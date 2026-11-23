import {
  NetlistResult,
  PartInstance,
  PartManifest,
  PinDef,
  PinRef,
  Wire,
  isMcuBoardType,
  pinKey,
} from './types.js';

class DisjointSet {
  private parent = new Map<string, string>();

  add(item: string): void {
    if (!this.parent.has(item)) {
      this.parent.set(item, item);
    }
  }

  find(item: string): string {
    this.add(item);
    let root = item;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root)!;
    }
    let curr = item;
    while (curr !== root) {
      const next = this.parent.get(curr)!;
      this.parent.set(curr, root);
      curr = next;
    }
    return root;
  }

  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) {
      if (ra < rb) {
        this.parent.set(rb, ra);
      } else {
        this.parent.set(ra, rb);
      }
    }
  }

  keys(): IterableIterator<string> {
    return this.parent.keys();
  }
}

export interface NetlistDynamicState {
  pressedButtons?: Set<string>;
  /** Key format: `${partId}:${rowIndex}:${colIndex}` (0-based 0..3) */
  pressedKeypadKeys?: Set<string>;
  /** Energized relay partIds (connects COM->NO instead of COM->NC) */
  energizedRelays?: Set<string>;
}

/**
 * Computes electrical nets using Union-Find across wires, breadboard strips,
 * MCU ground planes, closed pushbuttons, relay contacts, and pressed keypad matrix switches.
 */
export function buildNetlist(
  parts: PartInstance[],
  wires: Wire[],
  manifests: Map<string, PartManifest>,
  dynamic: Set<string> | NetlistDynamicState = {}
): NetlistResult {
  const dyn: NetlistDynamicState =
    dynamic instanceof Set ? { pressedButtons: dynamic } : dynamic;
  const pressedButtons = dyn.pressedButtons ?? new Set<string>();
  const pressedKeypadKeys = dyn.pressedKeypadKeys ?? new Set<string>();
  const energizedRelays = dyn.energizedRelays ?? new Set<string>();

  const ds = new DisjointSet();

  for (const part of parts) {
    const manifest = manifests.get(part.type);
    if (!manifest) continue;
    for (const pin of manifest.pins) {
      ds.add(`${part.id}:${pin.id}`);
    }

    // Breadboard half-size internal strip continuity
    if (part.type === 'breadboard-half') {
      for (const prefix of ['tp', 'tn', 'bp', 'bn']) {
        const first = `${part.id}:${prefix}1`;
        for (let i = 2; i <= 25; i++) {
          ds.union(first, `${part.id}:${prefix}${i}`);
        }
      }
      for (let col = 1; col <= 30; col++) {
        for (const row of ['b', 'c', 'd', 'e']) {
          ds.union(`${part.id}:a${col}`, `${part.id}:${row}${col}`);
        }
        for (const row of ['g', 'h', 'i', 'j']) {
          ds.union(`${part.id}:f${col}`, `${part.id}:${row}${col}`);
        }
      }
    }

    // MCU unified GND plane & 5V rails across all ground/5V pins on the board
    if (isMcuBoardType(part.type)) {
      const gndPins = manifest.pins.filter((p) => p.type === 'gnd');
      for (let i = 1; i < gndPins.length; i++) {
        ds.union(`${part.id}:${gndPins[0].id}`, `${part.id}:${gndPins[i].id}`);
      }
      const v5Pins = manifest.pins.filter((p) => p.fixedVoltage === 5.0);
      for (let i = 1; i < v5Pins.length; i++) {
        ds.union(`${part.id}:${v5Pins[0].id}`, `${part.id}:${v5Pins[i].id}`);
      }
    }

    // 4-pin tactile pushbutton internal leg pairs + switch contact when pressed
    if (part.type === 'pushbutton') {
      ds.union(`${part.id}:1a`, `${part.id}:1b`);
      ds.union(`${part.id}:2a`, `${part.id}:2b`);
      const locked = Boolean(part.props.locked);
      if (pressedButtons.has(part.id) || locked) {
        ds.union(`${part.id}:1a`, `${part.id}:2a`);
      }
    }

    // SPDT Relay module: COM connects to NO when energized, otherwise NC
    if (part.type === 'relay') {
      if (energizedRelays.has(part.id)) {
        ds.union(`${part.id}:COM`, `${part.id}:NO`);
      } else {
        ds.union(`${part.id}:COM`, `${part.id}:NC`);
      }
    }

    // DC-DC Buck / Boost converters share a common negative ground bus (IN- <-> OUT-)
    if (part.type === 'buck-lm2596' || part.type === 'boost-mt3608') {
      ds.union(`${part.id}:IN-`, `${part.id}:OUT-`);
    }

    // 4x4 Matrix Keypad: pressing (row, col) shorts R{row+1} to C{col+1}
    if (part.type === 'keypad-4x4') {
      const lockedKey = typeof part.props.activeKey === 'string' ? part.props.activeKey : '';
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          const token = `${part.id}:${r}:${c}`;
          if (pressedKeypadKeys.has(token) || lockedKey === `${r}:${c}`) {
            ds.union(`${part.id}:R${r + 1}`, `${part.id}:C${c + 1}`);
          }
        }
      }
    }
  }

  for (const wire of wires) {
    ds.union(pinKey(wire.from), pinKey(wire.to));
  }

  const pinToNet = new Map<string, string>();
  const netToPins = new Map<string, string[]>();

  for (const key of ds.keys()) {
    const root = ds.find(key);
    pinToNet.set(key, root);
    let group = netToPins.get(root);
    if (!group) {
      group = [];
      netToPins.set(root, group);
    }
    group.push(key);
  }

  return { pinToNet, netToPins };
}

