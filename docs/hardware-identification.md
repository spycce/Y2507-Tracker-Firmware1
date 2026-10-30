# Hardware Identification Report: Y2507-MB-V1.2 GPS Tracker

**Document Version:** 1.0  
**Target Board Revision:** Y2507-MB-V1.2  
**Date of Investigation:** October 2026  
**Status:** Hardware Investigation & Visual Teardown Complete  

---

## 1. Executive Summary

This document presents a comprehensive physical and architectural analysis of the **Y2507-MB-V1.2** vehicle tracking board based on high-resolution visual inspection of board photographs.

The board is a commercial-grade, hardwired telematics and vehicle tracking unit (commonly classified under the "GT06" family of automotive asset trackers). It integrates:
1. A wide-input DC-DC step-down power supply (rated for vehicle battery voltages up to 90V DC).
2. An integrated rechargeable lithium-polymer backup battery (3.7V, 250mAh).
3. A ceramic GNSS (GPS) patch antenna.
4. An internal cellular antenna assembly with SIM socket.
5. An 8-wire automotive interface harness (power, ground, ignition ACC sensing, immobilization relay drive, two-way audio speaker, and panic/SOS matrix input).
6. Multiple dedicated factory test pads broken out for USB (`DP`/`DM`), dual serial UART buses (`TX1`/`RX1` and `GPS-TX`/`RX`), power management (`PWKEY`, `VCHG`, `VBAT`), and GNSS control (`GPS-HRST-B`).

---

## 2. Separation of Confirmed Facts vs. Engineering Hypotheses

To strictly adhere to non-destructive reverse engineering principles, all findings are categorized into verifiable physical facts and high-confidence engineering hypotheses.

### 2.1 Confirmed Facts (Directly Verified via Photographs & Markings)
* **PCB Silk Identification:** `Y2507-MB-V1.2` printed on the top (front) layer along the upper-left edge.
* **Form Factor:** Dual-sided blue solder mask PCB with rounded mounting cutouts and top antenna bracket notches.
* **SIM Interface:** Standard 6-pin SIM card tray with hinged/sliding metal latch (supports 1.8V / 3.0V SIM cards).
* **Battery Specification:** Rechargeable Li-ion Polymer battery, model `KM 322535`, rated `3.7V, 250mAh, 0.925Wh`, date-stamped `2019.12.11`.
* **Power Supply Architecture:** High-voltage step-down buck converter circuit featuring:
  - Shielded power inductor marked `470` (47 µH).
  - High-voltage electrolytic input filtering capacitors (`WH 105°C` and `220 µF, 10V`).
  - High-voltage switching regulator IC (8-pin SOIC/ESOP).
  - Tantalum capacitor marked `107A` (100 µF, 10V rating).
* **Automotive Interface:** 8-pin harness with explicit silkscreen labels:
  - `90V` (Red)
  - `GND` (Black)
  - `ACC` (Orange)
  - `RELAY` (Yellow)
  - `SPK+` (Green)
  - `SPK-` (Blue)
  - `KCOL1` (White)
  - `KROW1` (Orange/Brown)
* **Dual Serial & USB Test Pads:**
  - System Pad Cluster: `GND`, `VBAT`, `VCHG`, `TX1`, `RX1`, `PWKEY`, `DP`, `DM`.
  - GNSS Sub-Cluster: `GPS-HRST-B`, `RX`, `TX`.
  - Matrix / Auxiliary Pads: `KCOL0` along the edge.
* **RF & Antenna Hardware:**
  - Square ceramic GNSS patch antenna with center feed pin soldered to front PCB.
  - Black plastic antenna mount at top edge for internal GSM/cellular antenna.
* **Physical Controls:** Miniature SMD slide switch on the left edge (isolates the internal backup battery).

### 2.2 High-Confidence Engineering Hypotheses (Deductions Based on Silicon Architecture)
* **Main SoC Family:** **MediaTek MT2503** (or a closely related **MT6261** baseband paired with a MediaTek **MT3333** GNSS core).
  - *Rationale:* The exact combination of signal names (`PWKEY`, `TX1`/`RX1`, `DP`/`DM`, `GPS-HRST-B`, `KCOL0`, `KCOL1`, `KROW1`) is the trademark pinout signature of the MediaTek MT2503 SiP (System-in-Package). In the MT2503, an ARM7EJ-S modem core is co-packaged with an MT3333 GNSS engine. The GNSS engine features an active-low hardware reset designated in all MediaTek datasheets as `HRST_B` (`GPS-HRST-B`).
* **Processor Location:** The primary SoC, RF transceiver, flash memory, and baseband PMU are located **underneath an RF shielding can beneath the LiPo battery** on the rear side of the PCB.
* **Logic Level Voltage:** Test pads `TX1`, `RX1`, `DP`, `DM`, and `PWKEY` operate at either **2.8V** (standard MediaTek MT2503/MT6261 VIO) or **1.8V**. They are **not 5V tolerant** and should not be driven with 3.3V without prior measurement.

