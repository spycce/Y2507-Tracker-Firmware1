try {
  if (typeof process.loadEnvFile === 'function') process.loadEnvFile();
} catch (e) {}

const path = require('node:path');
const db = require('./db');
const TcpIngestionServer = require('./tcp_server');
const TelemetryWebServer = require('./web_server');
const TunnelManager = require('./tunnel_manager');

const TCP_PORT = parseInt(process.env.TCP_PORT, 10) || 5023;
const HTTP_PORT = parseInt(process.env.HTTP_PORT, 10) || 8080;
const CLOUD_IP = process.env.PUBLIC_HOST || '54.252.226.77';

console.log('====================================================');
console.log('   AEROTRACK // CLOUD TELEMATICS PLATFORM           ');
console.log(`   Cloud Public IP: ${CLOUD_IP}                    `);
console.log('   Hardware Support: EV26R_MB_V3.0 & Y2507-MB-V1.2   ');
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

// 3. Create persistent internet gateway / direct cloud manager
const tunnelManager = new TunnelManager(TCP_PORT, CLOUD_IP, TCP_PORT, (status) => {
  // Broadcast tunnel/endpoint changes to connected browser tabs
  webServer.broadcast({
    type: 'TUNNEL_UPDATE',
    data: status
  });
});

// Link references
webServer.tcpServer = tcpServer;
webServer.tunnelManager = tunnelManager;
tcpServer.tunnelManager = tunnelManager;

async function bootstrap() {
  try {
    // Start TCP ingestion server
    await tcpServer.start();

    // Start Web & WebSocket server
    await webServer.start();

    // Start cloud gateway / direct public endpoint
    await tunnelManager.start();
    const tStatus = tunnelManager.getStatus();

    console.log(`\n====================================================`);
    console.log(`[CLOUD VPC READY] Telematics Platform Operational:`);
    console.log(`  -> Web Dashboard URL:     http://${CLOUD_IP}:${HTTP_PORT} (or http://localhost:${HTTP_PORT})`);
    console.log(`  -> Cloud TCP Ingestion:   ${CLOUD_IP}:${TCP_PORT}`);
    console.log(`----------------------------------------------------`);
    console.log(`[SMS SETUP FOR PHYSICAL EV26R / Y2507 TRACKER]:`);
    console.log(`  1. Set APN:    APN,<your_sim_apn>#`);
    console.log(`  2. Set Server: ${tStatus.smsCommand}`);
    console.log(`  3. Set Timer:  TIMER,10,60#`);
    console.log(`  4. Reboot:     RESET#`);
    console.log(`====================================================\n`);

  } catch (err) {
    console.error('Fatal initialization error:', err);
    process.exit(1);
  }
}

// Graceful shutdown handling
process.on('SIGINT', () => {
  console.log('\n[Shutdown] Closing services gracefully...');
  tunnelManager.stop();
  tcpServer.stop();
  webServer.stop();
  process.exit(0);
});

bootstrap();
