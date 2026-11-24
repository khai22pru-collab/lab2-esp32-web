const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const key = process.env.DEVICE_KEY || 'doi-khoa-demo-nay';
const port = Number(process.env.PORT || 3000);
let state = null;
let lastSeen = 0;
let commandId = 0;
let commands = [];
const page = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

function respond(res, code, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}
function read(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 4096) { reject(Error('Too large')); req.destroy(); }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/' && req.method === 'GET') return respond(res, 200, page, 'text/html; charset=utf-8');
    if (url.pathname === '/api/device' && req.method === 'POST') {
      if (req.headers['x-device-key'] !== key) return respond(res, 403, 'Forbidden');
      const parsed = JSON.parse(await read(req));
      if (!Number.isInteger(parsed.water) || !Array.isArray(parsed.attendance)) return respond(res, 400, 'Invalid state');
      state = parsed; lastSeen = Date.now();
      const after = Number(url.searchParams.get('after') || 0);
      const next = commands.find(c => c.id > after);
      commands = commands.filter(c => c.id > after);
      return respond(res, 200, next ? next.id + ',' + next.key : '0,-');
    }
    // Dashboard dùng cùng khóa để người lạ không đọc hoặc điều khiển thiết bị.
    if (req.headers['x-device-key'] !== key) return respond(res, 403, 'Sai khóa truy cập');
    if (url.pathname === '/api/state' && req.method === 'GET') {
      return respond(res, 200, JSON.stringify({ ...state, connected: Date.now() - lastSeen < 10000 }), 'application/json');
    }
    if (url.pathname === '/api/control' && req.method === 'POST') {
      const body = new URLSearchParams(await read(req));
      const k = body.get('key');
      if (!/^[0-6]$/.test(k || '')) return respond(res, 400, 'Invalid key');
      if (Date.now() - lastSeen > 10000) return respond(res, 503, 'ESP32 offline');
      commands.push({ id: ++commandId, key: k });
      return respond(res, 200, JSON.stringify({ queued: true }), 'application/json');
    }
    respond(res, 404, 'Not found');
  } catch (e) { if (!res.headersSent) respond(res, 400, 'Bad request'); }
}).listen(port, () => console.log('Dashboard ready on port ' + port));
