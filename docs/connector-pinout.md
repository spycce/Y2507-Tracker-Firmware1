# Connector & Test Pad Pinout Reference: Y2507-MB-V1.2

**Document Version:** 1.0  
**Target Board Revision:** Y2507-MB-V1.2  
**Date:** October 2026  

---

## 1. Overview

This document provides complete pin definitions, electrical ratings, wire color codes, and operational descriptions for all physical interfaces, test pads, and cable harnesses on the **Y2507-MB-V1.2** tracker board.

---

## 2. Test Pad Cluster 1: System, Power & Primary Debug Interface

Located directly adjacent to the SIM card tray on the top side of the PCB. These 8 gold circular test pads provide direct access to the host processor, internal PMU, battery rails, and native USB transceiver.

```
       [Top Edge of Board]
       
      ( GND )        ( VCHG )
         \              /
          ( VBAT )
         /        \
      ( TX1 )      ( RX1 )
         |          |
      (PWKEY)       |
         |          |
      ( DP  )      ( DM  )
      
    [Towards GPS Patch Antenna]
```

### 2.1 Pin Table

| Pad Label | Signal Direction | Classification | Electrical Specification | Functional Description |
|:---|:---|:---|:---|:---|
| **GND** | Passive | **Confirmed Fact** | 0.0V (Common Reference) | System ground reference for all power rails, signals, and test instruments. |
| **VBAT** | Power (Bidirectional) | **Confirmed Fact** | 3.4V – 4.2V DC (Nominal 3.7V) | Direct connection to the positive terminal of the 250mAh LiPo battery. Can be used to power the board from a bench supply (3.8V – 4.0V) bypassing the HV buck regulator. |
| **VCHG** | Power Input | **Confirmed Fact** | 4.5V – 5.5V DC (Max 6.0V) | Direct 5V charging input to the PMU linear charger circuit. Powers the charging circuit and battery management system. |
| **TX1** | Output (Host -> Ext) | **Confirmed Fact / High Hypothesis** | 2.8V CMOS logic (MTK standard) | Primary UART Transmit line from the host cellular baseband/processor (UART 1). Emits boot ROM messages, RTOS trace logs, or AT response data. |
| **RX1** | Input (Ext -> Host) | **Confirmed Fact / High Hypothesis** | 2.8V CMOS logic (tolerant max 3.0V) | Primary UART Receive line into the host processor. Accepts AT commands, calibration data, and bootloader download packets. |
| **PWKEY** | Input (Active Low) | **Confirmed Fact / High Hypothesis** | Pulled up to internal VRTC / VBAT (~2.8V - 3.7V) | Power Key / Turn-on line. Shorting this pad to `GND` for ≥ 1.5 seconds triggers PMU power-up sequence and boots the processor. |
| **DP** | Bidirectional (Differential) | **Confirmed Fact / High Hypothesis** | 0.0V – 3.3V differential (USB Full Speed) | USB Data Positive (D+). Connects directly to the internal USB transceiver of the SoC. Used for high-speed bootloader flashing and diagnostic CDC ACM ports. |
| **DM** | Bidirectional (Differential) | **Confirmed Fact / High Hypothesis** | 0.0V – 3.3V differential (USB Full Speed) | USB Data Negative (D-). Connects directly to the internal USB transceiver of the SoC. |

> [!WARNING]
> **Logic Level Warning:** The `TX1` and `RX1` pads operate at **2.8V** (typical MediaTek I/O level). Connecting standard 5.0V FTDI adapters will permanently destroy the SoC I/O buffer. Always use a level-shifted adapter set to 2.8V or 3.3V (with 1kΩ series current-limiting resistors if 3.3V).

---

## 3. Test Pad Cluster 2: GNSS (GPS) Subsystem Interface

Located horizontally in the gap between the SIM tray and the ceramic patch antenna.

```
  [GPS-HRST-B]      ( RX )      ( TX )       [Via/Pads]
```

### 3.1 Pin Table

| Pad Label | Signal Direction | Classification | Electrical Specification | Functional Description |
|:---|:---|:---|:---|:---|
| **GPS-HRST-B** | Input (Active Low) | **Confirmed Fact** | 1.8V – 2.8V Logic (Internal pull-up) | Dedicated Hardware Reset for the GNSS engine. Pulling this pad to `GND` forces an immediate hardware reset of the GPS receiver core. |
| **RX** | Input (Host -> GPS) | **Confirmed Fact** | 1.8V – 2.8V Logic | GNSS serial input. Accepts proprietary binary configuration commands (PMTK, CASIC, or UBX sentences depending on GNSS core). |
| **TX** | Output (GPS -> Host) | **Confirmed Fact** | 1.8V – 2.8V Logic | GNSS serial output. Transmits raw NMEA 0183 position sentences (`$GPRMC`, `$GPGGA`, `$GPGSV`, etc.) at 9600 baud. |

