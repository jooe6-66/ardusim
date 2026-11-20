/**
 * Parses an Intel HEX string into a 16-bit word program memory buffer suitable for avr8js.
 * Verifies record length and two's-complement checksum on every record.
 */
export function parseIntelHex(hex: string, flashBytes = 32768): Uint16Array {
  const bytes = new Uint8Array(flashBytes);
  bytes.fill(0xff);

  let upperAddress = 0;
  let sawEof = false;
  const lines = hex.split(/\r?\n/);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const raw = lines[lineIndex].trim();
    if (!raw) continue;
    if (!raw.startsWith(':')) {
      throw new Error(`Invalid Intel HEX record at line ${lineIndex + 1}: missing ':' prefix`);
    }

    const body = raw.slice(1);
    if (body.length < 10 || body.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(body)) {
      throw new Error(`Invalid Intel HEX syntax at line ${lineIndex + 1}`);
    }

    const byteCount = parseInt(body.slice(0, 2), 16);
    const addr = parseInt(body.slice(2, 6), 16);
    const recordType = parseInt(body.slice(6, 8), 16);
    const expectedHexLen = 8 + byteCount * 2 + 2;
    if (body.length !== expectedHexLen) {
      throw new Error(
        `Invalid Intel HEX length at line ${lineIndex + 1}: expected ${expectedHexLen} chars, got ${body.length}`
      );
    }

    let sum = 0;
    for (let i = 0; i < body.length; i += 2) {
      sum = (sum + parseInt(body.slice(i, i + 2), 16)) & 0xff;
    }
    if (sum !== 0) {
      throw new Error(`Intel HEX checksum mismatch at line ${lineIndex + 1}`);
    }

    if (recordType === 0x00) {
      for (let i = 0; i < byteCount; i++) {
        const value = parseInt(body.slice(8 + i * 2, 10 + i * 2), 16);
        const fullAddr = upperAddress + addr + i;
        if (fullAddr >= 0 && fullAddr < bytes.length) {
          bytes[fullAddr] = value;
        }
      }
    } else if (recordType === 0x01) {
      sawEof = true;
      break;
    } else if (recordType === 0x02) {
      // Extended segment address (shifted left 4 bits)
      const seg = parseInt(body.slice(8, 12), 16);
      upperAddress = seg << 4;
    } else if (recordType === 0x04) {
      // Extended linear address (upper 16 bits)
      const lin = parseInt(body.slice(8, 12), 16);
      upperAddress = lin << 16;
    }
  }

  if (!sawEof) {
    throw new Error('Invalid Intel HEX: missing EOF (:00000001FF) record');
  }

  // Convert little-endian AVR byte array into Uint16Array instruction words
  const words = new Uint16Array(bytes.length / 2);
  for (let i = 0; i < words.length; i++) {
    words[i] = bytes[i * 2] | (bytes[i * 2 + 1] << 8);
  }
  return words;
}
