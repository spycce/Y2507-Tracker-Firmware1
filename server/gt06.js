// server/gt06.js - Robust GT06 Telematics Protocol Parser & Serializer
// Compliant with standard Concox / Jimi / SinoTrack / Y2507 GPS tracking protocol specifications

const crctab16 = [
  0X0000, 0X1189, 0X2312, 0X329B, 0X4624, 0X57AD, 0X6536, 0X74BF,
  0X8C48, 0X9DC1, 0XAF5A, 0XBED3, 0XCA6C, 0XDBE5, 0XE97E, 0XF8F7,
  0X1081, 0X0108, 0X3393, 0X221A, 0X56A5, 0X472C, 0X75B7, 0X643E,
  0X9CC9, 0X8D40, 0XBFDB, 0XAE52, 0XDAED, 0XCB64, 0XF9FF, 0XE876,
  0X2102, 0X308B, 0X0210, 0X1399, 0X6726, 0X76AF, 0X4434, 0X55BD,
  0XAD4A, 0XBCC3, 0X8E58, 0X9FD1, 0XEB6E, 0XFAE7, 0XC87C, 0XD9F5,
  0X3183, 0X200A, 0X1291, 0X0318, 0X77A7, 0X662E, 0X54B5, 0X453C,
  0XBDCB, 0XAC42, 0X9ED9, 0X8F50, 0XFBEF, 0XEA66, 0XD8FD, 0XC974,
  0X4204, 0X538D, 0X6116, 0X709F, 0X0420, 0X15A9, 0X2732, 0X36BB,
  0XCE4C, 0XDFC5, 0XED5E, 0XFCD7, 0X8868, 0X99E1, 0XAB7A, 0XBAF3,
  0X5285, 0X430C, 0X7197, 0X601E, 0X14A1, 0X0528, 0X37B3, 0X263A,
  0XDECD, 0XCF44, 0XFDDF, 0XEC56, 0X98E9, 0X8960, 0XBBFB, 0XAA72,
  0X6306, 0X728F, 0X4014, 0X519D, 0X2522, 0X34AB, 0X0630, 0X17B9,
  0XEF4E, 0XFEC7, 0XCC5C, 0XDDD5, 0XA96A, 0XB8E3, 0X8A78, 0X9BF1,
  0X7387, 0X620E, 0X5095, 0X411C, 0X35A3, 0X242A, 0X16B1, 0X0738,
  0XFFCF, 0XEE46, 0XDCDD, 0XCD54, 0XB9EB, 0XA862, 0X9AF9, 0X8B70,
  0X8408, 0X9581, 0XA71A, 0XB693, 0XC22C, 0XD3A5, 0XE13E, 0XF0B7,
  0X0840, 0X19C9, 0X2B52, 0X3ADB, 0X4E64, 0X5FED, 0X6D76, 0X7CFF,
  0X9489, 0X8500, 0XB79B, 0XA612, 0XD2AD, 0XC324, 0XF1BF, 0XE036,
  0X18C1, 0X0948, 0X3BD3, 0X2A5A, 0X5EE5, 0X4F6C, 0X7DF7, 0X6C7E,
  0XA50A, 0XB483, 0X8618, 0X9791, 0XE32E, 0XF2A7, 0XC03C, 0XD1B5,
  0X2942, 0X38CB, 0X0A50, 0X1BD9, 0X6F66, 0X7EEF, 0X4C74, 0X5DFD,
  0XB58B, 0XA402, 0X9699, 0X8710, 0XF3AF, 0XE226, 0XD0BD, 0XC134,
  0X39C3, 0X284A, 0X1AD1, 0X0B58, 0X7FE7, 0X6E6E, 0X5CF5, 0X4D7C,
  0XC60C, 0XD785, 0XE51E, 0XF497, 0X8028, 0X91A1, 0XA33A, 0XB2B3,
  0X4A44, 0X5BCD, 0X6956, 0X78DF, 0X0C60, 0X1DE9, 0X2F72, 0X3EFB,
  0XD68D, 0XC704, 0XF59F, 0XE416, 0X90A9, 0X8120, 0XB3BB, 0XA232,
  0X5AC5, 0X4B4C, 0X79D7, 0X685E, 0X1CE1, 0X0D68, 0X3FF3, 0X2E7A,
  0XE70E, 0XF687, 0XC41C, 0XD595, 0XA12A, 0XB0A3, 0X8238, 0X93B1,
  0X6B46, 0X7ACF, 0X4854, 0X59DD, 0X2D62, 0X3CEB, 0X0E70, 0X1FF9,
  0XF78F, 0XE606, 0XD49D, 0XC514, 0XB1AB, 0XA022, 0X92B9, 0X8330,
  0X7BC7, 0X6A4E, 0X58D5, 0X495C, 0X3DE3, 0X2C6A, 0X1EF1, 0X0F78
];

