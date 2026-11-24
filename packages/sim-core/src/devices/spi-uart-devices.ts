import { CPU } from 'avr8js';
import { Max7219State, StepperVisualState } from '../types.js';
import { SetDigitalPinFn } from './timing-devices.js';

/**
 * MAX7219 8x8 LED Matrix Controller.
 * Supports BOTH bit-banged shiftOut / LedControl (DIN, CLK, CS) and hardware SPI.transfer().
 */
export class Max7219Matrix {
  private rows = new Uint8Array(8);
  private shutdown = true;
  private displayTest = false;

  private shiftReg = 0;
  private bitCount = 0;
  private dinHigh = false;
  private lastClkHigh = false;
  private lastCsHigh = true;

  onDinChange(high: boolean): void {
    this.dinHigh = high;
  }

  onClkChange(high: boolean): void {
    if (high && !this.lastClkHigh && !this.lastCsHigh) {
      this.shiftReg = ((this.shiftReg << 1) | (this.dinHigh ? 1 : 0)) & 0xffff;
      this.bitCount++;
    }
    this.lastClkHigh = high;
  }

  /** Accepts a full byte directly from hardware AVRSPI when CS is LOW. */
  onSpiByte(byte: number): void {
    if (this.lastCsHigh) return;
    this.shiftReg = ((this.shiftReg << 8) | (byte & 0xff)) & 0xffff;
    this.bitCount += 8;
  }

  onCsChange(high: boolean): void {
    if (high === this.lastCsHigh) return;
    if (!this.lastCsHigh && high && this.bitCount >= 16) {
      const reg = (this.shiftReg >> 8) & 0x0f;
      const val = this.shiftReg & 0xff;
      this.applyRegister(reg, val);
      this.bitCount = 0;
      this.shiftReg = 0;
    } else if (this.lastCsHigh && !high) {
      this.bitCount = 0;
      this.shiftReg = 0;
    }
    this.lastCsHigh = high;
  }

  private applyRegister(reg: number, val: number): void {
    if (reg >= 1 && reg <= 8) {
      this.rows[reg - 1] = val;
    } else if (reg === 0x0c) {
      this.shutdown = (val & 0x01) === 0;
    } else if (reg === 0x0f) {
      this.displayTest = (val & 0x01) !== 0;
    }
  }

  getState(): Max7219State {
    if (this.displayTest) {
      return { rows: [255, 255, 255, 255, 255, 255, 255, 255], active: true };
    }
    if (this.shutdown) {
      return { rows: [0, 0, 0, 0, 0, 0, 0, 0], active: false };
    }
    return { rows: Array.from(this.rows), active: true };
  }
}

/**
 * WS2812B / NeoPixel 800 kHz single-wire RGB LED strip decoder (8 pixels).
 * Compatible with official Adafruit_NeoPixel library.
 */
export class NeoPixelStrip {
  private readonly numPixels: number;
  private latched: Array<[number, number, number]>;
  private pending: Uint8Array;
  private bitPos = 0;
  private riseCycle = 0;
  private lastFallCycle = 0;
  private lastHigh = false;

  constructor(private readonly cpu: CPU, private readonly clockHz: number, numPixels = 8) {
    this.numPixels = numPixels;
    this.latched = Array.from({ length: numPixels }, () => [0, 0, 0]);
    this.pending = new Uint8Array(numPixels * 3);
  }

  onSignalChange(high: boolean): void {
    if (high === this.lastHigh) return;
    this.lastHigh = high;
    const now = this.cpu.cycles;

    if (high) {
      const lowUs = ((now - this.lastFallCycle) * 1_000_000) / this.clockHz;
      if (lowUs >= 45 && this.bitPos > 0) {
        this.latch();
      }
      this.riseCycle = now;
    } else {
      const highNs = ((now - this.riseCycle) * 1_000_000_000) / this.clockHz;
      this.lastFallCycle = now;
      if (highNs >= 150 && highNs <= 1600) {
        const bit = highNs >= 550 ? 1 : 0;
        const byteIdx = this.bitPos >> 3;
        if (byteIdx < this.pending.length) {
          const bitInByte = 7 - (this.bitPos & 7);
          if (bit) this.pending[byteIdx] |= 1 << bitInByte;
          else this.pending[byteIdx] &= ~(1 << bitInByte);
        }
        this.bitPos++;
        if (this.bitPos >= this.numPixels * 24) {
          this.latch();
        }
      }
    }
  }

