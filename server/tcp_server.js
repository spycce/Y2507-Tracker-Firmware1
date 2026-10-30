// server/tcp_server.js - High-throughput GT06 TCP Ingestion Server
const net = require('node:net');
const gt06 = require('./gt06');
const db = require('./db');

class TcpIngestionServer {
  constructor(port = 5023, onEventCallback = null) {
    this.port = port;
    this.onEvent = onEventCallback || (() => {});
    this.server = null;
    this.clients = new Map(); // socket -> { imei, rxBuffer, remoteAddress, connectedAt }
    this.stats = {
      totalPackets: 0,
      loginCount: 0,
      locationCount: 0,
      heartbeatCount: 0,
      alarmCount: 0,
      bytesReceived: 0,
      activeConnections: 0
    };
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = net.createServer((socket) => this.handleClient(socket));

      this.server.on('error', (err) => {
        console.error(`[TCP Ingestion] Server error:`, err);
        reject(err);
      });

      this.server.listen(this.port, '0.0.0.0', () => {
        console.log(`[TCP Ingestion] GT06 Server listening on TCP port ${this.port}`);
        resolve();
      });
    });
  }

  handleClient(socket) {
    const remote = `${socket.remoteAddress}:${socket.remotePort}`;
    console.log(`[TCP Ingestion] Client connected from ${remote}`);

    const clientState = {
      imei: null,
      rxBuffer: Buffer.alloc(0),
      remoteAddress: remote,
      connectedAt: Date.now()
    };
    this.clients.set(socket, clientState);
    this.stats.activeConnections = this.clients.size;

    this.emitEvent('CLIENT_CONNECT', { remote, activeCount: this.clients.size });

    socket.on('data', (chunk) => {
      this.stats.bytesReceived += chunk.length;
      console.log(`[TCP RAW RECV] Received ${chunk.length} bytes from ${remote}:`, chunk.toString('hex').toUpperCase());
      clientState.rxBuffer = Buffer.concat([clientState.rxBuffer, chunk]);

      // Process all complete frames from the streaming buffer
      this.processBuffer(socket, clientState);
    });

    socket.on('close', () => {
      console.log(`[TCP Ingestion] Client disconnected: ${remote} (IMEI: ${clientState.imei || 'unregistered'})`);
      if (clientState.rxBuffer.length > 0) {
        console.log(`[TCP UNPROCESSED BUFFER ON CLOSE]:`, clientState.rxBuffer.toString('hex').toUpperCase());
      }
      if (clientState.imei) {
        db.statements?.updateDeviceStatus?.run('offline', Date.now(), clientState.imei);
      }
      this.clients.delete(socket);
      this.stats.activeConnections = this.clients.size;
      this.emitEvent('CLIENT_DISCONNECT', { remote, imei: clientState.imei });
    });

    socket.on('error', (err) => {
      console.warn(`[TCP Ingestion] Socket error from ${remote}:`, err.message);
    });
  }

  processBuffer(socket, clientState) {
    while (clientState.rxBuffer.length >= 10) {
      // Find start of frame (0x78 0x78 or 0x79 0x79)
      let startIndex = -1;
      for (let i = 0; i <= clientState.rxBuffer.length - 2; i++) {
        if ((clientState.rxBuffer[i] === 0x78 && clientState.rxBuffer[i + 1] === 0x78) ||
            (clientState.rxBuffer[i] === 0x79 && clientState.rxBuffer[i + 1] === 0x79)) {
          startIndex = i;
          break;
        }
      }

      if (startIndex === -1) {
        // No header found, clear buffer
        clientState.rxBuffer = Buffer.alloc(0);
        break;
      }

      if (startIndex > 0) {
        // Discard garbage preceding the header
        clientState.rxBuffer = clientState.rxBuffer.subarray(startIndex);
      }

      // Try to parse packet
      const parsed = gt06.parsePacket(clientState.rxBuffer);
      if (!parsed) {
        // Packet incomplete, wait for more TCP chunks
        break;
      }

      // Advance buffer past this packet
      clientState.rxBuffer = clientState.rxBuffer.subarray(parsed.totalLength);
      this.stats.totalPackets++;

      // Dispatch packet by type
      this.handleParsedPacket(socket, clientState, parsed);
    }
  }

  handleParsedPacket(socket, clientState, parsed) {
    // Log raw packet to diagnostic event bus
    this.emitEvent('RAW_PACKET', {
      time: Date.now(),
      protocol: parsed.protocol,
      type: parsed.type,
      hex: parsed.rawHex,
      serial: parsed.serialNumber,
      imei: clientState.imei || parsed.imei || 'Unknown'
    });

    switch (parsed.type) {
      case 'LOGIN': {
        this.stats.loginCount++;
        clientState.imei = parsed.imei;
        console.log(`[TCP Ingestion] LOGIN from IMEI: ${parsed.imei} (Serial: ${parsed.serialNumber})`);

        db.upsertDevice(parsed.imei);

        if (parsed.ack) {
          socket.write(parsed.ack);
          console.log(`[TCP Ingestion] Sent LOGIN ACK to IMEI: ${parsed.imei}`);
        }

        this.emitEvent('DEVICE_LOGIN', {
          imei: parsed.imei,
          timestamp: Date.now(),
          remote: clientState.remoteAddress
        });
        break;
      }

      case 'LOCATION': {
        this.stats.locationCount++;
        const imei = clientState.imei || '860465040325932';
        const loc = {
          ...parsed.location,
          imei
        };

        // Always acknowledge location packets to tracker
        if (parsed.ack) {
          socket.write(parsed.ack);
        }

        // --- Handle Historical Flash Buffer Dumps ---
        if (loc.isHistorical) {
          console.log(`[TCP Ingestion] HISTORICAL FLASH BUFFER [${imei}]: Lat ${loc.latitude}, Lng ${loc.longitude}, Time ${new Date(loc.timestamp).toISOString()}`);
          this.emitEvent('CACHED_HISTORY_SYNC', {
            imei,
            dateString: new Date(loc.timestamp).toISOString()
          });
          // Do not emit historical dumps as live position updates
          break;
        }

        // --- Static Drift Suppression ---
        // When stationary or when speed is low jitter (< 3 km/h), clamp speed to 0
        if (loc.speed < 3 || loc.isGpsPositioned === false) {
          loc.speed = 0;
        }

        // Live reading: authoritative timestamp is current server time
        loc.timestamp = Date.now();
        db.recordLocation(loc);

        console.log(`[TCP Ingestion] LIVE LOCATION [${imei}]: Lat ${loc.latitude}, Lng ${loc.longitude}, Speed ${loc.speed} km/h, Sat: ${loc.satellites}`);

        this.emitEvent('LIVE_LOCATION', {
          imei,
          location: loc
        });
        break;
      }

      case 'HEARTBEAT': {
        this.stats.heartbeatCount++;
        const imei = clientState.imei || 'Unknown';
        console.log(`[TCP Ingestion] HEARTBEAT [${imei}]: Batt ${parsed.heartbeat.batteryPercent}%, ACC: ${parsed.heartbeat.acc}`);

        if (clientState.imei) {
          db.updateDeviceHeartbeat(
            clientState.imei,
            parsed.heartbeat.batteryPercent,
            parsed.heartbeat.voltage,
            parsed.heartbeat.acc,
            parsed.heartbeat.gsmSignal
          );
        }

        if (parsed.ack) {
          socket.write(parsed.ack);
        }

        this.emitEvent('DEVICE_STATUS', {
          imei,
          status: parsed.heartbeat
        });
        break;
      }

      case 'ALARM': {
        this.stats.alarmCount++;
        const imei = clientState.imei || 'Unknown';
        console.warn(`[TCP Ingestion] ALARM ALERT [${imei}]: ${parsed.alarm.type}`);

        if (clientState.imei) {
          db.recordAlarm({
            imei: clientState.imei,
            type: parsed.alarm.type,
            timestamp: Date.now()
          });
        }

        if (parsed.ack) {
          socket.write(parsed.ack);
        }

        this.emitEvent('DEVICE_ALARM', {
          imei,
          alarm: parsed.alarm,
          timestamp: Date.now()
        });
        break;
      }

      default: {
        break;
      }
    }
  }

  emitEvent(eventType, payload) {
    try {
      this.onEvent(eventType, payload);
    } catch (e) {
      console.error('[TCP Ingestion] Error in event callback:', e);
    }
  }

  stop() {
    if (this.server) {
      this.server.close();
    }
  }
}

module.exports = TcpIngestionServer;
