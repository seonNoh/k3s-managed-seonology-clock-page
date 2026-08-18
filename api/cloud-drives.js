const https = require('https');
const { createOAuthTransactionStore } = require('./domains/cloud/oauth-transaction');
const { uploadOneDriveChunks } = require('./domains/cloud/onedrive-uploader');
const { createEncryptedTokenStore } = require('./infrastructure/storage/encrypted-token-store');

function createCloudRouteDependencies({
  config,
  tokenStore,
  oauthTransactions,
  post = httpsPost,
  get = httpsGet,
} = {}) {
  if (!config) throw new TypeError('Cloud configuration is required');
  let resolvedTokenStore = tokenStore;
  if (resolvedTokenStore === undefined && config.tokenEncryptionKey) {
    try {
      resolvedTokenStore = createEncryptedTokenStore({
        filePath: config.tokenFile,
        key: config.tokenEncryptionKey,
      });
    } catch (error) {
      console.error('Cloud token store configuration error:', error.message);
      resolvedTokenStore = null;
    }
  }
  if (resolvedTokenStore === undefined) resolvedTokenStore = null;
  const resolvedTransactions = oauthTransactions || createOAuthTransactionStore({});
  const shared = {
    tokenStore: resolvedTokenStore,
    oauthTransactions: resolvedTransactions,
    httpsPost: post,
    httpsGet: get,
  };
  return {
    google: { ...shared, config: config.google },
    microsoft: { ...shared, config: config.microsoft },
  };
}

function configured(dependencies) {
  return Boolean(
    dependencies.config?.clientId
    && dependencies.config?.clientSecret
    && dependencies.config?.redirectUri
    && dependencies.tokenStore,
  );
}

function unavailable(res, service) {
  return res.status(503).json({ error: `${service} is unavailable` });
}

function createUploadAbortScope() {
  const controller = new AbortController();
  const requests = new Set();
  const streams = new Set();
  return {
    signal: controller.signal,
    trackRequest(request) { requests.add(request); return request; },
    trackStream(stream) { streams.add(stream); return stream; },
    abort() {
      controller.abort();
      for (const stream of streams) stream.destroy();
      for (const request of requests) request.destroy();
      streams.clear();
      requests.clear();
    },
  };
}

function httpsPost(hostname, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = typeof body === 'string' ? body : new URLSearchParams(body).toString();
    const req = https.request({
      hostname, path, method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(data), ...headers },
    }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch { resolve({ raw: buf }); } });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function httpsGet(hostname, path, headers = {}) {
  return new Promise((resolve, reject) => {
    https.request({ hostname, path, method: 'GET', headers: { 'Accept': 'application/json', ...headers } }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch { resolve({ raw: buf }); } });
    }).on('error', reject).end();
  });
}

// ===== Google Drive =====
async function googleRefreshToken(dependencies) {
  const { config, tokenStore } = dependencies;
  const tokens = await tokenStore.read();
  const gt = tokens.google;
  if (!gt?.refresh_token) return null;
  const data = await dependencies.httpsPost('oauth2.googleapis.com', '/token', {
    client_id: config.clientId, client_secret: config.clientSecret,
    refresh_token: gt.refresh_token, grant_type: 'refresh_token',
  });
  if (data.access_token) {
    await tokenStore.update(current => ({
      ...current,
      google: { ...gt, access_token: data.access_token, expires_at: Date.now() + (data.expires_in || 3600) * 1000 },
    }));
    return data.access_token;
  }
  return null;
}

async function googleToken(dependencies) {
  const tokens = await dependencies.tokenStore.read();
  const gt = tokens.google;
  if (!gt?.access_token) return null;
  if (gt.expires_at && Date.now() > gt.expires_at - 60000) return googleRefreshToken(dependencies);
  return gt.access_token;
}

