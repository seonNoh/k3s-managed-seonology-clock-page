const express = require('express');
const cors = require('cors');
const https = require('https');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

// Cloud Drives
const { setupGoogleRoutes, setupMicrosoftRoutes } = require('./cloud-drives');
const { setupGithubCatalogRoutes } = require('./github-catalog');

// AI Chat configuration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// Sapporo Events configuration
const DOORKEEPER_TOKEN = process.env.DOORKEEPER_TOKEN || 'asKpciBVWtQbHPMyW1EM';
const CONNPASS_API_KEY = process.env.CONNPASS_API_KEY || '';

// CORS configuration
app.use(cors());
app.use(express.json());

// Kubernetes API configuration
const K8S_API_HOST = process.env.KUBERNETES_SERVICE_HOST || 'kubernetes.default.svc';
const K8S_API_PORT = process.env.KUBERNETES_SERVICE_PORT || '443';
const K8S_TOKEN_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/token';
const K8S_CA_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt';

// Check if running in k8s
const isInCluster = fs.existsSync(K8S_TOKEN_PATH);

// Service icon mapping
const SERVICE_ICONS = {
  vault: { name: 'Vault', description: 'Secret Management', color: '#FFD814', icon: 'vault' },
  auth: { name: 'Keycloak', description: 'Authentication', color: '#4D9FFF', icon: 'key' },
  argocd: { name: 'Argo CD', description: 'GitOps CD', color: '#EF7B4D', icon: 'gitops' },
  cli: { name: 'seon CLI', description: 'CLI Tools', color: '#00D9FF', icon: 'terminal' },
  clock: { name: 'Clock', description: 'Dashboard', color: '#A78BFA', icon: 'clock' },
  grafana: { name: 'Grafana', description: 'Monitoring', color: '#F46800', icon: 'chart' },
  aw: { name: 'ActivityWatch', description: 'Time Tracking', color: '#4CAF50', icon: 'activity' },
  'aw-api': { name: 'ActivityWatch API', description: 'Time Tracking API', color: '#4CAF50', icon: 'activity' },
  backstage: { name: 'Backstage', description: 'Developer Portal', color: '#9D4EDD', icon: 'portal' },
  blinko: { name: 'Blinko', description: 'Notes', color: '#FFB703', icon: 'note' },
  chat: { name: 'Mattermost', description: 'Team Chat', color: '#0072C6', icon: 'chat' },
  cms: { name: 'CMS', description: 'Content Management', color: '#06B6D4', icon: 'content' },
  code: { name: 'Coder', description: 'Dev Environment', color: '#6366F1', icon: 'code' },
  comic: { name: 'Komga', description: 'Comics', color: '#EC4899', icon: 'book' },
  file: { name: 'FileBrowser', description: 'File Manager', color: '#10B981', icon: 'folder' },
  headlamp: { name: 'Headlamp', description: 'K8s UI', color: '#3B82F6', icon: 'k8s' },
  journey: { name: 'Journey', description: 'Travel Planner', color: '#8B5CF6', icon: 'map' },
  k8s: { name: 'K8s Roadmap', description: 'Learning Path', color: '#326CE5', icon: 'k8s' },
  longhorn: { name: 'Longhorn', description: 'Storage', color: '#F97316', icon: 'storage' },
  music: { name: 'Navidrome', description: 'Music Server', color: '#EF4444', icon: 'music' },
  my: { name: 'Portal', description: 'User Portal', color: '#14B8A6', icon: 'user' },
  pdf: { name: 'Stirling PDF', description: 'PDF Tools', color: '#DC2626', icon: 'pdf' },
  photos: { name: 'Immich', description: 'Photo Library', color: '#F59E0B', icon: 'photo' },
  share: { name: 'Content Share', description: 'File Sharing', color: '#22C55E', icon: 'share' },
  tasks: { name: 'Vikunja', description: 'Task Manager', color: '#A855F7', icon: 'task' },
  webdav: { name: 'WebDAV', description: 'File Sync', color: '#0EA5E9', icon: 'cloud' },
  wiki: { name: 'Outline', description: 'Wiki', color: '#6366F1', icon: 'wiki' },
  workflow: { name: 'n8n', description: 'Automation', color: '#EA580C', icon: 'workflow' },
  www: { name: 'Homarr', description: 'Homepage', color: '#7C3AED', icon: 'home' },
};

// Get service key from hostname
function getServiceKey(hostname) {
  if (hostname.includes('vault')) return 'vault';
  if (hostname.includes('auth')) return 'auth';
  if (hostname.includes('argocd')) return 'argocd';
  if (hostname.includes('cli')) return 'cli';
  if (hostname.includes('clock')) return 'clock';
  if (hostname.includes('grafana')) return 'grafana';
  if (hostname.includes('aw-api')) return 'aw-api';
  if (hostname.includes('aw.')) return 'aw';
  if (hostname.includes('backstage')) return 'backstage';
  if (hostname.includes('blinko')) return 'blinko';
  if (hostname.includes('chat')) return 'chat';
  if (hostname.includes('cms')) return 'cms';
  if (hostname.includes('code')) return 'code';
  if (hostname.includes('comic')) return 'comic';
  if (hostname.includes('file')) return 'file';
  if (hostname.includes('headlamp')) return 'headlamp';
  if (hostname.includes('journey')) return 'journey';
  if (hostname.includes('k8s')) return 'k8s';
  if (hostname.includes('longhorn')) return 'longhorn';
  if (hostname.includes('music')) return 'music';
  if (hostname.includes('my.')) return 'my';
  if (hostname.includes('pdf')) return 'pdf';
  if (hostname.includes('photos')) return 'photos';
  if (hostname.includes('share')) return 'share';
  if (hostname.includes('tasks')) return 'tasks';
  if (hostname.includes('webdav')) return 'webdav';
  if (hostname.includes('wiki')) return 'wiki';
  if (hostname.includes('workflow')) return 'workflow';
  if (hostname.includes('www')) return 'www';
  return null;
}