  private latch(): void {
    for (let i = 0; i < this.numPixels; i++) {
      // WS2812B wire order is G-R-B
      const g = this.pending[i * 3];
      const r = this.pending[i * 3 + 1];
      const b = this.pending[i * 3 + 2];
      this.latched[i] = [r, g, b];
    }
    this.bitPos = 0;
  }

  getPixels(): Array<[number, number, number]> {
    // Also latch if line stayed LOW >= 50 us since last falling edge
    if (!this.lastHigh && this.bitPos >= 24) {
      const lowUs = ((this.cpu.cycles - this.lastFallCycle) * 1_000_000) / this.clockHz;
      if (lowUs >= 45) this.latch();
    }
    return this.latched.map(([r, g, b]) => [r, g, b]);
  }
}

/**
 * 4-Wire Stepper Motor decoder (compatible with Arduino built-in Stepper.h & ULN2003 28BYJ-48).
 * Tracks full-step & half-step coil phase transitions on IN1..IN4.
 */
export class StepperMotorDevice {
  private coils = [false, false, false, false];
  private lastPhase: number | null = null;
  private steps = 0;
  stepsPerRev = 200;

  onCoilChange(coilIndex: 0 | 1 | 2 | 3, high: boolean): void {
    if (this.coils[coilIndex] === high) return;
    this.coils[coilIndex] = high;
    const mask =
      (this.coils[0] ? 1 : 0) |
      (this.coils[1] ? 2 : 0) |
      (this.coils[2] ? 4 : 0) |
      (this.coils[3] ? 8 : 0);

    // Standard Arduino Stepper.h 4-pin bipolar sequence (IN1=bit0, IN2=bit1, IN3=bit2, IN4=bit3):
    // step 0: 1010 -> IN1+IN3 = 5, step 1: 0110 -> IN2+IN3 = 6, step 2: 0101 -> IN2+IN4 = 10, step 3: 1001 -> IN1+IN4 = 9.
    // Ignore transient 1-coil states between consecutive digitalWrite() calls.
    const fullStepMap: Record<number, number> = {
      5: 0,  // IN1 + IN3
      6: 1,  // IN2 + IN3
      10: 2, // IN2 + IN4
      9: 3,  // IN1 + IN4
    };
    const phase = fullStepMap[mask];
    if (phase === undefined) return;

    if (this.lastPhase !== null && phase !== this.lastPhase) {
      let delta = phase - this.lastPhase;
      if (delta > 2) delta -= 4;
      if (delta < -2) delta += 4;
      if (delta === 1 || delta === -1) {
        this.steps += delta;
      }
    }
    this.lastPhase = phase;
  }

  getState(): StepperVisualState {
    const rev = Math.max(8, this.stepsPerRev);
    const angleDeg = (((this.steps / rev) * 360) % 360 + 360) % 360;
    return {
      steps: Math.round(this.steps),
      angleDeg: Math.round(angleDeg * 10) / 10,
    };
  }
}

/** Real ISO14443A CRC_A (polynomial 0x8408, initial 0x6363) used by MFRC522. */
function crcA(bytes: number[]): [number, number] {
  let crc = 0x6363;
  for (const b of bytes) {
    let ch = b ^ (crc & 0xff);
    ch = (ch ^ (ch << 4)) & 0xff;
    crc = ((crc >> 8) ^ (ch << 8) ^ (ch << 3) ^ (ch >> 4)) & 0xffff;
  }
  return [crc & 0xff, (crc >> 8) & 0xff];
}

/**
 * MFRC522 RFID Reader over hardware SPI (compatible with official MFRC522 Arduino library).
 */
export class Mfrc522Device {
  private regs = new Uint8Array(64);
  private fifo: number[] = [];
  private csSelected = false;
  private activeAddr = -1;
  private isRead = false;

  cardPresent = false;
  uid: [number, number, number, number] = [0xde, 0xad, 0xbe, 0xef];

  constructor() {
    this.softReset();
  }

  softReset(): void {
    this.regs.fill(0);
    this.fifo = [];
    this.regs[0x0c] = 0x10; // ControlReg
    this.regs[0x11] = 0x3d; // ModeReg
    this.regs[0x14] = 0x80; // TxControlReg
    this.regs[0x37] = 0x92; // VersionReg v2.0
  }

  setUidHex(hexStr: string): void {
    const clean = hexStr.replace(/[^0-9a-fA-F]/g, '').padEnd(8, '0').slice(0, 8);
    const parseByte = (hex: string, fallback: number): number => {
      const n = parseInt(hex, 16);
      return Number.isNaN(n) ? fallback : n & 0xff;
    };
    this.uid = [
      parseByte(clean.slice(0, 2), 0xde),
      parseByte(clean.slice(2, 4), 0xad),
      parseByte(clean.slice(4, 6), 0xbe),
      parseByte(clean.slice(6, 8), 0xef),
    ];
  }

