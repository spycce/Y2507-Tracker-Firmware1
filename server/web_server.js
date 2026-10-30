// server/web_server.js - HTTP & Realtime WebSocket Telemetry Server
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const { WebSocketServer } = require('ws');
const db = require('./db');

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

class TelemetryWebServer {
  constructor(port = 8080, publicDir = null, tcpServer = null) {
    this.port = port;
    this.publicDir = publicDir || path.join(__dirname, '..', 'public');
    this.tcpServer = tcpServer;
    this.httpServer = null;
    this.wss = null;
    this.wsClients = new Set();
  }

  start() {
    return new Promise((resolve) => {
      this.httpServer = http.createServer((req, res) => this.handleHttpRequest(req, res));

      // Attach WebSocket server to the same HTTP server port
      this.wss = new WebSocketServer({ server: this.httpServer });

      this.wss.on('connection', (ws, req) => {
        const clientIp = req.socket.remoteAddress;
        this.wsClients.add(ws);
        console.log(`[WebSocket] Client connected: ${clientIp} (Total clients: ${this.wsClients.size})`);

        // Send initial synchronization payload
        const devices = db.getAllDevices();
        const alarms = db.getAlarms();
        const initialLocations = {};
        for (const dev of devices) {
          const latest = db.getLatestLocation(dev.imei);
          if (latest) {
            initialLocations[dev.imei] = latest;
          }
        }

        ws.send(JSON.stringify({
          type: 'SYNC_INIT',
          data: {
            devices,
            latestLocations: initialLocations,
            alarms,
            stats: this.tcpServer?.stats || {}
          }
        }));

        ws.on('message', (message) => {
          this.handleClientWsMessage(ws, message);
        });

        ws.on('close', () => {
          this.wsClients.delete(ws);
          console.log(`[WebSocket] Client disconnected: ${clientIp}`);
        });

        ws.on('error', (err) => {
          console.warn(`[WebSocket] Client error:`, err.message);
          this.wsClients.delete(ws);
        });
      });

      this.httpServer.listen(this.port, '0.0.0.0', () => {
        console.log(`[Web Dashboard] Live Telemetry UI listening on http://localhost:${this.port}`);
        resolve();
      });
    });
  }

  handleClientWsMessage(ws, raw) {
    try {
      const msg = JSON.parse(raw.toString());
      switch (msg.type) {
        case 'GET_TRAIL': {
          const imei = msg.imei;
          const trail = db.getRecentTrail(imei, 200);
          ws.send(JSON.stringify({
            type: 'TRAIL_DATA',
            imei,
            trail
          }));
          break;
        }

        case 'QUERY_HISTORY': {
          const { imei, from, to } = msg;
          const history = db.getHistory(imei, from || 0, to || Date.now());
          ws.send(JSON.stringify({
            type: 'HISTORY_RESULT',
            imei,
            history
          }));
          break;
        }

        default:
          break;
      }
    } catch (e) {
      console.error('[WebSocket] Error parsing client message:', e);
    }
  }

  handleHttpRequest(req, res) {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // CORS & Security headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // REST API Routes
    if (pathname === '/api/devices') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(db.getAllDevices()));
      return;
    }

    if (pathname.startsWith('/api/history/')) {
      const imei = pathname.replace('/api/history/', '');
      const limit = parseInt(parsedUrl.searchParams.get('limit'), 10) || 500;
      const trail = db.getRecentTrail(imei, limit);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(trail));
      return;
    }

    if (pathname === '/api/stats') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        tcp: this.tcpServer?.stats || {},
        connectedWebClients: this.wsClients.size
      }));
      return;
    }

    // Static File Serving
    let filePath = path.join(this.publicDir, pathname === '/' ? 'index.html' : pathname);

    // Prevent directory traversal
    if (!filePath.startsWith(this.publicDir)) {
      res.writeHead(403);
      res.end('Access Denied');
      return;
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        // Fallback to index.html for single-page app
        filePath = path.join(this.publicDir, 'index.html');
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      fs.readFile(filePath, (readErr, content) => {
        if (readErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found');
          return;
        }

        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      });
    });
  }

  // Broadcast event to all connected dashboard browsers
  broadcast(event) {
    if (this.wsClients.size === 0) return;
    const json = JSON.stringify(event);
    for (const ws of this.wsClients) {
      if (ws.readyState === ws.OPEN) {
        ws.send(json);
      }
    }
  }

  stop() {
    if (this.wss) {
      this.wss.close();
    }
    if (this.httpServer) {
      this.httpServer.close();
    }
  }
}

module.exports = TelemetryWebServer;
