# Hardware Identification & Setup Guide: EV26R_MB_V3.0 GPS Tracker

**Document Version:** 1.0  
**Target Board Revision:** `EV26R_MB_V3.0`  
**System Family:** EV26 / EV26R / EV02 Telematics Core  
**Application Platform:** AeroTrack GT06 Ingestion Server  

---

## 1. Executive Summary

This document specifies the technical details, pinout configuration, and software integration requirements for the **`EV26R_MB_V3.0`** vehicle tracking board.

The `EV26R_MB_V3.0` is an ultra-compact, high-reliability commercial automotive telematics board designed for motorcycles, e-bikes, passenger cars, and commercial fleet vehicles. It replaces legacy bulky trackers with a streamlined 4-wire interface while maintaining full compatibility with the **GT06 binary telematics protocol** used by the AeroTrack ingestion engine.

```
+-------------------------------------------------------------+
|  [Spring Contact: GSM]             0124 26-12 EV26R_MB_V3.0 |
|  O (Mounting Hole)                                       O  |
|                                                             |
|  +-------------------------------------------------------+  |
|  |             RF Shielding & Processing Core            |  |
|  |  +-------------------------------------------------+  |  |
|  |  | Label: SZ-0607-2607000004 13.6                  |  |  |
|  |  |        K2EV26R00DL0122 XSW-260723               |  |  |
|  |  |        [DL] [BT] [MMI:OK] [QC] [W]              |  |  |
|  |  +-------------------------------------------------+  |  |
|  +-------------------------------------------------------+  |
|  [TVS Diode] [Transistor Matrix] [LDO / Buck Converter]     |
|                                                             |
|  =========================================================  |
|  |                                                       |  |
|  |              Ceramic GPS / BDS Patch Antenna          |  |
|  |                 (Marking: GMHBG...)                   |  |
|  |                                                       |  |
|  =========================================================  |
|  +-------------------------------------------------------+  |
|  |  [RED]         [BLACK]         [ORANGE]       [YELLOW]|  |
|  |   VCC            GND              ACC          RELAY  |  |
|  | (9V-90V DC)   (Ground)      (Ignition Sense)  (Cutoff)|  |
|  +-------------------------------------------------------+  |
+-------------------------------------------------------------+
```

---

## 2. Hardware Specifications

| Parameter | Specification | Notes |
| :--- | :--- | :--- |
| **Board Revision** | `EV26R_MB_V3.0` | Solder mask date code: `0124 26-12` |
| **Manufacturing SKU** | `K2EV26R00DL0122 XSW-260723` | Assembly build July 2026, FW 13.6 |
| **Cellular Radio** | GSM / GPRS Quad-band (850/900/1800/1900 MHz) | Internal casing antenna via `GSM` spring contact |
| **GNSS Engine** | Integrated Dual-Constellation GPS + BDS (BeiDou) | Ceramic patch antenna (`GMHBG...`) with center-pin feed |
| **Position Accuracy** | < 2.5m CEP (autonomous) | Fast cold start (< 35s), hot start (< 2s) |
| **Operating Voltage** | **9V to 90V DC** continuous | Wide-input buck regulator suitable for 12V/24V/48V/72V batteries |
| **Backup Battery** | 3.7V Li-Polymer (60mAh - 100mAh) | Powers anti-theft power-cut alert when disconnected |
| **Enclosure Rating** | IP65 dust and splash resistant | When mounted inside standard snap-fit plastic shell |

---

## 3. Automotive 4-Wire Harness Interface

The unit breaks out a 4-conductor harness with automotive-standard color coding:

| Wire Color | Signal Name | Recommended Connection | Description |
| :--- | :--- | :--- | :--- |
| **Red** | `VCC` | Vehicle Battery Positive (`9V - 90V`) | Constant unswitched DC supply. |
| **Black** | `GND` | Vehicle Chassis / Battery Negative | Common ground reference. |
| **Orange** *(or White)* | `ACC` | Keyed Ignition Switch (+12V/24V) | High when vehicle key is ON; low when parked. Triggers AeroTrack HUD ignition indicator and adjusts reporting timer. |
| **Yellow** | `RELAY` | Relay Coil (-) Input (Pin 85 or 86) | Low-side N-channel open-drain output. Energizes external 12V/24V relay to cut fuel pump or ignition circuit upon server command. |

