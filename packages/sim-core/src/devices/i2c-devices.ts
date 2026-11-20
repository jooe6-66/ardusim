import { AVRTWI, TWIEventHandler } from 'avr8js';
import { LcdDisplayState, OledDisplayState } from '../types.js';

export interface I2CDevice {
  readonly address: number;
  connect(write: boolean): boolean;
  writeByte(value: number): boolean;
  readByte(): number;
  stop(): void;
}

/** Routes avr8js hardware TWI (I2C) transactions to attached virtual I2C peripherals. */
export class I2CBusRouter implements TWIEventHandler {
  private devices = new Map<number, I2CDevice>();
  private activeDevice: I2CDevice | null = null;

  constructor(private readonly twi: AVRTWI) {}

  clear(): void {
    this.devices.clear();
    this.activeDevice = null;
  }

  register(device: I2CDevice): void {
    this.devices.set(device.address & 0x7f, device);
  }

  start(): void {
    this.twi.completeStart();
  }

  stop(): void {
    this.activeDevice?.stop();
    this.activeDevice = null;
    this.twi.completeStop();
  }

  connectToSlave(addr: number, write: boolean): void {
    const dev = this.devices.get(addr & 0x7f);
    if (!dev) {
      this.activeDevice = null;
      this.twi.completeConnect(false);
      return;
    }
    this.activeDevice = dev;
    this.twi.completeConnect(dev.connect(write));
  }

  writeByte(value: number): void {
    if (!this.activeDevice) {
      this.twi.completeWrite(false);
      return;
    }
    this.twi.completeWrite(this.activeDevice.writeByte(value));
  }

  readByte(): void {
    if (!this.activeDevice) {
      this.twi.completeRead(0xff);
      return;
    }
    this.twi.completeRead(this.activeDevice.readByte());
  }
}

/**
 * HD44780 16x2 LCD behind a PCF8574 I2C backpack (compatible with LiquidCrystal_I2C).
 * Bit mapping: P0=RS, P1=RW, P2=EN, P3=Backlight, P4..P7=D4..D7.
 */
export class Lcd1602I2C implements I2CDevice {
  readonly address: number;
  private ddram = new Uint8Array(0x80).fill(0x20);
  private addrPtr = 0;
  private inCgram = false;
  private increment = 1;
  private backlight = false;
  private prevEn = false;
  private highNibble: number | null = null;
  private is4Bit = false;

  constructor(address = 0x27) {
    this.address = address;
  }

  connect(): boolean {
    return true;
  }

  stop(): void {}

  readByte(): number {
    return 0xff;
  }

  writeByte(value: number): boolean {
    this.backlight = Boolean(value & 0x08);
    const rs = Boolean(value & 0x01);
    const rw = Boolean(value & 0x02);
    const en = Boolean(value & 0x04);
    const nibble = (value >> 4) & 0x0f;

    if (this.prevEn && !en && !rw) {
      if (!this.is4Bit) {
        if (!rs && nibble === 0x02) {
          this.is4Bit = true;
          this.highNibble = null;
        }
      } else if (this.highNibble === null) {
        this.highNibble = nibble;
      } else {
        const byte = ((this.highNibble << 4) | nibble) & 0xff;
        this.highNibble = null;
        this.processByte(rs, byte);
      }
    }
    this.prevEn = en;
    return true;
  }

  private processByte(rs: boolean, byte: number): void {
    if (!rs) {
      if (byte === 0x01) {
        this.ddram.fill(0x20);
        this.addrPtr = 0;
        this.inCgram = false;
      } else if ((byte & 0xfe) === 0x02) {
        this.addrPtr = 0;
        this.inCgram = false;
      } else if ((byte & 0xfc) === 0x04) {
        this.increment = byte & 0x02 ? 1 : -1;
      } else if ((byte & 0xe0) === 0x20) {
        this.is4Bit = !(byte & 0x10);
      } else if ((byte & 0xc0) === 0x40) {
        this.inCgram = true;
        this.addrPtr = byte & 0x3f;
      } else if ((byte & 0x80) === 0x80) {
        this.inCgram = false;
        this.addrPtr = byte & 0x7f;
      }
      return;
    }

    if (!this.inCgram) {
      this.ddram[this.addrPtr & 0x7f] = byte;
      this.addrPtr = (this.addrPtr + this.increment) & 0x7f;
    } else {
      this.addrPtr = (this.addrPtr + 1) & 0x3f;
    }
  }

  getState(): LcdDisplayState {
    const readRow = (base: number): string => {
      let s = '';
      for (let i = 0; i < 16; i++) {
        const ch = this.ddram[base + i];
        s += ch >= 0x20 && ch <= 0x7e ? String.fromCharCode(ch) : ' ';
      }
      return s;
    };
    return {
      rows: [readRow(0x00), readRow(0x40)],
      backlight: this.backlight,
    };
  }
}

/**
 * SSD1306 128x64 monochrome OLED I2C controller (compatible with Adafruit_SSD1306 & u8g2).
 */
