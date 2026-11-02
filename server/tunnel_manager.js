// server/tunnel_manager.js - Automated Internet Gateway Manager
// Supports both Local Tunnel Mode (bore.pub:5023) and Cloud VPS / AWS Direct IP Mode
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

class TunnelManager {
  constructor(localPort = 5023, defaultHost = 'bore.pub', defaultPort = 5023) {
    this.localPort = localPort;
    this.remoteHost = process.env.PUBLIC_HOST || defaultHost;
    this.remotePort = process.env.PUBLIC_PORT ? parseInt(process.env.PUBLIC_PORT, 10) : defaultPort;
    this.isDirectHosting = !!process.env.PUBLIC_HOST;
    this.proc = null;
    this.isActive = this.isDirectHosting;
    this.lastConnectedAt = this.isDirectHosting ? Date.now() : null;
    this.reconnectTimer = null;
    this.enabled = true;
    this.binPath = this.resolveBinary();
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
      console.log(`[Cloud Mode] Direct Public IP active on AWS: ${this.remoteHost}:${this.remotePort}`);
      this.isActive = true;
      return;
    }

    // If running in cloud environment without bore.exe, auto-detect AWS public IP
    if (!this.binPath) {
      try {
        console.log('[Cloud Mode] bore.exe not present. Auto-detecting Cloud / AWS Public IP...');
        const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) });
        if (res.ok) {
          const data = await res.json();
          if (data.ip) {
            this.remoteHost = data.ip;
            this.remotePort = this.localPort;
            this.isDirectHosting = true;
            this.isActive = true;
            this.lastConnectedAt = Date.now();
            console.log(`[Cloud Mode] Detected Cloud / AWS Public IP: ${this.remoteHost}:${this.remotePort}`);
            return;
          }
        }
      } catch (e) {
        console.log('[Cloud Mode] IP auto-detection note:', e.message);
      }
      console.log('[Tunnel Manager] Running in LAN-only direct mode.');
      return;
    }

    if (this.proc) {
      return;
    }

    console.log(`[Tunnel Manager] Starting public TCP gateway (${this.remoteHost}:${this.remotePort} -> localhost:${this.localPort})...`);
    
    try {
      this.proc = spawn(this.binPath, [
        'local',
        this.localPort.toString(),
        '--to',
        this.remoteHost,
        '-p',
        this.remotePort.toString()
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      });

      this.proc.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        if (text.includes('listening at') || text.includes('connected to server')) {
          this.isActive = true;
          this.lastConnectedAt = Date.now();
          console.log(`[Tunnel Manager] Gateway ACTIVE! Public endpoint: ${this.remoteHost}:${this.remotePort}`);
        }
      });

      this.proc.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        if (text.includes('listening at') || text.includes('connected to server')) {
          this.isActive = true;
          this.lastConnectedAt = Date.now();
          console.log(`[Tunnel Manager] Gateway ACTIVE! Public endpoint: ${this.remoteHost}:${this.remotePort}`);
        }
      });

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
    return {
      enabled: this.enabled,
      active: this.isActive,
      isDirectHosting: this.isDirectHosting,
      publicHost: this.remoteHost,
      publicPort: this.remotePort,
      publicEndpoint: `${this.remoteHost}:${this.remotePort}`,
      smsCommand: this.remoteHost === 'bore.pub' ? `SERVER,1,159.223.110.159,${this.remotePort},0#` : `SERVER,1,${this.remoteHost},${this.remotePort},0#`,
      smsCommandDomain: `SERVER,0,${this.remoteHost},${this.remotePort},0#`,
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