---

## 4. Telematics Protocol Compatibility

The `EV26R_MB_V3.0` natively implements the **GT06 binary telematics standard**. It is 100% interoperable with the existing AeroTrack ingestion stack:

| Packet ID | Packet Name | Handled by AeroTrack (`server/gt06.js`) | Action Taken |
| :--- | :--- | :--- | :--- |
| **`0x01`** | Login Packet | Handled & Acknowledged (`buildAck(0x01)`) | Registers terminal IMEI in SQLite DB; grants session access. |
| **`0x12` / `0x22`** | GPS Telemetry | Decoded into lat, lon, speed, bearing, sats | Stored in WAL database and broadcast to live Leaflet canvas. |
| **`0x13`** | Heartbeat & Status | Handled & Acknowledged (`buildAck(0x13)`) | Updates vehicle HUD (ACC state, GSM CSQ signal, battery %). |
| **`0x16` / `0x26`** | Alarm Message | Handled & Acknowledged (`buildAck(0x16)`) | Triggers dashboard visual alarm (Power Cut, Vibration, Geofence). |
| **`0x80`** | Downlink Command | Encapsulated via `buildCommand(cmd)` | Sends over-the-air commands (e.g. relay cutoff `RELAY,1#`). |

---

## 5. Step-by-Step Configuration Guide

### 5.1 SIM Card Preparation
1. Insert an active **2G GPRS Micro-SIM card** into the slot.
2. Verify that the SIM has an SMS balance and active mobile data.
3. Ensure the SIM has **no PIN lock** enabled.

### 5.2 Server Endpoint Verification
Start the AeroTrack platform:
```bash
npm start
```
Note down the active TCP ingestion endpoint from the terminal output:
- Cloud VPS Public IP: `54.252.226.77:5023`
- Web Dashboard: `http://54.252.226.77:8080`

### 5.3 SMS Configuration Commands

Send each command via SMS to the tracker's SIM number:

#### 1. Set Cellular APN
```text
APN,<apn_name>#
```
*Example (Airtel):* `APN,airtelgprs.com#`  
*Example (Jio):* `APN,jionet#`  
*Example (Generic):* `APN,internet#`

#### 2. Set Server Address & Port (Cloud VPS)
In this firmware (`EV26R / Concox / WanWay`), the first parameter sets the format mode:
- **Mode 0 = Numeric IP address**
- **Mode 1 = Text Domain name**

*Cloud VPS Direct IP (Mode 0):*
```text
SERVER,0,54.252.226.77,5023,0#
```
*(Replies: `SERVER OK`)*

#### 3. Set Reporting Interval
```text
TIMER,10,60#
```
Configures the tracker to stream every **10 seconds** while moving (ACC ON) and every **60 seconds** while parked (ACC OFF).

#### 4. Query & Verify Configuration
```text
PARAM#
```
Returns tracker IMEI, server IP/domain, port, and APN.

```text
STATUS#
```
Returns internal battery voltage, GSM signal strength (CSQ 0-31), GPS fix state, and ACC status.

#### 5. Apply & Restart
```text
RESET#
```
Restarts the GSM baseband and forces immediate connection to AeroTrack.

---

## 6. Remote Commands Reference (via AeroTrack Web Console Protocol `0x80` or SMS)

| Feature | SMS / Web Command | Description |
| :--- | :--- | :--- |
| **Cut Engine (Relay)** | `RELAY,1#` | Activates Yellow wire relay; disconnects fuel/ignition circuit. |
| **Restore Engine** | `RELAY,0#` | Deactivates relay; restores vehicle circuit. |
| **Query Location** | `WHERE#` | Replies with latitude, longitude, and map link. |
| **Reboot Modem** | `RESET#` | Soft reset of modem and GPS engine. |
| **Factory Reset** | `FACTORY#` | Resets configuration to factory defaults. |