// Kubernetes API request helper
function k8sRequest(path) {
  return new Promise((resolve, reject) => {
    if (!isInCluster) {
      reject(new Error('Not running in Kubernetes cluster'));
      return;
    }

    const token = fs.readFileSync(K8S_TOKEN_PATH, 'utf8');
    const ca = fs.readFileSync(K8S_CA_PATH);

    const options = {
      hostname: K8S_API_HOST,
      port: K8S_API_PORT,
      path: path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      ca: ca,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// Fallback to kubectl for local development
async function fetchWithKubectl() {
  const { exec } = require('child_process');
  const util = require('util');
  const execPromise = util.promisify(exec);

  const services = [];

  try {
    const { stdout: ingressJson } = await execPromise(
      'kubectl --context k3s-lightsail get ingress -A -o json'
    );
    const ingressData = JSON.parse(ingressJson);
    const ingresses = ingressData.items || [];

    ingresses
      .filter((ingress) => {
        return ingress.spec.rules?.some((rule) =>
          rule.host?.includes('seonology.com')
        );
      })
      .forEach((ingress) => {
        const rule = ingress.spec.rules[0];
        const hostname = rule.host;
        const serviceKey = getServiceKey(hostname);
        const serviceInfo = SERVICE_ICONS[serviceKey] || {
          name: hostname.split('.')[0],
          description: 'Service',
          color: '#888888',
          icon: 'default',
        };

        services.push({
          id: serviceKey || hostname,
          name: serviceInfo.name,
          url: `https://${hostname}`,
          description: serviceInfo.description,
          color: serviceInfo.color,
          icon: serviceInfo.icon,
        });
      });
  } catch (err) {
    console.error('Error fetching Ingresses:', err.message);
  }

  try {
    const { stdout: routeOutput } = await execPromise(
      'kubectl --context k3s-lightsail get ingressroute -A -o json'
    );
    const routeData = JSON.parse(routeOutput);
    const ingressRoutes = routeData.items || [];

    ingressRoutes.forEach((route) => {
      const routes = route.spec?.routes || [];
      routes.forEach((r) => {
        const match = r.match || '';
        const hostMatch = match.match(/Host\(`([^`]+)`\)/);
        if (hostMatch && hostMatch[1].includes('seonology.com')) {
          const hostname = hostMatch[1];
          const serviceKey = getServiceKey(hostname);
          const serviceInfo = SERVICE_ICONS[serviceKey] || {
            name: hostname.split('.')[0],
            description: 'Service',
            color: '#888888',
            icon: 'default',
          };

          services.push({
            id: serviceKey || hostname,
            name: serviceInfo.name,
            url: `https://${hostname}`,
            description: serviceInfo.description,
            color: serviceInfo.color,
            icon: serviceInfo.icon,
          });
        }
      });
    });
  } catch (err) {
    console.error('Error fetching IngressRoutes:', err);
  }

  return services;
}

// API endpoint to get services
app.get('/api/services', async (req, res) => {
  try {
    console.log('=== Fetching services from k8s ===');
    console.log('Running in cluster:', isInCluster);

    let services = [];

    if (isInCluster) {
      // Fetch from k8s API
      try {
        const ingressData = await k8sRequest('/apis/networking.k8s.io/v1/ingresses');
        const ingresses = ingressData.items || [];

        ingresses
          .filter((ingress) => {
            return ingress.spec.rules?.some((rule) =>
              rule.host?.includes('seonology.com')
            );
          })
          .forEach((ingress) => {
            const rule = ingress.spec.rules[0];
            const hostname = rule.host;
            const serviceKey = getServiceKey(hostname);
            const serviceInfo = SERVICE_ICONS[serviceKey] || {
              name: hostname.split('.')[0],
              description: 'Service',
              color: '#888888',
              icon: 'default',
            };

            services.push({
              id: serviceKey || hostname,
              name: serviceInfo.name,
              url: `https://${hostname}`,
              description: serviceInfo.description,
              color: serviceInfo.color,
              icon: serviceInfo.icon,
            });
          });
      } catch (err) {
        console.error('Error fetching Ingresses from k8s API:', err.message);
      }

      try {
        const routeData = await k8sRequest('/apis/traefik.io/v1alpha1/ingressroutes');
        const ingressRoutes = routeData.items || [];

        ingressRoutes.forEach((route) => {
          const routes = route.spec?.routes || [];
          routes.forEach((r) => {
            const match = r.match || '';
            const hostMatch = match.match(/Host\(`([^`]+)`\)/);
            if (hostMatch && hostMatch[1].includes('seonology.com')) {
              const hostname = hostMatch[1];
              const serviceKey = getServiceKey(hostname);
              const serviceInfo = SERVICE_ICONS[serviceKey] || {
                name: hostname.split('.')[0],
                description: 'Service',
                color: '#888888',
                icon: 'default',
              };

              services.push({
                id: serviceKey || hostname,
                name: serviceInfo.name,
                url: `https://${hostname}`,
                description: serviceInfo.description,
                color: serviceInfo.color,
                icon: serviceInfo.icon,
              });
            }
          });
        });
      } catch (err) {
        console.error('Error fetching IngressRoutes from k8s API:', err.message);
      }
    } else {
      // Fallback to kubectl for local development
      services = await fetchWithKubectl();
    }

    // Remove duplicates
    const uniqueServices = services.filter((service, index, self) =>
      index === self.findIndex((s) => s.id === service.id)
    );

    console.log('Total unique services:', uniqueServices.length);
    console.log('Services:', uniqueServices.map(s => s.name).join(', '));

    res.json({ services: uniqueServices });
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

// ===== BOOKMARKS API =====
const path = require('path');
const BOOKMARKS_DIR = process.env.BOOKMARKS_DIR || path.join(__dirname, '..', 'data');
const BOOKMARKS_FILE = path.join(BOOKMARKS_DIR, 'bookmarks.json');

// Default bookmarks structure
const DEFAULT_BOOKMARKS = {
  categories: [
    {
      id: 'default',
      name: 'Bookmarks',
      order: 0,
      bookmarks: [],
    },
  ],
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readBookmarks() {
  try {
    ensureDir(BOOKMARKS_DIR);
    if (!fs.existsSync(BOOKMARKS_FILE)) {
      fs.writeFileSync(BOOKMARKS_FILE, JSON.stringify(DEFAULT_BOOKMARKS, null, 2));
      return DEFAULT_BOOKMARKS;
    }
    return JSON.parse(fs.readFileSync(BOOKMARKS_FILE, 'utf8'));
  } catch (err) {
    console.error('Error reading bookmarks:', err);
    return DEFAULT_BOOKMARKS;
  }
}

function writeBookmarks(data) {
  ensureDir(BOOKMARKS_DIR);
  fs.writeFileSync(BOOKMARKS_FILE, JSON.stringify(data, null, 2));
}

// GET all bookmarks
app.get('/api/bookmarks', (req, res) => {
  try {
    const data = readBookmarks();
    res.json(data);
  } catch (err) {
    console.error('Error getting bookmarks:', err);
    res.status(500).json({ error: 'Failed to read bookmarks' });
  }
});

// PUT replace all bookmarks (full save)
app.put('/api/bookmarks', (req, res) => {
  try {
    const data = req.body;
    if (!data || !Array.isArray(data.categories)) {
      return res.status(400).json({ error: 'Invalid bookmarks data' });
    }
    writeBookmarks(data);
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving bookmarks:', err);
    res.status(500).json({ error: 'Failed to save bookmarks' });
  }
});

// POST add a category
app.post('/api/bookmarks/categories', (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Category name is required' });
    const data = readBookmarks();
    const id = `cat-${Date.now()}`;
    const order = data.categories.length;
    data.categories.push({ id, name, order, bookmarks: [] });
    writeBookmarks(data);
    res.json({ success: true, category: { id, name, order, bookmarks: [] } });
  } catch (err) {
    console.error('Error adding category:', err);
    res.status(500).json({ error: 'Failed to add category' });
  }
});

// DELETE a category
app.delete('/api/bookmarks/categories/:categoryId', (req, res) => {
  try {
    const data = readBookmarks();
    data.categories = data.categories.filter(c => c.id !== req.params.categoryId);
    writeBookmarks(data);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting category:', err);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

// POST add a bookmark to a category
app.post('/api/bookmarks/categories/:categoryId/bookmarks', (req, res) => {
  try {
    const { name, url, icon, color, quickLink } = req.body;
    if (!name || !url) return res.status(400).json({ error: 'Name and URL are required' });
    const data = readBookmarks();
    const cat = data.categories.find(c => c.id === req.params.categoryId);
    if (!cat) return res.status(404).json({ error: 'Category not found' });
    const bookmark = { id: `bm-${Date.now()}`, name, url, icon: icon || 'default', color: color || '#6366f1', quickLink: !!quickLink };
    cat.bookmarks.push(bookmark);
    writeBookmarks(data);
    res.json({ success: true, bookmark });
  } catch (err) {
    console.error('Error adding bookmark:', err);
    res.status(500).json({ error: 'Failed to add bookmark' });
  }
});

// DELETE a bookmark
app.delete('/api/bookmarks/categories/:categoryId/bookmarks/:bookmarkId', (req, res) => {
  try {
    const data = readBookmarks();
    const cat = data.categories.find(c => c.id === req.params.categoryId);
    if (!cat) return res.status(404).json({ error: 'Category not found' });
    cat.bookmarks = cat.bookmarks.filter(b => b.id !== req.params.bookmarkId);
    writeBookmarks(data);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting bookmark:', err);
    res.status(500).json({ error: 'Failed to delete bookmark' });
  }
});

// PATCH update a bookmark
app.patch('/api/bookmarks/categories/:categoryId/bookmarks/:bookmarkId', (req, res) => {
  try {
    const data = readBookmarks();
    const cat = data.categories.find(c => c.id === req.params.categoryId);
    if (!cat) return res.status(404).json({ error: 'Category not found' });
    const bm = cat.bookmarks.find(b => b.id === req.params.bookmarkId);
    if (!bm) return res.status(404).json({ error: 'Bookmark not found' });
    if (req.body.name) bm.name = req.body.name;
    if (req.body.url) bm.url = req.body.url;
    if (req.body.icon) bm.icon = req.body.icon;
    if (req.body.color) bm.color = req.body.color;
    if (req.body.quickLink !== undefined) bm.quickLink = !!req.body.quickLink;
    writeBookmarks(data);
    res.json({ success: true, bookmark: bm });
  } catch (err) {
    console.error('Error updating bookmark:', err);
    res.status(500).json({ error: 'Failed to update bookmark' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ===== GOOGLE SUGGEST PROXY =====
app.get('/api/suggest', async (req, res) => {
  const q = req.query.q;
  if (!q) return res.json([]);
  try {
    const url = `http://suggestqueries.google.com/complete/search?client=firefox&hl=ko&q=${encodeURIComponent(q)}`;
    const response = await new Promise((resolve, reject) => {
      const http = require('http');
      http.get(url, (resp) => {
        const chunks = [];
        resp.on('data', chunk => chunks.push(chunk));
        resp.on('end', () => {
          const buf = Buffer.concat(chunks);
          // Google returns charset=EUC-KR for Korean queries; detect from Content-Type
          const contentType = resp.headers['content-type'] || '';
          const charsetMatch = contentType.match(/charset=([^\s;]+)/i);
          const charset = charsetMatch ? charsetMatch[1] : 'utf-8';
          try {
            const decoder = new TextDecoder(charset);
            resolve(decoder.decode(buf));
          } catch {
            resolve(buf.toString('utf8'));
          }
        });
      }).on('error', reject);
    });
    const parsed = JSON.parse(response);
    res.json(parsed[1] || []);
  } catch (err) {
    console.error('Google suggest error:', err.message);
    res.json([]);
  }
});

// ===== BROWSER STATS API =====
// In-memory store for browser stats from Chrome Extension
let browserStats = null;

// POST browser stats (from Chrome Extension)
app.post('/api/browser-stats', (req, res) => {
  try {
    browserStats = {
      ...req.body,
      receivedAt: new Date().toISOString(),
    };
    res.json({ success: true });
  } catch (err) {
    console.error('Error saving browser stats:', err);
    res.status(500).json({ error: 'Failed to save browser stats' });
  }
});

// GET browser stats (for frontend)
app.get('/api/browser-stats', (req, res) => {
  if (!browserStats) {
    return res.json({ available: false });
  }
  // Consider stale if older than 2 minutes
  const age = Date.now() - new Date(browserStats.receivedAt).getTime();
  res.json({
    available: age < 120000,
    stale: age >= 120000,
    ...browserStats,
  });
});

// ===== TODOS API =====
const TODOS_FILE = path.join(BOOKMARKS_DIR, 'todos.json');

const DEFAULT_TODOS = { todos: [] };

function readTodos() {
  try {
    ensureDir(BOOKMARKS_DIR);
    if (!fs.existsSync(TODOS_FILE)) {
      fs.writeFileSync(TODOS_FILE, JSON.stringify(DEFAULT_TODOS, null, 2));
      return DEFAULT_TODOS;
    }
    return JSON.parse(fs.readFileSync(TODOS_FILE, 'utf8'));
  } catch (err) {
    console.error('Error reading todos:', err);
    return DEFAULT_TODOS;
  }
}

function writeTodos(data) {
  ensureDir(BOOKMARKS_DIR);
  fs.writeFileSync(TODOS_FILE, JSON.stringify(data, null, 2));
}

// GET all todos
app.get('/api/todos', (req, res) => {
  try {
    res.json(readTodos());
  } catch (err) {
    res.status(500).json({ error: 'Failed to read todos' });
  }
});

// POST add todo
app.post('/api/todos', (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'text required' });
    const data = readTodos();
    const todo = {
      id: `todo-${Date.now()}`,
      text: text.trim(),
      completed: false,
      createdAt: new Date().toISOString(),
    };
    data.todos.push(todo);
    writeTodos(data);
    res.json({ success: true, todo });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add todo' });
  }
});

// PATCH toggle/update todo
app.patch('/api/todos/:id', (req, res) => {
  try {
    const data = readTodos();
    const todo = data.todos.find(t => t.id === req.params.id);
    if (!todo) return res.status(404).json({ error: 'Todo not found' });
    if (req.body.completed !== undefined) todo.completed = req.body.completed;
    if (req.body.text !== undefined) todo.text = req.body.text;
    writeTodos(data);
    res.json({ success: true, todo });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update todo' });
  }
});

// DELETE todo
app.delete('/api/todos/:id', (req, res) => {
  try {
    const data = readTodos();
    data.todos = data.todos.filter(t => t.id !== req.params.id);
    writeTodos(data);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete todo' });
  }
});

// DELETE completed todos
app.delete('/api/todos', (req, res) => {
  try {
    const data = readTodos();
    data.todos = data.todos.filter(t => !t.completed);
    writeTodos(data);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear completed' });
  }
});

// ===== NOTES API =====
const NOTES_FILE = path.join(BOOKMARKS_DIR, 'notes.json');

const DEFAULT_NOTES = { notes: [] };

function readNotes() {
  try {
    ensureDir(BOOKMARKS_DIR);
    if (!fs.existsSync(NOTES_FILE)) {
      fs.writeFileSync(NOTES_FILE, JSON.stringify(DEFAULT_NOTES, null, 2));
      return DEFAULT_NOTES;
    }
    return JSON.parse(fs.readFileSync(NOTES_FILE, 'utf8'));
  } catch (err) {
    console.error('Error reading notes:', err);
    return DEFAULT_NOTES;
  }
}

function writeNotes(data) {
  ensureDir(BOOKMARKS_DIR);
  fs.writeFileSync(NOTES_FILE, JSON.stringify(data, null, 2));
}

// GET all notes
app.get('/api/notes', (req, res) => {
  try {
    res.json(readNotes());
  } catch (err) {
    res.status(500).json({ error: 'Failed to read notes' });
  }
});

// POST create note
app.post('/api/notes', (req, res) => {
  try {
    const data = readNotes();
    const note = {
      id: `note-${Date.now()}`,
      content: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    data.notes.unshift(note);
    writeNotes(data);
    res.json({ success: true, note });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create note' });
  }
});

// PATCH update note content
app.patch('/api/notes/:id', (req, res) => {
  try {
    const data = readNotes();
    const note = data.notes.find(n => n.id === req.params.id);
    if (!note) return res.status(404).json({ error: 'Note not found' });
    if (req.body.content !== undefined) note.content = req.body.content;
    note.updatedAt = new Date().toISOString();
    writeNotes(data);
    res.json({ success: true, note });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update note' });
  }
});

// DELETE note
app.delete('/api/notes/:id', (req, res) => {
  try {
    const data = readNotes();
    data.notes = data.notes.filter(n => n.id !== req.params.id);
    writeNotes(data);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

// ===== AI CHAT API =====

// GET available models
app.get('/api/chat/models', (req, res) => {
  const models = [];
  if (GITHUB_TOKEN) {
    models.push(
      { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'github', desc: 'OpenAI 최신 플래그십' },
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini', provider: 'github', desc: 'GPT-4.1 경량 버전' },
      { id: 'gpt-4o', name: 'GPT-4o', provider: 'github', desc: 'OpenAI 멀티모달' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'github', desc: 'GPT-4o 경량 버전' },
      { id: 'DeepSeek-R1', name: 'DeepSeek R1', provider: 'github', desc: '추론 특화 오픈소스' },
      { id: 'Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B', provider: 'github', desc: 'Meta 오픈소스 대형' },
      { id: 'Phi-4', name: 'Phi-4', provider: 'github', desc: 'MS 경량 고성능' },
      { id: 'Codestral-2501', name: 'Codestral', provider: 'github', desc: 'Mistral 코딩 특화' },
    );
  }
  if (GEMINI_API_KEY) {
    models.push(
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'gemini', desc: 'Google 최신 프리미엄' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'gemini', desc: 'Google 빠른 응답' },
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'gemini', desc: 'Google 안정 버전' },
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', provider: 'gemini', desc: 'Google 차세대 (Preview)' },
    );
  }
  res.json({ models, hasGithub: !!GITHUB_TOKEN, hasGemini: !!GEMINI_API_KEY });
});

// GET rate limit / usage info for GitHub Models
app.get('/api/chat/usage', async (req, res) => {
  const usage = {};

  if (GITHUB_TOKEN) {
    try {
      const response = await fetch('https://models.inference.ai.azure.com/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 1,
        }),
      });
      usage.github = {
        limitRequests: parseInt(response.headers.get('x-ratelimit-limit-requests') || '0'),
        remainingRequests: parseInt(response.headers.get('x-ratelimit-remaining-requests') || '0'),
        limitTokens: parseInt(response.headers.get('x-ratelimit-limit-tokens') || '0'),
        remainingTokens: parseInt(response.headers.get('x-ratelimit-remaining-tokens') || '0'),
      };
    } catch (err) {
      console.error('GitHub usage check error:', err);
      usage.github = null;
    }
  }

  if (GEMINI_API_KEY) {
    // Gemini doesn't expose usage via headers easily; return static info
    usage.gemini = {
      note: 'Free tier: 15 RPM, 1500 req/day (Flash), 50 req/day (Pro)',
    };
  }

  res.json(usage);
});

// POST chat via GitHub Models
app.post('/api/chat/github', async (req, res) => {
  if (!GITHUB_TOKEN) return res.status(503).json({ error: 'GitHub Token not configured' });

  const { messages, model = 'gpt-4o' } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  try {
    const response = await fetch('https://models.inference.ai.azure.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
      },
      body: JSON.stringify({ model, messages, max_tokens: 4096 }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('GitHub Models API error:', response.status, err);
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    res.json({
      content: data.choices[0]?.message?.content || '',
      model: data.model,
      usage: data.usage,
      rateLimit: {
        limitRequests: parseInt(response.headers.get('x-ratelimit-limit-requests') || '0'),
        remainingRequests: parseInt(response.headers.get('x-ratelimit-remaining-requests') || '0'),
        limitTokens: parseInt(response.headers.get('x-ratelimit-limit-tokens') || '0'),
        remainingTokens: parseInt(response.headers.get('x-ratelimit-remaining-tokens') || '0'),
      },
    });
  } catch (err) {
    console.error('GitHub Models error:', err);
    res.status(500).json({ error: 'Failed to call GitHub Models' });
  }
});

// POST chat via Google Gemini
app.post('/api/chat/gemini', async (req, res) => {
  if (!GEMINI_API_KEY) return res.status(503).json({ error: 'Gemini API Key not configured' });

  const { messages, model = 'gemini-2.0-flash' } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  // Convert OpenAI-style messages to Gemini format
  const systemInstruction = messages.find(m => m.role === 'system');
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
    const body = { contents };
    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction.content }] };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Gemini API error:', response.status, err);
      return res.status(response.status).json({ error: err });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    res.json({
      content: text,
      model: model,
      usage: data.usageMetadata,
    });
  } catch (err) {
    console.error('Gemini error:', err);
    res.status(500).json({ error: 'Failed to call Gemini' });
  }
});

// ===== CHAT HISTORY API =====
const CHAT_HISTORY_FILE = path.join(BOOKMARKS_DIR, 'chat-history.json');
const MAX_CONVERSATIONS = 50;

const DEFAULT_CHAT_HISTORY = { conversations: [] };

function readChatHistory() {
  try {
    ensureDir(BOOKMARKS_DIR);
    if (!fs.existsSync(CHAT_HISTORY_FILE)) {
      fs.writeFileSync(CHAT_HISTORY_FILE, JSON.stringify(DEFAULT_CHAT_HISTORY, null, 2));
      return DEFAULT_CHAT_HISTORY;
    }
    return JSON.parse(fs.readFileSync(CHAT_HISTORY_FILE, 'utf8'));
  } catch (err) {
    console.error('Error reading chat history:', err);
    return DEFAULT_CHAT_HISTORY;
  }
}

function writeChatHistory(data) {
  ensureDir(BOOKMARKS_DIR);
  // Trim to max conversations
  if (data.conversations.length > MAX_CONVERSATIONS) {
    data.conversations = data.conversations.slice(0, MAX_CONVERSATIONS);
  }
  fs.writeFileSync(CHAT_HISTORY_FILE, JSON.stringify(data, null, 2));
}

// GET chat history list (without messages for performance)
app.get('/api/chat/history', (req, res) => {
  try {
    const data = readChatHistory();
    const list = data.conversations.map(c => ({
      id: c.id,
      title: c.title,
      model: c.model,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      messageCount: c.messages.length,
    }));
    res.json({ conversations: list });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read chat history' });
  }
});

// GET single conversation
app.get('/api/chat/history/:id', (req, res) => {
  try {
    const data = readChatHistory();
    const conv = data.conversations.find(c => c.id === req.params.id);
    if (!conv) return res.status(404).json({ error: 'Conversation not found' });
    res.json(conv);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read conversation' });
  }
});

// POST save/update conversation
app.post('/api/chat/history', (req, res) => {
  try {
    const { id, title, model, messages } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array required' });
    }
    const data = readChatHistory();
    const existing = data.conversations.find(c => c.id === id);
    if (existing) {
      existing.title = title || existing.title;
      existing.model = model || existing.model;
      existing.messages = messages;
      existing.updatedAt = new Date().toISOString();
    } else {
      const conv = {
        id: id || `chat-${Date.now()}`,
        title: title || (messages[0]?.content?.slice(0, 40) || 'New Chat'),
        model: model || '',
        messages,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      data.conversations.unshift(conv);
    }
    writeChatHistory(data);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save chat history' });
  }
});

// DELETE conversation
app.delete('/api/chat/history/:id', (req, res) => {
  try {
    const data = readChatHistory();
    data.conversations = data.conversations.filter(c => c.id !== req.params.id);
    writeChatHistory(data);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

// ========== Sapporo Events API ==========

// In-memory cache for events
const sapporoEventsCache = {
  doorkeeper: { data: null, fetchedAt: null },
  connpass: { data: null, fetchedAt: null },
};
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Helper: fetch JSON from HTTPS URL
function fetchJSON(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...headers,
      },
    };
    https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          reject(new Error(`Invalid JSON: ${data.slice(0, 200)}`));
        }
      });
    }).on('error', reject).end();
  });
}