function calculateCrc16(buffer, start, length) {
  let fcs = 0xFFFF;
  for (let i = start; i < start + length; i++) {
    fcs = (fcs >> 8) ^ crctab16[(fcs ^ buffer[i]) & 0xFF];
  }
  return (~fcs) & 0xFFFF;
}

function bcdToImei(buffer, start, length) {
  let imei = '';
  for (let i = 0; i < length; i++) {
    const byte = buffer[start + i];
    const high = (byte >> 4) & 0x0F;
    const low = byte & 0x0F;
    imei += high.toString(10);
    if (low <= 9) {
      imei += low.toString(10);
    }
  }
  // Standard IMEI is 15 digits; strip any leading padding zero if 16 digits
  if (imei.length === 16 && imei.startsWith('0')) {
    imei = imei.substring(1);
  }
  return imei;
}

function imeiToBcd(imei) {
  // Pad with leading 0 to make 16 digits
  const padded = imei.padStart(16, '0');
  const buf = Buffer.alloc(8);
  for (let i = 0; i < 8; i++) {
    const high = parseInt(padded[i * 2], 10);
    const low = parseInt(padded[i * 2 + 1], 10);
    buf[i] = (high << 4) | low;
  }
  return buf;
}

// Build standard GT06 response packet (0x78 0x78 0x05 <protocol> <serial_hi> <serial_lo> <crc_hi> <crc_lo> 0x0D 0x0A)
function buildAck(protocol, serialNumber) {
  const content = Buffer.alloc(4);
  content[0] = 0x05; // Length
  content[1] = protocol;
  content.writeUInt16BE(serialNumber, 2);

  const crc = calculateCrc16(content, 0, content.length);
  const packet = Buffer.alloc(10);
  packet[0] = 0x78;
  packet[1] = 0x78;
  content.copy(packet, 2);
  packet.writeUInt16BE(crc, 6);
  packet[8] = 0x0D;
  packet[9] = 0x0A;
  return packet;
}

// Build Server-to-Terminal Command Packet (Protocol 0x80)
// Encapsulates configuration strings (e.g., 'SOS,A,919876543210#') over TCP
function buildCommand(commandStr, serialNumber = 1) {
  const cmdBuf = Buffer.from(commandStr, 'ascii');
  const cmdLen = 4 + cmdBuf.length;
  const length = 1 + 1 + cmdLen + 2; // protocol(1) + cmdLen(1) + serverFlag(4) + cmd + serial(2)

  const content = Buffer.alloc(1 + length);
  content[0] = length;
  content[1] = 0x80; // Protocol 0x80
  content[2] = cmdLen;
  content.writeUInt32BE(0x00000001, 3); // Server token
  cmdBuf.copy(content, 7);
  content.writeUInt16BE(serialNumber, 7 + cmdBuf.length);

  const crc = calculateCrc16(content, 0, content.length);
  const packet = Buffer.alloc(content.length + 6);
  packet[0] = 0x78;
  packet[1] = 0x78;
  content.copy(packet, 2);
  packet.writeUInt16BE(crc, 2 + content.length);
  packet[packet.length - 2] = 0x0D;
  packet[packet.length - 1] = 0x0A;
  return packet;
}

// Helper to parse standard 18-byte GT06 GPS telemetry block
function parseGpsBlock(buf, offset) {
  const year = 2000 + buf[offset++];
  const month = buf[offset++] - 1;
  const day = buf[offset++];
  const hour = buf[offset++];
  const minute = buf[offset++];
  const second = buf[offset++];
  const dateUtc = Date.UTC(year, month, day, hour, minute, second);

  const satByte = buf[offset++];
  const satellites = satByte & 0x0F;

  const rawLat = buf.readUInt32BE(offset);
  offset += 4;
  let latitude = rawLat / 1800000.0;

  const rawLng = buf.readUInt32BE(offset);
  offset += 4;
  let longitude = rawLng / 1800000.0;

  const speed = buf[offset++];

  const courseStatus = buf.readUInt16BE(offset);
  offset += 2;

  // Bit 12 (0x1000): GPS fixed / valid
  const isGpsPositioned = (courseStatus & 0x1000) !== 0 || (courseStatus & 0x2000) !== 0;
  // Bit 11 (0x0800): 1 = West, 0 = East
  const isWest = (courseStatus & 0x0800) !== 0;
  // Bit 10 (0x0400): 0 = South, 1 = North
  const isSouth = (courseStatus & 0x0400) === 0;
  const course = courseStatus & 0x03FF;

  if (isWest) longitude = -longitude;
  if (isSouth) latitude = -latitude;

  latitude = Math.max(-90, Math.min(90, latitude));
  longitude = Math.max(-180, Math.min(180, longitude));

  const isHistorical = (year === 2022) || (latitude > 19.5 && longitude > 78.5);

  return {
    location: {
      timestamp: dateUtc,
      latitude: parseFloat(latitude.toFixed(6)),
      longitude: parseFloat(longitude.toFixed(6)),
      speed,
      course,
      satellites,
      altitude: 0,
      isGpsPositioned,
      isHistorical
    },
    nextOffset: offset
  };
}