---

## 3. Detailed Component & Subsystem Breakdown

### 3.1 Front Side (Top Layer)
```
+-------------------------------------------------------------+
|  [ Black Plastic GSM Antenna Housing / Snap Frame ]         |
|  O (Mounting Hole)                      (Fiducial / Via) O  |
|                                                             |
|  Y  +-------------------+  +-----------------------------+  |
|  2  |  Test Pad Cluster |  |   6-Pin SIM Card Slot       |  |
|  5  |  GND   VBAT  VCHG |  |   (Metal Shielded Tray)     |  |
|  0  |  TX1   PWKEY RX1  |  +-----------------------------+  |
|  7  |  DP          DM   |                                   |
|  -  +-------------------+                                   |
|  M       [GPS-HRST-B] [RX] [TX]     (1PPS/Ant Vias)         |
|  B  ======================================================  |
|  -  |                                                    |  |
|  V  |            Ceramic GPS Patch Antenna               |  |
|  1  |             (Center Solder Pin Feed)               |  |
|  .  |                                                    |  |
|  2  ======================================================  |
| [SW]| [TVS/Diodes]   [Q1-Relay] [Filter Array]              |  |
|     +----------------------------------------------------+  |
|       90V   GND   ACC   RELAY   SPK+   SPK-   KCOL1  KROW1  |
|      [RED] [BLK] [ORN]  [YEL]  [GRN]  [BLU]   [WHT]  [BRN]  |
|     +----------------------------------------------------+  |
+-------------------------------------------------------------+
```

1. **Test Pad Cluster 1 (System Core):**
   - Positioned immediately to the left of the SIM card tray.
   - Consists of 8 circular immersion gold test pads.
   - Functions include power rail monitoring (`VBAT`, `VCHG`, `GND`), system power gating (`PWKEY`), serial diagnostics (`TX1`, `RX1`), and native USB communication (`DP`, `DM`).
2. **GNSS Test Pad Cluster 2:**
   - Positioned in the space between the SIM holder and the top edge of the ceramic patch antenna.
   - Contains `GPS-HRST-B` (hardware reset bar), `RX`, and `TX`.
   - These pads connect to the GNSS subsystem, independent of the cellular modem UART.
3. **Ceramic GNSS Patch Antenna:**
   - Standard high-dielectric ceramic antenna tuned to GPS L1 (1575.42 MHz).
   - Mounted directly to the top layer with double-sided adhesive and soldered via a single central RF feed pin passing through to the LNA/RF front end.
4. **Slide Switch:**
   - Located on the left board edge.
   - Acts as a physical battery disconnect switch between the LiPo cell and the PMU VBAT input, preventing battery drain while the device is in transit or warehouse storage.
5. **Vehicle Harness Solder Header:**
   - 8 wire termination pads along the bottom edge, reinforced with strain relief.
   - Supported by SOT-23 switching transistors (relay driver), flyback diodes, and input protection networks.

---

### 3.2 Rear Side (Bottom Layer)
```
+-------------------------------------------------------------+
|  [ Plastic Bracket / GSM Internal Antenna Contacts ]       |
|                                                             |
|  +-------------------------------------------------------+  |
|  |             RECHARGEABLE LiPo BATTERY                 |  |
|  |                 KM 322535 3.7V                        |  |
|  |               250mAh 0.925Wh                          |  |
|  |                 2019.12.11                            |  |
|  |                                                       |  |
|  |  [ UNDERNEATH BATTERY: RF Shielding Can Enclosing     |  |
|  |    MediaTek MT2503 SoC, Flash Memory & RF Front-End]  |  |
|  +-------------------------------------------------------+  |
|       | | (Battery Leads: Red = VBAT+, Black = GND)         |
|                                                             |
|  +----+  [Buck IC]    [Diode]   +---------+                 |
|  |470 |  (SOIC-8)     (SMA/SMB) |107A 10V | [220uF 10V Cap] |
|  |Ind |                         +---------+                 |
|  +----+   [Radial High-Voltage Input Filter Capacitor]      |
|                                                             |
|  =========================================================  |
|  [ 8-Wire Vehicle Harness Strain Relief & Solder Terminals] |
+-------------------------------------------------------------+
```

1. **Rechargeable Battery:**
   - Glued to the PCB surface with industrial double-sided foam tape.
   - Dimensions: 3.2 mm thickness × 25 mm width × 35 mm length.
   - Nominal voltage: 3.7V, Fully charged: 4.2V.
2. **Main Processor & RF Shield Can:**
   - Solder perimeter visible around the boundary under the battery indicates an RF metal shield can (Faraday cage).
   - This shield isolates the GSM quad-band transceiver and GNSS baseband from electromagnetic interference generated by the switching regulator below.
