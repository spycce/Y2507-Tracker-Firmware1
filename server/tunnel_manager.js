// server/tunnel_manager.js - Automated Internet Gateway Manager for Local & Cloud Testing
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

function getLocalLanIp() {
  try {
    const interfaces = os.networkInterfaces();
    for (const devName in interfaces) {
      const iface = interfaces[devName];
      for (const alias of iface) {
        if (alias.family === 'IPv4' && !alias.internal && !alias.address.startsWith('172.')) {
          return alias.address;
        }
      }
    }
  } catch (e) {}
  return '127.0.0.1';
}

class TunnelManager {
  constructor(localPort = 5023, defaultHost = '54.252.226.77', defaultPort = 5023, onStatusChange = null) {
    this.localPort = localPort;
    this.localIp = getLocalLanIp();
    this.remoteHost = process.env.PUBLIC_HOST || defaultHost;
    this.requestedPort = process.env.PUBLIC_PORT ? parseInt(process.env.PUBLIC_PORT, 10) : defaultPort;
    this.remotePort = this.requestedPort;
    this.isDirectHosting = process.env.PUBLIC_HOST ? true : (this.remoteHost !== 'bore.pub');
    this.proc = null;
    this.isActive = this.isDirectHosting;
    this.lastConnectedAt = this.isDirectHosting ? Date.now() : null;
    this.reconnectTimer = null;
    this.enabled = true;
    this.binPath = this.resolveBinary();
    this.onStatusChange = onStatusChange;
    this.useFallbackPort = false;
  }

  resolveBinary() {
    const candidates = [
      path.join(__dirname, '..', 'bin', 'bore.exe'),
      path.join(__dirname, '..', 'scratch', 'bore.exe'),
      path.join(__dirname, '..', 'bin', 'bore'),
      path.join(__dirname, '..', 'scratch', 'bore')
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return null;
  }

  async start() {
    // If PUBLIC_HOST is explicitly provided (e.g. AWS EC2 Elastic IP), use direct cloud hosting
    if (this.isDirectHosting) {
      console.log(`[Cloud Mode] Direct Public IP active on VPS/Cloud: ${this.remoteHost}:${this.remotePort}`);
      this.isActive = true;
      if (this.onStatusChange) this.onStatusChange(this.getStatus());
      return;
    }

    // Local Testing: If running locally without bore.exe, auto-detect Public IP or LAN mode
    if (!this.binPath) {
      try {
        console.log('[Local Test] bore.exe not found. Detecting router Public IP...');
        const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          const data = await res.json();
          if (data.ip) {
            this.remoteHost = data.ip;
            this.remotePort = this.localPort;
            this.isDirectHosting = true;
            this.isActive = true;
            this.lastConnectedAt = Date.now();
            console.log(`[Local Test] Detected Public WAN IP: ${this.remoteHost}:${this.remotePort}`);
            if (this.onStatusChange) this.onStatusChange(this.getStatus());
            return;
          }
        }
      } catch (e) {}
      console.log(`[Local Test] Running in Local LAN-only mode (PC IP: ${this.localIp}:${this.localPort})`);
      return;
    }

    if (this.proc) {
      return;
    }

    const args = ['local', this.localPort.toString(), '--to', this.remoteHost];
    if (!this.useFallbackPort && this.requestedPort > 0) {
      args.push('-p', this.requestedPort.toString());
    }

    console.log(`[Tunnel Manager] Starting local-to-public TCP bridge (${this.remoteHost}:${this.useFallbackPort ? 'auto' : this.requestedPort} -> localhost:${this.localPort})...`);

    try {
      this.proc = spawn(this.binPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      });

      const handleOutput = (chunk) => {
        const text = chunk.toString();
        // Match: "listening at bore.pub:<port>" or "bore.pub:<port>"
        const portMatch = text.match(/listening at [^:]+:(\d+)/i) || text.match(/bore\.pub:(\d+)/i);
        if (portMatch) {
          const parsedPort = parseInt(portMatch[1], 10);
          if (!isNaN(parsedPort) && parsedPort > 0) {
            this.remotePort = parsedPort;
          }
          this.isActive = true;
          this.lastConnectedAt = Date.now();
          console.log(`[Tunnel Manager] Bridge ACTIVE! Public endpoint: ${this.remoteHost}:${this.remotePort}`);
          console.log(`[Tunnel Manager] >>> SMS FOR TRACKER: SERVER,0,159.223.110.159,${this.remotePort},0# <<<`);
          if (this.onStatusChange) {
            this.onStatusChange(this.getStatus());
          }
        } else if (text.includes('listening at') || text.includes('connected to server')) {
          this.isActive = true;
          this.lastConnectedAt = Date.now();
          console.log(`[Tunnel Manager] Bridge ACTIVE! Public endpoint: ${this.remoteHost}:${this.remotePort}`);
          if (this.onStatusChange) {
            this.onStatusChange(this.getStatus());
          }
        }

        if (text.toLowerCase().includes('address already in use') || text.toLowerCase().includes('could not listen')) {
          console.warn(`[Tunnel Manager] Port ${this.requestedPort} occupied on ${this.remoteHost}. Switching to auto-allocated port...`);
          this.useFallbackPort = true;
        }
      };

      this.proc.stdout.on('data', handleOutput);
      this.proc.stderr.on('data', handleOutput);

      this.proc.on('close', (code) => {
        this.isActive = false;
        this.proc = null;
        if (this.enabled) {
          console.warn(`[Tunnel Manager] Gateway disconnected (code ${code}). Auto-reconnecting in 3s...`);
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = setTimeout(() => this.start(), 3000);
        }
      });

      this.proc.on('error', (err) => {
        console.warn(`[Tunnel Manager] Process error:`, err.message);
        this.isActive = false;
      });

    } catch (e) {
      console.error('[Tunnel Manager] Failed to spawn bore:', e.message);
    }
  }

  getStatus() {
    const isBore = this.remoteHost === 'bore.pub';
    const numericIp = isBore ? '159.223.110.159' : this.remoteHost;
    return {
      enabled: this.enabled,
      active: this.isActive,
      isDirectHosting: this.isDirectHosting,
      localIp: this.localIp,
      localPort: this.localPort,
      publicHost: this.remoteHost,
      publicPort: this.remotePort,
      publicEndpoint: `${this.remoteHost}:${this.remotePort}`,
      smsCommand: `SERVER,0,${numericIp},${this.remotePort},0#`,
      smsCommandDomain: `SERVER,1,${this.remoteHost},${this.remotePort},0#`,
      smsCommandLocalLan: `SERVER,0,${this.localIp},${this.localPort},0#`,
      lastConnectedAt: this.lastConnectedAt
    };
  }

  stop() {
    this.enabled = false;
    clearTimeout(this.reconnectTimer);
    if (this.proc) {
      try {
        this.proc.kill('SIGTERM');
      } catch (e) {}
      this.proc = null;
    }
    this.isActive = false;
  }
}

module.exports = TunnelManager;
