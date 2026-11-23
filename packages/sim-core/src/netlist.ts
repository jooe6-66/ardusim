import { NetlistResult, PartInstance, PartManifest, Wire, isMcuBoardType, pinKey } from './types.js';

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
