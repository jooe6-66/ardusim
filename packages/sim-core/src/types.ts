export type BoardId = 'arduino-uno' | 'arduino-nano' | 'arduino-mega';

export type AvrPortName = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'J' | 'K' | 'L';

export type PinType =
  | 'digital'
  | 'analog'
  | 'power'
  | 'gnd'
  | 'passive'
  | 'breadboard'
  | 'i2c'
  | 'spi'
  | 'uart';

export type ResistanceUnit = 'ohm' | 'kohm' | 'mohm';
export type CapacitanceUnit = 'pf' | 'nf' | 'uf' | 'mf';
export type DiodeModel = '1N4007' | '1N5819' | 'zener' | 'custom';
export type CapacitorKind = 'ceramic' | 'electrolytic';
export type LedColor = 'red' | 'green' | 'yellow' | 'blue' | 'white';

export interface Point {
  x: number;
  y: number;
}

export interface PinRef {
  partId: string;
  pinId: string;
}

export interface PinDef {
  id: string;
  label: string;
  x: number;
  y: number;
  type: PinType;
  /** Optional exit direction vector for clean orthogonal routing */
  exitDir?: 'up' | 'down' | 'left' | 'right';
  avrPort?: AvrPortName;
  avrBit?: number;
  adcChannel?: number;
  fixedVoltage?: number;
}

export interface PartInstance {
  id: string;
  type: string;
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
  flipX?: boolean;
  flipY?: boolean;
  props: Record<string, unknown>;
}

export interface Wire {
  id: string;
  from: PinRef;
  to: PinRef;
  color: string;
  waypoints?: Point[];
}

export interface CircuitDiagram {
  version: 1;
  id: string;
  name: string;
  board: BoardId;
  parts: PartInstance[];
  wires: Wire[];
  sketch: string;
  updatedAt: number;
}

export interface LedVisualState {
  brightness: number; // 0..1
  currentMa: number;
  overcurrent: boolean;
}

export interface RgbLedVisualState {
  r: number; // 0..1
  g: number; // 0..1
  b: number; // 0..1
}

export interface LcdDisplayState {
  rows: [string, string];
  backlight: boolean;
}

export interface OledDisplayState {
  /** Base64 or flat Uint8Array packed 128x64 (1024 bytes, 8 pages x 128 cols) */
  buffer: number[];
  displayOn: boolean;
  inverted: boolean;
}

export interface MotorVisualState {
  voltage: number; // signed -5..+5V
  rpm: number;
}

export interface Max7219State {
  rows: number[]; // 8 bytes
  active: boolean;
}

export interface StepperVisualState {
  steps: number;
  angleDeg: number;
}

export interface PowerConverterVisualState {
  vin: number;
  vout: number;
  active: boolean;
}

export interface L298NVisualState {
  vSupply: number;
  outA: number;
  outB: number;
  powered: boolean;
}

export interface SimWarning {
  partId: string;
  code: 'LED_OVERCURRENT' | 'CAP_REVERSE_POLARITY';
  detail: string;
}

export interface SimSnapshot {
  running: boolean;
  timeMs: number;
  onboardLed: boolean;
  onboardLeds?: Record<string, boolean>;
  ledStates: Record<string, LedVisualState>;
  rgbLedStates: Record<string, RgbLedVisualState>;
  sevenSegStates: Record<string, Record<string, number>>;
  capacitorVoltages: Record<string, number>;
  diodeConducting: Record<string, boolean>;
  servoAngles: Record<string, number>;
  buzzerHz: Record<string, number>;
  relayEnergized: Record<string, boolean>;
  motorStates: Record<string, MotorVisualState>;
  converterStates?: Record<string, PowerConverterVisualState>;
  l298nStates?: Record<string, L298NVisualState>;
  stepperStates: Record<string, StepperVisualState>;
  lcdDisplays: Record<string, LcdDisplayState>;
  oledDisplays: Record<string, OledDisplayState>;
  max7219Displays: Record<string, Max7219State>;
  neoPixelStrips: Record<string, Array<[number, number, number]>>;
  rtcTimes: Record<string, string>;
  bluetoothLogs: Record<string, string>;
  pinVoltages: Record<string, number>;
  warnings: SimWarning[];
}

export type PinModeState = 'INPUT' | 'INPUT_PULLUP' | 'OUTPUT_LOW' | 'OUTPUT_HIGH';

export interface McuPinState {
  pinKey: string; // `${partId}:${pinId}`
  mode: PinModeState;
  outputVoltage: number;
}

export interface NetlistResult {
  /** Maps `${partId}:${pinId}` -> canonical netId */
  pinToNet: Map<string, string>;
  /** Maps canonical netId -> list of `${partId}:${pinId}` */
  netToPins: Map<string, string[]>;
}

export interface PartManifest {
  type: string;
  category:
    | 'mcu'
    | 'breadboard'
    | 'power'
    | 'passive'
    | 'input'
    | 'output'
    | 'sensor'
    | 'display'
    | 'motor';
  width: number;
  height: number;
  name: { id: string; en: string };
  defaultProps: Record<string, unknown>;
  pins: PinDef[];
}

export function isMcuBoardType(type: string): type is BoardId {
  return type === 'arduino-uno' || type === 'arduino-nano' || type === 'arduino-mega';
}

export function pinKey(ref: PinRef): string {
  return `${ref.partId}:${ref.pinId}`;
}

/** Transform a local pin coordinate on a part to world coordinates given x, y, width, height, rotation, and flip. */
export function getPinWorldPosition(
  part: Pick<PartInstance, 'x' | 'y' | 'rotation' | 'flipX' | 'flipY'>,
  manifest: Pick<PartManifest, 'width' | 'height'>,
  pin: Pick<PinDef, 'x' | 'y'>
): Point {
  const cx = manifest.width / 2;
  const cy = manifest.height / 2;
  const dx = pin.x - cx;
  const dy = pin.y - cy;
  let rx = dx;
  let ry = dy;
  switch (part.rotation) {
    case 90:
      rx = -dy;
      ry = dx;
      break;
    case 180:
      rx = -dx;
      ry = -dy;
      break;
    case 270:
      rx = dy;
      ry = -dx;
      break;
    default:
      break;
  }
  if (part.flipX) rx = -rx;
  if (part.flipY) ry = -ry;
  return {
    x: Math.round((part.x + cx + rx) * 10) / 10,
    y: Math.round((part.y + cy + ry) * 10) / 10,
  };
}
