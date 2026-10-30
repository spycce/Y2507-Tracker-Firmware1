# Serial Debugging & Protocol Analysis Guide: Y2507-MB-V1.2

**Document Version:** 1.0  
**Target Board Revision:** Y2507-MB-V1.2  
**Date:** October 2026  

---

## 1. Subsystem Architecture of Serial Interfaces

A critical finding from the physical investigation of board **Y2507-MB-V1.2** is the presence of **two independent physical UART interfaces**:

```
                  +----------------------------------------------+
                  |         Y2507-MB-V1.2 Tracking Board         |
                  |                                              |
[Host Terminal]   |  +--------------------+                      |
  USB-to-UART <======>  TX1 / RX1 Pads    |                      |
  (Debug / AT)    |  +---------+----------+                      |
                  |            |                                 |
                  |     +------v---------------------------+     |
                  |     | MediaTek MT2503 Host Baseband    |     |
                  |     | (ARM7EJ-S Core @ 260 MHz)        |     |
                  |     +--------------+-------------------+     |
                  |                    | (Internal SPI / UART)   |
                  |     +--------------v-------------------+     |
[GPS Sniffer]     |     | MT3333 GNSS Positioning Engine   |     |
  USB-to-UART <======>  GPS-TX / RX / GPS-HRST-B Pads     |     |
  (NMEA 0183)     |     +----------------------------------+     |
                  +----------------------------------------------+
```

### 1.1 Interface 1: Primary Host Baseband UART (`TX1` / `RX1`)
* **Connection Target:** Connects directly to the application processor / cellular modem (MediaTek MT2503 / MT6261 baseband core).
* **Protocol:** 
  - During cold boot: Emits BootROM diagnostic tokens or preloader banner strings (e.g., `MTK`, hardware handshake codes).
  - During active runtime: Handles Hayes Standard AT Commands (3GPP TS 27.007 / 27.005) or proprietary logging / telemetry framing.
* **Role in Firmware Development:** This is the primary interactive debug console and the UART fallback programming interface.

### 1.2 Interface 2: Dedicated GNSS Receiver UART (`TX` / `RX` + `GPS-HRST-B`)
* **Connection Target:** Connects directly to the GNSS positioning engine (MT3333 or companion GNSS die).
* **Protocol:** Standard **NMEA 0183** sentences (`$GPRMC`, `$GPGGA`, `$GPGSV`, `$GPGSA`) or binary positioning packets (MediaTek PMTK protocol).
* **Role in Firmware Development:** Allows direct, non-invasive tapping of satellite acquisition and positioning data without requiring host firmware cooperation.

---

## 2. Signal Voltage Verification & Level Shifting

> [!CAUTION]
> **Overvoltage Hazard:** Modern cellular SoCs (including MediaTek MT2503) use internal I/O pads powered by the PMU's digital I/O rail (`VIO`), typically **2.8V** (or occasionally 1.8V). **They are NOT 5.0V tolerant.** Directly attaching a legacy 5V USB-to-TTL adapter will blow the I/O clamping diodes and destroy the processor core.

### 2.1 Step-by-Step Voltage Measurement Procedure
1. Disconnect any serial adapters from the board.
2. Power the tracker board with a current-limited bench supply (12.0V DC on `90V` / `GND`, current limit set to 200mA) OR connect a 3.8V DC supply to `VBAT` / `GND`.
3. Set a Digital Multimeter (DMM) to DC Volts (20V range).
4. Place the Black multimeter probe firmly on the `GND` test pad.
5. Place the Red probe on `TX1` and observe the idle voltage:
   - **Expected Reading:** **+2.75V to +2.85V** (Confirms 2.8V CMOS logic).
   - If the reading is **+1.75V to +1.85V**, the chip is using 1.8V ultra-low-power VIO.
6. Place the Red probe on `TX` (GNSS sub-cluster):
   - **Expected Reading:** Rapidly fluctuating or periodic pulsing between ~0V and ~2.8V as NMEA sentences transmit every 1000ms.

### 2.2 Level Shifting Requirements
* **If Your Adapter Supports 3.3V:** 
  Connecting a 3.3V UART adapter's RX pin to the board's `TX1` (2.8V) is generally safe because 2.8V exceeds the $V_{IH}$ threshold (~2.0V) of a 3.3V receiver. However, the adapter's TX pin (3.3V) driving into the board's `RX1` (2.8V) will stress the MTK input.
* **Safe Solution:** Use an inline resistive voltage divider on the Adapter TX -> Board RX1 line:
  ```
  Adapter TX (3.3V) ----[ 1.0 kΩ ]----+----> Board RX1 (approx 2.75V)
                                      |
                                  [ 4.7 kΩ ]
                                      |
                                    [ GND ]
  ```
* **Best Solution:** Use a USB-to-UART adapter featuring an adjustable VCCIO / VIO pin (e.g., FTDI FT232R with VCCIO jumper set to 2.8V, or a bidirectional logic level converter such as the TXS0102 / TXB0104).

---

## 3. Host System COM Port Identification

### 3.1 Windows Environment (PowerShell)
Plug in your USB-to-UART bridge and execute the following command to identify available COM ports:

```powershell
# List all active serial ports and hardware descriptions
Get-CimInstance Win32_SerialPort | Select-Object DeviceID, Description, PNPDeviceID

# Fast port query
[System.IO.Ports.SerialPort]::GetPortNames()
```

