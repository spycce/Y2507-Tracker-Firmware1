// server/simulator.js - Realistic Virtual GT06 Tracker Simulator
// Connects to local TCP port 5023 and emits compliant binary GT06 packets for testing
const net = require('node:net');
const gt06 = require('./gt06');

class VirtualTrackerSimulator {
  constructor(port = 5023, imei = '867530901234567') {
    this.port = port;
    this.imei = imei;
    this.client = null;
    this.timer = null;
    this.isRunning = false;
    this.serial = 1;

    // Realistic vehicle drive path coordinates (Looping city/highway drive)
    this.waypoints = [
      { lat: 37.774929, lng: -122.419416, speed: 38 },
      { lat: 37.775832, lng: -122.417850, speed: 42 },
      { lat: 37.777012, lng: -122.415890, speed: 48 },
      { lat: 37.778500, lng: -122.413200, speed: 55 },
      { lat: 37.780120, lng: -122.410500, speed: 60 },
      { lat: 37.781890, lng: -122.407900, speed: 65 },
      { lat: 37.783650, lng: -122.405200, speed: 58 },
      { lat: 37.785210, lng: -122.402600, speed: 50 },
      { lat: 37.784100, lng: -122.400500, speed: 45 },
      { lat: 37.782500, lng: -122.401800, speed: 40 },
      { lat: 37.780500, lng: -122.403500, speed: 42 },
      { lat: 37.778800, lng: -122.405200, speed: 48 },
      { lat: 37.776500, lng: -122.408000, speed: 52 },
      { lat: 37.775100, lng: -122.412000, speed: 45 },
      { lat: 37.774500, lng: -122.416000, speed: 35 }
    ];
    this.currentIndex = 0;
  }

  calculateBearing(lat1, lon1, lat2, lon2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const toDeg = (rad) => (rad * 180) / Math.PI;

    const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
    const x =
      Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
      Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
    const bearing = (toDeg(Math.atan2(y, x)) + 360) % 360;
    return Math.round(bearing);
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    console.log(`[Simulator] Starting virtual tracker (IMEI: ${this.imei})...`);
    this.client = new net.Socket();

    this.client.connect(this.port, '127.0.0.1', () => {
      console.log(`[Simulator] Connected to TCP port ${this.port}. Sending GT06 Login packet...`);
      this.sendLoginPacket();
    });

    this.client.on('data', (data) => {
      if (data[0] === 0x78 && data[1] === 0x78) {
        const protocol = data[3];
        if (protocol === 0x01) {
          console.log(`[Simulator] Received LOGIN ACK from server! Starting GPS telemetry feed...`);
          this.startGpsLoop();
        }
      }
    });

    this.client.on('close', () => {
      console.log(`[Simulator] Connection closed.`);
      this.stop();
    });

    this.client.on('error', (err) => {
      console.error(`[Simulator] Socket error:`, err.message);
      this.stop();
    });
  }

  sendLoginPacket() {
    const bcd = gt06.imeiToBcd(this.imei);
    const content = Buffer.alloc(12);
    content[0] = 11; // Length of data from proto to serial
    content[1] = 0x01; // Protocol 0x01 (Login)
    bcd.copy(content, 2);
    content.writeUInt16BE(this.serial++, 10);

    const crc = gt06.calculateCrc16(content, 0, content.length);
    const packet = Buffer.alloc(18);
    packet[0] = 0x78;
    packet[1] = 0x78;
    content.copy(packet, 2);
    packet.writeUInt16BE(crc, 14);
    packet[16] = 0x0D;
    packet[17] = 0x0A;

    this.client.write(packet);
  }

  sendLocationPacket() {
    if (!this.isRunning || !this.client || this.client.destroyed) return;

    const curr = this.waypoints[this.currentIndex];
    const nextIndex = (this.currentIndex + 1) % this.waypoints.length;
    const next = this.waypoints[nextIndex];

    const course = this.calculateBearing(curr.lat, curr.lng, next.lat, next.lng);
    const packet = gt06.createSimulatedLocationPacket(
      this.imei,
      curr.lat,
      curr.lng,
      curr.speed,
      course,
      this.serial++
    );

    this.client.write(packet);

    // Also occasionally send a status/heartbeat packet
    if (this.serial % 5 === 0) {
      this.sendHeartbeatPacket();
    }

    this.currentIndex = nextIndex;
  }

  sendHeartbeatPacket() {
    if (!this.isRunning || !this.client || this.client.destroyed) return;

    const content = Buffer.alloc(7);
    content[0] = 6; // Length
    content[1] = 0x13; // Protocol 0x13 (Heartbeat)
    content[2] = 0x07; // Status: ACC ON, Charging, Defended
    content[3] = 0x05; // Battery level 5 (approx 85-90%)
    content[4] = 0x1C; // GSM CSQ 28 (Strong signal)
    content.writeUInt16BE(this.serial++, 5);

    const crc = gt06.calculateCrc16(content, 0, content.length);
    const packet = Buffer.alloc(13);
    packet[0] = 0x78;
    packet[1] = 0x78;
    content.copy(packet, 2);
    packet.writeUInt16BE(crc, 9);
    packet[11] = 0x0D;
    packet[12] = 0x0A;

    this.client.write(packet);
  }

  triggerSosAlarm() {
    if (!this.isRunning || !this.client || this.client.destroyed) return;

    // Send SOS Alarm packet
    const curr = this.waypoints[this.currentIndex];
    const content = Buffer.alloc(24);
    content[0] = 23; // Length
    content[1] = 0x16; // Protocol 0x16 (Alarm)
    
    const now = new Date();
    content[2] = now.getUTCFullYear() - 2000;
    content[3] = now.getUTCMonth() + 1;
    content[4] = now.getUTCDate();
    content[5] = now.getUTCHours();
    content[6] = now.getUTCMinutes();
    content[7] = now.getUTCSeconds();
    content[8] = 0xC8; // 8 Satellites

    const rawLat = Math.round(Math.abs(curr.lat) * 1800000);
    content.writeUInt32BE(rawLat, 9);
    const rawLng = Math.round(Math.abs(curr.lng) * 1800000);
    content.writeUInt32BE(rawLng, 13);
    content[17] = Math.min(255, Math.round(curr.speed));
    content.writeUInt16BE(0x1000 | 0x0400, 18); // Course + flags
    content[20] = 0x01; // Terminal info
    content[21] = 0x01; // SOS Panic Alarm code!
    content.writeUInt16BE(this.serial++, 22);

    const crc = gt06.calculateCrc16(content, 0, content.length);
    const packet = Buffer.alloc(30);
    packet[0] = 0x78;
    packet[1] = 0x78;
    content.copy(packet, 2);
    packet.writeUInt16BE(crc, 26);
    packet[28] = 0x0D;
    packet[29] = 0x0A;

    this.client.write(packet);
    console.log(`[Simulator] Sent SOS Alarm packet!`);
  }

  startGpsLoop() {
    this.sendLocationPacket();
    this.timer = setInterval(() => {
      this.sendLocationPacket();
    }, 2000); // 2-second real-time telemetry updates
  }

  stop() {
    this.isRunning = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
    console.log(`[Simulator] Virtual tracker stopped.`);
  }
}

module.exports = VirtualTrackerSimulator;