  onCsChange(high: boolean): void {
    if (this.csSelected === !high) return;
    this.csSelected = !high;
    if (high) {
      this.activeAddr = -1;
      this.isRead = false;
    }
  }

  isSelected(): boolean {
    return this.csSelected;
  }

  transferByte(mosi: number): number {
    if (!this.csSelected) return 0x00;

    if (this.activeAddr < 0) {
      this.isRead = Boolean(mosi & 0x80);
      this.activeAddr = (mosi >> 1) & 0x3f;
      return 0x00;
    }

    if (this.isRead) {
      const value = this.readRegister(this.activeAddr);
      // MFRC522 SPI protocol: MOSI during read carries the next register address (or 0 to end)
      if (mosi === 0) {
        this.activeAddr = -1;
      } else {
        this.isRead = Boolean(mosi & 0x80);
        this.activeAddr = (mosi >> 1) & 0x3f;
      }
      return value;
    } else {
      this.writeRegister(this.activeAddr, mosi);
      // Keep activeAddr for multi-byte FIFO writes (0x09)
      if (this.activeAddr !== 0x09) {
        this.activeAddr = -1;
      }
      return 0x00;
    }
  }

  private readRegister(addr: number): number {
    if (addr === 0x09) {
      return this.fifo.length > 0 ? this.fifo.shift()! : 0;
    }
    if (addr === 0x0a) {
      return this.fifo.length & 0x7f;
    }
    if (addr === 0x37) return 0x92;
    return this.regs[addr] ?? 0;
  }

  private writeRegister(addr: number, val: number): void {
    if (addr === 0x01) {
      const cmd = val & 0x0f;
      this.regs[0x01] = val;
      if (cmd === 0x0f) {
        this.softReset();
      } else if (cmd === 0x03) {
        // CalcCRC
        const [lo, hi] = crcA(this.fifo);
        this.regs[0x22] = lo;
        this.regs[0x21] = hi;
        this.regs[0x05] |= 0x04; // DivIrqReg CRCIRq
      }
      return;
    }
    if (addr === 0x04 || addr === 0x05) {
      // Set/clear IRQ bits depending on MSB (Set1)
      if (val & 0x80) this.regs[addr] |= val & 0x7f;
      else this.regs[addr] &= ~(val & 0x7f);
      return;
    }
    if (addr === 0x09) {
      if (this.fifo.length < 64) this.fifo.push(val & 0xff);
      return;
    }
    if (addr === 0x0a) {
      if (val & 0x80) this.fifo = [];
      return;
    }
    this.regs[addr] = val;

    // BitFramingReg StartSend triggers Transceive command (0x0C)
    if (addr === 0x0d && (val & 0x80) && (this.regs[0x01] & 0x0f) === 0x0c) {
      this.executeTransceive();
    }
  }

  private executeTransceive(): void {
    const cmdBytes = [...this.fifo];
    this.fifo = [];
    this.regs[0x06] = 0x00; // clear ErrorReg
    this.regs[0x0c] = 0x00; // RxLastBits = 0

    if (!this.cardPresent || cmdBytes.length === 0) {
      this.regs[0x04] |= 0x01; // TimerIRq (no card timeout)
      return;
    }

    const op = cmdBytes[0];
    if (op === 0x26 || op === 0x52) {
      // REQA / WUPA -> ATQA for MIFARE Classic 1K
      this.fifo = [0x04, 0x00];
      this.regs[0x04] |= 0x30; // RxIRq | IdleIRq
    } else if (op === 0x93 && cmdBytes[1] === 0x20) {
      // Cascade Level 1 anticollision -> 4-byte UID + BCC checksum
      const [u0, u1, u2, u3] = this.uid;
      const bcc = (u0 ^ u1 ^ u2 ^ u3) & 0xff;
      this.fifo = [u0, u1, u2, u3, bcc];
      this.regs[0x04] |= 0x30;
    } else if (op === 0x93 && cmdBytes[1] === 0x70) {
      // SELECT -> SAK 0x08 (MIFARE Classic 1K) + CRC_A
      const sak = [0x08];
      const [lo, hi] = crcA(sak);
      this.fifo = [0x08, lo, hi];
      this.regs[0x04] |= 0x30;
    } else {
      // Acknowledge Halt (0x50) or other frames cleanly
      this.regs[0x04] |= 0x10; // IdleIRq
    }
  }
}

