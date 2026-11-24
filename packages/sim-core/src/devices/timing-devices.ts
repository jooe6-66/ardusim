import { CPU } from 'avr8js';
import type { Servo360VisualState } from '../types.js';

export type SetDigitalPinFn = (high: boolean) => void;

/**
 * HC-SR04 Ultrasonic Distance Sensor.
 * On TRIG pulse >= 8 us (rising -> falling), emits an ECHO HIGH pulse of `distanceCm * 58.2` us.
 */
export class HcSr04Device {
  private trigRiseCycle: number | null = null;
  private lastTrigHigh = false;
  private disposed = false;
  distanceCm = 100;

  constructor(
    private readonly cpu: CPU,
    private readonly clockHz: number,
    private readonly setEchoPin: SetDigitalPinFn
  ) {}

  dispose(): void {
    this.disposed = true;
  }

  onTrigChange(high: boolean): void {
    if (this.disposed) return;
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
        const dist = Number.isFinite(this.distanceCm) ? this.distanceCm : 100;
        const clampedCm = Math.min(400, Math.max(2, dist));
        const echoUs = Math.round(clampedCm * 58.2);
        const startDelayCycles = Math.round((200 * this.clockHz) / 1_000_000);
        const echoCycles = Math.round((echoUs * this.clockHz) / 1_000_000);

        this.cpu.addClockEvent(() => {
          if (this.disposed) return;
          this.setEchoPin(true);
          this.cpu.addClockEvent(() => {
            if (this.disposed) return;
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
  private disposed = false;
  temperatureC = 26.5;
  humidityPct = 62.0;
  model: 'DHT22' | 'DHT11' = 'DHT22';

  constructor(
    private readonly cpu: CPU,
    private readonly clockHz: number,
    private readonly setDataPin: SetDigitalPinFn
  ) {}

  dispose(): void {
    this.disposed = true;
    this.responding = false;
  }

  /** Called whenever MCU pin state changes on the DHT DATA line. */
  onLineChange(drivenLowByMcu: boolean): void {
    if (this.disposed || this.responding) return;
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
    const rawHum = Number.isFinite(this.humidityPct) ? this.humidityPct : 62.0;
    const rawTemp = Number.isFinite(this.temperatureC) ? this.temperatureC : 26.5;
    if (this.model === 'DHT11') {
      const hum = Math.min(100, Math.max(0, Math.round(rawHum)));
      const temp = Math.min(50, Math.max(0, Math.round(rawTemp)));
      const checksum = (hum + temp) & 0xff;
      return [hum, 0, temp, 0, checksum];
    }
    const hum10 = Math.min(1000, Math.max(0, Math.round(rawHum * 10)));
    const neg = rawTemp < 0;
    const temp10 = Math.min(800, Math.round(Math.abs(rawTemp) * 10));
    const b0 = (hum10 >> 8) & 0xff;
    const b1 = hum10 & 0xff;
    const b2 = ((temp10 >> 8) & 0x7f) | (neg ? 0x80 : 0);
    const b3 = temp10 & 0xff;
    const checksum = (b0 + b1 + b2 + b3) & 0xff;
    return [b0, b1, b2, b3, checksum];
  }

  private emitResponseFrame(): void {
    if (this.disposed) return;
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
      if (this.disposed) {
        this.responding = false;
        return;
      }
      if (idx >= events.length) {
        this.responding = false;
        return;
      }
      const ev = events[idx++];
      this.cpu.addClockEvent(() => {
        if (this.disposed) {
          this.responding = false;
          return;
        }
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
 * 360-degree continuous rotation servo decoder.
 * Deadband 1470..1530 us stops cleanly (covers both Servo.write(90)=1472us and writeMicroseconds(1500)).
 */
export class ContinuousServoDevice {
  maxRpm: number;
  angleDeg = 0;
  rpm = 0;
  pulseUs = 0;
  private riseCycle: number | null = null;
  private lastHigh = false;
  private lastUpdateCycle = 0;
  private lastPulseCycle = -1;

  constructor(private readonly cpu: CPU, private readonly clockHz: number, maxRpm = 120) {
    this.maxRpm = Number.isFinite(maxRpm) ? maxRpm : 120;
  }

  private advanceTo(nowCycle: number): void {
    if (this.lastPulseCycle >= 0) {
      const timeoutCycle = this.lastPulseCycle + 0.1 * this.clockHz;
      if (nowCycle > timeoutCycle) {
        const endCycle = Math.max(this.lastUpdateCycle, timeoutCycle);
        const dtSec = Math.max(0, (endCycle - this.lastUpdateCycle) / this.clockHz);
        this.angleDeg += this.rpm * 6 * dtSec;
        this.rpm = 0;
        this.pulseUs = 0;
        this.lastUpdateCycle = nowCycle;
        this.lastPulseCycle = -1;
        return;
      }
    }
    const dtSec = Math.max(0, (nowCycle - this.lastUpdateCycle) / this.clockHz);
    this.angleDeg += this.rpm * 6 * dtSec;
    this.lastUpdateCycle = nowCycle;
  }

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
        this.advanceTo(now);
        let speedNorm = 0;
        if (widthUs < 1470) {
          speedNorm = -Math.min(1, (1470 - widthUs) / 470);
        } else if (widthUs > 1530) {
          speedNorm = Math.min(1, (widthUs - 1530) / 470);
        }
        const safeMaxRpm = Number.isFinite(this.maxRpm) ? Math.max(1, this.maxRpm) : 120;
        this.rpm = speedNorm * safeMaxRpm;
        if (Math.abs(this.rpm) < 0.5) this.rpm = 0;
        this.pulseUs = Math.round(widthUs);
        this.lastPulseCycle = now;
        this.lastUpdateCycle = now;
      }
    }
  }

  getState(): Servo360VisualState {
    this.advanceTo(this.cpu.cycles);
    const roundedRpm = Math.round(this.rpm);
    return {
      angleDeg: Math.round(this.angleDeg * 10) / 10,
      rpm: roundedRpm,
      pulseUs: this.pulseUs,
      direction: roundedRpm > 0 ? 'cw' : roundedRpm < 0 ? 'ccw' : 'stop',
    };
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

  constructor(private readonly cpu: CPU, private readonly clockHz: number) {
    this.windowStartCycle = cpu.cycles;
  }

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
