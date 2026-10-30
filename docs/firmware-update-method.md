# Firmware Update Mechanisms & Bootloader Investigation: Y2507-MB-V1.2

**Document Version:** 1.0  
**Target Board Revision:** Y2507-MB-V1.2  
**Date:** October 2026  

---

## 1. Overview of Firmware Update Architecture

This document evaluates the supported firmware update pathways, bootloader architectures, and physical test pad implementations for the **Y2507-MB-V1.2** tracking board.

Based on hardware identification, the board's host processor is built on the **MediaTek MT2503 / MT6261** silicon architecture. Firmware updates on this architecture operate through a strict multi-tier hierarchy:

```
+-----------------------------------------------------------------------------------+
|                           SILICON MASK BOOTROM (BROM)                             |
|          Hardcoded in permanent silicon ROM; cannot be erased or modified         |
+-----------------------------------------------------------------------------------+
           |                                                      |
           v                                                      v
  [ High-Speed USB Interface ]                          [ Primary Serial UART ]
       Pads: DP, DM, GND                                   Pads: TX1, RX1, GND
           |                                                      |
           +--------------------------+---------------------------+
                                      |
                                      v
+-----------------------------------------------------------------------------------+
|                         DOWNLOAD AGENT (DA) INJECTION                             |
|       Temporary loader streamed by host PC into internal processor SRAM           |
+-----------------------------------------------------------------------------------+
                                      |
                                      v
+-----------------------------------------------------------------------------------+
|                       NOR FLASH / SPI MEMORY ACCESS                               |
|       Performs partition dump (Readback), verification, and safe backup           |
+-----------------------------------------------------------------------------------+
```

---

## 2. Investigation of USB Data Support via `DP` and `DM`

### 2.1 Physical Traces & Passives
In Image 3 (ultra-close-up of the test pad cluster):
- Test pads labeled **`DP`** (USB Data+) and **`DM`** (USB Data-) are positioned at the bottom of the system test pad cluster.
- Immediately below `DP` and `DM`, two **0402 SMD passive footprints** are visible.
- In MediaTek reference designs, these footprints are allocated for either:
  1. **Series termination resistors** ($22\,\Omega$ to $33\,\Omega$) placed in series with the D+ and D- lines to match USB trace impedance ($90\,\Omega$ differential).
  2. **TVS / ESD clamping arrays** protecting the high-speed differential inputs from static discharge during human contact.

### 2.2 Continuity & Readiness Verification (Non-Destructive)
Before soldering a USB breakout cable to `DP` and `DM`:
1. Use a multimeter in resistance mode ($\Omega$) to measure continuity from the `DP` pad across its adjacent 0402 component.
   - If resistance is $0\,\Omega$ to $33\,\Omega$, the trace is active and continuous to the SoC.
   - If resistance is open circuit ($\infty$), the component is unpopulated; a small solder bridge or $0\,\Omega$ jumper must be installed across the pads.
2. Measure the unpowered resistance between `DP` and `GND`, and between `DM` and `GND`:
   - Both should read high impedance ($> 100\,\text{k}\Omega$) in normal conditions.

### 2.3 USB Breakout Harness Fabrication
To safely connect the board to a PC via USB:
1. Prepare a standard USB Type-A or Micro-B/Type-C breakout cable.
2. Solder fine gauge, flexible wire (30 AWG Kynar or enamelled wire) to:
   - Green wire -> `DP` pad.
   - White wire -> `DM` pad.
   - Black wire -> `GND` pad.
   - Red wire (+5V VBUS) -> **`VCHG`** pad (NOT `VBAT`! `VCHG` feeds the PMU charger input, which accepts 5.0V).
3. Keep the data wire length as short as possible ($\le 10\,\text{cm}$) and loosely twisted together to preserve differential impedance and minimize RF reflections.

---

## 3. Firmware Update Channels

### 3.1 Channel A: High-Speed USB BootROM (Preferred)
* **Interface:** Test pads `DP`, `DM`, `GND` (and `VCHG`).
* **Mechanism:**
  1. The PC flash utility initiates listening on the USB bus.
  2. The board is connected with the battery switch ON and USB cable inserted.
  3. The on-chip MediaTek Mask ROM (BROM) enumerates as a USB Full-Speed device:
     - `USB\VID_0E8D&PID_0003` (MediaTek Inc. MT65xx Preloader / BROM).
  4. The host flasher exchanges a cryptographic/protocol handshake and uploads a specialized **Download Agent (DA)** binary into internal 260 MHz SRAM.
  5. The DA initializes the external NOR/SPI Flash memory controller, permitting high-speed flash readback (backup) and flashing.