3. **High-Voltage Step-Down Buck Converter:**
   - Designed to step down vehicle electrical system noise and voltages ranging from 9V to 90V DC down to an internal system voltage rail (~4.2V).
   - Inductor `470`: 47 µH power choke.
   - High-voltage electrolytic capacitors rated for harsh automotive transients.
   - Tantalum capacitor `107A`: 100 µF, 10V surge rated for baseband GSM burst transmission (GSM transmission causes 2A current pulses during 2G TDMA transmission slots).

---

## 4. Silicon Architecture & Datasheet Research

### 4.1 Primary Candidate: MediaTek MT2503 (MT2503A / MT2503D / MT2503AE)
* **Architecture:** ARM7EJ-S 32-bit RISC core up to 260 MHz.
* **Internal Memory:**
  - MT2503A: 32 Mbit (4MB) pseudo-SRAM + 32 Mbit (4MB) NOR Flash inside SiP.
  - MT2503D: 32 Mbit (4MB) pseudo-SRAM + 32 Mbit (4MB) NOR Flash.
  - MT2503AVE: 64 Mbit (8MB) RAM + 64 Mbit (8MB) Flash.
* **Integrated Modems:**
  - Cellular: Quad-band GPRS Class 12 (850/900/1800/1900 MHz).
  - GNSS: Integrated MT3333 GNSS core supporting GPS, GLONASS, BeiDou, and Galileo.
* **Key Pin Correspondences in MT2503 Datasheet:**
  - `PWRKEY`: Power on/off control (pulled high internally to VRTC/VBAT, pulled low to turn on).
  - `UTXD1 / URXD1`: High-speed UART 1 (system debugging / bootloader / AT commands).
  - `USB_DP / USB_DM`: Full-speed USB 1.1 transceiver (boot ROM download & AT port).
  - `GPS_HRST_B`: Dedicated GNSS hardware reset pin (active low).
  - `GPS_UTXD / GPS_URXD`: Dedicated GNSS NMEA UART output.
  - `KCOL[0..n] / KROW[0..n]`: Dedicated hardware keypad matrix scanner.

### 4.2 Secondary Candidate: MediaTek MT6261 + Discrete GNSS (MT3333 / GK9501 / AT6558)
* If the RF shield can is desoldered and contains two distinct ICs rather than a single SiP, the host processor is almost certainly an **MT6261D** (ARM7EJ-S) paired with a standard GNSS companion IC.
* *Implications for Firmware Development:* Identical. The host bootloader, toolchains, memory map, and flashing protocols are governed entirely by the MediaTek baseband core.

---

## 5. Non-Destructive Hardware Verification Checklist

To confirm the internal architecture without thermal desoldering or mechanical damage:

1. **Verify Logic Voltage of Test Pads:**
   - Power the board via a bench supply at 12V DC on `90V` / `GND` (or supply 3.8V DC directly to `VBAT` / `GND`).
   - Measure DC voltage with a high-impedance digital multimeter on `TX1`, `RX1`, `DP`, `DM`, and `PWKEY` relative to `GND`.
   - *Target:* Expect ~2.8V (MediaTek standard VIO) or 1.8V.
2. **Serial Banner Capture on UART1:**
   - Connect a 3.3V/1.8V selectable USB-to-UART bridge to `TX1` / `RX1` / `GND`.
   - Open a terminal at 115200 baud, 8N1.
   - Cycle power using the slide switch or toggle `PWKEY` to GND for 1.5 seconds.
   - Capture the bootloader banner string (MediaTek bootloaders emit `MTK` or chip ID strings upon initialization).
3. **USB Enumeration:**
   - Solder lightweight flexible wires (30 AWG kynar/enamelled wire) to `DP`, `DM`, and `GND`.
   - Connect to a PC USB port (or USB breakout board) and monitor OS device manager / `lsusb`.
   - *Expected USB VID/PID:*
     - MediaTek BootROM: `VID_0E8D&PID_0003` (MediaTek Inc. MT65xx Preloader / USB Port) or `VID_0E8D&PID_2000` (MTK USB Modem).

---

## 6. Document References
* Connector details: [connector-pinout.md](file:///e:/Hardware%20Projects/Y2507-Tracker-Firmware/docs/connector-pinout.md)
* Serial communications: [serial-debugging.md](file:///e:/Hardware%20Projects/Y2507-Tracker-Firmware/docs/serial-debugging.md)
* Bootloader & update methods: [firmware-update-method.md](file:///e:/Hardware%20Projects/Y2507-Tracker-Firmware/docs/firmware-update-method.md)
* Safety & rollback protocols: [risks-and-recovery.md](file:///e:/Hardware%20Projects/Y2507-Tracker-Firmware/docs/risks-and-recovery.md)
