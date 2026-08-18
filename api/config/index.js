const path = require('node:path');

function splitList(value) {
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function loadConfig(env = process.env) {
  const dataDirectory = env.BOOKMARKS_DIR || '/data';
  return {
    port: positiveInteger(env.PORT, 3001),
    dataDirectory,
    api: {
      githubToken: env.GITHUB_TOKEN || '',
      geminiApiKey: env.GEMINI_API_KEY || '',
      doorkeeperToken: env.DOORKEEPER_TOKEN || '',
      connpassApiKey: env.CONNPASS_API_KEY || '',
    },
    cloud: {
      tokenFile: path.join(dataDirectory, 'cloud-tokens.json'),
      tokenEncryptionKey: env.CLOUD_TOKEN_ENCRYPTION_KEY || '',
      google: {
        clientId: env.GOOGLE_CLIENT_ID || '',
        clientSecret: env.GOOGLE_CLIENT_SECRET || '',
        redirectUri: env.GOOGLE_REDIRECT_URI || 'https://clock.seonology.com/api/auth/google/callback',
      },
      microsoft: {
        clientId: env.MS_CLIENT_ID || '',
        clientSecret: env.MS_CLIENT_SECRET || '',
        redirectUri: env.MS_REDIRECT_URI || 'https://clock.seonology.com/api/auth/microsoft/callback',
      },
    },
    grafana: {
      url: env.GRAFANA_URL || 'https://grafana.seonology.com',
      user: env.GRAFANA_USER || '',
      password: env.GRAFANA_PASS || '',
    },
    tailscale: {
      clientId: env.TAILSCALE_OAUTH_CLIENT_ID || '',
      clientSecret: env.TAILSCALE_OAUTH_CLIENT_SECRET || '',
    },
    nas: {
      host: env.NAS_HOST || '',
      port: positiveInteger(env.NAS_PORT, 5001),
      account: env.NAS_ACCOUNT || '',
      password: env.NAS_PASSWORD || '',
      allowedRoots: splitList(env.NAS_ALLOWED_ROOTS),
      caPath: env.NAS_CA_PATH || '',
      servername: env.NAS_TLS_SERVERNAME || env.NAS_HOST || '',
      maxUploadBytes: positiveInteger(env.NAS_MAX_UPLOAD_BYTES, 11 * 1024 * 1024 * 1024),
      maxUploadFiles: positiveInteger(env.NAS_MAX_UPLOAD_FILES, 1),
    },
  };
}

module.exports = { loadConfig };
