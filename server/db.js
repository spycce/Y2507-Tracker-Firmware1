// server/db.js - Embedded SQLite Database Engine using native node:sqlite
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'tracking.db');
const db = new DatabaseSync(dbPath);

// Initialize database tables and performance indices
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;

  CREATE TABLE IF NOT EXISTS devices (
    imei TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    model TEXT DEFAULT 'Y2507-GT06',
    status TEXT DEFAULT 'offline',
    last_seen INTEGER,
    battery INTEGER DEFAULT 100,
    voltage REAL DEFAULT 4.0,
    ignition INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    imei TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    speed REAL DEFAULT 0,
    course REAL DEFAULT 0,
    satellites INTEGER DEFAULT 0,
    altitude REAL DEFAULT 0,
    acc INTEGER DEFAULT 0,
    voltage REAL DEFAULT 0,
    gsm_signal INTEGER DEFAULT 0,
    FOREIGN KEY(imei) REFERENCES devices(imei)
  );

  CREATE INDEX IF NOT EXISTS idx_locations_imei_time ON locations(imei, timestamp DESC);

  CREATE TABLE IF NOT EXISTS alarms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    imei TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    type TEXT NOT NULL,
    latitude REAL,
    longitude REAL,
    speed REAL,
    FOREIGN KEY(imei) REFERENCES devices(imei)
  );
`);

console.log(`[Database] SQLite connected: ${dbPath}`);

const statements = {
  upsertDevice: db.prepare(`
    INSERT INTO devices (imei, name, model, status, last_seen, battery, voltage, ignition, created_at)
    VALUES (?, ?, ?, 'online', ?, ?, ?, ?, ?)
    ON CONFLICT(imei) DO UPDATE SET
      status = 'online',
      last_seen = excluded.last_seen,
      battery = coalesce(excluded.battery, devices.battery),
      voltage = coalesce(excluded.voltage, devices.voltage),
      ignition = coalesce(excluded.ignition, devices.ignition)
  `),

  updateDeviceStatus: db.prepare(`
    UPDATE devices SET status = ?, last_seen = ? WHERE imei = ?
  `),

  insertLocation: db.prepare(`
    INSERT INTO locations (imei, timestamp, latitude, longitude, speed, course, satellites, altitude, acc, voltage, gsm_signal)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),

  insertAlarm: db.prepare(`
    INSERT INTO alarms (imei, timestamp, type, latitude, longitude, speed)
    VALUES (?, ?, ?, ?, ?, ?)
  `),

  getAllDevices: db.prepare(`
    SELECT * FROM devices ORDER BY last_seen DESC
  `),

  getDevice: db.prepare(`
    SELECT * FROM devices WHERE imei = ?
  `),

  getLatestLocation: db.prepare(`
    SELECT * FROM locations WHERE imei = ? ORDER BY id DESC LIMIT 1
  `),

  getHistory: db.prepare(`
    SELECT * FROM locations 
    WHERE imei = ? AND timestamp >= ? AND timestamp <= ? 
    ORDER BY id ASC
  `),

  getRecentLocations: db.prepare(`
    SELECT * FROM locations 
    WHERE imei = ? 
    ORDER BY id DESC 
    LIMIT ?
  `),

  getAlarms: db.prepare(`
    SELECT * FROM alarms ORDER BY id DESC LIMIT 50
  `)
};

module.exports = {
  db,
  upsertDevice(imei, name, battery = 100, voltage = 4.0, ignition = 0) {
    const now = Date.now();
    statements.upsertDevice.run(imei, name || `Tracker-${imei.slice(-4)}`, 'Y2507-GT06', now, battery, voltage, ignition, now);
  },

  updateDeviceHeartbeat(imei, battery, voltage, ignition, gsmSignal) {
    const now = Date.now();
    statements.upsertDevice.run(imei, `Tracker-${imei.slice(-4)}`, 'Y2507-GT06', now, battery, voltage, ignition, now);
  },

  recordLocation(location) {
    const ts = location.isHistorical ? (location.timestamp || Date.now()) : Date.now();
    statements.insertLocation.run(
      location.imei,
      ts,
      location.latitude,
      location.longitude,
      location.speed || 0,
      location.course || 0,
      location.satellites || 0,
      location.altitude || 0,
      location.acc || 0,
      location.voltage || 0,
      location.gsmSignal || 0
    );

    // Only update device live last seen if this is not an ancient historical flash dump
    if (!location.isHistorical) {
      statements.upsertDevice.run(
        location.imei,
        `Tracker-${location.imei.slice(-4)}`,
        'Y2507-GT06',
        ts,
        location.battery || 100,
        location.voltage || 4.0,
        location.acc || 0,
        Date.now()
      );
    }
  },

  recordAlarm(alarm) {
    statements.insertAlarm.run(
      alarm.imei,
      alarm.timestamp || Date.now(),
      alarm.type,
      alarm.latitude || 0,
      alarm.longitude || 0,
      alarm.speed || 0
    );
  },

  getAllDevices() {
    return statements.getAllDevices.all();
  },

  getDevice(imei) {
    return statements.getDevice.get(imei);
  },

  getLatestLocation(imei) {
    return statements.getLatestLocation.get(imei);
  },

  getHistory(imei, fromTime, toTime) {
    return statements.getHistory.all(imei, fromTime, toTime);
  },

  getRecentTrail(imei, limit = 500) {
    const rows = statements.getRecentLocations.all(imei, limit);
    return rows.reverse(); // Return in chronological order
  },

  getAlarms() {
    return statements.getAlarms.all();
  }
};
