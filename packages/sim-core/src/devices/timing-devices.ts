import { CPU } from 'avr8js';

export type SetDigitalPinFn = (high: boolean) => void;

/**
 * HC-SR04 Ultrasonic Distance Sensor.
 * On TRIG pulse >= 8 us (rising -> falling), emits an ECHO HIGH pulse of `distanceCm * 58.2` us.
 */
export class HcSr04Device {
  private trigRiseCycle: number | null = null;
  private lastTrigHigh = false;
  distanceCm = 100;

  constructor(
    private readonly cpu: CPU,
    private readonly clockHz: number,
    private readonly setEchoPin: SetDigitalPinFn
  ) {}

  onTrigChange(high: boolean): void {
    if (high === this.lastTrigHigh) return;
    this.lastTrigHigh = high;
    const now = this.cpu.cycles;

    if (high) {
      this.trigRiseCycle = now;
      return;
    }

    if (this.trigRiseCycle !== null) {
      const pulseUs = ((now - this.trigRiseCycle) * 1_000_000) / this.clockHz;
      this.trigRiseCycle = null;
      if (pulseUs >= 5) {
        const clampedCm = Math.min(400, Math.max(2, this.distanceCm));
        const echoUs = Math.round(clampedCm * 58.2);
        const startDelayCycles = Math.round((200 * this.clockHz) / 1_000_000);
        const echoCycles = Math.round((echoUs * this.clockHz) / 1_000_000);

        this.cpu.addClockEvent(() => {
          this.setEchoPin(true);
          this.cpu.addClockEvent(() => {
            this.setEchoPin(false);
          }, echoCycles);
        }, startDelayCycles);
      }
    }
  }
}

/**
 * DHT11 / DHT22 single-wire temperature & humidity sensor.
 * Compatible with official Adafruit `DHT.h` library.
 */
export class DhtDevice {
  private lowStartCycle: number | null = null;
  private responding = false;
  temperatureC = 26.5;
  humidityPct = 62.0;
  model: 'DHT22' | 'DHT11' = 'DHT22';

  constructor(
    private readonly cpu: CPU,
    private readonly clockHz: number,
    private readonly setDataPin: SetDigitalPinFn
  ) {}

  /** Called whenever MCU pin state changes on the DHT DATA line. */
  onLineChange(drivenLowByMcu: boolean): void {
    if (this.responding) return;
    const now = this.cpu.cycles;

    if (drivenLowByMcu) {
      if (this.lowStartCycle === null) this.lowStartCycle = now;
      return;
    }

    if (this.lowStartCycle !== null) {
      const lowUs = ((now - this.lowStartCycle) * 1_000_000) / this.clockHz;
      this.lowStartCycle = null;
      const minStartUs = this.model === 'DHT11' ? 12_000 : 600;
      if (lowUs >= minStartUs) {
        this.emitResponseFrame();
      }
    }
  }

  private buildBytes(): [number, number, number, number, number] {
    if (this.model === 'DHT11') {
      const hum = Math.min(100, Math.max(0, Math.round(this.humidityPct)));
      const temp = Math.min(50, Math.max(0, Math.round(this.temperatureC)));
      const checksum = (hum + temp) & 0xff;
      return [hum, 0, temp, 0, checksum];
    }
    const hum10 = Math.min(1000, Math.max(0, Math.round(this.humidityPct * 10)));
    const neg = this.temperatureC < 0;
    const temp10 = Math.min(800, Math.round(Math.abs(this.temperatureC) * 10));
    const b0 = (hum10 >> 8) & 0xff;
    const b1 = hum10 & 0xff;
    const b2 = ((temp10 >> 8) & 0x7f) | (neg ? 0x80 : 0);
    const b3 = temp10 & 0xff;
    const checksum = (b0 + b1 + b2 + b3) & 0xff;
    return [b0, b1, b2, b3, checksum];
  }

  private emitResponseFrame(): void {
    this.responding = true;
    const usToCycles = (us: number) => Math.max(1, Math.round((us * this.clockHz) / 1_000_000));
    const bytes = this.buildBytes();

    // Schedule exact bit-level waveform transitions sequentially
    const events: Array<{ delayUs: number; high: boolean }> = [
      { delayUs: 30, high: false }, // 80us LOW response start
      { delayUs: 80, high: true }, // 80us HIGH response
      { delayUs: 80, high: false }, // start of bit 0 (50us LOW)
    ];

    for (let byteIdx = 0; byteIdx < 5; byteIdx++) {
      const val = bytes[byteIdx];
      for (let bit = 7; bit >= 0; bit--) {
        const isOne = Boolean(val & (1 << bit));
        events.push({ delayUs: 50, high: true });
        events.push({ delayUs: isOne ? 70 : 26, high: false });
      }
    }
    // Release line HIGH after final 50us LOW
    events.push({ delayUs: 50, high: true });

    let idx = 0;
    const scheduleNext = () => {
      if (idx >= events.length) {
        this.responding = false;
        return;
      }
      const ev = events[idx++];
      this.cpu.addClockEvent(() => {
        this.setDataPin(ev.high);
        scheduleNext();
      }, usToCycles(ev.delayUs));
    };

    this.setDataPin(true);
    scheduleNext();
  }
}

/**
 * Servo SG90 pulse-width decoder.
 * Maps Arduino Servo.h default pulses (544..2400 us) cleanly to 0..180 degrees.
 */
export class ServoDevice {
  private riseCycle: number | null = null;
  private lastHigh = false;
  angleDeg = 90;

  constructor(private readonly cpu: CPU, private readonly clockHz: number) {}

  onSignalChange(high: boolean): void {
    if (high === this.lastHigh) return;
    this.lastHigh = high;
    const now = this.cpu.cycles;

    if (high) {
      this.riseCycle = now;
      return;
    }
    if (this.riseCycle !== null) {
      const widthUs = ((now - this.riseCycle) * 1_000_000) / this.clockHz;
      this.riseCycle = null;
      if (widthUs >= 400 && widthUs <= 2600) {
        const norm = (widthUs - 544) / (2400 - 544);
        this.angleDeg = Math.round(Math.min(180, Math.max(0, norm * 180)));
      }
    }
  }
}

/**
 * Piezo / Buzzer frequency detector measuring pin edges (supports tone() & bit-banged audio).
 */
export class BuzzerDevice {
  private lastHigh = false;
  private risingEdges = 0;
  private windowStartCycle = 0;
  frequencyHz = 0;

  constructor(private readonly cpu: CPU, private readonly clockHz: number) {}

  onSignalChange(high: boolean): void {
    if (high === this.lastHigh) return;
    this.lastHigh = high;
    if (high) this.risingEdges++;
  }

  sampleAndReset(): number {
    const now = this.cpu.cycles;
    const dtSec = (now - this.windowStartCycle) / this.clockHz;
    if (dtSec >= 0.01) {
      this.frequencyHz = this.risingEdges >= 1 ? Math.round(this.risingEdges / dtSec) : 0;
      this.risingEdges = 0;
      this.windowStartCycle = now;
    }
    return this.frequencyHz;
  }
}