// GET /api/sapporo-events/doorkeeper — Doorkeeper IT events proxy
app.get('/api/sapporo-events/doorkeeper', async (req, res) => {
  try {
    const { since, until, keyword, refresh } = req.query;

    // Use cache unless force refresh
    const cache = sapporoEventsCache.doorkeeper;
    const cacheKey = `${since || ''}_${until || ''}_${keyword || ''}`;
    if (!refresh && cache.data && cache.cacheKey === cacheKey && cache.fetchedAt && (Date.now() - cache.fetchedAt < CACHE_TTL)) {
      return res.json({ source: 'cache', fetchedAt: cache.fetchedAt, events: cache.data });
    }

    // Build query params
    const params = new URLSearchParams();
    params.set('prefecture', 'hokkaido');
    params.set('sort', 'starts_at');
    if (keyword) params.set('q', keyword);
    else params.set('q', '札幌');
    if (since) params.set('since', since);
    if (until) params.set('until', until);

    const url = `https://api.doorkeeper.jp/events?${params.toString()}`;
    const result = await fetchJSON(url, { 'Authorization': `Bearer ${DOORKEEPER_TOKEN}` });

    if (result.status !== 200) {
      return res.status(result.status).json({ error: 'Doorkeeper API error', details: result.data });
    }

    // Normalize events
    const events = (result.data || []).map(item => {
      const e = item.event || item;
      return {
        id: `dk-${e.id}`,
        source: 'doorkeeper',
        title: e.title,
        description: e.description ? e.description.slice(0, 200) : '',
        startsAt: e.starts_at,
        endsAt: e.ends_at,
        venue: e.venue_name || '',
        address: e.address || '',
        url: e.public_url || e.event_url || '',
        participants: e.participants || 0,
        waitlisted: e.waitlisted || 0,
        limit: e.ticket_limit || 0,
        groupName: e.group?.title || '',
      };
    });

    // Update cache
    sapporoEventsCache.doorkeeper = { data: events, fetchedAt: Date.now(), cacheKey };
    res.json({ source: 'api', fetchedAt: Date.now(), events });
  } catch (err) {
    console.error('Doorkeeper fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch Doorkeeper events', message: err.message });
  }
});

// GET /api/sapporo-events/connpass — connpass IT events proxy (requires API key)
app.get('/api/sapporo-events/connpass', async (req, res) => {
  if (!CONNPASS_API_KEY) {
    return res.status(503).json({ error: 'connpass API key not configured', available: false });
  }

  try {
    const { ym, keyword, refresh } = req.query;
    const yearMonth = ym || (() => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}`; })();

    // Use cache unless force refresh
    const cache = sapporoEventsCache.connpass;
    const cacheKey = `${yearMonth}_${keyword || ''}`;
    if (!refresh && cache.data && cache.cacheKey === cacheKey && cache.fetchedAt && (Date.now() - cache.fetchedAt < CACHE_TTL)) {
      return res.json({ source: 'cache', fetchedAt: cache.fetchedAt, events: cache.data });
    }

    const params = new URLSearchParams();
    params.set('prefecture', 'hokkaido');
    params.set('ym', yearMonth);
    params.set('order', 'date');
    params.set('count', '50');
    if (keyword) params.set('keyword', keyword);
    else params.set('keyword', '札幌');

    const url = `https://connpass.com/api/v2/events/?${params.toString()}`;
    const result = await fetchJSON(url, { 'X-API-Key': CONNPASS_API_KEY });

    if (result.status !== 200) {
      return res.status(result.status).json({ error: 'connpass API error', details: result.data });
    }

    const events = (result.data?.events || []).map(e => ({
      id: `cp-${e.event_id}`,
      source: 'connpass',
      title: e.title,
      description: e.catch ? e.catch.slice(0, 200) : '',
      startsAt: e.started_at,
      endsAt: e.ended_at,
      venue: e.place || '',
      address: e.address || '',
      url: e.event_url || '',
      participants: e.accepted || 0,
      waitlisted: e.waiting || 0,
      limit: e.limit || 0,
      groupName: e.series?.title || '',
    }));

    sapporoEventsCache.connpass = { data: events, fetchedAt: Date.now(), cacheKey };
    res.json({ source: 'api', fetchedAt: Date.now(), events });
  } catch (err) {
    console.error('connpass fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch connpass events', message: err.message });
  }
});