export class OledSsd1306 implements I2CDevice {
  readonly address: number;
  private gddram = new Uint8Array(128 * 8);
  private displayOn = false;
  private inverted = false;
  private mode: 'control' | 'command' | 'data' = 'control';
  private pendingCmd: number | null = null;
  private cmdArgs: number[] = [];
  private expectedArgs = 0;

  private memMode = 2;
  private colStart = 0;
  private colEnd = 127;
  private pageStart = 0;
  private pageEnd = 7;
  private col = 0;
  private page = 0;

  constructor(address = 0x3c) {
    this.address = address;
  }

  connect(): boolean {
    this.mode = 'control';
    return true;
  }

  stop(): void {
    this.mode = 'control';
  }

  readByte(): number {
    return this.displayOn ? 0x00 : 0x40;
  }

  writeByte(value: number): boolean {
    if (this.mode === 'control') {
      this.mode = value & 0x40 ? 'data' : 'command';
      return true;
    }

    if (this.mode === 'data') {
      const idx = (this.page & 7) * 128 + (this.col & 127);
      this.gddram[idx] = value;
      if (this.memMode === 0) {
        this.col++;
        if (this.col > this.colEnd) {
          this.col = this.colStart;
          this.page++;
          if (this.page > this.pageEnd) this.page = this.pageStart;
        }
      } else if (this.memMode === 1) {
        this.page++;
        if (this.page > this.pageEnd) {
          this.page = this.pageStart;
          this.col++;
          if (this.col > this.colEnd) this.col = this.colStart;
        }
      } else {
        this.col = (this.col + 1) & 127;
      }
      return true;
    }

    if (this.pendingCmd !== null) {
      this.cmdArgs.push(value);
      if (this.cmdArgs.length >= this.expectedArgs) {
        this.executeMultiByteCommand(this.pendingCmd, this.cmdArgs);
        this.pendingCmd = null;
        this.cmdArgs = [];
        this.expectedArgs = 0;
      }
      return true;
    }

    this.handleCommand(value);
    return true;
  }

  private handleCommand(cmd: number): void {
    if (cmd === 0xae) this.displayOn = false;
    else if (cmd === 0xaf) this.displayOn = true;
    else if (cmd === 0xa6) this.inverted = false;
    else if (cmd === 0xa7) this.inverted = true;
    else if (cmd >= 0x00 && cmd <= 0x0f) this.col = (this.col & 0xf0) | (cmd & 0x0f);
    else if (cmd >= 0x10 && cmd <= 0x1f) this.col = (this.col & 0x0f) | ((cmd & 0x0f) << 4);
    else if (cmd >= 0xb0 && cmd <= 0xb7) this.page = cmd & 0x07;
    else if (
      cmd === 0x20 ||
      cmd === 0x81 ||
      cmd === 0xa8 ||
      cmd === 0xd3 ||
      cmd === 0xd5 ||
      cmd === 0xd9 ||
      cmd === 0xda ||
      cmd === 0xdb ||
      cmd === 0x8d
    ) {
      this.pendingCmd = cmd;
      this.expectedArgs = 1;
      this.cmdArgs = [];
    } else if (cmd === 0x21 || cmd === 0x22) {
      this.pendingCmd = cmd;
      this.expectedArgs = 2;
      this.cmdArgs = [];
    }
  }

  private executeMultiByteCommand(cmd: number, args: number[]): void {
    if (cmd === 0x20) {
      this.memMode = args[0] & 0x03;
    } else if (cmd === 0x21) {
      this.colStart = args[0] & 0x7f;
      this.colEnd = args[1] & 0x7f;
      this.col = this.colStart;
    } else if (cmd === 0x22) {
      this.pageStart = args[0] & 0x07;
      this.pageEnd = args[1] & 0x07;
      this.page = this.pageStart;
    }
  }

  getState(): OledDisplayState {
    return {
      buffer: Array.from(this.gddram),
      displayOn: this.displayOn,
      inverted: this.inverted,
    };
  }
}

function toBcd(n: number): number {
  const clamped = Math.max(0, Math.min(99, Math.floor(n)));
  return ((Math.floor(clamped / 10) << 4) | (clamped % 10)) & 0xff;
}

function fromBcd(b: number): number {
  return ((b >> 4) & 0x0f) * 10 + (b & 0x0f);
}

/**
 * DS3231 Real-Time Clock over I2C (address 0x68, compatible with Adafruit RTClib).
 */
export class Ds3231Rtc implements I2CDevice {
  readonly address = 0x68;
  private regPtr = 0;
  private firstWrite = true;
  private baseEpochMs: number;
  private offsetSimMs = 0;
  private ctrl = 0x1c;
  private status = 0x00;

  constructor(initialEpochMs = Date.now()) {
    this.baseEpochMs = initialEpochMs;
  }

  setSimElapsedMs(simMs: number): void {
    this.offsetSimMs = simMs;
  }

