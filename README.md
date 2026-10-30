# AeroTrack: Proprietary Real-Time Telematics Core & Live Dashboard

A custom, high-precision, proprietary telematics tracking platform engineered for the **Y2507-MB-V1.2** automotive hardware tracking board and all GT06-compliant GPS devices.

---

## 1. System Architecture

```
+-----------------------------------+             2G GPRS / TCP (Port 5023)            +-------------------------------------------+
|    Y2507-MB-V1.2 Physical Board   | ===============================================> |         AEROTRACK INGESTION SERVER        |
|  - MediaTek MT2503 / GT06 Core    |                                                  |                                           |
|  - GPS L1 Ceramic Patch Antenna   |              Binary GT06 Packets                 |  1. TCP Ingestion Listener (Port 5023)    |
|  - 9V-90V DC Vehicle Power        |          (Login, Location, Heartbeat, SOS)       |  2. GT06 Frame Parser & ITU-16 Checksum   |
+-----------------------------------+                                                  |  3. Embedded SQLite WAL Database Engine   |
                                                                                       +---------------------+---------------------+
                                                                                                             |
                                                                                                  WebSocket  | HTTP REST (Port 8080)
                                                                                                             v
                                                                                       +-------------------------------------------+
                                                                                       |         AEROTRACK LIVE WEB CONSOLE        |
                                                                                       |                                           |
                                                                                       |  - Real-Time Leaflet Map Canvas           |
                                                                                       |  - Rotating Vehicle Marker with Radar     |
                                                                                       |  - Speed-Gradient Breadcrumb Trails       |
                                                                                       |  - Digital & Radial Speedometer Gauge     |
                                                                                       |  - Vehicle Ignition (ACC) & Battery HUD   |
                                                                                       |  - Trip History Replay Scrubber           |
                                                                                       |  - Real-Time Diagnostic Packet Terminal   |
                                                                                       +-------------------------------------------+
```

---

## 2. Key Features

* **High-Throughput TCP Ingestion Engine (`port 5023`):**
  - Robust GT06 binary frame assembler handling packet fragmentation and stream buffering.
  - Automatically acknowledges Login (`0x01`), Status/Heartbeat (`0x13`), and Alarm (`0x16`/`0x26`) packets to prevent hardware timeouts and connection drops.
* **Native Embedded SQLite Database (`data/tracking.db`):**
  - Uses Node.js native `node:sqlite` (zero C++ compilation dependencies).
  - Configured with Write-Ahead Logging (`PRAGMA journal_mode = WAL`) and indexed for sub-millisecond coordinate history queries.
* **Cyber-Dark Glassmorphism Dashboard (`http://localhost:8080`):**
  - **Dynamic Speedometer Gauge:** SVG radial gauge with dynamic color shifting based on speed.
  - **Rotating Vehicle Marker:** Orients to the exact compass bearing (`course` 0–359°) with animated radar pings on new packet arrival.
  - **Breadcrumb Trail:** Records real-time coordinate breadcrumbs.
  - **Vehicle Health HUD:** Ignition state (`ACC ON/OFF`), internal LiPo battery %, cell voltage, and GSM signal strength (`CSQ` bars).
  - **Trip Analytics:** Calculates live distance (Haversine formula), max speed, average speed, and packet count.
  - **Trip History Replay:** Scrubber bar with Play / Pause / 1x-2x-4x speed multiplier to replay previous drives.
  - **Diagnostic Terminal:** Collapsible drawer showing streaming raw binary hex packets and decoded protocol tags.
* **Built-in Virtual Tracker Simulator:**
  - One-click testing directly from the web UI to verify map tracking, speedometers, and alarms without needing immediate field testing.

---

## 3. Quick Start & Execution

### Starting the Server
From the project root:

```bash
# Start the unified telematics server (TCP Ingestion + Web UI)
npm start
```

### Accessing the Dashboard
Open your browser and navigate to:
```text
http://localhost:8080
```

1. Click **"START SIMULATOR"** in the top navigation bar to stream virtual vehicle telemetry through the TCP ingestion port.
2. Click **"LOGS"** to inspect live raw hexadecimal GT06 packets.
3. Click **"SOS TEST"** to test the emergency alert notification modal.

---

## 4. Connecting Your Physical Y2507-MB-V1.2 Hardware

To stream real GPS coordinates from your physical tracker to this server:

### Step 1: Insert a 2G-Compatible SIM Card
Ensure the SIM card has an active data plan and is inserted into the 6-pin SIM slot on the board.

### Step 2: Configure the Tracker via SMS
Send the following SMS messages to the SIM card's phone number from your smartphone:

1. **Set Mobile Data APN:**
   ```text
   APN,<your_cellular_apn>#
   ```
   *(e.g., `APN,internet#` or `APN,airtelgprs.com#`)*

2. **Set Server IP & Port (Point to your computer / cloud VPS):**
   ```text
   SERVER,1,<YOUR_PUBLIC_IP_OR_DOMAIN>,5023,0#
   ```
   *(e.g., `SERVER,1,198.51.100.25,5023,0#`)*

3. **Set Real-Time Reporting Interval:**
   ```text
   TIMER,10#
   ```
   *(Commands the tracker to transmit GPS fixes every 10 seconds while moving).*

### Step 3: Power the Board
* Connect 12V DC power to the **Red (`90V`)** and **Black (`GND`)** harness wires.
* Slide the on-board battery switch to **ON**.
* The tracker will register on the GSM network, open a TCP socket to your server on port `5023`, exchange the GT06 Login handshake, and start streaming live GPS coordinates directly to your dashboard!

---

## 5. Directory Structure

```
├── data/                     # Embedded SQLite database storage
│   └── tracking.db
├── docs/                     # Hardware reverse engineering & pinout documentation
│   ├── connector-pinout.md
│   ├── firmware-update-method.md
│   ├── hardware-identification.md
│   ├── risks-and-recovery.md
│   └── serial-debugging.md
├── public/                   # Client-side web application
│   ├── css/
│   │   └── style.css         # Glassmorphism cyber-dark design system
│   ├── js/
│   │   └── app.js            # Leaflet map, HUD, WebSocket client, history player
│   └── index.html            # Main dashboard HTML
├── server/                   # Backend services
│   ├── db.js                 # SQLite database engine
│   ├── gt06.js               # GT06 protocol codec and CRC-16 ITU calculator
│   ├── index.js              # Central orchestrator
│   ├── simulator.js          # Virtual GT06 hardware simulator
│   ├── tcp_server.js         # GT06 TCP stream ingestion server (Port 5023)
│   └── web_server.js         # HTTP and WebSocket telemetry server (Port 8080)
├── package.json
└── README.md
```