Look for devices labeled:
- `Silicon Labs CP210x USB to UART Bridge (COMx)`
- `FTDI USB Serial Port (COMx)`
- `USB-SERIAL CH340 (COMx)`

### 3.2 Linux / macOS Environment
```bash
# Check kernel recognition
dmesg | grep -E "ttyUSB|ttyACM"

# Query device listing
ls -l /dev/ttyUSB* /dev/ttyACM*
```

---

## 4. Baud Rate Hunting & Protocol Determination

### 4.1 Oscilloscope / Logic Analyzer Method (Recommended)
1. Attach Channel 0 of a digital logic analyzer to `TX1`, Channel 1 to `TX` (GNSS), and Ground to `GND`.
2. Configure sampling at $\ge 10 \text{ MS/s}$.
3. Trigger on a falling edge on `TX1` while powering on the board.
4. Measure the narrowest pulse width ($T_{\text{bit}}$):
   $$\text{Baud Rate} = \frac{1}{T_{\text{bit}}}$$
   - If $T_{\text{bit}} \approx 8.68 \, \mu\text{s} \implies \mathbf{115,200 \text{ baud}}$ (standard baseband debug / bootloader).
   - If $T_{\text{bit}} \approx 104 \, \mu\text{s} \implies \mathbf{9,600 \text{ baud}}$ (standard GNSS NMEA).
   - If $T_{\text{bit}} \approx 1.08 \, \mu\text{s} \implies \mathbf{921,600 \text{ baud}}$ (high-speed MTK download agent).

### 4.2 Automated Software Baud Hunting
If test instrumentation is limited, run an automated Python sniffing loop (`docs/scratch/baud_hunter.py`):

```python
import serial
import time

candidate_bauds = [115200, 9600, 38400, 57600, 19200, 460800, 921600]
port = "COM3"  # Replace with verified port

for baud in candidate_bauds:
    print(f"Testing baud rate: {baud}...")
    try:
        with serial.Serial(port, baudrate=baud, timeout=1.5) as ser:
            data = ser.read(256)
            # Check for readable ASCII strings (AT response, NMEA headers, or MTK tokens)
            printable = "".join([chr(b) for b in data if 32 <= b <= 126 or b in (10, 13)])
            if any(token in printable for token in ["$GP", "$GN", "OK", "READY", "MTK", "+"]):
                print(f"[FOUND!] Valid protocol detected at {baud} baud:")
                print(printable)
                break
    except Exception as e:
        print(f"Error opening port: {e}")
```

---

## 5. Non-Destructive Interactive Diagnostic Sessions

### 5.1 Session 1: Passive GNSS Tapping (`GPS-TX` to Adapter RX)
* **Wiring:** Connect Adapter RX -> Board `TX` pad; Adapter GND -> Board `GND`. Leave Board `RX` disconnected.
* **Terminal Configuration:** 9600 baud, 8 data bits, no parity, 1 stop bit (8N1).
* **Expected Output:**
  ```text
  $GNRMC,123519.00,A,3746.5201,N,12225.2912,W,0.02,31.2,291026,,,A*76
  $GNGGA,123519.00,3746.5201,N,12225.2912,W,1,08,1.03,15.4,M,-28.0,M,,*4E
  $GPGSA,A,3,01,03,06,09,17,19,28,,,,,,1.8,1.0,1.5*37
  ```
  *(Confirms satellite tracking core is operational and receiving clock/position data).*

### 5.2 Session 2: Cellular Baseband Diagnostic Session (`TX1` / `RX1`)
* **Wiring:** Connect Adapter RX -> Board `TX1`; Adapter TX (level-shifted) -> Board `RX1`; Adapter GND -> Board `GND`.
* **Terminal Configuration:** 115200 baud, 8N1, Hardware Flow Control: None, Local Echo: ON, Newline: CRLF (`\r\n`).
* **Safe Diagnostic Command Sequence (Query Only - No Writes):**

| Command | Expected Response | Diagnostic Value |
|:---|:---|:---|
| `AT` | `OK` | Verifies UART communication, autobaud alignment, and modem readiness. |
| `ATI` | Returns manufacturer & chip ID (e.g., `MTK2503`, `Revision: ...`) | **Identifies exact silicon and internal firmware release.** |
| `AT+CGMI` | e.g., `MediaTek Inc.` | Confirms device manufacturer. |
| `AT+CGMM` | e.g., `MT2503` | Confirms modem hardware model. |
| `AT+CGMR` | e.g., `11CW1352MP_MT2503_...` | Software build revision and SDK version. |
| `AT+CGSN` | Returns 15-digit IMEI | Confirms NVRAM integrity without modifying it. |
| `AT+CPIN?` | `+CPIN: READY` | Tests SIM socket physical continuity and SIM detection. |
| `AT+CSQ` | `+CSQ: <rssi>,<ber>` | Reports cellular RF reception level (0-31). |
| `AT+CBC` | `+CBC: <bcs>,<bcl>,<voltage>` | Reports battery charging state and battery millivolts. |

> [!IMPORTANT]
> **Safety Rule:** Never issue flash write commands (e.g., `AT+FOTA`, `AT+RESTORE`, `AT&F`, `AT+CFUN=4` write tests) during serial investigation. Keep all commands strictly read-only (`?` query commands).