### 3.2 Channel B: Serial UART BootROM (Fallback)
* **Interface:** Test pads `TX1`, `RX1`, `GND` via a 2.8V level-shifted USB-to-UART adapter.
* **Mechanism:**
  1. If USB test pads are inaccessible or traces are unpopulated, the MediaTek BootROM also listens on `UART1` (`TX1`/`RX1`) during the first 1 to 3 seconds following reset.
  2. Handshake sequence: The host flasher sends repetitive sync bytes (typically `0xA0`, `0x0A`, or `0x5F`) at 115,200 baud.
  3. The BROM acknowledges with `0x5F` / `0x05`, confirms sync, and accepts the DA binary over serial.
  4. Once the DA is running in SRAM, the baud rate is dynamically negotiated up to 921,600 baud for data transfers.

### 3.3 Channel C: Vendor Over-The-Air (FOTA)
* **Interface:** Cellular GPRS network connection via on-board SIM card.
* **Mechanism:** The stock tracker firmware polls a remote HTTP/TCP server. If a new firmware package is flagged, it downloads the delta binary into a reserved FOTA cache partition and triggers a software reboot into its secondary bootloader to patch the main image.
* **Limitations for Custom Firmware:** FOTA cannot be used to install initial custom firmware because vendor FOTA engines require cryptographic signature verification and vendor server coordination.

---

## 4. Flashing Tools & Environment

### 4.1 Official MediaTek Flashing Tools
* **FlashTool for Feature Phones (FlashTool_v5.xxxx):**
  - Dedicated tool developed by MediaTek for ARM7/MT62xx/MT2503 feature phone and IoT SoCs.
  - Requires:
    - Chip selection: `MT2503` or `MT6261`.
    - Download Agent: `MTK_AllInOne_DA.bin` (standard MediaTek DA package).
    - Scatter / Configuration File: Maps the partition offsets (e.g., `ROM`, `VIVA`, `BOOTLOADER`, `NVRAM`).
* **SP Flash Tool (Smart Phone Flash Tool):**
  - Primarily intended for smartphone SoCs (MT65xx/MT67xx), but specific legacy versions support MT2503 IoT devices.

### 4.2 Modern Open-Source Tooling: `mtkclient`
* `mtkclient` is an open-source Python-based utility that interfaces directly with the MediaTek BROM protocol over USB:
  - Supports non-destructive memory dumping (`dump`, `r` commands).
  - Works across Windows and Linux.
  - Allows full flash readbacks without vendor-specific proprietary account credentials.

---

## 5. Mandatory Safety Protocol: Flash Backup Before Any Modification

> [!CAUTION]
> **CRITICAL PERMANENT BRICK HAZARD:**  
> MediaTek tracking SoCs store individual device calibration data in non-volatile flash partitions (commonly designated **`NVRAM`** and **`SEC_RO`**):
> 1. **RF Power & Crystal Trimming:** Factory-tuned crystal capacitance calibration registers (26 MHz AFC) and GSM PA power ramp tables.
> 2. **Factory Identifiers:** The unique 15-digit International Mobile Station Equipment Identity (**IMEI**) and MAC address.
>
> If you flash or erase the flash chip without an exact, verified binary backup of the original firmware and NVRAM partitions:
> - The tracker's RF front-end will fail frequency lock and will **never be able to connect to cellular towers**.
> - The IMEI will be wiped (reporting `000000000000000` or invalid), making network registration illegal and rejected by cellular carriers.

### 5.1 Non-Destructive Backup Workflow (Mandatory First Milestone)
```
[Step 1: Physical Prep]
  Solder breakout wires to DP, DM, GND (or TX1, RX1, GND)
       |
       v
[Step 2: Readback Configuration]
  Configure FlashTool or mtkclient in "READBACK ONLY" mode
  Start Address: 0x00000000
  Length: Full Flash Size (Typically 4MB / 0x00400000 or 8MB / 0x00800000)
       |
       v
[Step 3: Execute Dump]
  Trigger BootROM via PWKEY assertion / battery connect
  Save raw dump as: backup_original_full_flash_y2507.bin
       |
       v
[Step 4: Cryptographic Verification]
  Compute SHA-256 hash of the dump
  Perform a second independent dump and confirm matching hashes:
  Certifies 100% bit-accurate preservation of the original factory firmware.
```