// ============================================================================
// Sapporo Events Web Scraper System
// ============================================================================

const SCRAPE_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
const SCRAPE_TIMEOUT = 15000; // 15s per request

// Scraped events store
const scrapedEventsStore = {
  tourism: [],   // Array of event objects with absolute dates
  culture: [],
  fetchedAt: null,
  errors: [],
  lastAttempt: null,
};

// Helper: Fetch HTML from URL with timeout + redirect support
async function fetchHTML(url, timeoutMs = SCRAPE_TIMEOUT) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'ja,en;q=0.9',
      },
      redirect: 'follow',
    });
    const html = await response.text();
    return { status: response.status, html, url: response.url };
  } finally {
    clearTimeout(timeout);
  }
}

// Helper: Format date string
function fmtDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Helper: Extract Japanese date ranges from text
// Matches multiple date patterns found on Sapporo event websites
function extractJapaneseDateRanges(text) {
  const results = [];
  let m;

  // Pattern 1: YYYY年MM月DD日...～(MM月)?DD日 (standard Japanese)
  const rx1 = /(\d{4})年(\d{1,2})月(\d{1,2})日[^〜～~\n]{0,20}[〜～~]\s*(?:(\d{1,2})月)?(\d{1,2})日/g;
  while ((m = rx1.exec(text)) !== null) {
    results.push({
      year: parseInt(m[1]),
      startMonth: parseInt(m[2]), startDay: parseInt(m[3]),
      endMonth: m[4] ? parseInt(m[4]) : parseInt(m[2]),
      endDay: parseInt(m[5]),
    });
  }

  // Pattern 2: Compact YYYYMM.DD[DAY]~YYYYMM.DD[DAY] (sapporo.travel format)
  // e.g. 202609.11[FRI]~202610.03[SAT]
  const rx2 = /(\d{4})(\d{2})\.(\d{1,2})\[[^\]]*\][^~\-〜～\n]{0,5}[~\-〜～]\s*(\d{4})(\d{2})\.(\d{1,2})\[[^\]]*\]/g;
  while ((m = rx2.exec(text)) !== null) {
    const yr = parseInt(m[1]);
    const sm = parseInt(m[2]);
    const sd = parseInt(m[3]);
    if (!results.some(r => r.year === yr && r.startMonth === sm && r.startDay === sd)) {
      results.push({ year: yr, startMonth: sm, startDay: sd, endMonth: parseInt(m[5]), endDay: parseInt(m[6]) });
    }
  }

  // Pattern 3: YYYY/M/D(曜)～M/D or YYYY/M/D～YYYY/M/D
  const rx3 = /(\d{4})\/(\d{1,2})\/(\d{1,2})[^〜～~\n]{0,15}[〜～~]\s*(?:(\d{4})\/)?(?:(\d{1,2})\/)?(\d{1,2})/g;
  while ((m = rx3.exec(text)) !== null) {
    const yr = m[4] ? parseInt(m[4]) : parseInt(m[1]);
    const sm = parseInt(m[2]);
    const sd = parseInt(m[3]);
    const em = m[5] ? parseInt(m[5]) : sm;
    const ed = parseInt(m[6]);
    if (!results.some(r => r.year === parseInt(m[1]) && r.startMonth === sm && r.startDay === sd)) {
      results.push({ year: parseInt(m[1]), startMonth: sm, startDay: sd, endMonth: em, endDay: ed });
    }
  }

  return results;
}

// Helper: Filter dates by expected month range and deduplicate by year (keep first per year)
function filterSeasonalDates(dates, minMonth, maxMonth) {
  const seen = new Set();
  return dates
    .filter(d => d.startMonth >= minMonth && d.startMonth <= maxMonth)
    .filter(d => {
      if (seen.has(d.year)) return false;
      seen.add(d.year);
      return true;
    });
}

// ─── Individual Scrapers ───────────────────────────────────────

// 🎿 Snow Festival (snowfes.com) — expected: Jan~Feb
async function scrapeSnowFestival() {
  const { html } = await fetchHTML('https://www.snowfes.com/');
  const dates = filterSeasonalDates(extractJapaneseDateRanges(html), 1, 3);
  return dates.map(d => ({
    id: 'tour-1', source: 'tourism', scraped: true, scrapedFrom: 'snowfes.com',
    title: 'さっぽろ雪まつり', titleKo: '삿포로 눈축제', year: d.year,
    startsAt: `${fmtDate(d.year, d.startMonth, d.startDay)}T00:00:00+09:00`,
    endsAt: `${fmtDate(d.year, d.endMonth, d.endDay)}T23:59:59+09:00`,
    venue: '大通公園・すすきの・つどーむ',
    description: '世界的に有名な冬のイベント。大雪像や氷像が展示される',
    color: '#60A5FA', url: 'https://www.snowfes.com/',
  }));
}

// 💃 YOSAKOI Soran Festival (yosakoi-soran.jp) — expected: Jun
async function scrapeYosakoi() {
  const { html } = await fetchHTML('https://www.yosakoi-soran.jp/');
  const allDates = extractJapaneseDateRanges(html);
  // Also try YYYY.MM.DD pattern (some years use dots)
  const dotRx = /(\d{4})\.(\d{1,2})\.(\d{1,2})[^〜～~\n]{0,20}[〜～~]\s*(?:(\d{1,2})\.)?(\d{1,2})/g;
  let m;
  while ((m = dotRx.exec(html)) !== null) {
    const year = parseInt(m[1]);
    if (!allDates.some(d => d.year === year)) {
      allDates.push({
        year, startMonth: parseInt(m[2]), startDay: parseInt(m[3]),
        endMonth: m[4] ? parseInt(m[4]) : parseInt(m[2]), endDay: parseInt(m[5]),
      });
    }
  }
  const dates = filterSeasonalDates(allDates, 5, 7);
  return dates.map(d => ({
    id: 'tour-3', source: 'tourism', scraped: true, scrapedFrom: 'yosakoi-soran.jp',
    title: 'YOSAKOIソーラン祭り', titleKo: 'YOSAKOI 소란축제', year: d.year,
    startsAt: `${fmtDate(d.year, d.startMonth, d.startDay)}T00:00:00+09:00`,
    endsAt: `${fmtDate(d.year, d.endMonth, d.endDay)}T23:59:59+09:00`,
    venue: '大通公園周辺',
    description: '約300チームが参加する日本最大級のYOSAKOI祭り',
    color: '#F472B6', url: 'https://www.yosakoi-soran.jp/',
  }));
}

// 🌸 Lilac Festival (sapporo.travel) — expected: May
async function scrapeLilacFestival() {
  const { html } = await fetchHTML('https://www.sapporo.travel/lilacfes/');
  const dates = filterSeasonalDates(extractJapaneseDateRanges(html), 5, 6);
  return dates.map(d => ({
    id: 'tour-2', source: 'tourism', scraped: true, scrapedFrom: 'sapporo.travel/lilacfes',
    title: 'さっぽろライラックまつり', titleKo: '삿포로 라일락축제', year: d.year,
    startsAt: `${fmtDate(d.year, d.startMonth, d.startDay)}T00:00:00+09:00`,
    endsAt: `${fmtDate(d.year, d.endMonth, d.endDay)}T23:59:59+09:00`,
    venue: '大通公園',
    description: 'ライラックが咲き誇る春の祭り。ワインガーデンも人気',
    color: '#C084FC', url: 'https://www.sapporo.travel/find/event/lilac_festival/',
  }));
}

// 🍂 Autumn Fest (sapporo.travel) — expected: Sep~Oct
async function scrapeAutumnFest() {
  const { html } = await fetchHTML('https://www.sapporo.travel/autumnfest/');
  const dates = filterSeasonalDates(extractJapaneseDateRanges(html), 9, 10);
  return dates.map(d => ({
    id: 'tour-7', source: 'tourism', scraped: true, scrapedFrom: 'sapporo.travel/autumnfest',
    title: 'さっぽろオータムフェスト', titleKo: '삿포로 오텀페스트', year: d.year,
    startsAt: `${fmtDate(d.year, d.startMonth, d.startDay)}T00:00:00+09:00`,
    endsAt: `${fmtDate(d.year, d.endMonth, d.endDay)}T23:59:59+09:00`,
    venue: '大通公園',
    description: '北海道の食の祭典。道内各地のグルメが集結',
    color: '#FB923C', url: 'https://www.sapporo-autumnfest.jp/',
  }));
}

// ✨ White Illumination (sapporo.travel) — expected: Nov~Dec
async function scrapeWhiteIllumination() {
  const { html } = await fetchHTML('https://www.sapporo.travel/white-illumination/');
  const dates = filterSeasonalDates(extractJapaneseDateRanges(html), 10, 12);
  return dates.slice(0, 1).map(d => ({
    id: 'tour-8', source: 'tourism', scraped: true, scrapedFrom: 'sapporo.travel/white-illumination',
    title: 'さっぽろホワイトイルミネーション', titleKo: '삿포로 화이트 일루미네이션', year: d.year,
    startsAt: `${fmtDate(d.year, d.startMonth, d.startDay)}T00:00:00+09:00`,
    endsAt: `${fmtDate(d.year, d.endMonth, d.endDay)}T23:59:59+09:00`,
    venue: '大通公園・駅前通・南一条通',
    description: '日本初のイルミネーションイベント。約80万個のLED',
    color: '#93C5FD', url: 'https://white-illumination.jp/',
  }));
}

// 🏃 Hokkaido Marathon (hokkaido-marathon.com)
async function scrapeHokkaidoMarathon() {
  const { html } = await fetchHTML('https://www.hokkaido-marathon.com/');
  // Try standard date patterns
  let dates = extractJapaneseDateRanges(html);
  // Also check for single date: YYYY年MM月DD日
  const singleRx = /(\d{4})年(\d{1,2})月(\d{1,2})日/g;
  let m;
  while ((m = singleRx.exec(html)) !== null) {
    const yr = parseInt(m[1]);
    const mo = parseInt(m[2]);
    const dy = parseInt(m[3]);
    if (!dates.some(d => d.year === yr && d.startMonth === mo && d.startDay === dy)) {
      dates.push({ year: yr, startMonth: mo, startDay: dy, endMonth: mo, endDay: dy });
    }
  }
  // Also try countdown: "Days NNN" or "あと NNN 日" pattern to calculate
  if (dates.length === 0) {
    const countdownMatch = html.match(/Days\s*(\d+)/i) || html.match(/あと\s*(\d+)\s*日/);
    if (countdownMatch) {
      const daysLeft = parseInt(countdownMatch[1]);
      const eventDate = new Date(Date.now() + daysLeft * 86400000);
      dates.push({
        year: eventDate.getFullYear(),
        startMonth: eventDate.getMonth() + 1, startDay: eventDate.getDate(),
        endMonth: eventDate.getMonth() + 1, endDay: eventDate.getDate(),
      });
    }
  }
  return dates.filter(d => d.startMonth >= 7 && d.startMonth <= 9).slice(0, 1).map(d => ({
    id: 'tour-6', source: 'tourism', scraped: true, scrapedFrom: 'hokkaido-marathon.com',
    title: '北海道マラソン', titleKo: '홋카이도 마라톤', year: d.year,
    startsAt: `${fmtDate(d.year, d.startMonth, d.startDay)}T00:00:00+09:00`,
    endsAt: `${fmtDate(d.year, d.endMonth, d.endDay)}T23:59:59+09:00`,
    venue: '大通公園 (発着)',
    description: '夏の北海道を走るフルマラソン大会',
    color: '#34D399', url: 'https://www.hokkaido-marathon.com/',
  }));
}

