import { CapacitanceUnit, DiodeModel, ResistanceUnit } from '@ardusim/sim-core';

export const RESISTANCE_UNITS: Array<{ id: ResistanceUnit; label: string; mult: number }> = [
  { id: 'ohm', label: 'Ω', mult: 1 },
  { id: 'kohm', label: 'kΩ', mult: 1e3 },
  { id: 'mohm', label: 'MΩ', mult: 1e6 },
];

export const CAPACITANCE_UNITS: Array<{ id: CapacitanceUnit; label: string; mult: number }> = [
  { id: 'pf', label: 'pF', mult: 1e-12 },
  { id: 'nf', label: 'nF', mult: 1e-9 },
  { id: 'uf', label: 'µF', mult: 1e-6 },
  { id: 'mf', label: 'mF', mult: 1e-3 },
];

export const DIODE_MODELS: Array<{ id: DiodeModel; label: string; defaultVf: number }> = [
  { id: '1N4007', label: '1N4007 (Silicon 0.7V)', defaultVf: 0.7 },
  { id: '1N5819', label: '1N5819 (Schottky 0.3V)', defaultVf: 0.3 },
  { id: 'zener', label: 'Zener Diode', defaultVf: 0.7 },
  { id: 'custom', label: 'Custom Vf', defaultVf: 0.7 },
];

export function formatResistance(value: number, unit: ResistanceUnit): string {
  const sym = RESISTANCE_UNITS.find((u) => u.id === unit)?.label ?? 'Ω';
  const clean = Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  return `${clean} ${sym}`;
}

export function formatCapacitance(value: number, unit: CapacitanceUnit): string {
  const sym = CAPACITANCE_UNITS.find((u) => u.id === unit)?.label ?? 'µF';
  const clean = Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  return `${clean} ${sym}`;
}

const DIGIT_COLORS = [
  '#1C1C1C', // 0 black
  '#7C4728', // 1 brown
  '#C92A2A', // 2 red
  '#E8590C', // 3 orange
  '#EAB308', // 4 yellow
  '#2F9E44', // 5 green
  '#1971C2', // 6 blue
  '#7048E8', // 7 violet
  '#6B7280', // 8 grey
  '#F8FAFC', // 9 white
];

const MULT_COLORS: Record<number, string> = {
  [-2]: '#C0C0C0', // silver 0.01
  [-1]: '#D4AF37', // gold 0.1
  0: '#1C1C1C',
  1: '#7C4728',
  2: '#C92A2A',
  3: '#E8590C',
  4: '#EAB308',
  5: '#2F9E44',
  6: '#1971C2',
  7: '#7048E8',
};

/** Computes standard 4-band EIA resistor color bands [d1, d2, multiplier, tolerance(gold)]. */
export function getResistorColorBands(ohms: number): [string, string, string, string] {
  if (!Number.isFinite(ohms) || ohms <= 0) {
    return [DIGIT_COLORS[0], DIGIT_COLORS[0], DIGIT_COLORS[0], '#D4AF37'];
  }
  const exp = Math.floor(Math.log10(ohms)) - 1;
  const normalized = Math.round(ohms / Math.pow(10, exp));
  let d1 = Math.floor(normalized / 10);
  let d2 = normalized % 10;
  let mult = exp;
  if (d1 >= 10) {
    d1 = 1;
    d2 = 0;
    mult += 1;
  }
  const c1 = DIGIT_COLORS[Math.min(9, Math.max(0, d1))] ?? DIGIT_COLORS[1];
  const c2 = DIGIT_COLORS[Math.min(9, Math.max(0, d2))] ?? DIGIT_COLORS[0];
  const cm = MULT_COLORS[Math.min(7, Math.max(-2, mult))] ?? DIGIT_COLORS[0];
  return [c1, c2, cm, '#D4AF37'];
}
