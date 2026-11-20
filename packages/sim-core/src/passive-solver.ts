import {
  CapacitanceUnit,
  DiodeModel,
  LedColor,
  LedVisualState,
  McuPinState,
  MotorVisualState,
  NetlistResult,
  PartInstance,
  PartManifest,
  ResistanceUnit,
  RgbLedVisualState,
  SimWarning,
} from './types.js';

export const LED_FORWARD_VOLTAGE: Record<LedColor, number> = {
  red: 1.9,
  yellow: 2.0,
  green: 2.2,
  blue: 3.0,
  white: 3.1,
};

export function resistanceToOhms(value: number, unit: ResistanceUnit): number {
  const safe = Number.isFinite(value) && value > 0 ? value : 220;
  switch (unit) {
    case 'kohm':
      return safe * 1e3;
    case 'mohm':
      return safe * 1e6;
    default:
      return safe;
  }
}

export function capacitanceToFarads(value: number, unit: CapacitanceUnit): number {
  const safe = Number.isFinite(value) && value > 0 ? value : 100;
  switch (unit) {
    case 'pf':
      return safe * 1e-12;
    case 'nf':
      return safe * 1e-9;
    case 'uf':
      return safe * 1e-6;
    case 'mf':
      return safe * 1e-3;
    default:
      return safe * 1e-6;
  }
}

export function getDiodeForwardVoltage(model: DiodeModel, customVf?: number): number {
  switch (model) {
    case '1N5819':
      return 0.3;
    case '1N4007':
      return 0.7;
    case 'zener':
      return 0.7;
    case 'custom':
      return typeof customVf === 'number' && customVf > 0 ? customVf : 0.7;
    default:
      return 0.7;
  }
}

/** Realistic CdS LDR resistance curve: 10 lux (~80k ohm) -> 1000 lux (~500 ohm). */
export function ldrLuxToOhms(lux: number): number {
  const clamped = Math.min(1000, Math.max(1, Number.isFinite(lux) ? lux : 250));
  return Math.round(500_000 / Math.pow(clamped, 0.95));
}

export interface PassiveSolveOutput {
  netVoltages: Map<string, number>;
  ledStates: Record<string, LedVisualState>;
  rgbLedStates: Record<string, RgbLedVisualState>;
  sevenSegStates: Record<string, Record<string, number>>;
  capacitorVoltages: Record<string, number>;
  diodeConducting: Record<string, boolean>;
  relayEnergized: Record<string, boolean>;
  motorStates: Record<string, MotorVisualState>;
  warnings: SimWarning[];
}

interface ActiveComponentEdge {
  a: number;
  b: number;
}

interface ResistorBranch extends ActiveComponentEdge {
  ohms: number;
}

interface DiodeBranch extends ActiveComponentEdge {
  partId: string;
  kind: 'led' | 'diode' | 'rgb' | 'seg';
  channel?: string;
  vf: number;
  rOn: number;
  zenerVz?: number;
}

interface CapacitorBranch extends ActiveComponentEdge {
  partId: string;
  farads: number;
  polarized: boolean;
}

/**
 * Dense Gaussian elimination with partial pivoting for small circuit nodal matrices (N <= 80).
 * ponytail: dense O(N^3) solver is exact and <25us for Arduino breadboard sizes (<70 active nets);
 * upgrade to sparse LU if circuits ever exceed ~200 active electrical nets.
 */
function solveLinearSystem(A: Float64Array[], b: Float64Array): Float64Array {
  const n = b.length;
  const x = new Float64Array(n);
  if (n === 0) return x;

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxAbs = Math.abs(A[col][col]);
    for (let row = col + 1; row < n; row++) {
      const v = Math.abs(A[row][col]);
      if (v > maxAbs) {
        maxAbs = v;
        pivotRow = row;
      }
    }
    if (pivotRow !== col) {
      const tmpRow = A[col];
      A[col] = A[pivotRow];
      A[pivotRow] = tmpRow;
      const tmpB = b[col];
      b[col] = b[pivotRow];
      b[pivotRow] = tmpB;
    }
    const diag = A[col][col];
    if (Math.abs(diag) < 1e-15) continue;

    for (let row = col + 1; row < n; row++) {
      const factor = A[row][col] / diag;
      if (factor === 0) continue;
      for (let k = col; k < n; k++) {
        A[row][k] -= factor * A[col][k];
      }
      b[row] -= factor * b[col];
    }
  }

  for (let row = n - 1; row >= 0; row--) {
    let sum = b[row];
    for (let col = row + 1; col < n; col++) {
      sum -= A[row][col] * x[col];
    }
    const diag = A[row][row];
    x[row] = Math.abs(diag) < 1e-15 ? 0 : sum / diag;
  }

  return x;
}