// 🎶 PMF - Pacific Music Festival (pmf.or.jp)
async function scrapePMF() {
  // Try current year's info page first
  const year = new Date().getFullYear();
  let html;
  try {
    const result = await fetchHTML(`https://www.pmf.or.jp/jp/news/information/pmf${year}.html`);
    html = result.html;
  } catch {
    // Fallback to next year
    try {
      const result2 = await fetchHTML(`https://www.pmf.or.jp/jp/news/information/pmf${year + 1}.html`);
      html = result2.html;
    } catch {
      // Try main page
      const result3 = await fetchHTML('https://www.pmf.or.jp/');
      html = result3.html;
    }
  }
  if (!html) return [];
  const dates = extractJapaneseDateRanges(html);
  return dates.filter(d => d.startMonth >= 6 && d.startMonth <= 8).slice(0, 1).map(d => ({
    id: 'cult-1', source: 'culture', category: 'music', scraped: true, scrapedFrom: 'pmf.or.jp',
    title: 'PMF（パシフィック・ミュージック・フェスティバル）',
    titleKo: 'PMF (퍼시픽 뮤직 페스티벌)', year: d.year,
    startsAt: `${fmtDate(d.year, d.startMonth, d.startDay)}T00:00:00+09:00`,
    endsAt: `${fmtDate(d.year, d.endMonth, d.endDay)}T23:59:59+09:00`,
    venue: '札幌コンサートホールKitara・芸術の森',
    description: 'バーンスタインが創設した国際教育音楽祭。世界中の若手音楽家が集う',
    url: 'https://www.pmf.or.jp/',
  }));
}

// 🎷 Sapporo City Jazz
async function scrapeCityJazz() {
  const { html } = await fetchHTML('https://sapporocityjazz.jp/');
  const dates = extractJapaneseDateRanges(html);
  return dates.filter(d => d.startMonth >= 6 && d.startMonth <= 8).slice(0, 1).map(d => ({
    id: 'cult-2', source: 'culture', category: 'music', scraped: true, scrapedFrom: 'sapporocityjazz.jp',
    title: 'サッポロ・シティ・ジャズ', titleKo: '삿포로 시티 재즈', year: d.year,
    startsAt: `${fmtDate(d.year, d.startMonth, d.startDay)}T00:00:00+09:00`,
    endsAt: `${fmtDate(d.year, d.endMonth, d.endDay)}T23:59:59+09:00`,
    venue: '芸術の森・大通公園',
    description: '国内最大級の野外ジャズフェスティバル。エゾ・グルーヴを感じる夏',
    url: 'https://sapporocityjazz.jp/',
  }));
}

// 🎸 RISING SUN ROCK FESTIVAL
async function scrapeRisingSun() {
  const { html } = await fetchHTML('https://rfrfes.com/');
  const dates = extractJapaneseDateRanges(html);
  return dates.filter(d => d.startMonth >= 7 && d.startMonth <= 9).slice(0, 1).map(d => ({
    id: 'cult-3', source: 'culture', category: 'music', scraped: true, scrapedFrom: 'rfrfes.com',
    title: 'RISING SUN ROCK FESTIVAL', titleKo: '라이징 선 록 페스티벌', year: d.year,
    startsAt: `${fmtDate(d.year, d.startMonth, d.startDay)}T00:00:00+09:00`,
    endsAt: `${fmtDate(d.year, d.endMonth, d.endDay)}T23:59:59+09:00`,
    venue: '石狩湾新港樽川ふ頭横野外特設ステージ',
    description: '北海道最大のロックフェス。オールナイトで音楽を楽しむ',
    url: 'https://rfrfes.com/',
  }));
}

// 🎬 Sapporo Short Film Festival
async function scrapeShortFilmFest() {
  const { html } = await fetchHTML('https://sapporoshortfest.jp/');
  const dates = extractJapaneseDateRanges(html);
  return dates.filter(d => d.startMonth >= 9 && d.startMonth <= 11).slice(0, 1).map(d => ({
    id: 'cult-4', source: 'culture', category: 'music', scraped: true, scrapedFrom: 'sapporoshortfest.jp',
    title: '札幌国際短編映画祭', titleKo: '삿포로 국제 단편영화제', year: d.year,
    startsAt: `${fmtDate(d.year, d.startMonth, d.startDay)}T00:00:00+09:00`,
    endsAt: `${fmtDate(d.year, d.endMonth, d.endDay)}T23:59:59+09:00`,
    venue: '札幌プラザ2・5',
    description: 'アジア最大級の短編映画祭。世界各地の短編作品を上映',
    url: 'https://sapporoshortfest.jp/',
  }));
}

// ─── Scraper Orchestrator ──────────────────────────────────────

async function scrapeAllEvents() {
  console.log('[Scraper] Starting periodic event scrape...');
  const errors = [];
  const tourismEvents = [];
  const cultureEvents = [];

  // NOTE: sapporo.travel pages (lilac, autumnfest, illumination) are JavaScript-rendered SPAs
  // whose dates cannot be extracted via fetch(). They use verified fallback data instead.
  const scrapers = [
    // Tourism (SSR sites that work with fetch + regex)
    { fn: scrapeSnowFestival, target: tourismEvents, name: 'snowfes' },
    { fn: scrapeYosakoi, target: tourismEvents, name: 'yosakoi' },
    { fn: scrapeHokkaidoMarathon, target: tourismEvents, name: 'marathon' },
    // Culture (SSR sites)
    { fn: scrapePMF, target: cultureEvents, name: 'pmf' },
    { fn: scrapeCityJazz, target: cultureEvents, name: 'cityjazz' },
    { fn: scrapeRisingSun, target: cultureEvents, name: 'risingsun' },
    { fn: scrapeShortFilmFest, target: cultureEvents, name: 'shortfest' },
  ];

  await Promise.allSettled(scrapers.map(async ({ fn, target, name }) => {
    try {
      const events = await fn();
      if (events.length > 0) {
        target.push(...events);
        console.log(`[Scraper] ${name}: ${events.length} event(s) found`);
      } else {
        console.log(`[Scraper] ${name}: no dates found on page`);
      }
    } catch (e) {
      errors.push({ scraper: name, error: e.message });
      console.error(`[Scraper] ${name} failed:`, e.message);
    }
  }));

  scrapedEventsStore.tourism = tourismEvents;
  scrapedEventsStore.culture = cultureEvents;
  scrapedEventsStore.fetchedAt = Date.now();
  scrapedEventsStore.errors = errors;
  scrapedEventsStore.lastAttempt = new Date().toISOString();

  console.log(`[Scraper] Done: tourism=${tourismEvents.length}, culture=${cultureEvents.length}, errors=${errors.length}`);
}

// Start periodic scraping (after 5s delay for server startup, then every 24h)
setTimeout(() => {
  scrapeAllEvents();
  setInterval(scrapeAllEvents, SCRAPE_INTERVAL);
}, 5000);

// ─── Fallback Static Data (confirmed 2026 dates from official sites) ───

// Dates verified 2025-06 from official websites. Used when scraping fails.
const TOURISM_FALLBACK = [
  { id: 'tour-1', source: 'tourism', title: 'さっぽろ雪まつり', titleKo: '삿포로 눈축제', startsAt: '-02-04', endsAt: '-02-11', venue: '大通公園・すすきの・つどーむ', description: '世界的に有名な冬のイベント。大雪像や氷像が展示される', color: '#60A5FA', url: 'https://www.snowfes.com/' },
  { id: 'tour-2', source: 'tourism', title: 'さっぽろライラックまつり', titleKo: '삿포로 라일락축제', startsAt: '-05-20', endsAt: '-05-31', venue: '大通公園', description: 'ライラックが咲き誇る春の祭り。ワインガーデンも人気', color: '#C084FC', url: 'https://www.sapporo.travel/find/event/lilac_festival/' },
  { id: 'tour-3', source: 'tourism', title: 'YOSAKOIソーラン祭り', titleKo: 'YOSAKOI 소란축제', startsAt: '-06-10', endsAt: '-06-14', venue: '大通公園周辺', description: '約300チームが参加する日本最大級のYOSAKOI祭り', color: '#F472B6', url: 'https://www.yosakoi-soran.jp/' },
  { id: 'tour-4', source: 'tourism', title: 'さっぽろ夏まつり', titleKo: '삿포로 여름축제', startsAt: '-07-19', endsAt: '-08-16', venue: '大通公園', description: 'ビアガーデンや盆踊りなど夏の風物詩', color: '#FBBF24', url: 'https://www.sapporo.travel/find/event/summer_festival/' },
  { id: 'tour-5', source: 'tourism', title: '大通ビアガーデン', titleKo: '오도리 비어가든', startsAt: '-07-19', endsAt: '-08-14', venue: '大通公園 5〜11丁目', description: '日本最大級のビアガーデン。約1万3千席', color: '#F59E0B', url: 'https://www.sapporo.travel/find/event/odori_beer_garden/' },
  { id: 'tour-6', source: 'tourism', title: '北海道マラソン', titleKo: '홋카이도 마라톤', startsAt: '-08-30', endsAt: '-08-30', venue: '大通公園 (発着)', description: '夏の北海道を走るフルマラソン大会', color: '#34D399', url: 'https://www.hokkaido-marathon.com/' },
  { id: 'tour-7', source: 'tourism', title: 'さっぽろオータムフェスト', titleKo: '삿포로 오텀페스트', startsAt: '-09-11', endsAt: '-10-03', venue: '大通公園', description: '北海道の食の祭典。道内各地のグルメが集結', color: '#FB923C', url: 'https://www.sapporo-autumnfest.jp/' },
  { id: 'tour-8', source: 'tourism', title: 'さっぽろホワイトイルミネーション', titleKo: '삿포로 화이트 일루미네이션', startsAt: '-11-21', endsAt: '-12-25', venue: '大通公園・駅前通・南一条通', description: '日本初のイルミネーションイベント。約80万個のLED', color: '#93C5FD', url: 'https://white-illumination.jp/' },
  { id: 'tour-9', source: 'tourism', title: 'ミュンヘン・クリスマス市', titleKo: '뮌헨 크리스마스 마켓', startsAt: '-11-21', endsAt: '-12-25', venue: '大通公園2丁目', description: '姉妹都市ミュンヘンにちなんだクリスマスマーケット', color: '#F87171', url: 'https://www.sapporo.travel/find/event/munich_christmas/' },
  { id: 'tour-10', source: 'tourism', title: '初詣（北海道神宮）', titleKo: '새해 첫 참배 (홋카이도 신궁)', startsAt: '-01-01', endsAt: '-01-03', venue: '北海道神宮', description: '毎年約80万人が訪れる北海道最大の初詣スポット', color: '#FCA5A5', url: 'https://www.hokkaidojingu.or.jp/' },
];