> [!NOTE]
> **Subsystem Isolation:** The presence of both `TX1`/`RX1` and `TX`/`RX` confirms that the board maintains two distinct serial domains:
> 1. `TX1`/`RX1`: Connected to the main application processor / cellular modem.
> 2. `TX`/`RX`: Connected directly to the GNSS positioning engine. This allows tapping the raw GPS stream independently of the cellular firmware state.

---

## 4. Vehicle Wiring Harness (8-Wire Interface)

The bottom edge of the board is soldered to an 8-conductor automotive cable harness with integrated silicone strain relief.

```
  Pin 1   Pin 2   Pin 3   Pin 4   Pin 5   Pin 6   Pin 7   Pin 8
  [RED]   [BLK]   [ORN]   [YEL]   [GRN]   [BLU]   [WHT]   [BRN]
  +90V     GND     ACC    RELAY   SPK+    SPK-    KCOL1   KROW1
```

### 4.1 Wire Assignment & Specification Table

| Pin # | Wire Color | Silkscreen Label | Direction | Voltage / Current Rating | Functional Purpose |
|:---:|:---|:---|:---:|:---|:---|
| **1** | **Red** | `90V` | Input (Power) | +9.0V to +90.0V DC (wide-range automotive DC input) | Main vehicle battery power. Feeds the internal high-voltage buck converter. Connect through a 1A or 2A in-line fuse. |
| **2** | **Black** | `GND` | Ground | 0.0V Reference | Main vehicle chassis ground / power return. |
| **3** | **Orange** | `ACC` | Input | 0.0V to 36.0V DC (Threshold ~5V) | Vehicle Ignition / Accessory sense line. Connected to the vehicle ignition switch. Detects engine running vs parked state. |
| **4** | **Yellow** | `RELAY` | Output (Open-Drain) | Max 36V, Sinks up to 500mA | Remote vehicle immobilization line. Controlled via an on-board NPN/N-MOSFET (SOT-23 marked `1002`). Sinks current to GND to energize an external 12V/24V fuel pump cut-off relay. |
| **5** | **Green** | `SPK+` | Output (Audio) | Differential AC, ~1W RMS into 8Ω | Speaker positive output from the baseband audio amplifier. Used for two-way dispatch calling or siren playback. |
| **6** | **Blue** | `SPK-` | Output (Audio) | Differential AC, ~1W RMS into 8Ω | Speaker negative differential return line. Must never be connected directly to GND. |
| **7** | **White** | `KCOL1` | Input/Matrix | 2.8V Logic (Keypad matrix column 1) | Emergency SOS / Panic button loop. Connected to one terminal of an external momentary push button. |
| **8** | **Orange/Brown** | `KROW1` | Output/Matrix | 2.8V Logic (Keypad matrix row 1) | Emergency SOS / Panic button loop return. Shorted to `KCOL1` when the external SOS button is depressed. |

---

## 5. Auxiliary & Peripheral Test Pads

### 5.1 Keypad Column 0 (`KCOL0`)
- **Location:** On the front layer, along the middle-left edge near the battery switch.
- **Form:** 4 aligned micro-vias / test pads.
- **Function:** Keypad Matrix Column 0 line. In production fixtures, this is paired with `KROW0` or `KROW1` for factory diagnostic mode entry or tamper detection switches.

### 5.2 Battery Slide Switch (`SW1`)
- **Location:** Left edge of front PCB.
- **Function:** In-line mechanical disconnect between the positive lead of the LiPo battery and the PMU `VBAT` rail.
- **Positions:**
  - *OFF (Storage):* Battery isolated; device remains completely powered off to prevent deep discharge during shelf storage.
  - *ON (Active):* Battery connected to PMU; enables backup operation and battery charging.

### 5.3 Antenna Test & Tuning Points
- **GNSS Antenna Center Pin:** Soldered through-hole pin in the center of the ceramic patch antenna. Feeds into an RF matching network and Low-Noise Amplifier (LNA).
- **Cellular Antenna Contact:** Spring fingers / solder joints on the top edge connecting to the black plastic carrier (which holds a stamped sheet metal or flex-PCB GSM monopole/PIFA antenna).

---

## 6. Summary of Recommended Measurement Targets

When verifying this pinout on a physical unit with a digital multimeter:

| Measurement Point | Ground Reference | Target When Powered (12V on 90V/GND) | Target on Battery Only |
|:---|:---|:---|:---|
| `VBAT` | `GND` | ~4.15V – 4.20V (Charging state) | 3.6V – 4.1V (Battery cell state) |
| `VCHG` | `GND` | ~4.8V – 5.2V (Regulated output from buck) | 0.0V (No external DC) |
| `TX1` | `GND` | ~2.80V (Idle high) | ~2.80V (Idle high) |
| `GPS-TX` | `GND` | ~2.80V (Toggling with NMEA bursts) | ~2.80V (Toggling with NMEA bursts) |
| `PWKEY` | `GND` | ~2.80V – 3.2V (Internal pull-up) | ~2.80V – 3.2V (Internal pull-up) |
| `ACC` | `GND` | Follows external input (e.g., 12.0V if connected) | 0.0V |