export const WIRE_COLOR_GND = '#1F2937';
export const WIRE_COLOR_POWER = '#DC2626';
export const WIRE_COLOR_POWER_3V3 = '#EA580C';

/** High-contrast jumper wire colors distinct across light and dark workbench surfaces. */
export const SIGNAL_WIRE_PALETTE = [
  '#2563EB', // blue
  '#16A34A', // green
  '#D97706', // amber
  '#7C3AED', // violet
  '#0891B2', // cyan
  '#DB2777', // magenta
  '#0F766E', // teal
  '#CA8A04', // ochre
  '#4F46E5', // indigo
  '#65A30D', // lime
] as const;

type PowerRole = 'gnd' | 'power' | 'power3v3' | 'signal';

function classifyPinPowerRole(pin: PinDef | undefined): PowerRole {
  if (!pin) return 'signal';
  const idUpper = pin.id.toUpperCase();
  if (
    pin.type === 'gnd' ||
    idUpper === 'IN-' ||
    idUpper === 'OUT-' ||
    idUpper.startsWith('GND')
  ) {
    return 'gnd';
  }
  if (idUpper === '3.3V') return 'power3v3';
  if (
    pin.type === 'power' ||
    idUpper === 'IN+' ||
    idUpper === 'OUT+' ||
    idUpper === '5V' ||
    idUpper === '12V' ||
    idUpper === 'VCC' ||
    idUpper === 'VIN'
  ) {
    return 'power';
  }
  return 'signal';
}

function resolveNetPowerRole(
  netId: string | undefined,
  netlist: NetlistResult,
  partById: Map<string, PartInstance>,
  manifests: Map<string, PartManifest>,
  fallbackRef?: PinRef
): PowerRole {
  const keys = netId ? (netlist.netToPins.get(netId) ?? []) : [];
  const checkKeys = fallbackRef ? [...keys, pinKey(fallbackRef)] : keys;
  let found: PowerRole = 'signal';
  for (const k of checkKeys) {
    const sep = k.indexOf(':');
    if (sep <= 0) continue;
    const part = partById.get(k.slice(0, sep));
    const pinId = k.slice(sep + 1);
    const pin = part ? manifests.get(part.type)?.pins.find((p) => p.id === pinId) : undefined;
    const role = classifyPinPowerRole(pin);
    if (role === 'gnd') return 'gnd';
    if (role === 'power') found = 'power';
    else if (role === 'power3v3' && found === 'signal') found = 'power3v3';
  }
  return found;
}