function setupGoogleRoutes(app, dependencies) {
  const { config, tokenStore, oauthTransactions } = dependencies;
  // Auth status
  app.get('/api/gdrive/status', async (req, res) => {
    if (!configured(dependencies)) return res.json({ connected: false, configured: false });
    try {
      const tokens = await tokenStore.read();
      res.json({ connected: !!tokens.google?.refresh_token, configured: true });
    } catch {
      unavailable(res, 'Google Drive');
    }
  });

  // Start OAuth
  app.get('/api/auth/google', (req, res) => {
    if (!configured(dependencies)) return unavailable(res, 'Google Drive');
    const transaction = oauthTransactions.create('google');
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/drive',
      access_type: 'offline',
      prompt: 'consent',
      state: transaction.state,
      code_challenge: transaction.challenge,
      code_challenge_method: transaction.challengeMethod,
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  // OAuth callback
  app.get('/api/auth/google/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.status(400).send('No code');
    if (!configured(dependencies)) return unavailable(res, 'Google Drive');
    let verifier;
    try {
      ({ verifier } = oauthTransactions.consume({ provider: 'google', state: req.query.state }));
    } catch (error) {
      return res.status(400).send(error.message);
    }
    try {
      const data = await dependencies.httpsPost('oauth2.googleapis.com', '/token', {
        code, client_id: config.clientId, client_secret: config.clientSecret,
        redirect_uri: config.redirectUri, grant_type: 'authorization_code', code_verifier: verifier,
      });
      if (data.access_token) {
        await tokenStore.update(tokens => ({
          ...tokens,
          google: { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + (data.expires_in || 3600) * 1000 },
        }));
        res.send('<html><body><h2>Google Drive connected!</h2><script>window.close()</script></body></html>');
      } else {
        res.status(502).send('Token exchange failed');
      }
    } catch { res.status(502).send('Token exchange failed'); }
  });

  // List files
  app.get('/api/gdrive/files', async (req, res) => {
    if (!configured(dependencies)) return unavailable(res, 'Google Drive');
    const token = await googleToken(dependencies);
    if (!token) return res.status(401).json({ error: 'Not connected' });
    const folderId = req.query.folderId || 'root';
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    try {
      const data = await dependencies.httpsGet('www.googleapis.com',
        `/drive/v3/files?q=${q}&fields=files(id,name,mimeType,size,modifiedTime,parents)&orderBy=folder,name&pageSize=200`,
        { 'Authorization': `Bearer ${token}` });
      if (data.error) throw new Error(data.error.message);
      const files = (data.files || []).map(f => ({
        id: f.id, name: f.name, isdir: f.mimeType === 'application/vnd.google-apps.folder',
        size: parseInt(f.size || 0), time: f.modifiedTime, mimeType: f.mimeType,
      }));
      res.json({ files, folderId });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Create folder
  app.post('/api/gdrive/mkdir', async (req, res) => {
    if (!configured(dependencies)) return unavailable(res, 'Google Drive');
    const token = await googleToken(dependencies);
    if (!token) return res.status(401).json({ error: 'Not connected' });
    const { parentId, name } = req.body;
    try {
      const body = JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId || 'root'] });
      const data = await new Promise((resolve, reject) => {
        const r = https.request({ hostname: 'www.googleapis.com', path: '/drive/v3/files', method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        }, (resp) => { let b = ''; resp.on('data', c => b += c); resp.on('end', () => resolve(JSON.parse(b))); });
        r.on('error', reject); r.write(body); r.end();
      });
      if (data.id) res.json({ success: true, id: data.id });
      else res.status(500).json({ error: data.error?.message || 'Failed' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Delete
  app.post('/api/gdrive/delete', async (req, res) => {
    if (!configured(dependencies)) return unavailable(res, 'Google Drive');
    const token = await googleToken(dependencies);
    if (!token) return res.status(401).json({ error: 'Not connected' });
    try {
      await new Promise((resolve, reject) => {
        https.request({ hostname: 'www.googleapis.com', path: `/drive/v3/files/${req.body.fileId}`, method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` },
        }, (resp) => { let b = ''; resp.on('data', c => b += c); resp.on('end', () => resolve(b)); }).on('error', reject).end();
      });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Rename
  app.post('/api/gdrive/rename', async (req, res) => {
    if (!configured(dependencies)) return unavailable(res, 'Google Drive');
    const token = await googleToken(dependencies);
    if (!token) return res.status(401).json({ error: 'Not connected' });
    const body = JSON.stringify({ name: req.body.name });
    try {
      const data = await new Promise((resolve, reject) => {
        const r = https.request({ hostname: 'www.googleapis.com', path: `/drive/v3/files/${req.body.fileId}`, method: 'PATCH',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        }, (resp) => { let b = ''; resp.on('data', c => b += c); resp.on('end', () => resolve(JSON.parse(b))); });
        r.on('error', reject); r.write(body); r.end();
      });
      res.json({ success: !!data.id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Download proxy
  app.get('/api/gdrive/download', async (req, res) => {
    if (!configured(dependencies)) return unavailable(res, 'Google Drive');
    const token = await googleToken(dependencies);
    if (!token) return res.status(401).json({ error: 'Not connected' });
    const fileId = req.query.fileId;
    try {
      const proxyReq = https.request({
        hostname: 'www.googleapis.com', path: `/drive/v3/files/${fileId}?alt=media`,
        method: 'GET', headers: { 'Authorization': `Bearer ${token}` }, timeout: 600000,
      }, (proxyRes) => {
        if (proxyRes.headers['content-type']) res.setHeader('Content-Type', proxyRes.headers['content-type']);
        if (proxyRes.headers['content-length']) res.setHeader('Content-Length', proxyRes.headers['content-length']);
        proxyRes.pipe(res);
      });
      proxyReq.on('error', e => res.status(500).json({ error: e.message }));
      proxyReq.end();
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Upload (streaming via resumable upload)
  app.post('/api/gdrive/upload', async (req, res) => {
    if (!configured(dependencies)) return unavailable(res, 'Google Drive');
    const token = await googleToken(dependencies);
    if (!token) return res.status(401).json({ error: 'Not connected' });
    const busboy = require('busboy');
    let parentId = req.query.parentId || req.headers['x-upload-parent-id'] || '';
    let uploadDone = false;
    let fileCount = 0;
    let fileStarted = false;
    const abortScope = createUploadAbortScope();
    const fail = (status, message) => {
      if (uploadDone) return;
      uploadDone = true;
      if (!res.headersSent) res.status(status).json({ error: message });
      abortScope.abort();
    };
    req.on('aborted', () => { uploadDone = true; abortScope.abort(); });
    try {
      const bb = busboy({ headers: req.headers, limits: { files: 1, fileSize: 11 * 1024 * 1024 * 1024 } });
      bb.on('field', (name, val) => {
        if (name !== 'parentId') return;
        if (fileStarted) return fail(400, 'Upload target must be provided before file data');
        parentId = val;
      });
      bb.on('file', (fieldname, fileStream, info) => {
        fileStarted = true;
        fileCount += 1;
        abortScope.trackStream(fileStream);
        if (fileCount > 1 || !parentId) {
          fileStream.resume();
          fail(400, 'Upload target must be provided before file data');
          return;
        }
        const metadata = JSON.stringify({ name: info.filename, parents: [parentId] });
        const initReq = abortScope.trackRequest(https.request({
          hostname: 'www.googleapis.com', path: '/upload/drive/v3/files?uploadType=resumable', method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8', 'Content-Length': Buffer.byteLength(metadata) },
        }, (initRes) => {
          const uploadUrl = initRes.headers.location;
          if (initRes.statusCode < 200 || initRes.statusCode >= 300 || !uploadUrl) { fileStream.resume(); fail(502, 'Google Drive upload session failed'); return; }
          const urlObj = new URL(uploadUrl);
          let sizeLimitExceeded = false;
          const upReq = abortScope.trackRequest(https.request({ hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search, method: 'PUT',
            headers: { 'Content-Type': 'application/octet-stream', 'Transfer-Encoding': 'chunked' }, timeout: 600000,
          }, (upRes) => {
            let body = ''; upRes.on('data', c => body += c);
            upRes.on('end', () => {
              if (uploadDone) return;
              uploadDone = true;
              if (sizeLimitExceeded) res.status(413).json({ error: 'Upload size limit exceeded' });
              else if (upRes.statusCode >= 200 && upRes.statusCode < 300) res.json({ success: true });
              else res.status(502).json({ error: `Google Drive upload failed with HTTP ${upRes.statusCode}` });
            });
          }));
          fileStream.on('limit', () => {
            sizeLimitExceeded = true;
            fail(413, 'Upload size limit exceeded');
          });
          upReq.on('error', e => {
            fail(sizeLimitExceeded ? 413 : 500, e.message);
          });
          fileStream.pipe(upReq);
        }));
        initReq.on('error', e => { fileStream.resume(); fail(500, e.message); });
        initReq.write(metadata); initReq.end();
      });
      bb.on('filesLimit', () => fail(400, 'Upload file count limit exceeded'));
      bb.on('error', e => fail(500, e.message));
      req.pipe(bb);
    } catch (e) { fail(500, e.message); }
  });
}

// ===== Microsoft OneDrive =====
async function msRefreshToken(dependencies) {
  const { config, tokenStore } = dependencies;
  const tokens = await tokenStore.read();
  const mt = tokens.microsoft;
  if (!mt?.refresh_token) return null;
  const data = await dependencies.httpsPost('login.microsoftonline.com', '/common/oauth2/v2.0/token', {
    client_id: config.clientId, client_secret: config.clientSecret,
    refresh_token: mt.refresh_token, grant_type: 'refresh_token', scope: 'Files.ReadWrite.All User.Read offline_access',
  });
  if (data.access_token) {
    await tokenStore.update(current => ({
      ...current,
      microsoft: { ...mt, access_token: data.access_token, refresh_token: data.refresh_token || mt.refresh_token,
        expires_at: Date.now() + (data.expires_in || 3600) * 1000 },
    }));
    return data.access_token;
  }
  return null;
}

async function msToken(dependencies) {
  const tokens = await dependencies.tokenStore.read();
  const mt = tokens.microsoft;
  if (!mt?.access_token) return null;
  if (mt.expires_at && Date.now() > mt.expires_at - 60000) return msRefreshToken(dependencies);
  return mt.access_token;
}

function setupMicrosoftRoutes(app, dependencies) {
  const { config, tokenStore, oauthTransactions } = dependencies;
  app.get('/api/onedrive/status', async (req, res) => {
    if (!configured(dependencies)) return res.json({ connected: false, configured: false });
    try {
      const tokens = await tokenStore.read();
      res.json({ connected: !!tokens.microsoft?.refresh_token, configured: true });
    } catch {
      unavailable(res, 'OneDrive');
    }
  });

  app.get('/api/auth/microsoft', (req, res) => {
    if (!configured(dependencies)) return unavailable(res, 'OneDrive');
    const transaction = oauthTransactions.create('microsoft');
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: 'Files.ReadWrite.All User.Read offline_access',
      response_mode: 'query',
      state: transaction.state,
      code_challenge: transaction.challenge,
      code_challenge_method: transaction.challengeMethod,
    });
    res.redirect(`https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`);
  });

  app.get('/api/auth/microsoft/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.status(400).send('No code');
    if (!configured(dependencies)) return unavailable(res, 'OneDrive');
    let verifier;
    try {
      ({ verifier } = oauthTransactions.consume({ provider: 'microsoft', state: req.query.state }));
    } catch (error) {
      return res.status(400).send(error.message);
    }
    try {
      const data = await dependencies.httpsPost('login.microsoftonline.com', '/common/oauth2/v2.0/token', {
        code, client_id: config.clientId, client_secret: config.clientSecret,
        redirect_uri: config.redirectUri, grant_type: 'authorization_code',
        scope: 'Files.ReadWrite.All User.Read offline_access', code_verifier: verifier,
      });
      if (data.access_token) {
        await tokenStore.update(tokens => ({
          ...tokens,
          microsoft: { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + (data.expires_in || 3600) * 1000 },
        }));
        res.send('<html><body><h2>OneDrive connected!</h2><script>window.close()</script></body></html>');
      } else {
        res.status(502).send('Token exchange failed');
      }
    } catch { res.status(502).send('Token exchange failed'); }
  });

  app.get('/api/onedrive/files', async (req, res) => {
    if (!configured(dependencies)) return unavailable(res, 'OneDrive');
    const token = await msToken(dependencies);
    if (!token) return res.status(401).json({ error: 'Not connected' });
    const folderId = req.query.folderId || 'root';
    const apiPath = folderId === 'root' ? '/v1.0/me/drive/root/children' : `/v1.0/me/drive/items/${folderId}/children`;
    try {
      const data = await dependencies.httpsGet('graph.microsoft.com', `${apiPath}?$select=id,name,size,lastModifiedDateTime,folder,file&$orderby=name&$top=200`,
        { 'Authorization': `Bearer ${token}` });
      if (data.error) throw new Error(data.error.message);
      const files = (data.value || []).map(f => ({
        id: f.id, name: f.name, isdir: !!f.folder, size: f.size || 0,
        time: f.lastModifiedDateTime, mimeType: f.file?.mimeType || '',
      }));
      res.json({ files, folderId });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/onedrive/mkdir', async (req, res) => {
    if (!configured(dependencies)) return unavailable(res, 'OneDrive');
    const token = await msToken(dependencies);
    if (!token) return res.status(401).json({ error: 'Not connected' });
    const { parentId, name } = req.body;
    const apiPath = (!parentId || parentId === 'root') ? '/v1.0/me/drive/root/children' : `/v1.0/me/drive/items/${parentId}/children`;
    const body = JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'rename' });
    try {
      const data = await new Promise((resolve, reject) => {
        const r = https.request({ hostname: 'graph.microsoft.com', path: apiPath, method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        }, (resp) => { let b = ''; resp.on('data', c => b += c); resp.on('end', () => resolve(JSON.parse(b))); });
        r.on('error', reject); r.write(body); r.end();
      });
      res.json({ success: !!data.id, id: data.id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/onedrive/delete', async (req, res) => {
    if (!configured(dependencies)) return unavailable(res, 'OneDrive');
    const token = await msToken(dependencies);
    if (!token) return res.status(401).json({ error: 'Not connected' });
    try {
      await new Promise((resolve, reject) => {
        https.request({ hostname: 'graph.microsoft.com', path: `/v1.0/me/drive/items/${req.body.fileId}`, method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}` },
        }, (resp) => { let b = ''; resp.on('data', c => b += c); resp.on('end', () => resolve(b)); }).on('error', reject).end();
      });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.post('/api/onedrive/rename', async (req, res) => {
    if (!configured(dependencies)) return unavailable(res, 'OneDrive');
    const token = await msToken(dependencies);
    if (!token) return res.status(401).json({ error: 'Not connected' });
    const body = JSON.stringify({ name: req.body.name });
    try {
      const data = await new Promise((resolve, reject) => {
        const r = https.request({ hostname: 'graph.microsoft.com', path: `/v1.0/me/drive/items/${req.body.fileId}`, method: 'PATCH',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        }, (resp) => { let b = ''; resp.on('data', c => b += c); resp.on('end', () => resolve(JSON.parse(b))); });
        r.on('error', reject); r.write(body); r.end();
      });
      res.json({ success: !!data.id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/api/onedrive/download', async (req, res) => {
    if (!configured(dependencies)) return unavailable(res, 'OneDrive');
    const token = await msToken(dependencies);
    if (!token) return res.status(401).json({ error: 'Not connected' });
    try {
      // Get download URL first
      const meta = await dependencies.httpsGet('graph.microsoft.com', `/v1.0/me/drive/items/${req.query.fileId}`,
        { 'Authorization': `Bearer ${token}` });
      const dlUrl = meta['@microsoft.graph.downloadUrl'];
      if (!dlUrl) return res.status(404).json({ error: 'No download URL' });
      const urlObj = new URL(dlUrl);
      const proxyReq = https.request({
        hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search,
        method: 'GET', timeout: 600000,
      }, (proxyRes) => {
        if (proxyRes.headers['content-type']) res.setHeader('Content-Type', proxyRes.headers['content-type']);
        if (proxyRes.headers['content-length']) res.setHeader('Content-Length', proxyRes.headers['content-length']);
        proxyRes.pipe(res);
      });
      proxyReq.on('error', e => res.status(500).json({ error: e.message }));
      proxyReq.end();
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Upload (streaming via upload session)
  app.post('/api/onedrive/upload', async (req, res) => {
    if (!configured(dependencies)) return unavailable(res, 'OneDrive');
    const token = await msToken(dependencies);
    if (!token) return res.status(401).json({ error: 'Not connected' });
    const busboy = require('busboy');
    let parentId = req.query.parentId || req.headers['x-upload-parent-id'] || '';
    let declaredSize = Number.parseInt(req.query.size || req.headers['x-upload-size'], 10);
    let uploadDone = false;
    let fileCount = 0;
    let fileStarted = false;
    const abortScope = createUploadAbortScope();
    const fail = (status, message) => {
      if (uploadDone) return;
      uploadDone = true;
      if (!res.headersSent) res.status(status).json({ error: message });
      abortScope.abort();
    };
    req.on('aborted', () => { uploadDone = true; abortScope.abort(); });
    try {
      const bb = busboy({ headers: req.headers, limits: { files: 1, fileSize: 11 * 1024 * 1024 * 1024 } });
      bb.on('field', (name, val) => {
        if (name !== 'parentId' && name !== 'size') return;
        if (fileStarted) return fail(400, 'Upload target and size must be provided before file data');
        if (name === 'parentId') parentId = val;
        else declaredSize = Number.parseInt(val, 10);
      });
      bb.on('file', (fieldname, fileStream, info) => {
        fileStarted = true;
        fileCount += 1;
        abortScope.trackStream(fileStream);
        if (fileCount > 1 || !parentId || !Number.isSafeInteger(declaredSize) || declaredSize <= 0
          || declaredSize > 11 * 1024 * 1024 * 1024) {
          fileStream.resume();
          fail(400, 'Upload target and size must be provided before file data');
          return;
        }
        const fileName = info.filename;
        const apiPath = (!parentId || parentId === 'root')
          ? `/v1.0/me/drive/root:/${encodeURIComponent(fileName)}:/createUploadSession`
          : `/v1.0/me/drive/items/${parentId}:/${encodeURIComponent(fileName)}:/createUploadSession`;
        const body = JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename', name: fileName } });
        const initReq = abortScope.trackRequest(https.request({
          hostname: 'graph.microsoft.com', path: apiPath, method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        }, (initRes) => {
          let initBody = ''; initRes.on('data', c => initBody += c);
          initRes.on('end', async () => {
            let sessionData;
            try { sessionData = JSON.parse(initBody); } catch { sessionData = {}; }
            if (initRes.statusCode < 200 || initRes.statusCode >= 300 || !sessionData.uploadUrl) {
              fileStream.resume();
              fail(502, 'OneDrive upload session failed');
              return;
            }
            const uploadUrl = new URL(sessionData.uploadUrl);
            const session = {
              uploadChunk: ({ chunk, start, end, total, signal }) => new Promise((resolve, reject) => {
                const upReq = abortScope.trackRequest(https.request({
                  hostname: uploadUrl.hostname,
                  path: uploadUrl.pathname + uploadUrl.search,
                  method: 'PUT',
                  headers: { 'Content-Length': chunk.length, 'Content-Range': `bytes ${start}-${end}/${total}` },
                  timeout: 600000,
                  signal,
                }, upRes => {
                  upRes.resume();
                  upRes.on('end', () => resolve({ statusCode: upRes.statusCode }));
                }));
                upReq.on('error', reject);
                upReq.end(chunk);
              }),
            };
            try {
              await uploadOneDriveChunks({
                stream: fileStream,
                size: declaredSize,
                session,
                chunkSize: 10 * 320 * 1024,
                signal: abortScope.signal,
              });
              if (!uploadDone) { uploadDone = true; res.json({ success: true }); }
            } catch (error) {
              fail(error.name === 'AbortError' ? 499 : 502, error.message);
            }
          });
        }));
        initReq.on('error', e => { fileStream.resume(); fail(500, e.message); });
        initReq.write(body); initReq.end();
      });
      bb.on('filesLimit', () => fail(400, 'Upload file count limit exceeded'));
      bb.on('error', e => fail(500, e.message));
      req.pipe(bb);
    } catch (e) { fail(500, e.message); }
  });
}

module.exports = { createCloudRouteDependencies, setupGoogleRoutes, setupMicrosoftRoutes };
