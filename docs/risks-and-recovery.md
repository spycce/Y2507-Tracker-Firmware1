# Risk Analysis, Recovery Strategy & Safe Test Procedures: Y2507-MB-V1.2

**Document Version:** 1.0  
**Target Board Revision:** Y2507-MB-V1.2  
**Date:** October 2026  

---

## 1. Risk Analysis & Hazard Prevention

Reverse engineering physical IoT hardware involves electrical, chemical, and firmware risks. The following risk matrix identifies critical hazards and non-destructive mitigations for the **Y2507-MB-V1.2** tracker board.

```
+----------------------------------------------------------------------------------------------------+
|                                      HAZARD IDENTIFICATION MATRIX                                  |
+--------------------------+-----------------------+-------------------------------------------------+
| Hazard Type              | Severity / Impact     | Mandatory Mitigation Procedure                  |
+--------------------------+-----------------------+-------------------------------------------------+
| High-Voltage DC Input    | CRITICAL              | NEVER power the board from a vehicle battery or |
| (90V Harness Rail)       | Component Destruction | uncontrolled AC adapter. Use a DC bench supply  |
|                          | Fire / Explosion      | set strictly to 12.0V DC with a 150mA limit.    |
+--------------------------+-----------------------+-------------------------------------------------+
| LiPo Battery Puncture    | CRITICAL              | DO NOT pry the battery off the PCB with metal   |
| (KM 322535 3.7V Pouch)   | Thermal Runaway / Fire| tools. Use only plastic spudgers. Disconnect    |
|                          | Toxic Fume Release    | the battery switch during bench testing.        |
+--------------------------+-----------------------+-------------------------------------------------+
| Logic Level Overvoltage  | HIGH                  | MT2503 I/O runs at 2.8V. NEVER connect 5V TTL.  |
| (TX1, RX1, DP, DM)       | Silicon Gate Rupture  | Use level shifters or 2.8V/3.3V VIO adapters    |
|                          | Permanent Latch-Up    | with series current-limiting resistors.         |
+--------------------------+-----------------------+-------------------------------------------------+
| NVRAM / Calibration Loss | HIGH (IRREVERSIBLE)   | DO NOT flash, erase, or write to flash. Perform |
| (IMEI & RF Tuning Loss)  | Permanent Brick       | dual-verified complete BROM readback before     |
|                          | Loss of GSM Network   | attempting any custom code execution.           |
+--------------------------+-----------------------+-------------------------------------------------+
```

---

## 2. Battery Safety & Mechanical Precautions

The unit includes a **3.7V 250mAh lithium-ion polymer (LiPo) pouch cell** mounted directly over the RF shielding can on the rear layer:

1. **Mechanical Vulnerability:** Pouch cells have a soft aluminum-laminate casing. Even a minute pinprick from a soldering tip, probe, or screwdriver can puncture the internal separator, triggering internal short-circuits and thermal runaway (temperatures exceeding $400^\circ\text{C}$).
2. **Handling Rules:**
   - Always place the board on an ESD-safe silicone mat.
   - When inspecting the components underneath or around the battery, do not apply bending or twisting stress to the PCB.
   - Set the physical slide switch (`SW1`) to **OFF** when soldering test leads to `DP`, `DM`, `TX1`, or `RX1`.
   - If the battery exhibits any swelling, puffing, or heat, immediately disconnect its soldered red wire, insulate the lead with Kapton tape, and dispose of it in a certified battery recycling container.

---

## 3. Safe, Non-Destructive Electrical Testing Protocol

All hardware investigation must proceed through progressive, non-destructive validation stages:

```
[ Stage 1: Cold Resistance Checks ]
  (Board completely unpowered; measure impedance to GND)
                 |
                 v
[ Stage 2: Controlled Bench Powering ]
  (12.0V DC, 150mA current limit on 90V / GND; monitor quiescent current)
                 |
                 v
[ Stage 3: Passive Serial & Logic Sniffing ]
  (High-impedance probes on TX1 and GPS-TX; zero transmission into board)
                 |
                 v
[ Stage 4: Read-Only AT Command Interrogation ]
  (Non-volatile registers queried; no writes permitted)
                 |
                 v
[ Stage 5: BROM Partition Readback / Golden Image Extraction ]
  (Full binary flash dump archived and SHA-256 verified)
```

### 3.1 Stage 1: Cold Resistance Checks (Unpowered)
Before applying external power to any newly received board, verify that power rails are not shorted to ground:
* **`VBAT` to `GND`:** Set DMM to diode/resistance mode. Expect high resistance ($> 10\,\text{k}\Omega$) or open circuit charging signature.
* **`90V` to `GND`:** Expect high resistance ($> 50\,\text{k}\Omega$) as input capacitors charge. A reading below $10\,\Omega$ indicates a shorted buck regulator IC or TVS diode.
* **`TX1` / `RX1` to `GND`:** Expect high impedance ($> 100\,\text{k}\Omega$).