const CULTURE_FALLBACK = [
  // 🎵 Music & Performing Arts
  { id: 'cult-1', source: 'culture', category: 'music', title: 'PMF（パシフィック・ミュージック・フェスティバル）', titleKo: 'PMF (퍼시픽 뮤직 페스티벌)', startsAt: '-07-07', endsAt: '-07-27', venue: '札幌コンサートホールKitara・芸術の森', description: 'バーンスタインが創設した国際教育音楽祭。世界中の若手音楽家が集う', url: 'https://www.pmf.or.jp/' },
  { id: 'cult-2', source: 'culture', category: 'music', title: 'サッポロ・シティ・ジャズ', titleKo: '삿포로 시티 재즈', startsAt: '-07-05', endsAt: '-07-27', venue: '芸術の森・大通公園', description: '国内最大級の野外ジャズフェスティバル。エゾ・グルーヴを感じる夏', url: 'https://sapporocityjazz.jp/' },
  { id: 'cult-3', source: 'culture', category: 'music', title: 'RISING SUN ROCK FESTIVAL', titleKo: '라이징 선 록 페스티벌', startsAt: '-08-15', endsAt: '-08-16', venue: '石狩湾新港樽川ふ頭横野外特設ステージ', description: '北海道最大のロックフェス。オールナイトで音楽を楽しむ', url: 'https://rfrfes.com/' },
  { id: 'cult-4', source: 'culture', category: 'music', title: '札幌国際短編映画祭', titleKo: '삿포로 국제 단편영화제', startsAt: '-10-15', endsAt: '-10-20', venue: '札幌プラザ2・5', description: 'アジア最大級の短編映画祭。世界各地の短編作品を上映', url: 'https://sapporoshortfest.jp/' },
  // 🎨 Art & Exhibition
  { id: 'cult-5', source: 'culture', category: 'exhibition', title: '札幌芸術の森 野外美術館', titleKo: '삿포로 예술의 숲 야외미술관', startsAt: '-04-29', endsAt: '-11-03', venue: '札幌芸術の森', description: '7.5haの敷地に74点の彫刻作品。自然とアートが融合する美術館', url: 'https://artpark.or.jp/' },
  { id: 'cult-6', source: 'culture', category: 'exhibition', title: '北海道立近代美術館 特別展', titleKo: '홋카이도 근대미술관 특별전', startsAt: '-04-15', endsAt: '-06-15', venue: '北海道立近代美術館', description: '北海道ゆかりの美術を中心に国内外の近現代美術を展示', url: 'https://artmuseum.pref.hokkaido.lg.jp/knb/' },
  { id: 'cult-7', source: 'culture', category: 'exhibition', title: 'さっぽろアートステージ', titleKo: '삿포로 아트 스테이지', startsAt: '-11-01', endsAt: '-11-23', venue: '札幌市内各所', description: '演劇・音楽・映画など複合的な芸術祭。500円で楽しめるシアターZOO', url: 'https://s-artstage.com/' },
  { id: 'cult-8', source: 'culture', category: 'exhibition', title: 'モエレ沼公園 ガラスのピラミッド企画展', titleKo: '모에레누마공원 유리 피라미드 기획전', startsAt: '-05-01', endsAt: '-09-30', venue: 'モエレ沼公園 ガラスのピラミッド', description: 'イサム・ノグチ設計の公園内ガラスのピラミッドで開催される企画展', url: 'https://moerenumapark.jp/' },
  // 🏮 Seasonal & Cultural
  { id: 'cult-9', source: 'culture', category: 'seasonal', title: '北海道神宮例祭（札幌まつり）', titleKo: '홋카이도 신궁 예대제 (삿포로 마쓰리)', startsAt: '-06-14', endsAt: '-06-16', venue: '北海道神宮〜中島公園', description: '100年以上の歴史を持つ札幌の伝統祭り。神輿渡御と露店が賑わう', url: 'https://www.hokkaidojingu.or.jp/' },
  { id: 'cult-10', source: 'culture', category: 'seasonal', title: '定山渓温泉 渓流鯉のぼり', titleKo: '조잔케이 온천 잉어깃발', startsAt: '-04-01', endsAt: '-05-05', venue: '定山渓温泉街', description: '400匹以上の鯉のぼりが温泉街の渓谷を彩る春の風物詩', url: 'https://jozankei.jp/' },
  { id: 'cult-11', source: 'culture', category: 'seasonal', title: '定山渓ネイチャールミナリエ', titleKo: '조잔케이 네이처 루미나리에', startsAt: '-07-01', endsAt: '-10-31', venue: '定山渓温泉 二見公園', description: '温泉街の渓谷をライトアップ。自然とアートのイルミネーション', url: 'https://jozankei.jp/' },
  { id: 'cult-12', source: 'culture', category: 'seasonal', title: 'モエレ沼芸術花火', titleKo: '모에레누마 예술 불꽃놀이', startsAt: '-09-06', endsAt: '-09-06', venue: 'モエレ沼公園', description: '音楽とシンクロした芸術的な花火大会。イサム・ノグチの公園で開催', url: 'https://moerenumapark.jp/' },
  // 🛍️ Markets & Lifestyle
  { id: 'cult-13', source: 'culture', category: 'lifestyle', title: '大通公園 とうきびワゴン', titleKo: '오도리 공원 옥수수 왜건', startsAt: '-04-20', endsAt: '-10-07', venue: '大通公園', description: '札幌の春〜秋の風物詩。焼きとうきびの香りが大通公園を包む', url: 'https://www.sapporo.travel/' },
  { id: 'cult-14', source: 'culture', category: 'lifestyle', title: 'サッポロファクトリー クリスマス', titleKo: '삿포로 팩토리 크리스마스', startsAt: '-11-03', endsAt: '-12-25', venue: 'サッポロファクトリー', description: '高さ約15mの巨大クリスマスツリーが吹き抜け空間に登場', url: 'https://sapporofactory.jp/' },
  { id: 'cult-15', source: 'culture', category: 'lifestyle', title: '北海道フードフェスティバル', titleKo: '홋카이도 푸드 페스티벌', startsAt: '-09-13', endsAt: '-09-15', venue: '大通公園周辺', description: '北海道各地の名産品が集結するグルメイベント', url: 'https://www.sapporo.travel/' },
];

// ─── Resolve Functions (scraped data → fallback) ───────────────

// Resolve event dates for a given year from fallback static data
function resolveStaticEvents(events, year) {
  return events.map(event => ({
    ...event,
    scraped: false,
    startsAt: `${year}${event.startsAt}T00:00:00+09:00`,
    endsAt: `${year}${event.endsAt}T23:59:59+09:00`,
  }));
}

// Merge scraped + fallback: scraped data overrides fallback by ID
function mergeScrapedWithFallback(scrapedList, fallbackList, year) {
  const staticEvents = resolveStaticEvents(fallbackList, year);
  const merged = [...staticEvents];
  for (const se of scrapedList.filter(e => e.year === year)) {
    const idx = merged.findIndex(e => e.id === se.id);
    if (idx >= 0) {
      merged[idx] = { ...se }; // Override with scraped version
    } else {
      merged.push(se); // New event from scraping
    }
  }
  return merged;
}

function resolveTourismEvents(year) {
  return mergeScrapedWithFallback(scrapedEventsStore.tourism, TOURISM_FALLBACK, year);
}

function resolveCultureEvents(year) {
  return mergeScrapedWithFallback(scrapedEventsStore.culture, CULTURE_FALLBACK, year);
}

// GET /api/sapporo-events/scraper-status — Check scraper health
app.get('/api/sapporo-events/scraper-status', (req, res) => {
  res.json({
    lastAttempt: scrapedEventsStore.lastAttempt,
    fetchedAt: scrapedEventsStore.fetchedAt ? new Date(scrapedEventsStore.fetchedAt).toISOString() : null,
    scrapedCounts: {
      tourism: scrapedEventsStore.tourism.length,
      culture: scrapedEventsStore.culture.length,
    },
    errors: scrapedEventsStore.errors,
    nextScrapeIn: scrapedEventsStore.fetchedAt
      ? Math.max(0, Math.round((scrapedEventsStore.fetchedAt + SCRAPE_INTERVAL - Date.now()) / 60000)) + ' minutes'
      : 'pending',
    scrapedEvents: {
      tourism: scrapedEventsStore.tourism.map(e => ({ id: e.id, title: e.titleKo || e.title, year: e.year, from: e.scrapedFrom })),
      culture: scrapedEventsStore.culture.map(e => ({ id: e.id, title: e.titleKo || e.title, year: e.year, from: e.scrapedFrom })),
    },
  });
})

// GET /api/sapporo-events/tourism — Sapporo tourism events (scraped + fallback)
app.get('/api/sapporo-events/tourism', (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const events = resolveTourismEvents(year);
  const scrapedCount = events.filter(e => e.scraped).length;
  res.json({ source: scrapedCount > 0 ? 'scraped+fallback' : 'fallback', scrapedAt: scrapedEventsStore.fetchedAt, scrapedCount, events });
});

// GET /api/sapporo-events/culture — Sapporo culture events (scraped + fallback)
app.get('/api/sapporo-events/culture', (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const category = req.query.category;
  let events = resolveCultureEvents(year);
  if (category) {
    events = events.filter(e => e.category === category);
  }
  const scrapedCount = events.filter(e => e.scraped).length;
  res.json({ source: scrapedCount > 0 ? 'scraped+fallback' : 'fallback', scrapedAt: scrapedEventsStore.fetchedAt, scrapedCount, events });
});

// GET /api/sapporo-events/scrape — Force scrape now
app.get('/api/sapporo-events/scrape', async (req, res) => {
  await scrapeAllEvents();
  res.json({
    message: 'Scrape completed',
    fetchedAt: new Date(scrapedEventsStore.fetchedAt).toISOString(),
    tourism: scrapedEventsStore.tourism.length,
    culture: scrapedEventsStore.culture.length,
    errors: scrapedEventsStore.errors,
  });
});

