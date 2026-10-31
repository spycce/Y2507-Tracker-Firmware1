// server/tcp_server.js - High-throughput GT06 TCP Ingestion Server
const net = require('node:net');
const gt06 = require('./gt06');
const db = require('./db');

function formatTimeAgo(timestamp) {
  if (!timestamp) return 'Never';
  const diffMs = Math.max(0, Date.now() - timestamp);
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 3) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${Math.floor(diffHours / 24)}d ago`;
}

class TcpIngestionServer {
  constructor(port = 5023, onEventCallback = null) {
    this.port = port;
    this.onEvent = onEventCallback || (() => {});
    this.server = null;
    this.clients = new Map(); // socket -> clientState
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
      connectedAt: Date.now(),
      lastPacketAt: Date.now(),
      lastHeartbeatAt: null,
      lastLocationAt: null,
      lastHeartbeat: null,
      lastLocation: null
    };
    this.clients.set(socket, clientState);
    this.stats.activeConnections = this.clients.size;

    this.emitEvent('CLIENT_CONNECT', { remote, activeCount: this.clients.size });
    this.broadcastTrackerStatus();

    socket.on('data', (chunk) => {
      this.stats.bytesReceived += chunk.length;
      clientState.lastPacketAt = Date.now();
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
      this.broadcastTrackerStatus();
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
    clientState.lastPacketAt = Date.now();

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
        this.broadcastTrackerStatus(parsed.imei);
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

        // --- High-Precision Building Anchor & Static Drift Suppression ---
        // Adiamville Society Wing (18.624220, 73.727630)
        // Corrects 50-130m indoor satellite multipath drift when stationary at desk/building
        const dLat = (loc.latitude - 18.624220) * 111320;
        const dLng = (loc.longitude - 73.727630) * 111320 * 0.9476;
        const distFromBuilding = Math.sqrt(dLat * dLat + dLng * dLng);

        if (distFromBuilding <= 180 && (loc.speed < 4 || loc.isGpsPositioned === false)) {
          loc.latitude = 18.624220;
          loc.longitude = 73.727630;
          loc.speed = 0;
        } else if (loc.speed < 3 || loc.isGpsPositioned === false) {
          loc.speed = 0;
        }

        // Live reading: authoritative timestamp is current server time
        loc.timestamp = Date.now();
        clientState.lastLocationAt = Date.now();
        clientState.lastLocation = loc;
        if (!clientState.imei) clientState.imei = imei;
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
        clientState.lastHeartbeatAt = Date.now();
        clientState.lastHeartbeat = parsed.heartbeat;
        if (!clientState.imei && imei !== 'Unknown') clientState.imei = imei;

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
        this.broadcastTrackerStatus(imei);
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

          // If the alarm packet (0x16/0x26) contains an embedded GPS fix, ingest and emit it
          if (parsed.location && parsed.location.latitude && parsed.location.longitude) {
            const loc = { ...parsed.location, imei: clientState.imei };
            loc.timestamp = Date.now();
            const dLat = (loc.latitude - 18.624220) * 111320;
            const dLng = (loc.longitude - 73.727630) * 111320 * 0.9476;
            const distFromBuilding = Math.sqrt(dLat * dLat + dLng * dLng);

            if (distFromBuilding <= 180 && (loc.speed < 4 || loc.isGpsPositioned === false)) {
              loc.latitude = 18.624220;
              loc.longitude = 73.727630;
              loc.speed = 0;
            } else if (loc.speed < 3 || loc.isGpsPositioned === false) {
              loc.speed = 0;
            }
            db.recordLocation(loc);
            console.log(`[TCP Ingestion] ALARM LOCATION [${imei}]: Lat ${loc.latitude}, Lng ${loc.longitude}, Speed ${loc.speed} km/h, Sat: ${loc.satellites}`);
            this.emitEvent('LIVE_LOCATION', { imei, location: loc });

            console.log(`[Emergency Alert] Tracker ${imei} triggered SOS alarm: ${parsed.alarm.type}`);
          } else {
            console.log(`[Emergency Alert] Tracker ${imei} triggered SOS alarm: ${parsed.alarm.type}`);
          }
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

      case 'COMMAND_RESPONSE': {
        const imei = clientState.imei || 'Unknown';
        console.log(`[TCP Ingestion] COMMAND RESPONSE from [${imei}]: "${parsed.response}"`);
        this.emitEvent('COMMAND_RESPONSE', {
          imei,
          response: parsed.response
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

  sendCommand(imei, commandStr) {
    for (const [socket, state] of this.clients.entries()) {
      if (state.imei === imei || (!state.imei && this.clients.size === 1)) {
        const serial = (++this.stats.totalPackets) & 0xFFFF;
        const packet = gt06.buildCommand(commandStr, serial);
        socket.write(packet);
        console.log(`[TCP Command] Sent command to [${imei || state.imei}]: "${commandStr}" (Hex: ${packet.toString('hex').toUpperCase()})`);
        return { success: true, imei: imei || state.imei, command: commandStr };
      }
    }
    console.warn(`[TCP Command] Device [${imei}] is not currently connected via TCP!`);
    return { success: false, error: 'Device is offline or not connected' };
  }

  // Authoritative Heartbeat & Connection Inspection
  getTrackerStatus(targetImei = '860465040325932') {
    let activeClient = null;

    for (const [socket, state] of this.clients.entries()) {
      if (state.imei === targetImei || (!state.imei && this.clients.size === 1)) {
        activeClient = state;
        break;
      }
    }

    if (!activeClient && this.clients.size > 0) {
      const firstEntry = this.clients.entries().next().value;
      if (firstEntry) {
        activeClient = firstEntry[1];
      }
    }

    const latestLocation = db.getLatestLocation(targetImei) || null;
    const deviceRecord = db.getDevice(targetImei) || null;

    if (activeClient) {
      const now = Date.now();
      const lastSeen = activeClient.lastPacketAt || activeClient.connectedAt;
      const ageMs = now - lastSeen;
      const isAlive = ageMs < 120000; // active packet received within 2 minutes

      return {
        connected: true,
        isAlive,
        imei: activeClient.imei || targetImei,
        remoteAddress: activeClient.remoteAddress,
        connectedAt: activeClient.connectedAt,
        lastSeen,
        lastSeenAgoMs: ageMs,
        lastSeenAgo: formatTimeAgo(lastSeen),
        lastHeartbeatAt: activeClient.lastHeartbeatAt,
        lastHeartbeatAgo: formatTimeAgo(activeClient.lastHeartbeatAt),
        lastLocationAt: activeClient.lastLocationAt,
        heartbeat: activeClient.lastHeartbeat || (deviceRecord ? {
          batteryPercent: deviceRecord.battery,
          acc: deviceRecord.ignition === 1,
          voltage: deviceRecord.voltage
        } : null),
        latestLocation: activeClient.lastLocation || latestLocation,
        stats: {
          ...this.stats,
          activeSockets: this.clients.size
        },
        tcpPort: this.port,
        serverTime: now
      };
    }

    const lastSeen = deviceRecord?.last_seen || latestLocation?.timestamp || null;
    return {
      connected: false,
      isAlive: false,
      imei: targetImei,
      remoteAddress: null,
      connectedAt: null,
      lastSeen,
      lastSeenAgoMs: lastSeen ? (Date.now() - lastSeen) : null,
      lastSeenAgo: lastSeen ? formatTimeAgo(lastSeen) : 'Never',
      lastHeartbeatAt: null,
      lastHeartbeatAgo: 'Never',
      lastLocationAt: latestLocation?.timestamp || null,
      heartbeat: deviceRecord ? {
        batteryPercent: deviceRecord.battery,
        acc: deviceRecord.ignition === 1,
        voltage: deviceRecord.voltage
      } : null,
      latestLocation,
      stats: {
        ...this.stats,
        activeSockets: this.clients.size
      },
      tcpPort: this.port,
      serverTime: Date.now()
    };
  }

  broadcastTrackerStatus(targetImei = '860465040325932') {
    const status = this.getTrackerStatus(targetImei);
    this.emitEvent('TRACKER_STATUS', status);
  }

  requestLocationRefresh(imei = '860465040325932') {
    const status = this.getTrackerStatus(imei);
    let commandSent = null;

    if (status.connected) {
      // Send GT06 standard instant position query command (WHERE#)
      const res = this.sendCommand(imei, 'WHERE#');
      if (res.success) {
        commandSent = 'WHERE#';
      }
      // Also send DW# as backup command accepted by variant GT06 microcontrollers
      this.sendCommand(imei, 'DW#');
    }

    const latestLocation = status.latestLocation || db.getLatestLocation(imei) || null;

    return {
      success: true,
      trackerConnected: status.connected,
      isAlive: status.isAlive,
      commandSent,
      message: status.connected
        ? 'Real-time GPS location query transmitted to tracker over TCP (0x80 WHERE#)'
        : 'Tracker is not currently connected over TCP :5023. Displaying latest saved fix from database.',
      latestLocation,
      status
    };
  }

  stop() {
    if (this.server) {
      this.server.close();
    }
  }
}

module.exports = TcpIngestionServer;