### 3.2 Stage 2: Controlled Bench Powering
* **Voltage Setting:** 12.0V DC (simulating nominal automotive battery).
* **Current Limit Setting:** **150 mA** (strictly enforced).
* **Connection:** 
  - Red power lead to `90V` wire (Wire 1).
  - Black ground lead to `GND` wire (Wire 2).
* **Current Profile Observation:**
  - Standby boot current: ~15 mA to 35 mA.
  - GSM network search bursts: Brief periodic spikes to ~80 mA to 120 mA (buffered by the on-board $100\,\mu\text{F}$ tantalum and $220\,\mu\text{F}$ capacitors).
  - *If current immediately reaches the 150mA clamp limit with voltage collapsing below 12V, instantly cut power — this indicates a short circuit or reversed polarity.*

---

## 4. Minimum Equipment Requirements

To safely reverse engineer and develop firmware for the Y2507-MB-V1.2 board without specialized production lab facilities, the following minimum equipment is required:

| Equipment | Minimum Specification | Purpose in Investigation |
|:---|:---|:---|
| **Regulated DC Bench Power Supply** | 0 – 30V DC, 0 – 2A, with adjustable Constant Current (CC) limiting | Safely powers the board via `90V`/`GND` or `VBAT` without risk of high-current fault damage. |
| **Digital Multimeter (DMM)** | 3.5-digit, high input impedance ($\ge 10\,\text{M}\Omega$), with fine gold-plated needle probes | Verifying rail voltages, idle logic levels on `TX1`/`DP`/`DM`, and cold continuity. |
| **USB-to-UART Serial Adapter** | Silicon Labs CP2102 or FTDI FT232R with **selectable 3.3V / 2.8V / 1.8V logic** | Interfacing with `TX1`/`RX1` baseband console and `GPS-TX` NMEA stream. |
| **Logic Analyzer** | 8-Channel, $\ge 24\,\text{MS/s}$ USB logic analyzer (e.g., Saleae clone supported by Sigrok/PulseView) | Measuring exact bit times to determine baud rates non-destructively on `TX1` and `GPS-TX`. |
| **Micro-Soldering Station** | Temperature-controlled iron (fine conical or 0.8mm chisel tip), 63/37 or SAC305 solder, tacky rosin flux | Attaching ultra-fine 30 AWG breakout wires to test pads without lifting delicate copper pads. |
| **Wiring & Consumables** | 30 AWG Kynar / wire-wrap wire, Kapton polyimide tape, isopropyl alcohol (IPA 99%) | Creating flexible, strain-relieved test harnesses for `DP`, `DM`, `TX1`, `RX1`, and `PWKEY`. |
| **Plastic Spudger & ESD Tools** | Anti-static ESD wrist strap, ESD dissipative work mat, non-conductive nylon spudgers | Protecting board from static discharge and avoiding metal tool contact with the LiPo battery. |

---

## 5. Golden Image Preservation & Rollback Plan

Custom firmware development on proprietary cellular hardware carries the risk of software lock-out (e.g., watchdog resets, flash corruption, broken serial handlers). 

### 5.1 Verification Checklist Prior to Any Firmware Experimentation
- [ ] **Physical Health:** LiPo battery is physically intact and isolated via slide switch.
- [ ] **Power Rails Verified:** Bench supply clamped at 12V @ 150mA; `VBAT` measures 3.8V – 4.2V.
- [ ] **Logic Level Confirmed:** `TX1` measured with DMM at ~2.8V relative to `GND`.
- [ ] **Passive Log Captured:** Boot log string and NMEA sentences recorded and archived in `docs/logs/`.
- [ ] **Full BROM Dump Extracted:** Full flash image extracted via USB BootROM or UART Download Agent.
- [ ] **Cryptographic Hash Verified:**
  ```bash
  sha256sum backup_original_full_flash_y2507.bin
  ```
  Two consecutive dumps must produce identical SHA-256 hashes.
- [ ] **NVRAM Partition Isolated:** The NVRAM sector (holding IMEI and RF tuning coefficients) is carved out and stored in a write-protected, separate archive directory.

---

## 6. Document Cross-References
* Full Hardware Breakdown: [hardware-identification.md](file:///e:/Hardware%20Projects/Y2507-Tracker-Firmware/docs/hardware-identification.md)
* Pin & Harness Definitions: [connector-pinout.md](file:///e:/Hardware%20Projects/Y2507-Tracker-Firmware/docs/connector-pinout.md)
* Serial Probing & AT Session: [serial-debugging.md](file:///e:/Hardware%20Projects/Y2507-Tracker-Firmware/docs/serial-debugging.md)
* BootROM Update Protocols: [firmware-update-method.md](file:///e:/Hardware%20Projects/Y2507-Tracker-Firmware/docs/firmware-update-method.md)