/**
 * Picks a deterministic, visually distinct jumper color for a new wire:
 * - Same electrical net (shared pin, branch, or breadboard strip) always reuses the same color.
 * - Distinct signal nets each receive a different color from `SIGNAL_WIRE_PALETTE`.
 * - Power rails keep conventional semantics (GND charcoal, VCC/5V/12V/+ red, 3.3V orange).
 * Also returns `unifyWireIds` when the new wire bridges two previously separate nets.
 */
export function pickWireColor(
  parts: PartInstance[],
  wires: Wire[],
  from: PinRef,
  to: PinRef,
  manifests: Map<string, PartManifest>
): { color: string; unifyWireIds: string[] } {
  const netlist = buildNetlist(parts, wires, manifests);
  const partById = new Map(parts.map((p) => [p.id, p]));

  const netFrom = netlist.pinToNet.get(pinKey(from));
  const netTo = netlist.pinToNet.get(pinKey(to));

  const wiresOnFrom = netFrom
    ? wires.filter((w) => netlist.pinToNet.get(pinKey(w.from)) === netFrom)
    : [];
  const wiresOnTo =
    netTo && netTo !== netFrom
      ? wires.filter((w) => netlist.pinToNet.get(pinKey(w.from)) === netTo)
      : [];

  const roleFrom = resolveNetPowerRole(netFrom, netlist, partById, manifests, from);
  const roleTo = resolveNetPowerRole(netTo, netlist, partById, manifests, to);
  const combinedRole: PowerRole =
    roleFrom === 'gnd' || roleTo === 'gnd'
      ? 'gnd'
      : roleFrom === 'power' || roleTo === 'power'
        ? 'power'
        : roleFrom === 'power3v3' || roleTo === 'power3v3'
          ? 'power3v3'
          : 'signal';

  // If either side already belongs to a colored net, reuse that net's color and unify bridged nets
  if (wiresOnFrom.length > 0 || wiresOnTo.length > 0) {
    let chosen: string;
    if (combinedRole === 'gnd') {
      chosen = WIRE_COLOR_GND;
    } else if (combinedRole === 'power') {
      chosen = WIRE_COLOR_POWER;
    } else if (combinedRole === 'power3v3') {
      chosen = WIRE_COLOR_POWER_3V3;
    } else if (wiresOnFrom.length > 0) {
      chosen = wiresOnFrom[0].color;
    } else {
      chosen = wiresOnTo[0].color;
    }
    const unifyWireIds = [...wiresOnFrom, ...wiresOnTo]
      .filter((w) => w.color.toUpperCase() !== chosen.toUpperCase())
      .map((w) => w.id);
    return { color: chosen, unifyWireIds };
  }

  if (combinedRole === 'gnd') return { color: WIRE_COLOR_GND, unifyWireIds: [] };
  if (combinedRole === 'power') return { color: WIRE_COLOR_POWER, unifyWireIds: [] };
  if (combinedRole === 'power3v3') return { color: WIRE_COLOR_POWER_3V3, unifyWireIds: [] };

  // Count color usage per distinct existing signal net so every new net gets an unused color
  const colorByNet = new Map<string, string>();
  for (const w of wires) {
    const nid = netlist.pinToNet.get(pinKey(w.from));
    if (nid && !colorByNet.has(nid)) {
      colorByNet.set(nid, w.color.toUpperCase());
    }
  }
  const usage = new Map<string, number>();
  for (const c of SIGNAL_WIRE_PALETTE) usage.set(c.toUpperCase(), 0);
  for (const col of colorByNet.values()) {
    if (usage.has(col)) usage.set(col, (usage.get(col) ?? 0) + 1);
  }

  let bestColor: string = SIGNAL_WIRE_PALETTE[0];
  let bestCount = Infinity;
  for (const c of SIGNAL_WIRE_PALETTE) {
    const cnt = usage.get(c.toUpperCase()) ?? 0;
    if (cnt < bestCount) {
      bestCount = cnt;
      bestColor = c;
    }
  }
  return { color: bestColor, unifyWireIds: [] };
}