// GET /api/sapporo-events/all — Combined endpoint (all sources)
app.get('/api/sapporo-events/all', async (req, res) => {
  const { year, month, refresh } = req.query;
  const y = parseInt(year) || new Date().getFullYear();
  const m = month ? parseInt(month) : new Date().getMonth() + 1;

  // Compute date range for the month
  const since = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const until = `${y}-${String(m).padStart(2, '0')}-${lastDay}`;

  const results = { doorkeeper: [], connpass: [], tourism: [], culture: [], errors: [] };

  // Fetch Doorkeeper
  try {
    const params = new URLSearchParams();
    params.set('prefecture', 'hokkaido');
    params.set('sort', 'starts_at');
    params.set('q', '札幌');
    params.set('since', since);
    params.set('until', until);

    const cache = sapporoEventsCache.doorkeeper;
    const cacheKey = `${since}_${until}_all`;
    let events;

    if (!refresh && cache.data && cache.cacheKey === cacheKey && cache.fetchedAt && (Date.now() - cache.fetchedAt < CACHE_TTL)) {
      events = cache.data;
    } else {
      const url = `https://api.doorkeeper.jp/events?${params.toString()}`;
      const result = await fetchJSON(url, { 'Authorization': `Bearer ${DOORKEEPER_TOKEN}` });
      if (result.status === 200) {
        events = (result.data || []).map(item => {
          const e = item.event || item;
          return {
            id: `dk-${e.id}`,
            source: 'doorkeeper',
            title: e.title,
            description: e.description ? e.description.slice(0, 200) : '',
            startsAt: e.starts_at,
            endsAt: e.ends_at,
            venue: e.venue_name || '',
            address: e.address || '',
            url: e.public_url || e.event_url || '',
            participants: e.participants || 0,
            waitlisted: e.waitlisted || 0,
            limit: e.ticket_limit || 0,
            groupName: e.group?.title || '',
          };
        });
        sapporoEventsCache.doorkeeper = { data: events, fetchedAt: Date.now(), cacheKey };
      } else {
        results.errors.push({ source: 'doorkeeper', status: result.status });
        events = [];
      }
    }
    results.doorkeeper = events;
  } catch (err) {
    results.errors.push({ source: 'doorkeeper', message: err.message });
  }

  // Fetch connpass (if key is configured)
  if (CONNPASS_API_KEY) {
    try {
      const ym = `${y}${String(m).padStart(2, '0')}`;
      const cache = sapporoEventsCache.connpass;
      const cacheKey = `${ym}_all`;
      let events;

      if (!refresh && cache.data && cache.cacheKey === cacheKey && cache.fetchedAt && (Date.now() - cache.fetchedAt < CACHE_TTL)) {
        events = cache.data;
      } else {
        const params = new URLSearchParams();
        params.set('prefecture', 'hokkaido');
        params.set('ym', ym);
        params.set('order', 'date');
        params.set('count', '50');
        params.set('keyword', '札幌');

        const url = `https://connpass.com/api/v2/events/?${params.toString()}`;
        const result = await fetchJSON(url, { 'X-API-Key': CONNPASS_API_KEY });
        if (result.status === 200) {
          events = (result.data?.events || []).map(e => ({
            id: `cp-${e.event_id}`,
            source: 'connpass',
            title: e.title,
            description: e.catch ? e.catch.slice(0, 200) : '',
            startsAt: e.started_at,
            endsAt: e.ended_at,
            venue: e.place || '',
            address: e.address || '',
            url: e.event_url || '',
            participants: e.accepted || 0,
            waitlisted: e.waiting || 0,
            limit: e.limit || 0,
            groupName: e.series?.title || '',
          }));
          sapporoEventsCache.connpass = { data: events, fetchedAt: Date.now(), cacheKey };
        } else {
          results.errors.push({ source: 'connpass', status: result.status });
          events = [];
        }
      }
      results.connpass = events;
    } catch (err) {
      results.errors.push({ source: 'connpass', message: err.message });
    }
  }

  // Tourism events
  const filterByMonth = (events) => events.filter(e => {
    const eMonth = new Date(e.startsAt).getMonth() + 1;
    const eEndMonth = new Date(e.endsAt).getMonth() + 1;
    return eMonth === m || eEndMonth === m || (eMonth < m && eEndMonth > m);
  });
  results.tourism = filterByMonth(resolveTourismEvents(y));

  // Culture events
  results.culture = filterByMonth(resolveCultureEvents(y));

  const allEvents = [...results.doorkeeper, ...results.connpass, ...results.tourism, ...results.culture];
  allEvents.sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));

  res.json({
    year: y,
    month: m,
    fetchedAt: Date.now(),
    total: allEvents.length,
    sources: {
      doorkeeper: results.doorkeeper.length,
      connpass: results.connpass.length,
      tourism: results.tourism.length,
      culture: results.culture.length,
    },
    errors: results.errors,
    events: allEvents,
  });
});

// ===== Infrastructure Dashboard APIs =====

// Grafana/Prometheus configuration
const GRAFANA_URL = process.env.GRAFANA_URL || 'https://grafana.seonology.com';
const GRAFANA_USER = process.env.GRAFANA_USER || 'admin';
const GRAFANA_PASS = process.env.GRAFANA_PASS || 'grafana-admin-pass';

// Tailscale configuration
const TAILSCALE_API_KEY = process.env.TAILSCALE_API_KEY || '';

// Synology NAS configuration
const NAS_HOST = process.env.NAS_HOST || '100.94.199.8';
const NAS_PORT = process.env.NAS_PORT || '5001';
const NAS_ACCOUNT = process.env.NAS_ACCOUNT || 'seon';
const NAS_PASSWORD = process.env.NAS_PASSWORD || '';

function promQuery(query) {
  const url = `${GRAFANA_URL}/api/datasources/proxy/1/api/v1/query?query=${encodeURIComponent(query)}`;
  const auth = Buffer.from(`${GRAFANA_USER}:${GRAFANA_PASS}`).toString('base64');
  const urlObj = new URL(url);
  const httpMod = urlObj.protocol === 'https:' ? https : require('http');
  return new Promise((resolve, reject) => {
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: { 'Accept': 'application/json', 'Authorization': `Basic ${auth}` },
    };
    httpMod.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    }).on('error', reject).end();
  });
}