const SEVEN_SEG_PINS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'];

export class PassiveCircuitSolver {
  private capState = new Map<string, number>();

  reset(): void {
    this.capState.clear();
  }

  solve(
    parts: PartInstance[],
    manifests: Map<string, PartManifest>,
    netlist: NetlistResult,
    mcuPins: McuPinState[],
    dtSeconds: number,
    commitState = true
  ): PassiveSolveOutput {
    const dt = Math.max(dtSeconds, 1e-6);

    const activeNetList: string[] = [];
    const netIndex = new Map<string, number>();
    const touchNet = (netId: string | undefined): number => {
      if (!netId) return -1;
      let idx = netIndex.get(netId);
      if (idx === undefined) {
        idx = activeNetList.length;
        activeNetList.push(netId);
        netIndex.set(netId, idx);
      }
      return idx;
    };

    const voltageSources: Array<{ node: number; volts: number; g: number }> = [];
    const resistors: ResistorBranch[] = [];
    const diodes: DiodeBranch[] = [];
    const capacitors: CapacitorBranch[] = [];
    const motors: Array<{ partId: string; pos: number; neg: number }> = [];
    const relays: Array<{ partId: string; vcc: number; gnd: number; inp: number; activeLow: boolean }> = [];

    // 1. Board fixed voltage rails (5V, 3.3V, GND)
    for (const part of parts) {
      const manifest = manifests.get(part.type);
      if (!manifest) continue;
      for (const pin of manifest.pins) {
        if (pin.fixedVoltage !== undefined) {
          const net = netlist.pinToNet.get(`${part.id}:${pin.id}`);
          const idx = touchNet(net);
          if (idx >= 0) {
            voltageSources.push({
              node: idx,
              volts: pin.fixedVoltage,
              g: pin.fixedVoltage === 0 ? 100 : 20,
            });
          }
        }
      }
    }

    // 2. MCU GPIO pin states
    for (const mp of mcuPins) {
      const net = netlist.pinToNet.get(mp.pinKey);
      const idx = touchNet(net);
      if (idx < 0) continue;
      if (mp.mode === 'OUTPUT_HIGH' || mp.mode === 'OUTPUT_LOW') {
        voltageSources.push({
          node: idx,
          volts: mp.outputVoltage,
          g: 1 / 25,
        });
      } else if (mp.mode === 'INPUT_PULLUP') {
        voltageSources.push({
          node: idx,
          volts: 5.0,
          g: 1 / 35000,
        });
      }
    }

    // 3. Passive, analog sensor, display & actuator branches
    for (const part of parts) {
      if (part.type === 'resistor') {
        const a = touchNet(netlist.pinToNet.get(`${part.id}:1`));
        const b = touchNet(netlist.pinToNet.get(`${part.id}:2`));
        if (a >= 0 && b >= 0 && a !== b) {
          const ohms = resistanceToOhms(
            Number(part.props.value ?? 220),
            (part.props.unit as ResistanceUnit) ?? 'ohm'
          );
          resistors.push({ a, b, ohms });
        }
      } else if (part.type === 'ldr') {
        const a = touchNet(netlist.pinToNet.get(`${part.id}:1`));
        const b = touchNet(netlist.pinToNet.get(`${part.id}:2`));
        if (a >= 0 && b >= 0 && a !== b) {
          resistors.push({ a, b, ohms: ldrLuxToOhms(Number(part.props.lux ?? 300)) });
        }
      } else if (part.type === 'potentiometer') {
        const vcc = touchNet(netlist.pinToNet.get(`${part.id}:VCC`));
        const sig = touchNet(netlist.pinToNet.get(`${part.id}:SIG`));
        const gnd = touchNet(netlist.pinToNet.get(`${part.id}:GND`));
        const totalOhms = resistanceToOhms(
          Number(part.props.value ?? 10),
          (part.props.unit as ResistanceUnit) ?? 'kohm'
        );
        const pos = Math.min(1, Math.max(0, Number(part.props.position ?? 0.5)));
        const rToGnd = Math.max(1, totalOhms * pos);
        const rToVcc = Math.max(1, totalOhms * (1 - pos));
        if (vcc >= 0 && sig >= 0 && vcc !== sig) resistors.push({ a: vcc, b: sig, ohms: rToVcc });
        if (gnd >= 0 && sig >= 0 && gnd !== sig) resistors.push({ a: sig, b: gnd, ohms: rToGnd });
      } else if (part.type === 'lm35') {
        const out = touchNet(netlist.pinToNet.get(`${part.id}:OUT`));
        if (out >= 0) {
          const tempC = Math.min(150, Math.max(0, Number(part.props.tempC ?? 25)));
          voltageSources.push({ node: out, volts: tempC * 0.01, g: 1 / 100 });
        }
      } else if (part.type === 'mq2') {
        const aout = touchNet(netlist.pinToNet.get(`${part.id}:AOUT`));
        const dout = touchNet(netlist.pinToNet.get(`${part.id}:DOUT`));
        const gasPct = Math.min(100, Math.max(0, Number(part.props.gasPct ?? 15)));
        const thresholdPct = Math.min(100, Math.max(5, Number(part.props.thresholdPct ?? 50)));
        if (aout >= 0) {
          voltageSources.push({ node: aout, volts: 0.4 + (gasPct / 100) * 4.2, g: 1 / 200 });
        }
        if (dout >= 0) {
          // MQ-2 DOUT is typically active-LOW when gas exceeds threshold
          voltageSources.push({
            node: dout,
            volts: gasPct >= thresholdPct ? 0.0 : 5.0,
            g: 1 / 100,
          });
        }
      } else if (part.type === 'pir') {
        const out = touchNet(netlist.pinToNet.get(`${part.id}:OUT`));
        if (out >= 0) {
          const motion = Boolean(part.props.motion);
          voltageSources.push({ node: out, volts: motion ? 5.0 : 0.0, g: 1 / 100 });
        }
      } else if (part.type === 'led') {
        const a = touchNet(netlist.pinToNet.get(`${part.id}:A`));
        const c = touchNet(netlist.pinToNet.get(`${part.id}:C`));
        if (a >= 0 && c >= 0) {
          const color = (part.props.color as LedColor) ?? 'red';
          const vf = LED_FORWARD_VOLTAGE[color] ?? 2.0;
          diodes.push({ partId: part.id, kind: 'led', a, b: c, vf, rOn: 15 });
        }
      } else if (part.type === 'rgb-led') {
        const com = touchNet(netlist.pinToNet.get(`${part.id}:COM`));
        const commonAnode = part.props.common === 'anode';
        const channels: Array<{ pin: string; ch: 'r' | 'g' | 'b'; vf: number }> = [
          { pin: 'R', ch: 'r', vf: 1.9 },
          { pin: 'G', ch: 'g', vf: 2.2 },
          { pin: 'B', ch: 'b', vf: 3.0 },
        ];
        for (const item of channels) {
          const p = touchNet(netlist.pinToNet.get(`${part.id}:${item.pin}`));
          if (p >= 0 && com >= 0) {
            diodes.push({
              partId: part.id,
              kind: 'rgb',
              channel: item.ch,
              a: commonAnode ? com : p,
              b: commonAnode ? p : com,
              vf: item.vf,
              rOn: 20,
            });
          }
        }
      } else if (part.type === 'seven-seg') {
        const com = touchNet(netlist.pinToNet.get(`${part.id}:COM`));
        const commonAnode = part.props.common === 'anode';
        for (const seg of SEVEN_SEG_PINS) {
          const p = touchNet(netlist.pinToNet.get(`${part.id}:${seg}`));
          if (p >= 0 && com >= 0) {
            diodes.push({
              partId: part.id,
              kind: 'seg',
              channel: seg,
              a: commonAnode ? com : p,
              b: commonAnode ? p : com,
              vf: 1.9,
              rOn: 25,
            });
          }
        }
      } else if (part.type === 'diode') {
        const a = touchNet(netlist.pinToNet.get(`${part.id}:A`));
        const c = touchNet(netlist.pinToNet.get(`${part.id}:C`));
        if (a >= 0 && c >= 0) {
          const model = (part.props.model as DiodeModel) ?? '1N4007';
          const vf = getDiodeForwardVoltage(model, Number(part.props.vf));
          const zenerVz =
            model === 'zener' ? Math.max(0.5, Number(part.props.zenerVz ?? 3.3)) : undefined;
          diodes.push({ partId: part.id, kind: 'diode', a, b: c, vf, rOn: 5, zenerVz });
        }
      } else if (part.type === 'capacitor') {
        const a = touchNet(netlist.pinToNet.get(`${part.id}:1`));
        const b = touchNet(netlist.pinToNet.get(`${part.id}:2`));
        if (a >= 0 && b >= 0) {
          const farads = capacitanceToFarads(
            Number(part.props.value ?? 100),
            (part.props.unit as CapacitanceUnit) ?? 'uf'
          );
          capacitors.push({
            partId: part.id,
            a,
            b,
            farads,
            polarized: part.props.kind === 'electrolytic',
          });
        }
      } else if (part.type === 'dc-motor') {
        const pos = touchNet(netlist.pinToNet.get(`${part.id}:+`));
        const neg = touchNet(netlist.pinToNet.get(`${part.id}:-`));
        if (pos >= 0 && neg >= 0) {
          if (pos !== neg) resistors.push({ a: pos, b: neg, ohms: 25 });
          motors.push({ partId: part.id, pos, neg });
        }
      } else if (part.type === 'relay') {
        const vcc = touchNet(netlist.pinToNet.get(`${part.id}:VCC`));
        const gnd = touchNet(netlist.pinToNet.get(`${part.id}:GND`));
        const inp = touchNet(netlist.pinToNet.get(`${part.id}:IN`));
        relays.push({
          partId: part.id,
          vcc,
          gnd,
          inp,
          activeLow: Boolean(part.props.activeLow),
        });
      }
    }

    const n = activeNetList.length;
    const diodeMode = new Int8Array(diodes.length);
    let nodeV: Float64Array<ArrayBufferLike> = new Float64Array(n);

    const stampResistor = (A: Float64Array[], i: number, j: number, g: number) => {
      A[i][i] += g;
      A[j][j] += g;
      A[i][j] -= g;
      A[j][i] -= g;
    };

    for (let iter = 0; iter < 6; iter++) {
      const A: Float64Array[] = Array.from({ length: n }, () => new Float64Array(n));
      const rhs = new Float64Array(n);

      for (let i = 0; i < n; i++) {
        A[i][i] += 1e-9;
      }

      for (const vs of voltageSources) {
        A[vs.node][vs.node] += vs.g;
        rhs[vs.node] += vs.g * vs.volts;
      }

      for (const r of resistors) {
        stampResistor(A, r.a, r.b, 1 / Math.max(0.1, r.ohms));
      }

      for (const cap of capacitors) {
        if (cap.a === cap.b) continue;
        const gCap = cap.farads / dt;
        const vPrev = this.capState.get(cap.partId) ?? 0;
        stampResistor(A, cap.a, cap.b, gCap);
        rhs[cap.a] += gCap * vPrev;
        rhs[cap.b] -= gCap * vPrev;
      }

      for (let dIdx = 0; dIdx < diodes.length; dIdx++) {
        const d = diodes[dIdx];
        if (d.a === d.b) continue;
        const mode = diodeMode[dIdx];
        if (mode === 1) {
          const gOn = 1 / d.rOn;
          stampResistor(A, d.a, d.b, gOn);
          rhs[d.a] += gOn * d.vf;
          rhs[d.b] -= gOn * d.vf;
        } else if (mode === -1 && d.zenerVz !== undefined) {
          const gZ = 1 / 10;
          stampResistor(A, d.a, d.b, gZ);
          rhs[d.a] -= gZ * d.zenerVz;
          rhs[d.b] += gZ * d.zenerVz;
        } else {
          stampResistor(A, d.a, d.b, 1e-8);
        }
      }

      nodeV = solveLinearSystem(A, rhs);

      let changed = false;
      for (let dIdx = 0; dIdx < diodes.length; dIdx++) {
        const d = diodes[dIdx];
        const vDiff = nodeV[d.a] - nodeV[d.b];
        let nextMode = 0;
        if (vDiff > d.vf + 1e-3) {
          nextMode = 1;
        } else if (d.zenerVz !== undefined && -vDiff > d.zenerVz + 1e-3) {
          nextMode = -1;
        }
        if (nextMode !== diodeMode[dIdx]) {
          diodeMode[dIdx] = nextMode;
          changed = true;
        }
      }
      if (!changed) break;
    }

    const netVoltages = new Map<string, number>();
    for (let i = 0; i < n; i++) {
      netVoltages.set(activeNetList[i], Math.round(nodeV[i] * 1000) / 1000);
    }

    const ledStates: Record<string, LedVisualState> = {};
    const rgbLedStates: Record<string, RgbLedVisualState> = {};
    const sevenSegStates: Record<string, Record<string, number>> = {};
    const diodeConducting: Record<string, boolean> = {};
    const capacitorVoltages: Record<string, number> = {};
    const relayEnergized: Record<string, boolean> = {};
    const motorStates: Record<string, MotorVisualState> = {};
    const warnings: SimWarning[] = [];

    for (let dIdx = 0; dIdx < diodes.length; dIdx++) {
      const d = diodes[dIdx];
      const vDiff = nodeV[d.a] - nodeV[d.b];
      const currentMa =
        diodeMode[dIdx] === 1 ? Math.max(0, ((vDiff - d.vf) / d.rOn) * 1000) : 0;

      if (d.kind === 'led') {
        const brightness = Math.min(1, currentMa / 15);
        const overcurrent = currentMa > 30;
        ledStates[d.partId] = {
          brightness: Math.round(brightness * 100) / 100,
          currentMa: Math.round(currentMa * 10) / 10,
          overcurrent,
        };
        if (overcurrent) {
          warnings.push({
            partId: d.partId,
            code: 'LED_OVERCURRENT',
            detail: `${Math.round(currentMa)} mA (> 30 mA)`,
          });
        }
      } else if (d.kind === 'rgb' && d.channel) {
        if (!rgbLedStates[d.partId]) rgbLedStates[d.partId] = { r: 0, g: 0, b: 0 };
        rgbLedStates[d.partId][d.channel as 'r' | 'g' | 'b'] =
          Math.round(Math.min(1, currentMa / 12) * 100) / 100;
      } else if (d.kind === 'seg' && d.channel) {
        if (!sevenSegStates[d.partId]) sevenSegStates[d.partId] = {};
        sevenSegStates[d.partId][d.channel] = Math.round(Math.min(1, currentMa / 10) * 100) / 100;
      } else if (d.kind === 'diode') {
        diodeConducting[d.partId] = diodeMode[dIdx] !== 0;
      }
    }

    for (const cap of capacitors) {
      const vCap = cap.a === cap.b ? 0 : nodeV[cap.a] - nodeV[cap.b];
      if (commitState) {
        this.capState.set(cap.partId, vCap);
      }
      capacitorVoltages[cap.partId] = Math.round(vCap * 1000) / 1000;
      if (cap.polarized && vCap < -0.5) {
        warnings.push({
          partId: cap.partId,
          code: 'CAP_REVERSE_POLARITY',
          detail: `${vCap.toFixed(2)} V`,
        });
      }
    }

    for (const m of motors) {
      const voltage = m.pos === m.neg ? 0 : nodeV[m.pos] - nodeV[m.neg];
      const deadband = Math.abs(voltage) < 0.4 ? 0 : voltage;
      motorStates[m.partId] = {
        voltage: Math.round(voltage * 100) / 100,
        rpm: Math.round(deadband * 48), // 5V -> ~240 RPM hobby DC gear motor
      };
    }

    for (const r of relays) {
      const vSupply = (r.vcc >= 0 ? nodeV[r.vcc] : 0) - (r.gnd >= 0 ? nodeV[r.gnd] : 0);
      const vIn = r.inp >= 0 ? nodeV[r.inp] : 0;
      const powered = vSupply >= 3.0 || (r.vcc < 0 && r.gnd < 0);
      relayEnergized[r.partId] = powered && (r.activeLow ? vIn < 1.5 : vIn > 2.5);
    }

    return {
      netVoltages,
      ledStates,
      rgbLedStates,
      sevenSegStates,
      capacitorVoltages,
      diodeConducting,
      relayEnergized,
      motorStates,
      warnings,
    };
  }
}