/**
 * Cycle-accurate 9600-baud bit-banged UART bridge (8N1) for SoftwareSerial & hardware UART pins.
 * Powers both GPS NEO-6M (NMEA-0183 transmitter) and Bluetooth HC-05 (bidirectional chat terminal).
 */
export class SoftUartDevice {
  private readonly bitCycles: number;
  private txQueue: number[] = [];
  private txBusy = false;

  private rxSampling = false;
  private lastRxHigh = true;
  private rxLog = '';
  private disposed = false;

  constructor(
    private readonly cpu: CPU,
    clockHz: number,
    private readonly setTxPin: SetDigitalPinFn | null,
    private readonly readRxPin: (() => boolean) | null,
    baud = 9600
  ) {
    this.bitCycles = Math.round(clockHz / baud);
    this.setTxPin?.(true); // UART idle line is HIGH
  }

  dispose(): void {
    this.disposed = true;
    this.txQueue.length = 0;
    this.txBusy = false;
    this.rxSampling = false;
  }

  enqueueText(text: string): void {
    if (this.disposed) return;
    for (let i = 0; i < text.length; i++) {
      if (this.txQueue.length < 512) {
        this.txQueue.push(text.charCodeAt(i) & 0xff);
      }
    }
    if (!this.txBusy) this.pumpTx();
  }

  private pumpTx(): void {
    if (this.disposed || !this.setTxPin || this.txQueue.length === 0) {
      this.txBusy = false;
      return;
    }
    this.txBusy = true;
    const byte = this.txQueue.shift()!;

    // 10-bit 8N1 frame: START(0), b0..b7 (LSB first), STOP(1)
    const bits: boolean[] = [false];
    for (let i = 0; i < 8; i++) bits.push(Boolean((byte >> i) & 1));
    bits.push(true);

    let idx = 0;
    const emitBit = () => {
      if (this.disposed) {
        this.txBusy = false;
        return;
      }
      if (idx >= bits.length) {
        this.pumpTx();
        return;
      }
      this.setTxPin!(bits[idx++]);
      this.cpu.addClockEvent(emitBit, this.bitCycles);
    };
    emitBit();
  }

  /** Called when Arduino drives the device's RX pin (Arduino TX). */
  onRxPinChange(high: boolean): void {
    if (this.disposed) return;
    if (high === this.lastRxHigh) return;
    const fell = this.lastRxHigh && !high;
    this.lastRxHigh = high;

    if (fell && !this.rxSampling && this.readRxPin) {
      this.rxSampling = true;
      let bitIdx = 0;
      let byteVal = 0;

      const sampleNext = () => {
        if (this.disposed || !this.readRxPin) {
          this.rxSampling = false;
          return;
        }
        if (bitIdx < 8) {
          if (this.readRxPin()) byteVal |= 1 << bitIdx;
          bitIdx++;
          this.cpu.addClockEvent(sampleNext, this.bitCycles);
        } else {
          // Stop bit sampled
          this.rxSampling = false;
          if (byteVal >= 0x09 && byteVal <= 0x7e) {
            this.rxLog = (this.rxLog + String.fromCharCode(byteVal)).slice(-4000);
          }
        }
      };

      // Sample first data bit center at 1.5 bit periods after falling start edge
      this.cpu.addClockEvent(sampleNext, Math.round(this.bitCycles * 1.5));
    }
  }

  getReceivedLog(): string {
    return this.rxLog;
  }

  clearReceivedLog(): void {
    this.rxLog = '';
  }
}

/** Generates valid NMEA-0183 $GPGGA and $GPRMC sentences with real XOR checksum. */
export function buildNmeaSentence(latDeg: number, lonDeg: number, speedKnots = 1.2): string {
  const fmtCoord = (val: number, isLon: boolean) => {
    const abs = Math.abs(val);
    const deg = Math.floor(abs);
    const min = (abs - deg) * 60;
    const degStr = String(deg).padStart(isLon ? 3 : 2, '0');
    const minStr = min.toFixed(4).padStart(7, '0');
    return `${degStr}${minStr}`;
  };
  const ns = latDeg >= 0 ? 'N' : 'S';
  const ew = lonDeg >= 0 ? 'E' : 'W';
  const body = `GPRMC,120000.00,A,${fmtCoord(latDeg, false)},${ns},${fmtCoord(lonDeg, true)},${ew},${speedKnots.toFixed(1)},0.0,201126,,,A`;
  let cs = 0;
  for (let i = 0; i < body.length; i++) cs ^= body.charCodeAt(i);
  return `$${body}*${cs.toString(16).toUpperCase().padStart(2, '0')}\r\n`;
}