// k3s Cluster Stats
app.get('/api/infra/cluster', async (req, res) => {
  try {
    // Fetch from both metrics-server (all nodes) and Prometheus (detailed metrics)
    const metricsPromise = isInCluster ? k8sRequest('/apis/metrics.k8s.io/v1beta1/nodes').catch(() => null) : null;
    const nodeListPromise = isInCluster ? k8sRequest('/api/v1/nodes').catch(() => null) : null;

    const [cpuRes, memRes, memTotalRes, diskRes, diskTotalRes, nodeInfoRes, podRes, metricsData, nodeListData] = await Promise.all([
      promQuery('100-(avg by(instance)(rate(node_cpu_seconds_total{mode="idle"}[5m]))*100)').catch(() => null),
      promQuery('node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes').catch(() => null),
      promQuery('node_memory_MemTotal_bytes').catch(() => null),
      promQuery('node_filesystem_size_bytes{mountpoint="/",fstype!="rootfs"} - node_filesystem_avail_bytes{mountpoint="/",fstype!="rootfs"}').catch(() => null),
      promQuery('node_filesystem_size_bytes{mountpoint="/",fstype!="rootfs"}').catch(() => null),
      promQuery('node_uname_info').catch(() => null),
      promQuery('count by(namespace)(kube_pod_info)').catch(() => null),
      metricsPromise,
      nodeListPromise,
    ]);

    const nodes = {};
    const getInst = (r) => r.metric?.instance || '';

    // Build node info from k8s API (all nodes including Lightsail)
    const nodeCapacity = {};
    (nodeListData?.items || []).forEach(n => {
      const name = n.metadata?.name || '';
      const labels = n.metadata?.labels || {};
      const cap = n.status?.capacity || {};
      const alloc = n.status?.allocatable || {};
      nodeCapacity[name] = {
        cpuCores: parseInt(alloc.cpu || cap.cpu || '0'),
        memTotal: parseInt(alloc.memory || cap.memory || '0') * 1024, // Ki to bytes
        nodeType: labels['node-type'] || '',
        os: n.status?.nodeInfo?.osImage || '',
        kubelet: n.status?.nodeInfo?.kubeletVersion || '',
        ready: (n.status?.conditions || []).some(c => c.type === 'Ready' && c.status === 'True'),
      };
    });

    // Build nodes from metrics-server (all nodes)
    (metricsData?.items || []).forEach(m => {
      const name = m.metadata?.name || '';
      const cpuNano = parseInt((m.usage?.cpu || '0').replace('n', '')) || 0;
      const memBytes = parseInt((m.usage?.memory || '0').replace('Ki', '')) * 1024 || 0;
      const cap = nodeCapacity[name] || {};
      const cpuPct = cap.cpuCores ? (cpuNano / (cap.cpuCores * 1e9)) * 100 : 0;
      nodes[name] = {
        name: name,
        instance: name,
        cpu: Math.round(cpuPct * 10) / 10,
        memUsed: memBytes,
        memTotal: cap.memTotal || 0,
        nodeType: cap.nodeType,
        os: cap.os,
        kubelet: cap.kubelet,
        ready: cap.ready !== false,
        source: 'metrics-server',
      };
    });

    // Override with Prometheus data (more accurate for nodes that have node-exporter)
    const promNodes = {};
    (nodeInfoRes?.data?.result || []).forEach(r => {
      const inst = getInst(r);
      const nodename = r.metric?.nodename || inst;
      promNodes[inst] = nodename;
    });

    (cpuRes?.data?.result || []).forEach(r => {
      const inst = getInst(r);
      const nodename = promNodes[inst];
      if (nodename && nodes[nodename]) {
        nodes[nodename].cpu = parseFloat(r.value?.[1] || 0);
        nodes[nodename].source = 'prometheus';
      }
    });

    (memRes?.data?.result || []).forEach(r => {
      const inst = getInst(r);
      const nodename = promNodes[inst];
      if (nodename && nodes[nodename]) nodes[nodename].memUsed = parseInt(r.value?.[1] || 0);
    });
    (memTotalRes?.data?.result || []).forEach(r => {
      const inst = getInst(r);
      const nodename = promNodes[inst];
      if (nodename && nodes[nodename]) nodes[nodename].memTotal = parseInt(r.value?.[1] || 0);
    });

    (diskRes?.data?.result || []).forEach(r => {
      const inst = getInst(r);
      const nodename = promNodes[inst];
      if (nodename && nodes[nodename]) nodes[nodename].diskUsed = parseInt(r.value?.[1] || 0);
    });
    (diskTotalRes?.data?.result || []).forEach(r => {
      const inst = getInst(r);
      const nodename = promNodes[inst];
      if (nodename && nodes[nodename]) nodes[nodename].diskTotal = parseInt(r.value?.[1] || 0);
    });

    // Pods per namespace
    const namespaces = {};
    (podRes?.data?.result || []).forEach(r => {
      namespaces[r.metric?.namespace || '?'] = parseInt(r.value?.[1] || 0);
    });

    res.json({
      nodes: Object.values(nodes),
      namespaces,
      totalPods: Object.values(namespaces).reduce((a, b) => a + b, 0),
    });
  } catch (err) {
    console.error('Cluster stats error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Tailscale Devices
app.get('/api/infra/tailscale', async (req, res) => {
  if (!TAILSCALE_API_KEY) return res.status(500).json({ error: 'Tailscale API key not configured' });
  try {
    const auth = Buffer.from(`${TAILSCALE_API_KEY}:`).toString('base64');
    const data = await new Promise((resolve, reject) => {
      https.request({
        hostname: 'api.tailscale.com',
        path: '/api/v2/tailnet/-/devices',
        method: 'GET',
        headers: { 'Authorization': `Basic ${auth}`, 'Accept': 'application/json' },
      }, (resp) => {
        let body = '';
        resp.on('data', c => body += c);
        resp.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { reject(new Error(`Parse error: ${body.slice(0,200)}`)); } });
      }).on('error', e => reject(new Error(`Request error: ${e.message}`))).end();
    });
    if (data.message) throw new Error(data.message);
    const now = Date.now();
    const devices = (data.devices || []).map(d => {
      const lastSeenMs = d.lastSeen ? new Date(d.lastSeen).getTime() : 0;
      const isOnline = d.online === true || (d.online == null && lastSeenMs > 0 && (now - lastSeenMs) < 300000);
      return {
        hostname: d.hostname,
        ip: d.addresses?.[0] || '',
        os: d.os || '',
        online: isOnline,
        lastSeen: d.lastSeen || '',
        clientVersion: d.clientVersion || '',
      };
    });
    res.json({ devices });
  } catch (err) {
    console.error('Tailscale error:', err.message || err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Synology NAS Status
let nasSid = null;
let nasSidTime = 0;

async function nasLogin() {
  const now = Date.now();
  if (nasSid && (now - nasSidTime) < 600000) return nasSid; // reuse for 10min
  const url = `https://${NAS_HOST}:${NAS_PORT}/webapi/entry.cgi?api=SYNO.API.Auth&version=6&method=login&account=${NAS_ACCOUNT}&passwd=${encodeURIComponent(NAS_PASSWORD)}&format=sid`;
  const data = await new Promise((resolve, reject) => {
    const req = https.request(url, { rejectUnauthorized: false }, (resp) => {
      let body = '';
      resp.on('data', c => body += c);
      resp.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.end();
  });
  if (data.success) {
    nasSid = data.data.sid;
    nasSidTime = now;
    return nasSid;
  }
  throw new Error('NAS login failed');
}

function nasApi(api, version, method, sid) {
  const url = `https://${NAS_HOST}:${NAS_PORT}/webapi/entry.cgi?api=${api}&version=${version}&method=${method}&_sid=${sid}`;
  return new Promise((resolve, reject) => {
    const req = https.request(url, { rejectUnauthorized: false, timeout: 10000 }, (resp) => {
      let body = '';
      resp.on('data', c => body += c);
      resp.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('NAS API timeout')); });
    req.end();
  });
}

app.get('/api/infra/nas', async (req, res) => {
  if (!NAS_PASSWORD) return res.status(500).json({ error: 'NAS password not configured' });
  try {
    // Force fresh login to avoid stale session
    nasSid = null;
    nasSidTime = 0;
    const sid = await nasLogin();
    const [sysInfo, utilization, storage, connections, shares] = await Promise.all([
      nasApi('SYNO.Core.System', 3, 'info', sid),
      nasApi('SYNO.Core.System.Utilization', 1, 'get', sid),
      nasApi('SYNO.Storage.CGI.Storage', 1, 'load_info', sid),
      nasApi('SYNO.Core.CurrentConnection', 1, 'list', sid).catch(() => ({ data: {} })),
      nasApi('SYNO.Core.Share', 1, 'list', sid).catch(() => ({ data: {} })),
    ]);

    const sys = sysInfo.data || {};
    if (!sysInfo.success) console.error('NAS sysInfo failed:', JSON.stringify(sysInfo));
    const util = utilization.data || {};
    if (!utilization.success) console.error('NAS utilization failed:', JSON.stringify(utilization));
    const cpu = util.cpu || {};
    const mem = util.memory || {};
    const memTotal = parseInt(mem.memory_size || 0);
    const memAvail = parseInt(mem.avail_real || 0);

    // Network interfaces
    const network = (util.network || []).map(n => ({
      device: n.device,
      rx: n.rx || 0,
      tx: n.tx || 0,
    }));

    // Disk I/O
    const diskIO = [];
    const diskUtil = util.disk || {};
    if (diskUtil.total) {
      diskIO.push({ device: 'total', read: diskUtil.total.read_access || 0, write: diskUtil.total.write_access || 0 });
    }
    if (Array.isArray(diskUtil.disk)) {
      diskUtil.disk.forEach(d => {
        diskIO.push({ device: d.device || '?', read: d.read_access || 0, write: d.write_access || 0 });
      });
    }

    const volumes = (storage.data?.volumes || []).map(v => ({
      id: v.id,
      total: parseInt(v.size?.total || 0),
      used: parseInt(v.size?.used || 0),
      status: v.status,
    }));

    const disks = (storage.data?.disks || []).map(d => ({
      id: d.id,
      model: d.model,
      temp: d.temp,
      status: d.status,
      size: d.size_total,
      smart_status: d.smart_status,
    }));

    // Connected users
    const connList = connections.data?.items || connections.data || [];
    const connUsers = Array.isArray(connList) ? connList.map(c => ({
      user: c.who || c.user || '?',
      from: c.from || c.ip || '?',
      type: c.type || '?',
      time: c.time || '',
    })) : [];

    // Shared folders
    const sharedFolders = (shares.data?.shares || []).map(s => ({
      name: s.name,
      path: s.vol_path || s.path || '',
      desc: s.desc || '',
    }));

    res.json({
      model: sys.model,
      firmware: sys.firmware_ver,
      temp: sys.sys_temp,
      uptime: sys.up_time,
      serial: sys.serial,
      cpu: { user: cpu.user_load, system: cpu.system_load },
      memory: { total: memTotal, used: memTotal - memAvail, cached: parseInt(mem.cached_kern || 0), swapUsed: parseInt(mem.real_usage || 0) },
      network,
      diskIO,
      volumes,
      disks,
      connections: connUsers,
      shares: sharedFolders,
    });
  } catch (err) {
    console.error('NAS error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===== NAS File Browser APIs =====

async function getNasSid() {
  nasSid = null;
  nasSidTime = 0;
  return nasLogin();
}

// List shares
app.get('/api/nas/shares', async (req, res) => {
  try {
    const sid = await getNasSid();
    const data = await nasApi('SYNO.FileStation.List', 2, 'list_share', sid);
    if (!data.success) throw new Error('Failed to list shares');
    res.json({ shares: (data.data.shares || []).map(s => ({ name: s.name, path: s.path })) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// List files in folder
app.get('/api/nas/files', async (req, res) => {
  const folder = req.query.path;
  if (!folder) return res.status(400).json({ error: 'path required' });
  try {
    const sid = await getNasSid();
    const sort = req.query.sort || 'name';
    const dir = req.query.dir || 'ASC';
    const data = await nasApi('SYNO.FileStation.List', 2,
      `list&folder_path=${encodeURIComponent(folder)}&additional=size,time,type&sort_by=${sort}&sort_direction=${dir}`, sid);
    if (!data.success) throw new Error(`Failed to list: ${JSON.stringify(data.error)}`);
    const files = (data.data.files || []).map(f => ({
      name: f.name,
      path: f.path,
      isdir: f.isdir,
      size: f.additional?.size || 0,
      time: f.additional?.time?.mtime || 0,
      type: f.additional?.type || '',
    }));
    res.json({ files, total: data.data.total || files.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Create folder
app.post('/api/nas/mkdir', async (req, res) => {
  const { folderPath, name } = req.body;
  if (!folderPath || !name) return res.status(400).json({ error: 'folderPath and name required' });
  try {
    const sid = await getNasSid();
    const data = await nasApi('SYNO.FileStation.CreateFolder', 2,
      `create&folder_path=${encodeURIComponent(folderPath)}&name=${encodeURIComponent(name)}`, sid);
    if (!data.success) throw new Error(`Failed: ${JSON.stringify(data.error)}`);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Rename
app.post('/api/nas/rename', async (req, res) => {
  const { path: filePath, name } = req.body;
  if (!filePath || !name) return res.status(400).json({ error: 'path and name required' });
  try {
    const sid = await getNasSid();
    const data = await nasApi('SYNO.FileStation.Rename', 2,
      `rename&path=${encodeURIComponent(filePath)}&name=${encodeURIComponent(name)}`, sid);
    if (!data.success) throw new Error(`Failed: ${JSON.stringify(data.error)}`);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Delete
app.post('/api/nas/delete', async (req, res) => {
  const { path: filePath } = req.body;
  if (!filePath) return res.status(400).json({ error: 'path required' });
  try {
    const sid = await getNasSid();
    const data = await nasApi('SYNO.FileStation.Delete', 2,
      `delete&path=${encodeURIComponent(filePath)}`, sid);
    if (!data.success) throw new Error(`Failed: ${JSON.stringify(data.error)}`);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Move/Copy
app.post('/api/nas/move', async (req, res) => {
  const { path: filePath, destPath, overwrite } = req.body;
  if (!filePath || !destPath) return res.status(400).json({ error: 'path and destPath required' });
  try {
    const sid = await getNasSid();
    const data = await nasApi('SYNO.FileStation.CopyMove', 3,
      `start&path=${encodeURIComponent(filePath)}&dest_folder_path=${encodeURIComponent(destPath)}&remove_src=true&overwrite=${overwrite ? 'true' : 'false'}`, sid);
    if (!data.success) throw new Error(`Failed: ${JSON.stringify(data.error)}`);
    res.json({ success: true, taskid: data.data?.taskid });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Download proxy
app.get('/api/nas/download', async (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).json({ error: 'path required' });
  try {
    const sid = await getNasSid();
    const url = `https://${NAS_HOST}:${NAS_PORT}/webapi/entry.cgi?api=SYNO.FileStation.Download&version=2&method=download&path=${encodeURIComponent(filePath)}&mode=download&_sid=${sid}`;
    const fileName = filePath.split('/').pop();
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    const proxyReq = https.request(url, { rejectUnauthorized: false, timeout: 600000 }, (proxyRes) => {
      if (proxyRes.headers['content-type']) res.setHeader('Content-Type', proxyRes.headers['content-type']);
      if (proxyRes.headers['content-length']) res.setHeader('Content-Length', proxyRes.headers['content-length']);
      proxyRes.pipe(res);
    });
    proxyReq.on('error', (e) => { res.status(500).json({ error: e.message }); });
    proxyReq.end();
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Upload (streaming to NAS)
app.post('/api/nas/upload', async (req, res) => {
  const busboy = require('busboy');
  let destPath = '';
  let fileName = '';
  let uploadDone = false;

  try {
    const sid = await getNasSid();
    const bb = busboy({ headers: req.headers, limits: { fileSize: 11 * 1024 * 1024 * 1024 } });

    bb.on('field', (name, val) => {
      if (name === 'path') destPath = val;
    });

    bb.on('file', (fieldname, fileStream, info) => {
      fileName = info.filename;
      if (!destPath) { fileStream.resume(); return; }

      const boundary = '----NASStream' + Date.now();
      const parts = [];
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="api"\r\n\r\nSYNO.FileStation.Upload`);
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="version"\r\n\r\n2`);
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="method"\r\n\r\nupload`);
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="path"\r\n\r\n${destPath}`);
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="create_parents"\r\n\r\ntrue`);
      parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="overwrite"\r\n\r\ntrue`);
      const fileHeader = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`;
      const prefix = parts.join('\r\n') + '\r\n' + fileHeader;
      const footer = `\r\n--${boundary}--\r\n`;

      const nasReq = https.request({
        hostname: NAS_HOST, port: NAS_PORT,
        path: `/webapi/entry.cgi?_sid=${sid}`,
        method: 'POST', rejectUnauthorized: false,
        headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Transfer-Encoding': 'chunked' },
        timeout: 600000,
      }, (nasRes) => {
        let body = '';
        nasRes.on('data', c => body += c);
        nasRes.on('end', () => {
          uploadDone = true;
          try {
            const d = JSON.parse(body);
            if (d.success) res.json({ success: true });
            else res.status(500).json({ error: `Upload failed: ${JSON.stringify(d.error)}` });
          } catch { res.status(500).json({ error: 'Invalid NAS response' }); }
        });
      });
      nasReq.on('error', (e) => { if (!uploadDone) res.status(500).json({ error: e.message }); });

      nasReq.write(prefix);
      fileStream.on('data', (chunk) => nasReq.write(chunk));
      fileStream.on('end', () => { nasReq.write(footer); nasReq.end(); });
      fileStream.on('error', (e) => { nasReq.destroy(); if (!uploadDone) res.status(500).json({ error: e.message }); });
    });

    bb.on('error', (e) => { if (!uploadDone) res.status(500).json({ error: e.message }); });
    req.pipe(bb);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Cloud Drive routes
setupGoogleRoutes(app);
setupMicrosoftRoutes(app);
setupGithubCatalogRoutes(app);

app.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
  console.log(`Running in cluster: ${isInCluster}`);
  console.log(`Bookmarks file: ${BOOKMARKS_FILE}`);
  console.log(`AI Chat: GitHub=${!!GITHUB_TOKEN}, Gemini=${!!GEMINI_API_KEY}`);
  console.log(`Sapporo Events: Doorkeeper=${!!DOORKEEPER_TOKEN}, connpass=${!!CONNPASS_API_KEY}`);
});