// Parse an incoming raw buffer
function parsePacket(buf) {
  if (buf.length < 10) return null;

  // Check header
  const isNormal = buf[0] === 0x78 && buf[1] === 0x78;
  const isExtended = buf[0] === 0x79 && buf[1] === 0x79;
  if (!isNormal && !isExtended) return null;

  let offset = 2;
  let length = 0;
  if (isNormal) {
    length = buf[offset++];
  } else {
    length = buf.readUInt16BE(offset);
    offset += 2;
  }

  // Detect total length based on stop bits (0x0D 0x0A)
  // Standard GT06: length includes CRC (totalLength = length + 5)
  // Some variant firmware: length excludes CRC (totalLength = length + 7)
  let totalLength = isNormal ? length + 5 : length + 6;
  if (isNormal && buf.length >= length + 7 && buf[length + 5] === 0x0D && buf[length + 6] === 0x0A) {
    totalLength = length + 7;
  }

  // Ensure full packet is available
  if (buf.length < totalLength) return null;

  const protocol = buf[offset++];
  // Information serial number is always the 2 bytes preceding the 2-byte CRC
  const serialNumber = buf.readUInt16BE(totalLength - 6);

  const result = {
    protocol,
    serialNumber,
    rawHex: buf.subarray(0, totalLength).toString('hex').toUpperCase(),
    totalLength
  };

  switch (protocol) {
    // 0x01: Login Message
    case 0x01: {
      result.type = 'LOGIN';
      result.imei = bcdToImei(buf, offset, 8);
      result.ack = buildAck(0x01, serialNumber);
      break;
    }

    // 0x12: Standard GPS Location Packet
    // 0x22: GPS Location Packet with LBS Information
    case 0x12:
    case 0x22: {
      result.type = 'LOCATION';
      const gps = parseGpsBlock(buf, offset);
      result.location = gps.location;
      offset = gps.nextOffset;
      // Always acknowledge location packets to prevent tracker flash buffer backlog
      result.ack = buildAck(protocol, serialNumber);
      break;
    }

    // 0x13: Status / Heartbeat Packet
    case 0x13: {
      result.type = 'HEARTBEAT';
      const statusInfo = buf[offset++];
      const voltageLevel = buf[offset++];
      const gsmSignal = buf[offset++];

      // Parse status flags
      const isAccOn = (statusInfo & 0x02) !== 0;
      const isCharging = (statusInfo & 0x04) !== 0;
      const isDefended = (statusInfo & 0x01) !== 0;

      // Battery voltage estimation (0=no power, 1=low, 2=ok, 3=good, 6=full)
      const batteryPercent = Math.min(100, Math.round((voltageLevel / 6.0) * 100));
      const voltageEstimate = parseFloat((3.3 + (voltageLevel / 6.0) * 0.9).toFixed(2));

      result.heartbeat = {
        acc: isAccOn ? 1 : 0,
        charging: isCharging ? 1 : 0,
        defended: isDefended ? 1 : 0,
        batteryPercent,
        voltage: voltageEstimate,
        gsmSignal // CSQ: 0 to 31
      };

      result.ack = buildAck(0x13, serialNumber);
      break;
    }

    // 0x16 or 0x26: Alarm Packet (contains full GPS fix + alarm code)
    case 0x16:
    case 0x26: {
      result.type = 'ALARM';
      
      // Extract embedded GPS block
      if (buf.length >= offset + 18) {
        const gps = parseGpsBlock(buf, offset);
        result.location = gps.location;
        offset = gps.nextOffset;
      }

      // Extract alarm code
      const alarmCode = buf[offset + 6] || buf[offset] || 0x01;
      const alarmTypes = {
        0x01: 'SOS_PANIC',
        0x02: 'POWER_CUT_OFF',
        0x03: 'VIBRATION_SHOCK',
        0x04: 'ENTER_GEOFENCE',
        0x05: 'EXIT_GEOFENCE',
        0x06: 'OVERSPEED',
        0x09: 'MOVING_ALERT'
      };

      result.alarm = {
        type: alarmTypes[alarmCode] || 'STATUS_ALERT',
        code: alarmCode
      };

      result.ack = buildAck(protocol, serialNumber);
      break;
    }

    // 0x15 or 0x21: String Information / Command Response Packet
    case 0x15:
    case 0x21: {
      result.type = 'COMMAND_RESPONSE';
      const cmdLen = buf[offset++];
      const serverFlag = buf.readUInt32BE(offset);
      offset += 4;
      const responseStr = buf.subarray(offset, totalLength - 6).toString('ascii').replace(/\0/g, '').trim();
      result.response = responseStr;
      console.log(`[GT06 Protocol] Tracker command response: "${responseStr}"`);
      break;
    }

    default: {
      result.type = 'OTHER';
      break;
    }
  }

  return result;
}

module.exports = {
  calculateCrc16,
  bcdToImei,
  imeiToBcd,
  buildAck,
  buildCommand,
  parsePacket
};