  connect(write: boolean): boolean {
    if (write) this.firstWrite = true;
    return true;
  }

  stop(): void {
    this.firstWrite = true;
  }

  private currentDate(): Date {
    return new Date(this.baseEpochMs + this.offsetSimMs);
  }

  writeByte(value: number): boolean {
    if (this.firstWrite) {
      this.regPtr = value & 0x1f;
      this.firstWrite = false;
      return true;
    }
    const d = this.currentDate();
    if (this.regPtr === 0x00) d.setSeconds(fromBcd(value & 0x7f));
    else if (this.regPtr === 0x01) d.setMinutes(fromBcd(value & 0x7f));
    else if (this.regPtr === 0x02) d.setHours(fromBcd(value & 0x3f));
    else if (this.regPtr === 0x04) d.setDate(fromBcd(value & 0x3f));
    else if (this.regPtr === 0x05) d.setMonth(Math.max(0, fromBcd(value & 0x1f) - 1));
    else if (this.regPtr === 0x06) d.setFullYear(2000 + fromBcd(value));
    else if (this.regPtr === 0x0e) this.ctrl = value;
    else if (this.regPtr === 0x0f) this.status = value;

    if (this.regPtr <= 0x06) {
      this.baseEpochMs = d.getTime() - this.offsetSimMs;
    }
    this.regPtr = (this.regPtr + 1) & 0x1f;
    return true;
  }

  readByte(): number {
    const d = this.currentDate();
    let val = 0;
    switch (this.regPtr) {
      case 0x00:
        val = toBcd(d.getSeconds());
        break;
      case 0x01:
        val = toBcd(d.getMinutes());
        break;
      case 0x02:
        val = toBcd(d.getHours());
        break;
      case 0x03:
        val = d.getDay() + 1;
        break;
      case 0x04:
        val = toBcd(d.getDate());
        break;
      case 0x05:
        val = toBcd(d.getMonth() + 1);
        break;
      case 0x06:
        val = toBcd(d.getFullYear() % 100);
        break;
      case 0x0e:
        val = this.ctrl;
        break;
      case 0x0f:
        val = this.status;
        break;
      case 0x11:
        val = 26; // 26.25 C die temp
        break;
      case 0x12:
        val = 0x40;
        break;
      default:
        val = 0;
    }
    this.regPtr = (this.regPtr + 1) & 0x1f;
    return val;
  }

  getFormattedTime(): string {
    const d = this.currentDate();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
}

/**
 * MPU6050 6-Axis Accelerometer + Gyroscope over I2C (0x68 or 0x69 when AD0=HIGH).
 */
export class Mpu6050Imu implements I2CDevice {
  readonly address: number;
  private regPtr = 0;
  private firstWrite = true;
  private pwrMgmt1 = 0x40; // sleep at power-on until sketch clears bit 6

  pitchDeg = 0;
  rollDeg = 0;
  tempC = 25;

  constructor(address = 0x68) {
    this.address = address;
  }

  connect(write: boolean): boolean {
    if (write) this.firstWrite = true;
    return true;
  }

  stop(): void {
    this.firstWrite = true;
  }

  writeByte(value: number): boolean {
    if (this.firstWrite) {
      this.regPtr = value & 0xff;
      this.firstWrite = false;
      return true;
    }
    if (this.regPtr === 0x6b) {
      this.pwrMgmt1 = value;
    }
    this.regPtr = (this.regPtr + 1) & 0xff;
    return true;
  }

  private sampleSigned16(): Record<number, number> {
    // 1g = 16384 LSB at default +-2g scale
    const pitchRad = (this.pitchDeg * Math.PI) / 180;
    const rollRad = (this.rollDeg * Math.PI) / 180;
    const ax = Math.round(Math.sin(pitchRad) * 16384);
    const ay = Math.round(Math.sin(rollRad) * Math.cos(pitchRad) * 16384);
    const az = Math.round(Math.cos(pitchRad) * Math.cos(rollRad) * 16384);
    const tempRaw = Math.round((this.tempC - 36.53) * 340);
    return {
      0x3b: (ax >> 8) & 0xff,
      0x3c: ax & 0xff,
      0x3d: (ay >> 8) & 0xff,
      0x3e: ay & 0xff,
      0x3f: (az >> 8) & 0xff,
      0x40: az & 0xff,
      0x41: (tempRaw >> 8) & 0xff,
      0x42: tempRaw & 0xff,
      0x43: 0,
      0x44: 0,
      0x45: 0,
      0x46: 0,
      0x47: 0,
      0x48: 0,
    };
  }

  readByte(): number {
    let val = 0;
    if (this.regPtr === 0x75) {
      val = 0x68; // WHO_AM_I
    } else if (this.regPtr === 0x6b) {
      val = this.pwrMgmt1;
    } else {
      const data = this.sampleSigned16();
      val = data[this.regPtr] ?? 0;
    }
    this.regPtr = (this.regPtr + 1) & 0xff;
    return val;
  }
}
