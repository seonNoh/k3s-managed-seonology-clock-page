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
      geminiApiKey: env.GEMINI_API_KEY || '',
      doorkeeperToken: env.DOORKEEPER_TOKEN || '',
      connpassApiKey: env.CONNPASS_API_KEY || '',
    },
    agentPlatform: {
      baseUrl: env.AGENT_PLATFORM_URL || 'http://agent-api.agent-platform.svc.cluster.local:8080',
      tokenUrl: env.AGENT_TOKEN_URL || 'https://auth.seonology.com/realms/master/protocol/openid-connect/token',
      clientId: env.AGENT_CLIENT_ID || '',
      clientSecret: env.AGENT_CLIENT_SECRET || '',
      timeoutMs: positiveInteger(env.AGENT_TIMEOUT_MS, 180000),
      pollIntervalMs: positiveInteger(env.AGENT_POLL_INTERVAL_MS, 1000),
    },
    security: {
      corsAllowedOrigins: splitList(env.CORS_ALLOWED_ORIGINS || [
        'https://clock.seonology.com',
        'http://localhost:5173',
        'http://127.0.0.1:5173',
      ].join(',')),
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
