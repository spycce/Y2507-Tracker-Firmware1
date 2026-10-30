// server/index.js - Unified Telematics Hub & Real-time Platform
const path = require('node:path');
const db = require('./db');
const TcpIngestionServer = require('./tcp_server');
const TelemetryWebServer = require('./web_server');

const TCP_PORT = parseInt(process.env.TCP_PORT, 10) || 5023;
const HTTP_PORT = parseInt(process.env.HTTP_PORT, 10) || 8080;

console.log('====================================================');
console.log('   Y2507-GT06 REAL-TIME TELEMATICS PLATFORM        ');
console.log('   High-Precision Ingestion, Storage & Live UI      ');
console.log('====================================================');

// 1. Create the web dashboard server
const webServer = new TelemetryWebServer(HTTP_PORT, path.join(__dirname, '..', 'public'), null);

// 2. Create the TCP ingestion server with real-time event forwarding
const tcpServer = new TcpIngestionServer(TCP_PORT, (eventType, payload) => {
  // Broadcast to all connected web dashboards
  webServer.broadcast({
    type: eventType,
    data: payload
  });
});

// Link back references
webServer.tcpServer = tcpServer;

async function bootstrap() {
  try {
    // Start TCP ingestion server
    await tcpServer.start();

    // Start Web & WebSocket server
    await webServer.start();

    console.log(`\n[READY] Telematics Platform Operational:`);
    console.log(`  -> TCP Tracker Ingestion:  0.0.0.0:${TCP_PORT}  (Point your Y2507 tracker here)`);
    console.log(`  -> Real-time Dashboard:    http://localhost:${HTTP_PORT}\n`);

  } catch (err) {
    console.error('Fatal initialization error:', err);
    process.exit(1);
  }
}

// Graceful shutdown handling
process.on('SIGINT', () => {
  console.log('\n[Shutdown] Closing services gracefully...');
  tcpServer.stop();
  webServer.stop();
  process.exit(0);
});

bootstrap();
