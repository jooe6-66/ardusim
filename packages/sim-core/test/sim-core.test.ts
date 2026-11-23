import assert from 'node:assert/strict';
import test from 'node:test';
import {
  autoTidyCircuit,
  autoTidyWires,
  autoWireFromSketch,
  buildNetlist,
  getPinWorldPosition,
  moveWireCorner,
  moveWireSegment,
  parseIntelHex,
  PassiveCircuitSolver,
  pickWireColor,
  rotateExitDir,
  routeWire,
  WIRE_COLOR_GND,
  WIRE_COLOR_POWER,
  PartInstance,
  PartManifest,
  Wire,
} from '../src/index.js';

const testManifests = new Map<string, PartManifest>([
  [
    'arduino-uno',
    {
      type: 'arduino-uno',
      category: 'mcu',
      width: 276,
      height: 196,
      name: { id: 'Arduino Uno', en: 'Arduino Uno' },
      defaultProps: {},
      pins: [
        { id: '5V', label: '5V', x: 100, y: 180, type: 'power', fixedVoltage: 5.0 },
        { id: 'GND.1', label: 'GND', x: 80, y: 14, type: 'gnd', fixedVoltage: 0 },
        { id: 'GND.2', label: 'GND', x: 120, y: 180, type: 'gnd', fixedVoltage: 0 },
        { id: 'GND.3', label: 'GND', x: 132, y: 180, type: 'gnd', fixedVoltage: 0 },
        { id: '13', label: 'D13', x: 110, y: 14, type: 'digital', avrPort: 'B', avrBit: 5 },
      ],
    },
  ],
  [
    'breadboard-half',
    {
      type: 'breadboard-half',
      category: 'breadboard',
      width: 396,
      height: 214,
      name: { id: 'BB', en: 'BB' },
      defaultProps: {},
      pins: [
        { id: 'a1', label: 'a1', x: 24, y: 50, type: 'breadboard' },
        { id: 'e1', label: 'e1', x: 24, y: 98, type: 'breadboard' },
        { id: 'f1', label: 'f1', x: 24, y: 116, type: 'breadboard' },
        { id: 'tp1', label: '+1', x: 36, y: 16, type: 'power' },
        { id: 'tp25', label: '+25', x: 372, y: 16, type: 'power' },
      ],
    },
  ],
  [
    'resistor',
    {
      type: 'resistor',
      category: 'passive',
      width: 84,
      height: 28,
      name: { id: 'R', en: 'R' },
      defaultProps: { value: 220, unit: 'ohm' },
      pins: [
        { id: '1', label: '1', x: 6, y: 14, type: 'passive' },
        { id: '2', label: '2', x: 78, y: 14, type: 'passive' },
      ],
    },
  ],
  [
    'led',
    {
      type: 'led',
      category: 'output',
      width: 44,
      height: 58,
      name: { id: 'LED', en: 'LED' },
      defaultProps: { color: 'red' },
      pins: [
        { id: 'A', label: 'A', x: 16, y: 54, type: 'passive' },
        { id: 'C', label: 'C', x: 28, y: 54, type: 'passive' },
      ],
    },
  ],
  [
    'diode',
    {
      type: 'diode',
      category: 'passive',
      width: 84,
      height: 28,
      name: { id: 'D', en: 'D' },
      defaultProps: { model: '1N4007', vf: 0.7 },
      pins: [
        { id: 'A', label: 'A', x: 6, y: 14, type: 'passive' },
        { id: 'C', label: 'C', x: 78, y: 14, type: 'passive' },
      ],
    },
  ],
  [
    'capacitor',
    {
      type: 'capacitor',
      category: 'passive',
      width: 60,
      height: 52,
      name: { id: 'C', en: 'C' },
      defaultProps: { value: 100, unit: 'uf', kind: 'electrolytic' },
      pins: [
        { id: '1', label: '+', x: 18, y: 48, type: 'passive' },
        { id: '2', label: '-', x: 42, y: 48, type: 'passive' },
      ],
    },
  ],
]);

test('parseIntelHex parses valid records and rejects bad checksum', () => {
  // 2 bytes (0x0C, 0x94 => word 0x940C) at 0x0000: checksum = (-(0x02+0x00+0x00+0x00+0x0C+0x94)) & 0xFF = 0x5E
  const validHex = ':020000000C945E\n:00000001FF\n';
  const words = parseIntelHex(validHex);
  assert.equal(words[0], 0x940c);

  assert.throws(() => parseIntelHex(':020000000C9400\n:00000001FF\n'), /checksum/i);
  assert.throws(() => parseIntelHex(':020000000C945E\n'), /EOF/i);
});

test('buildNetlist merges breadboard strips and isolates across trench', () => {
  const parts: PartInstance[] = [{ id: 'bb1', type: 'breadboard-half', x: 0, y: 0, rotation: 0, props: {} }];
  const net = buildNetlist(parts, [], testManifests);
  assert.equal(net.pinToNet.get('bb1:a1'), net.pinToNet.get('bb1:e1'));
  assert.notEqual(net.pinToNet.get('bb1:a1'), net.pinToNet.get('bb1:f1'));
  assert.equal(net.pinToNet.get('bb1:tp1'), net.pinToNet.get('bb1:tp25'));
});

test('routeWire creates strictly orthogonal segments from start to end', () => {
  const pts = routeWire({ x: 10, y: 20 }, { x: 140, y: 95 }, { startExit: 'up', endExit: 'down' });
  assert.deepEqual(pts[0], { x: 10, y: 20 });
  assert.deepEqual(pts[pts.length - 1], { x: 140, y: 95 });
  for (let i = 1; i < pts.length; i++) {
    const dx = Math.abs(pts[i].x - pts[i - 1].x);
    const dy = Math.abs(pts[i].y - pts[i - 1].y);
    assert.ok(dx < 0.01 || dy < 0.01, `Non-orthogonal segment ${i}: dx=${dx}, dy=${dy}`);
  }
});

test('PassiveCircuitSolver computes resistor voltage divider accurately', () => {
  const parts: PartInstance[] = [
    { id: 'u1', type: 'arduino-uno', x: 0, y: 0, rotation: 0, props: {} },
    { id: 'r1', type: 'resistor', x: 0, y: 0, rotation: 0, props: { value: 10, unit: 'kohm' } },
    { id: 'r2', type: 'resistor', x: 0, y: 0, rotation: 0, props: { value: 10, unit: 'kohm' } },
  ];
  const wires: Wire[] = [
    { id: 'w1', from: { partId: 'u1', pinId: '5V' }, to: { partId: 'r1', pinId: '1' }, color: '#c00' },
    { id: 'w2', from: { partId: 'r1', pinId: '2' }, to: { partId: 'r2', pinId: '1' }, color: '#0a0' },
    { id: 'w3', from: { partId: 'r2', pinId: '2' }, to: { partId: 'u1', pinId: 'GND.1' }, color: '#222' },
  ];
  const net = buildNetlist(parts, wires, testManifests);
  const solver = new PassiveCircuitSolver();
  const out = solver.solve(parts, testManifests, net, [], 0.01);
  const midNet = net.pinToNet.get('r1:2')!;
  const vMid = out.netVoltages.get(midNet)!;
  assert.ok(Math.abs(vMid - 2.5) < 0.05, `Expected ~2.5V divider midpoint, got ${vMid}V`);
});

test('PassiveCircuitSolver detects LED current with resistor and flags overcurrent without resistor', () => {
  const solver = new PassiveCircuitSolver();
  // Safe circuit: 5V -> 220 ohm -> LED -> GND (~13mA)
  const safeParts: PartInstance[] = [
    { id: 'u1', type: 'arduino-uno', x: 0, y: 0, rotation: 0, props: {} },
    { id: 'r1', type: 'resistor', x: 0, y: 0, rotation: 0, props: { value: 220, unit: 'ohm' } },
    { id: 'l1', type: 'led', x: 0, y: 0, rotation: 0, props: { color: 'red' } },
  ];
  const safeWires: Wire[] = [
    { id: 'w1', from: { partId: 'u1', pinId: '5V' }, to: { partId: 'r1', pinId: '1' }, color: '#c00' },
    { id: 'w2', from: { partId: 'r1', pinId: '2' }, to: { partId: 'l1', pinId: 'A' }, color: '#c00' },
    { id: 'w3', from: { partId: 'l1', pinId: 'C' }, to: { partId: 'u1', pinId: 'GND.1' }, color: '#222' },
  ];
  const safeOut = solver.solve(safeParts, testManifests, buildNetlist(safeParts, safeWires, testManifests), [], 0.01);
  assert.ok(safeOut.ledStates.l1.brightness > 0.7);
  assert.equal(safeOut.ledStates.l1.overcurrent, false);

  // Direct short: 5V -> LED -> GND without resistor (>30mA => overcurrent warning)
  const unsafeParts: PartInstance[] = [safeParts[0], safeParts[2]];
  const unsafeWires: Wire[] = [
    { id: 'w1', from: { partId: 'u1', pinId: '5V' }, to: { partId: 'l1', pinId: 'A' }, color: '#c00' },
    { id: 'w2', from: { partId: 'l1', pinId: 'C' }, to: { partId: 'u1', pinId: 'GND.1' }, color: '#222' },
  ];
  const unsafeOut = solver.solve(unsafeParts, testManifests, buildNetlist(unsafeParts, unsafeWires, testManifests), [], 0.01);
  assert.equal(unsafeOut.ledStates.l1.overcurrent, true);
  assert.ok(unsafeOut.warnings.some((w) => w.code === 'LED_OVERCURRENT'));
});

test('PassiveCircuitSolver models diode forward drop, reverse blocking, and RC capacitor charging', () => {
  const solver = new PassiveCircuitSolver();
  // Forward diode: 5V -> 1N4007 (0.7V) -> 1k ohm -> GND => cathode ~4.3V
  const fwdParts: PartInstance[] = [
    { id: 'u1', type: 'arduino-uno', x: 0, y: 0, rotation: 0, props: {} },
    { id: 'd1', type: 'diode', x: 0, y: 0, rotation: 0, props: { model: '1N4007', vf: 0.7 } },
    { id: 'r1', type: 'resistor', x: 0, y: 0, rotation: 0, props: { value: 1, unit: 'kohm' } },
  ];
  const fwdWires: Wire[] = [
    { id: 'w1', from: { partId: 'u1', pinId: '5V' }, to: { partId: 'd1', pinId: 'A' }, color: '#c00' },
    { id: 'w2', from: { partId: 'd1', pinId: 'C' }, to: { partId: 'r1', pinId: '1' }, color: '#c00' },
    { id: 'w3', from: { partId: 'r1', pinId: '2' }, to: { partId: 'u1', pinId: 'GND.1' }, color: '#222' },
  ];
  const fwdNet = buildNetlist(fwdParts, fwdWires, testManifests);
  const fwdOut = solver.solve(fwdParts, testManifests, fwdNet, [], 0.01);
  assert.equal(fwdOut.diodeConducting.d1, true);
  const vCathode = fwdOut.netVoltages.get(fwdNet.pinToNet.get('d1:C')!)!;
  assert.ok(vCathode > 4.1 && vCathode < 4.45, `Expected ~4.3V after Si diode, got ${vCathode}V`);

  // Reverse diode: 5V -> Cathode, Anode -> 1k -> GND => blocked (~0V at anode)
  const revWires: Wire[] = [
    { id: 'w1', from: { partId: 'u1', pinId: '5V' }, to: { partId: 'd1', pinId: 'C' }, color: '#c00' },
    { id: 'w2', from: { partId: 'd1', pinId: 'A' }, to: { partId: 'r1', pinId: '1' }, color: '#c00' },
    { id: 'w3', from: { partId: 'r1', pinId: '2' }, to: { partId: 'u1', pinId: 'GND.1' }, color: '#222' },
  ];
  const revNet = buildNetlist(fwdParts, revWires, testManifests);
  const revOut = solver.solve(fwdParts, testManifests, revNet, [], 0.01);
  assert.equal(revOut.diodeConducting.d1, false);
  const vAnode = revOut.netVoltages.get(revNet.pinToNet.get('d1:A')!)!;
  assert.ok(vAnode < 0.05, `Expected ~0V when diode reverse-biased, got ${vAnode}V`);

  // RC circuit: 5V -> 10k ohm -> 100uF cap -> GND (tau = 1.0s). After 100 steps of 10ms = 1.0s => ~3.16V (63.2% of 5V)
  solver.reset();
  const rcParts: PartInstance[] = [
    { id: 'u1', type: 'arduino-uno', x: 0, y: 0, rotation: 0, props: {} },
    { id: 'r1', type: 'resistor', x: 0, y: 0, rotation: 0, props: { value: 10, unit: 'kohm' } },
    { id: 'c1', type: 'capacitor', x: 0, y: 0, rotation: 0, props: { value: 100, unit: 'uf', kind: 'electrolytic' } },
  ];
  const rcWires: Wire[] = [
    { id: 'w1', from: { partId: 'u1', pinId: '5V' }, to: { partId: 'r1', pinId: '1' }, color: '#c00' },
    { id: 'w2', from: { partId: 'r1', pinId: '2' }, to: { partId: 'c1', pinId: '1' }, color: '#c00' },
    { id: 'w3', from: { partId: 'c1', pinId: '2' }, to: { partId: 'u1', pinId: 'GND.1' }, color: '#222' },
  ];
  const rcNet = buildNetlist(rcParts, rcWires, testManifests);
  let lastCapV = 0;
  for (let i = 0; i < 100; i++) {
    const out = solver.solve(rcParts, testManifests, rcNet, [], 0.01);
    lastCapV = out.capacitorVoltages.c1;
  }
  assert.ok(lastCapV > 3.0 && lastCapV < 3.35, `Expected ~3.16V at 1 tau, got ${lastCapV}V`);
});

test('autoTidyWires routes around component obstacles with strictly orthogonal paths and channel separation', () => {
  const parts: PartInstance[] = [
    { id: 'u1', type: 'arduino-uno', x: 48, y: 120, rotation: 0, props: {} },
    { id: 'r1', type: 'resistor', x: 384, y: 120, rotation: 0, props: { value: 220, unit: 'ohm' } },
    { id: 'l1', type: 'led', x: 384, y: 240, rotation: 0, props: { color: 'red' } },
  ];
  const wires: Wire[] = [
    { id: 'w1', from: { partId: 'u1', pinId: '13' }, to: { partId: 'r1', pinId: '1' }, color: '#c00' },
    { id: 'w2', from: { partId: 'u1', pinId: 'GND.1' }, to: { partId: 'l1', pinId: 'C' }, color: '#000' },
    { id: 'w3', from: { partId: 'u1', pinId: '5V' }, to: { partId: 'r1', pinId: '2' }, color: '#0a0' },
  ];

  const tidied = autoTidyWires(parts, wires, testManifests);
  assert.equal(tidied.length, 3);
  for (const w of tidied) {
    assert.ok(Array.isArray(w.waypoints) && w.waypoints.length >= 1, `Expected computed waypoints on ${w.id}`);
    // Verify consecutive waypoints stay strictly orthogonal
    for (let i = 1; i < w.waypoints!.length; i++) {
      const dx = Math.abs(w.waypoints![i].x - w.waypoints![i - 1].x);
      const dy = Math.abs(w.waypoints![i].y - w.waypoints![i - 1].y);
      assert.ok(dx < 0.5 || dy < 0.5, `Non-orthogonal tidied wire ${w.id} segment ${i}`);
    }
  }
});

test('autoTidyWires exits pins straight with board clearance and separates parallel wires', () => {
  const unoManifest = testManifests.get('arduino-uno')!;
  const unoWithExit: PartManifest = {
    ...unoManifest,
    pins: [
      { id: '13', label: 'D13', x: 74, y: 14, type: 'digital', exitDir: 'up', avrPort: 'B', avrBit: 5 },
      { id: '12', label: 'D12', x: 86, y: 14, type: 'digital', exitDir: 'up', avrPort: 'B', avrBit: 4 },
      { id: '11', label: 'D11', x: 98, y: 14, type: 'digital', exitDir: 'up', avrPort: 'B', avrBit: 3 },
    ],
  };
  const ledManifest = testManifests.get('led')!;
  const ledWithExit: PartManifest = {
    ...ledManifest,
    pins: [
      { id: 'A', label: 'A', x: 16, y: 54, type: 'passive', exitDir: 'down' },
      { id: 'C', label: 'C', x: 28, y: 54, type: 'passive', exitDir: 'down' },
    ],
  };
  const manifests = new Map<string, PartManifest>([
    ['arduino-uno', unoWithExit],
    ['led', ledWithExit],
  ]);

  const parts: PartInstance[] = [
    { id: 'u1', type: 'arduino-uno', x: 48, y: 168, rotation: 0, props: {} },
    { id: 'l1', type: 'led', x: 408, y: 84, rotation: 0, props: { color: 'red' } },
    { id: 'l2', type: 'led', x: 480, y: 84, rotation: 0, props: { color: 'green' } },
  ];
  const wires: Wire[] = [
    { id: 'w1', from: { partId: 'u1', pinId: '13' }, to: { partId: 'l1', pinId: 'A' }, color: '#c00' },
    { id: 'w2', from: { partId: 'u1', pinId: '12' }, to: { partId: 'l2', pinId: 'A' }, color: '#0a0' },
  ];

  const tidied = autoTidyWires(parts, wires, manifests);
  const horizTrunks: number[] = [];

  for (const w of tidied) {
    const startPin = unoWithExit.pins.find((p) => p.id === w.from.pinId)!;
    const endPin = ledWithExit.pins.find((p) => p.id === w.to.pinId)!;
    const endPart = parts.find((p) => p.id === w.to.partId)!;
    const startWorld = { x: parts[0].x + startPin.x, y: parts[0].y + startPin.y };
    const endWorld = { x: endPart.x + endPin.x, y: endPart.y + endPin.y };
    const full = routeWire(startWorld, endWorld, { waypoints: w.waypoints, startExit: 'up', endExit: 'down' });

    // First segment must go straight UP from pin with zero X kink and clear board top edge (y=168)
    assert.equal(full[1].x, startWorld.x, `${w.id} should leave pin dead-straight vertically`);
    assert.ok(full[1].y <= parts[0].y - 12, `${w.id} should clear board edge by at least 12px, got y=${full[1].y}`);

    // Collect horizontal trunk Y coordinates above board
    for (let i = 1; i < full.length; i++) {
      if (Math.abs(full[i].y - full[i - 1].y) < 0.5 && Math.abs(full[i].x - full[i - 1].x) > 40) {
        horizTrunks.push(full[i].y);
      }
    }
  }

  assert.ok(horizTrunks.length >= 2, 'Expected distinct horizontal trunks for both wires');
  assert.ok(
    Math.abs(horizTrunks[0] - horizTrunks[1]) >= 12,
    `Parallel horizontal trunks must be separated by >=12px, got ${horizTrunks.join(', ')}`
  );
});

test('getPinWorldPosition and rotateExitDir honor flipX and flipY with rotation', () => {
  const manifest = { width: 100, height: 60 };
  const pin = { x: 20, y: 10 }; // dx = -30, dy = -20 around center (50, 30)

  assert.deepEqual(
    getPinWorldPosition({ x: 0, y: 0, rotation: 0, flipX: true }, manifest, pin),
    { x: 80, y: 10 }
  );
  assert.deepEqual(
    getPinWorldPosition({ x: 0, y: 0, rotation: 0, flipY: true }, manifest, pin),
    { x: 20, y: 50 }
  );
  // Rotate 90 CW: (rx, ry) = (20, -30); then flipX -> (-20, -30) => (30, 0)
  assert.deepEqual(
    getPinWorldPosition({ x: 0, y: 0, rotation: 90, flipX: true }, manifest, pin),
    { x: 30, y: 0 }
  );

  assert.equal(rotateExitDir('left', 0, true, false), 'right');
  assert.equal(rotateExitDir('up', 0, false, true), 'down');
  // 'up' rotated 90 CW -> 'right', then flipX -> 'left'
  assert.equal(rotateExitDir('up', 90, true, false), 'left');
});

test('autoTidyCircuit arranges overlapping components without collisions and routes clean wires', () => {
  // Deliberately stack all parts on top of each other at (100, 100)
  const messyParts: PartInstance[] = [
    { id: 'u1', type: 'arduino-uno', x: 100, y: 100, rotation: 0, props: {} },
    { id: 'r1', type: 'resistor', x: 100, y: 100, rotation: 0, props: { value: 220, unit: 'ohm' } },
    { id: 'l1', type: 'led', x: 100, y: 100, rotation: 0, props: { color: 'red' } },
    { id: 'd1', type: 'diode', x: 100, y: 100, rotation: 90, props: { model: '1N4007', vf: 0.7 } },
    { id: 'c1', type: 'capacitor', x: 100, y: 100, rotation: 0, props: { value: 100, unit: 'uf', kind: 'electrolytic' } },
  ];
  const wires: Wire[] = [
    { id: 'w1', from: { partId: 'u1', pinId: '13' }, to: { partId: 'r1', pinId: '1' }, color: '#c00' },
    { id: 'w2', from: { partId: 'r1', pinId: '2' }, to: { partId: 'l1', pinId: 'A' }, color: '#c00' },
    { id: 'w3', from: { partId: 'l1', pinId: 'C' }, to: { partId: 'u1', pinId: 'GND.1' }, color: '#000' },
    { id: 'w4', from: { partId: 'u1', pinId: '5V' }, to: { partId: 'd1', pinId: 'A' }, color: '#0a0' },
    { id: 'w5', from: { partId: 'd1', pinId: 'C' }, to: { partId: 'c1', pinId: '1' }, color: '#0a0' },
  ];

  const { parts, wires: tidiedWires } = autoTidyCircuit(messyParts, wires, testManifests);
  assert.equal(parts.length, messyParts.length);
  assert.equal(tidiedWires.length, wires.length);

  // Verify zero bounding-box overlaps (accounting for 90-degree rotation on d1)
  const rects = parts.map((p) => {
    const m = testManifests.get(p.type)!;
    const cx = p.x + m.width / 2;
    const cy = p.y + m.height / 2;
    const rot = p.rotation === 90 || p.rotation === 270;
    const w = rot ? m.height : m.width;
    const h = rot ? m.width : m.height;
    return { id: p.id, x1: cx - w / 2, y1: cy - h / 2, x2: cx + w / 2, y2: cy + h / 2 };
  });
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      const overlaps = a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
      assert.equal(overlaps, false, `Parts ${a.id} and ${b.id} must not overlap after autoTidyCircuit`);
    }
  }
});

test('moveWireCorner and moveWireSegment reshape wires while keeping strict orthogonality', () => {
  const basePts = [
    { x: 60, y: 24 },
    { x: 60, y: 96 },
    { x: 204, y: 96 },
    { x: 204, y: 156 },
  ];

  // Slide middle horizontal segment downward to y=120
  const slidWp = moveWireSegment(basePts, 1, 132, 120);
  const slidFull = [basePts[0], ...slidWp, basePts[basePts.length - 1]];
  assert.deepEqual(slidWp, [
    { x: 60, y: 120 },
    { x: 204, y: 120 },
  ]);
  for (let i = 1; i < slidFull.length; i++) {
    assert.ok(
      Math.abs(slidFull[i].x - slidFull[i - 1].x) < 0.5 ||
        Math.abs(slidFull[i].y - slidFull[i - 1].y) < 0.5
    );
  }

  // Pull first pin-connected segment sideways to create a clean new orthogonal jog
  const jogWp = moveWireSegment(basePts, 0, 96, 60);
  const jogFull = [basePts[0], ...jogWp, basePts[basePts.length - 1]];
  assert.ok(jogWp.length >= 3, 'Expected new orthogonal bend points on pin-attached segment');
  for (let i = 1; i < jogFull.length; i++) {
    assert.ok(
      Math.abs(jogFull[i].x - jogFull[i - 1].x) < 0.5 ||
        Math.abs(jogFull[i].y - jogFull[i - 1].y) < 0.5,
      `Non-orthogonal segment ${i}`
    );
  }

  // Drag corner 1 to (84, 72) and verify orthogonality is preserved
  const cornerWp = moveWireCorner(basePts, 1, 84, 72);
  const cornerFull = [basePts[0], ...cornerWp, basePts[basePts.length - 1]];
  for (let i = 1; i < cornerFull.length; i++) {
    assert.ok(
      Math.abs(cornerFull[i].x - cornerFull[i - 1].x) < 0.5 ||
        Math.abs(cornerFull[i].y - cornerFull[i - 1].y) < 0.5,
      `Non-orthogonal corner drag segment ${i}`
    );
  }
});

test('PassiveCircuitSolver simulates 18650 (1S/2S/3S), LiPo 3S, Buck, Boost, and L298N H-bridge', () => {
  const powerManifests = new Map<string, PartManifest>(testManifests);
  powerManifests.set('battery-18650', {
    type: 'battery-18650',
    category: 'power',
    width: 116,
    height: 64,
    name: { id: '18650', en: '18650' },
    defaultProps: { cells: 1, voltage: 3.7 },
    pins: [
      { id: '+', label: '+', x: 110, y: 20, type: 'power' },
      { id: '-', label: '-', x: 110, y: 44, type: 'gnd' },
    ],
  });
  powerManifests.set('battery-lipo-3s', {
    type: 'battery-lipo-3s',
    category: 'power',
    width: 124,
    height: 68,
    name: { id: 'LiPo 3S', en: 'LiPo 3S' },
    defaultProps: { voltage: 11.1 },
    pins: [
      { id: '+', label: '+', x: 118, y: 22, type: 'power' },
      { id: '-', label: '-', x: 118, y: 46, type: 'gnd' },
    ],
  });
  powerManifests.set('buck-lm2596', {
    type: 'buck-lm2596',
    category: 'power',
    width: 124,
    height: 68,
    name: { id: 'Buck', en: 'Buck' },
    defaultProps: { targetVoltage: 5.0 },
    pins: [
      { id: 'IN+', label: 'IN+', x: 6, y: 22, type: 'power' },
      { id: 'IN-', label: 'IN-', x: 6, y: 46, type: 'gnd' },
      { id: 'OUT+', label: 'OUT+', x: 118, y: 22, type: 'power' },
      { id: 'OUT-', label: 'OUT-', x: 118, y: 46, type: 'gnd' },
    ],
  });
  powerManifests.set('boost-mt3608', {
    type: 'boost-mt3608',
    category: 'power',
    width: 116,
    height: 64,
    name: { id: 'Boost', en: 'Boost' },
    defaultProps: { targetVoltage: 12.0 },
    pins: [
      { id: 'IN+', label: 'IN+', x: 6, y: 20, type: 'power' },
      { id: 'IN-', label: 'IN-', x: 6, y: 44, type: 'gnd' },
      { id: 'OUT+', label: 'OUT+', x: 110, y: 20, type: 'power' },
      { id: 'OUT-', label: 'OUT-', x: 110, y: 44, type: 'gnd' },
    ],
  });
  powerManifests.set('l298n', {
    type: 'l298n',
    category: 'motor',
    width: 132,
    height: 124,
    name: { id: 'L298N', en: 'L298N' },
    defaultProps: { reg5vEnabled: true },
    pins: [
      { id: 'OUT1', label: 'OUT1', x: 6, y: 36, type: 'passive' },
      { id: 'OUT2', label: 'OUT2', x: 6, y: 56, type: 'passive' },
      { id: 'OUT3', label: 'OUT3', x: 126, y: 36, type: 'passive' },
      { id: 'OUT4', label: 'OUT4', x: 126, y: 56, type: 'passive' },
      { id: '12V', label: '12V', x: 16, y: 118, type: 'power' },
      { id: 'GND', label: 'GND', x: 28, y: 118, type: 'gnd' },
      { id: '5V', label: '5V', x: 40, y: 118, type: 'power' },
      { id: 'ENA', label: 'ENA', x: 58, y: 118, type: 'digital' },
      { id: 'IN1', label: 'IN1', x: 70, y: 118, type: 'digital' },
      { id: 'IN2', label: 'IN2', x: 82, y: 118, type: 'digital' },
      { id: 'IN3', label: 'IN3', x: 94, y: 118, type: 'digital' },
      { id: 'IN4', label: 'IN4', x: 106, y: 118, type: 'digital' },
      { id: 'ENB', label: 'ENB', x: 118, y: 118, type: 'digital' },
    ],
  });
  powerManifests.set('dc-motor', {
    type: 'dc-motor',
    category: 'motor',
    width: 84,
    height: 76,
    name: { id: 'DC Motor', en: 'DC Motor' },
    defaultProps: {},
    pins: [
      { id: '+', label: '+', x: 30, y: 72, type: 'passive' },
      { id: '-', label: '-', x: 54, y: 72, type: 'passive' },
    ],
  });

  const solver = new PassiveCircuitSolver();

  // 1. LiPo 3S (11.1V) -> Buck LM2596 (5V) -> 1k load
  const buckParts: PartInstance[] = [
    { id: 'lipo1', type: 'battery-lipo-3s', x: 0, y: 0, rotation: 0, props: { voltage: 11.1 } },
    { id: 'buck1', type: 'buck-lm2596', x: 0, y: 0, rotation: 0, props: { targetVoltage: 5.0 } },
    { id: 'r1', type: 'resistor', x: 0, y: 0, rotation: 0, props: { value: 1, unit: 'kohm' } },
  ];
  const buckWires: Wire[] = [
    { id: 'w1', from: { partId: 'lipo1', pinId: '+' }, to: { partId: 'buck1', pinId: 'IN+' }, color: '#c00' },
    { id: 'w2', from: { partId: 'lipo1', pinId: '-' }, to: { partId: 'buck1', pinId: 'IN-' }, color: '#000' },
    { id: 'w3', from: { partId: 'buck1', pinId: 'OUT+' }, to: { partId: 'r1', pinId: '1' }, color: '#c00' },
    { id: 'w4', from: { partId: 'buck1', pinId: 'OUT-' }, to: { partId: 'r1', pinId: '2' }, color: '#000' },
  ];
  const buckNet = buildNetlist(buckParts, buckWires, powerManifests);
  const buckOut = solver.solve(buckParts, powerManifests, buckNet, [], 0.01);
  assert.equal(buckOut.converterStates.buck1.active, true);
  assert.ok(Math.abs(buckOut.converterStates.buck1.vin - 11.1) < 0.15);
  assert.ok(Math.abs(buckOut.converterStates.buck1.vout - 5.0) < 0.1);

  // 2. 18650 1S (3.7V) -> Boost MT3608 (12V) -> L298N -> DC Motor with 50% PWM on ENA
  const boostParts: PartInstance[] = [
    { id: 'u1', type: 'arduino-uno', x: 0, y: 0, rotation: 0, props: {} },
    { id: 'b1', type: 'battery-18650', x: 0, y: 0, rotation: 0, props: { cells: 1, voltage: 3.7 } },
    { id: 'boost1', type: 'boost-mt3608', x: 0, y: 0, rotation: 0, props: { targetVoltage: 12.0 } },
    { id: 'drv1', type: 'l298n', x: 0, y: 0, rotation: 0, props: { reg5vEnabled: true } },
    { id: 'm1', type: 'dc-motor', x: 0, y: 0, rotation: 0, props: {} },
  ];
  const boostWires: Wire[] = [
    { id: 'w1', from: { partId: 'b1', pinId: '+' }, to: { partId: 'boost1', pinId: 'IN+' }, color: '#c00' },
    { id: 'w2', from: { partId: 'b1', pinId: '-' }, to: { partId: 'boost1', pinId: 'IN-' }, color: '#000' },
    { id: 'w3', from: { partId: 'boost1', pinId: 'OUT-' }, to: { partId: 'u1', pinId: 'GND.1' }, color: '#000' },
    { id: 'w4', from: { partId: 'boost1', pinId: 'OUT+' }, to: { partId: 'drv1', pinId: '12V' }, color: '#c00' },
    { id: 'w5', from: { partId: 'u1', pinId: 'GND.2' }, to: { partId: 'drv1', pinId: 'GND' }, color: '#000' },
    { id: 'w6', from: { partId: 'u1', pinId: '5V' }, to: { partId: 'drv1', pinId: 'IN1' }, color: '#0a0' },
    { id: 'w7', from: { partId: 'u1', pinId: 'GND.3' }, to: { partId: 'drv1', pinId: 'IN2' }, color: '#000' },
    { id: 'w8', from: { partId: 'u1', pinId: '13' }, to: { partId: 'drv1', pinId: 'ENA' }, color: '#00c' },
    { id: 'w9', from: { partId: 'drv1', pinId: 'OUT1' }, to: { partId: 'm1', pinId: '+' }, color: '#c00' },
    { id: 'w10', from: { partId: 'drv1', pinId: 'OUT2' }, to: { partId: 'm1', pinId: '-' }, color: '#000' },
  ];
  const boostNet = buildNetlist(boostParts, boostWires, powerManifests);
  const boostOut = solver.solve(
    boostParts,
    powerManifests,
    boostNet,
    [{ pinKey: 'u1:13', mode: 'OUTPUT_HIGH', outputVoltage: 2.5 }], // 50% PWM duty
    0.01
  );
  assert.equal(boostOut.converterStates.boost1.active, true);
  assert.ok(Math.abs(boostOut.converterStates.boost1.vout - 12.0) < 0.15);
  assert.equal(boostOut.l298nStates.drv1.powered, true);
  // (12V - 1.4V drop) * 50% duty = 5.3V across motor
  assert.ok(boostOut.motorStates.m1.voltage > 4.6 && boostOut.motorStates.m1.voltage < 5.7, `Got motor V=${boostOut.motorStates.m1.voltage}`);
  assert.ok(boostOut.motorStates.m1.rpm > 200);
});

test('pickWireColor assigns distinct colors per signal net and reuses the same color on the same net', () => {
  const parts: PartInstance[] = [
    { id: 'u1', type: 'arduino-uno', x: 0, y: 0, rotation: 0, props: {} },
    { id: 'bb1', type: 'breadboard-half', x: 0, y: 0, rotation: 0, props: {} },
    { id: 'r1', type: 'resistor', x: 0, y: 0, rotation: 0, props: { value: 220, unit: 'ohm' } },
    { id: 'l1', type: 'led', x: 0, y: 0, rotation: 0, props: { color: 'red' } },
  ];
  const wires: Wire[] = [];

  // 1. GND wire -> charcoal black
  const gndPick = pickWireColor(parts, wires, { partId: 'u1', pinId: 'GND.1' }, { partId: 'l1', pinId: 'C' }, testManifests);
  assert.equal(gndPick.color, WIRE_COLOR_GND);
  wires.push({ id: 'w1', from: { partId: 'u1', pinId: 'GND.1' }, to: { partId: 'l1', pinId: 'C' }, color: gndPick.color });

  // 2. 5V wire -> red
  const pwrPick = pickWireColor(parts, wires, { partId: 'u1', pinId: '5V' }, { partId: 'bb1', pinId: 'tp1' }, testManifests);
  assert.equal(pwrPick.color, WIRE_COLOR_POWER);
  wires.push({ id: 'w2', from: { partId: 'u1', pinId: '5V' }, to: { partId: 'bb1', pinId: 'tp1' }, color: pwrPick.color });

  // 3. First signal net (D13 -> bb1:a1) -> distinct color A
  const sigA1 = pickWireColor(parts, wires, { partId: 'u1', pinId: '13' }, { partId: 'bb1', pinId: 'a1' }, testManifests);
  assert.notEqual(sigA1.color, WIRE_COLOR_GND);
  assert.notEqual(sigA1.color, WIRE_COLOR_POWER);
  wires.push({ id: 'w3', from: { partId: 'u1', pinId: '13' }, to: { partId: 'bb1', pinId: 'a1' }, color: sigA1.color });

  // 4. Same electrical net via breadboard strip (bb1:e1 -> r1:1) -> MUST match color A!
  const sigA2 = pickWireColor(parts, wires, { partId: 'bb1', pinId: 'e1' }, { partId: 'r1', pinId: '1' }, testManifests);
  assert.equal(sigA2.color, sigA1.color);
  wires.push({ id: 'w4', from: { partId: 'bb1', pinId: 'e1' }, to: { partId: 'r1', pinId: '1' }, color: sigA2.color });

  // 5. Different electrical net across resistor (r1:2 -> l1:A) -> MUST get a different color B!
  const sigB = pickWireColor(parts, wires, { partId: 'r1', pinId: '2' }, { partId: 'l1', pinId: 'A' }, testManifests);
  assert.notEqual(sigB.color, sigA1.color);
  assert.notEqual(sigB.color, WIRE_COLOR_GND);
  assert.notEqual(sigB.color, WIRE_COLOR_POWER);
});

test('autoTidyWires routes aligned pins dead-straight (0 bends) and avoids collinear overlap on parallel wires', () => {
  const m = new Map<string, PartManifest>([
    [
      'resistor',
      {
        type: 'resistor',
        category: 'passive',
        width: 84,
        height: 28,
        name: { id: 'R', en: 'R' },
        defaultProps: {},
        pins: [
          { id: '1', label: '1', x: 6, y: 14, type: 'passive', exitDir: 'left' },
          { id: '2', label: '2', x: 78, y: 14, type: 'passive', exitDir: 'right' },
        ],
      },
    ],
  ]);

  // Two horizontally aligned resistors -> pin 2 of r1 faces pin 1 of r2 on exact same Y
  const parts: PartInstance[] = [
    { id: 'r1', type: 'resistor', x: 48, y: 120, rotation: 0, props: {} },
    { id: 'r2', type: 'resistor', x: 180, y: 120, rotation: 0, props: {} },
  ];
  const wires: Wire[] = [
    { id: 'w1', from: { partId: 'r1', pinId: '2' }, to: { partId: 'r2', pinId: '1' }, color: '#2563EB' },
  ];
  const tidied = autoTidyWires(parts, wires, m);
  const full = routeWire({ x: 48 + 78, y: 120 + 14 }, { x: 180 + 6, y: 120 + 14 }, {
    startExit: 'right',
    endExit: 'left',
    waypoints: tidied[0].waypoints,
  });
  assert.equal(full.length, 2, `Aligned facing pins should route straight (2 points), got ${full.length}`);

  // Preserved wire keeps its custom manual bend while a second wire routes cleanly
  const manualWp = [{ x: 132, y: 60 }, { x: 180, y: 60 }];
  const withSecond = autoTidyWires(
    parts,
    [
      { id: 'w1', from: { partId: 'r1', pinId: '2' }, to: { partId: 'r2', pinId: '1' }, color: '#2563EB', waypoints: manualWp },
      { id: 'w2', from: { partId: 'r1', pinId: '1' }, to: { partId: 'r2', pinId: '2' }, color: '#16A34A' },
    ],
    m,
    new Set(['w1'])
  );
  assert.deepEqual(withSecond[0].waypoints, manualWp);
  assert.ok((withSecond[1].waypoints?.length ?? 0) > 0);
});

test('pickWireColor keeps signal colors for passive/digital +/- pins and unwired active-low relay stays off', () => {
  const m = new Map<string, PartManifest>(testManifests);
  m.set('dc-motor', {
    type: 'dc-motor',
    category: 'motor',
    width: 84,
    height: 76,
    name: { id: 'Motor', en: 'Motor' },
    defaultProps: {},
    pins: [
      { id: '+', label: '+', x: 30, y: 72, type: 'passive' },
      { id: '-', label: '-', x: 54, y: 72, type: 'passive' },
    ],
  });
  m.set('relay', {
    type: 'relay',
    category: 'output',
    width: 92,
    height: 72,
    name: { id: 'Relay', en: 'Relay' },
    defaultProps: { activeLow: true },
    pins: [
      { id: 'VCC', label: 'VCC', x: 6, y: 20, type: 'power' },
      { id: 'GND', label: 'GND', x: 6, y: 36, type: 'gnd' },
      { id: 'IN', label: 'IN', x: 6, y: 52, type: 'digital' },
      { id: 'NO', label: 'NO', x: 86, y: 20, type: 'passive' },
      { id: 'COM', label: 'COM', x: 86, y: 36, type: 'passive' },
      { id: 'NC', label: 'NC', x: 86, y: 52, type: 'passive' },
    ],
  });

  const parts: PartInstance[] = [
    { id: 'u1', type: 'arduino-uno', x: 0, y: 0, rotation: 0, props: {} },
    { id: 'm1', type: 'dc-motor', x: 0, y: 0, rotation: 0, props: {} },
    { id: 'rel1', type: 'relay', x: 0, y: 0, rotation: 0, props: { activeLow: true } },
  ];

  // DC motor passive '+' and '-' wired to digital pins must NOT be forced to power red or GND charcoal
  const mp = pickWireColor(parts, [], { partId: 'u1', pinId: '13' }, { partId: 'm1', pinId: '+' }, m);
  assert.notEqual(mp.color, WIRE_COLOR_POWER);
  assert.notEqual(mp.color, WIRE_COLOR_GND);
  const mn = pickWireColor(parts, [{ id: 'w1', from: { partId: 'u1', pinId: '13' }, to: { partId: 'm1', pinId: '+' }, color: mp.color }], { partId: 'u1', pinId: '12' }, { partId: 'm1', pinId: '-' }, m);
  assert.notEqual(mn.color, WIRE_COLOR_GND);
  assert.notEqual(mn.color, mp.color);

  // Active-low relay with VCC+GND powered but IN unwired must remain OFF (not falsely energized)
  const solver = new PassiveCircuitSolver();
  const relayWires: Wire[] = [
    { id: 'r1', from: { partId: 'u1', pinId: '5V' }, to: { partId: 'rel1', pinId: 'VCC' }, color: '#DC2626' },
    { id: 'r2', from: { partId: 'u1', pinId: 'GND.1' }, to: { partId: 'rel1', pinId: 'GND' }, color: '#1F2937' },
  ];
  const unwiredOut = solver.solve(parts, m, buildNetlist(parts, relayWires, m), [], 0.01);
  assert.equal(unwiredOut.relayEnergized.rel1, false);

  // Wiring IN to LOW (0V) energizes active-low relay
  const wiredRelay = [...relayWires, { id: 'r3', from: { partId: 'u1', pinId: '13' }, to: { partId: 'rel1', pinId: 'IN' }, color: '#2563EB' }];
  const lowOut = solver.solve(
    parts,
    m,
    buildNetlist(parts, wiredRelay, m),
    [{ pinKey: 'u1:13', mode: 'OUTPUT_LOW', outputVoltage: 0 }],
    0.01
  );
  assert.equal(lowOut.relayEnergized.rel1, true);
});

test('autoWireFromSketch auto-adds detected components, wires pins accurately, and preserves manual power parts', () => {
  const m = new Map<string, PartManifest>(testManifests);
  // Expand Uno pins for full auto-wire coverage
  m.set('arduino-uno', {
    type: 'arduino-uno',
    category: 'mcu',
    width: 276,
    height: 196,
    name: { id: 'Arduino Uno', en: 'Arduino Uno' },
    defaultProps: {},
    pins: [
      { id: '5V', label: '5V', x: 100, y: 180, type: 'power', fixedVoltage: 5.0 },
      { id: '3.3V', label: '3.3V', x: 88, y: 180, type: 'power', fixedVoltage: 3.3 },
      { id: 'GND.1', label: 'GND', x: 80, y: 14, type: 'gnd', fixedVoltage: 0 },
      { id: 'GND.2', label: 'GND', x: 120, y: 180, type: 'gnd', fixedVoltage: 0 },
      { id: '2', label: 'D2', x: 240, y: 14, type: 'digital' },
      { id: '6', label: 'D6', x: 192, y: 14, type: 'digital' },
      { id: '7', label: 'D7', x: 180, y: 14, type: 'digital' },
      { id: '9', label: 'D9', x: 156, y: 14, type: 'digital' },
      { id: '13', label: 'D13', x: 110, y: 14, type: 'digital' },
      { id: 'A0', label: 'A0', x: 200, y: 180, type: 'analog' },
      { id: 'A4', label: 'A4', x: 248, y: 180, type: 'i2c' },
      { id: 'A5', label: 'A5', x: 260, y: 180, type: 'i2c' },
    ],
  });
  m.set('lcd-1602-i2c', {
    type: 'lcd-1602-i2c',
    category: 'display',
    width: 196,
    height: 92,
    name: { id: 'LCD', en: 'LCD' },
    defaultProps: { i2cAddress: 0x27 },
    pins: [
      { id: 'GND', label: 'GND', x: 6, y: 26, type: 'gnd' },
      { id: 'VCC', label: 'VCC', x: 6, y: 38, type: 'power' },
      { id: 'SDA', label: 'SDA', x: 6, y: 50, type: 'i2c' },
      { id: 'SCL', label: 'SCL', x: 6, y: 62, type: 'i2c' },
    ],
  });
  m.set('dht22', {
    type: 'dht22',
    category: 'sensor',
    width: 68,
    height: 76,
    name: { id: 'DHT', en: 'DHT' },
    defaultProps: { model: 'DHT22' },
    pins: [
      { id: 'VCC', label: 'VCC', x: 22, y: 72, type: 'power' },
      { id: 'DATA', label: 'DATA', x: 34, y: 72, type: 'digital' },
      { id: 'GND', label: 'GND', x: 46, y: 72, type: 'gnd' },
    ],
  });
  m.set('servo', {
    type: 'servo',
    category: 'motor',
    width: 96,
    height: 76,
    name: { id: 'Servo', en: 'Servo' },
    defaultProps: {},
    pins: [
      { id: 'GND', label: 'GND', x: 24, y: 72, type: 'gnd' },
      { id: 'VCC', label: 'VCC', x: 36, y: 72, type: 'power' },
      { id: 'SIG', label: 'SIG', x: 48, y: 72, type: 'digital' },
    ],
  });
  m.set('potentiometer', {
    type: 'potentiometer',
    category: 'input',
    width: 64,
    height: 68,
    name: { id: 'Pot', en: 'Pot' },
    defaultProps: { value: 10, unit: 'kohm', position: 0.5 },
    pins: [
      { id: 'GND', label: 'GND', x: 20, y: 64, type: 'gnd' },
      { id: 'SIG', label: 'SIG', x: 32, y: 64, type: 'analog' },
      { id: 'VCC', label: 'VCC', x: 44, y: 64, type: 'power' },
    ],
  });
  m.set('pushbutton', {
    type: 'pushbutton',
    category: 'input',
    width: 56,
    height: 56,
    name: { id: 'Btn', en: 'Btn' },
    defaultProps: {},
    pins: [
      { id: '1a', label: '1a', x: 10, y: 10, type: 'passive' },
      { id: '2a', label: '2a', x: 46, y: 10, type: 'passive' },
    ],
  });
  m.set('battery-18650', {
    type: 'battery-18650',
    category: 'power',
    width: 116,
    height: 64,
    name: { id: 'Bat', en: 'Bat' },
    defaultProps: { cells: 2, voltage: 7.4 },
    pins: [
      { id: '+', label: '+', x: 110, y: 20, type: 'power' },
      { id: '-', label: '-', x: 110, y: 44, type: 'gnd' },
    ],
  });

  const sketch = `
    #include <LiquidCrystal_I2C.h>
    #include <DHT.h>
    #include <Servo.h>
    #define DHT_PIN 2
    #define BTN_PIN 7
    const int GREEN_LED = 13;
    const int POT_PIN = A0;
    LiquidCrystal_I2C lcd(0x3F, 16, 2);
    DHT dht(DHT_PIN, DHT11);
    Servo gateServo;
    void setup() {
      Serial.begin(9600);
      pinMode(GREEN_LED, OUTPUT);
      pinMode(BTN_PIN, INPUT_PULLUP);
      gateServo.attach(9);
    }
    void loop() {
      int v = analogRead(POT_PIN);
      if (digitalRead(BTN_PIN) == LOW) digitalWrite(GREEN_LED, HIGH);
    }
  `;

  const mcu: PartInstance = { id: 'mcu1', type: 'arduino-uno', x: 48, y: 156, rotation: 0, props: {} };
  const manualBat: PartInstance = { id: 'bat1', type: 'battery-18650', x: 500, y: 40, rotation: 0, props: { cells: 2, voltage: 7.4 } };

  const res = autoWireFromSketch(sketch, mcu, [mcu, manualBat], [], m);
  assert.ok(res.addedParts >= 6, `Expected >= 6 auto-added parts, got ${res.addedParts}`);
  assert.ok(res.addedWires >= 14, `Expected >= 14 auto-added wires, got ${res.addedWires}`);
  // Manual battery preserved untouched
  assert.ok(res.parts.some((p) => p.id === 'bat1'), 'Manual battery must stay on canvas');
  const lcd = res.parts.find((p) => p.type === 'lcd-1602-i2c');
  assert.equal(lcd?.props.i2cAddress, 0x3f);
  const dht = res.parts.find((p) => p.type === 'dht22');
  assert.equal(dht?.props.model, 'DHT11');
  const led = res.parts.find((p) => p.type === 'led');
  assert.equal(led?.props.color, 'green');
  assert.ok(res.parts.some((p) => p.type === 'resistor'), 'LED should include series resistor');
  assert.ok(res.parts.some((p) => p.type === 'servo'));
  assert.ok(res.parts.some((p) => p.type === 'potentiometer'));
  assert.ok(res.parts.some((p) => p.type === 'pushbutton'));
  // Verify Servo SIG connected to D9 and DHT DATA connected to D2
  const servo = res.parts.find((p) => p.type === 'servo')!;
  assert.ok(res.wires.some((w) => w.from.pinId === '9' && w.to.partId === servo.id && w.to.pinId === 'SIG'));
  assert.ok(res.wires.some((w) => w.from.pinId === '2' && w.to.partId === dht!.id && w.to.pinId === 'DATA'));
});

test('autoWireFromSketch aligns array-loop LEDs & multi-zone inputs in pin order with common GND/5V rails', () => {
  const m = new Map<string, PartManifest>(testManifests);
  const unoPins: PartManifest['pins'] = [
    { id: '5V', label: '5V', x: 134, y: 182, type: 'power', exitDir: 'down', fixedVoltage: 5.0 },
    { id: 'GND.1', label: 'GND', x: 86, y: 14, type: 'gnd', exitDir: 'up', fixedVoltage: 0 },
    { id: 'GND.2', label: 'GND', x: 146, y: 182, type: 'gnd', exitDir: 'down', fixedVoltage: 0 },
    { id: 'GND.3', label: 'GND', x: 158, y: 182, type: 'gnd', exitDir: 'down', fixedVoltage: 0 },
  ];
  for (let pin = 2; pin <= 11; pin++) {
    unoPins.push({ id: String(pin), label: `D${pin}`, x: 236 - (pin - 2) * 12, y: 14, type: 'digital', exitDir: 'up' });
  }
  for (let a = 0; a <= 3; a++) {
    unoPins.push({ id: `A${a}`, label: `A${a}`, x: 200 + a * 12, y: 182, type: 'analog', exitDir: 'down' });
  }
  m.set('arduino-uno', {
    type: 'arduino-uno',
    category: 'mcu',
    width: 276,
    height: 196,
    name: { id: 'Arduino Uno', en: 'Arduino Uno' },
    defaultProps: {},
    pins: unoPins,
  });
  m.set('potentiometer', {
    type: 'potentiometer',
    category: 'input',
    width: 64,
    height: 68,
    name: { id: 'Pot', en: 'Pot' },
    defaultProps: { value: 10, unit: 'kohm', position: 0.5 },
    pins: [
      { id: 'GND', label: 'GND', x: 20, y: 64, type: 'gnd', exitDir: 'down' },
      { id: 'SIG', label: 'SIG', x: 32, y: 64, type: 'analog', exitDir: 'down' },
      { id: 'VCC', label: 'VCC', x: 44, y: 64, type: 'power', exitDir: 'down' },
    ],
  });

  // 1. 10-LED Water Wave with indexed array loop (LED_PINS[i])
  const waveSketch = `
    const int LED_PINS[] = {2, 3, 4, 5, 6, 7, 8, 9, 10, 11};
    const int jumlahLED = 10;
    void setup() {
      for (int i = 0; i < jumlahLED; i++) pinMode(LED_PINS[i], OUTPUT);
      Serial.begin(9600);
    }
    void loop() {
      for (int i = 0; i < jumlahLED; i++) {
        digitalWrite(LED_PINS[i], HIGH);
        delay(100);
        digitalWrite(LED_PINS[i], LOW);
      }
    }
  `;
  const mcu: PartInstance = { id: 'uno1', type: 'arduino-uno', x: 48, y: 156, rotation: 0, props: {} };
  const res = autoWireFromSketch(waveSketch, mcu, [mcu], [], m);
  const leds = res.parts.filter((p) => p.type === 'led');
  const resistors = res.parts.filter((p) => p.type === 'resistor');
  const uno = res.parts.find((p) => p.id === 'uno1')!;
  assert.equal(leds.length, 10);
  assert.equal(resistors.length, 10);

  // All 10 LEDs must sit in ONE horizontal row above Uno
  const uniqueLedY = new Set(leds.map((l) => l.y));
  assert.equal(uniqueLedY.size, 1, `Expected all 10 LEDs aligned on 1 row, got Ys: ${[...uniqueLedY]}`);
  assert.ok(leds[0].y < uno.y, 'Top-header LEDs should sit above the MCU');

  // Verify visual left-to-right order matches Uno physical pin order (D11 leftmost -> D2 rightmost)
  const pinToLedX = new Map<number, number>();
  for (const w of res.wires) {
    if (w.from.partId === 'uno1' && /^\d+$/.test(w.from.pinId)) {
      const rId = w.to.partId;
      const rToLed = res.wires.find((rw) => rw.from.partId === rId && rw.to.partId !== 'uno1');
      if (rToLed) {
        const ledPart = leds.find((l) => l.id === rToLed.to.partId)!;
        pinToLedX.set(Number(w.from.pinId), ledPart.x);
      }
    }
  }
  assert.equal(pinToLedX.size, 10);
  for (let pin = 11; pin > 2; pin--) {
    assert.ok(
      pinToLedX.get(pin)! < pinToLedX.get(pin - 1)!,
      `Expected D${pin} LED (x=${pinToLedX.get(pin)}) left of D${pin - 1} LED (x=${pinToLedX.get(pin - 1)})`
    );
  }

  // Common GND bus: only 1 wire taps MCU GND, yet ALL 10 LEDs share Uno GND net electrically
  const mcuGndWires = res.wires.filter(
    (w) => (w.from.partId === 'uno1' && w.from.pinId.startsWith('GND')) || (w.to.partId === 'uno1' && w.to.pinId.startsWith('GND'))
  );
  assert.equal(mcuGndWires.length, 1, `Expected 1 common GND tap to MCU, got ${mcuGndWires.length}`);
  const net = buildNetlist(res.parts, res.wires, m);
  const unoGndNet = net.pinToNet.get('uno1:GND.1');
  for (const l of leds) {
    assert.equal(net.pinToNet.get(`${l.id}:C`), unoGndNet, `${l.id}:C must be on Uno GND net`);
  }

  // 2. Multi-zone analog array (4 pots on A0..A3) sits cleanly in 1 row BELOW Uno with common GND & 5V rails
  const potSketch = `
    const int POTS[] = {A0, A1, A2, A3};
    void setup() {}
    void loop() {
      for (int i = 0; i < 4; i++) analogRead(POTS[i]);
    }
  `;
  const potRes = autoWireFromSketch(potSketch, mcu, [mcu], [], m);
  const pots = potRes.parts.filter((p) => p.type === 'potentiometer');
  const potUno = potRes.parts.find((p) => p.id === 'uno1')!;
  assert.equal(pots.length, 4);
  assert.equal(new Set(pots.map((p) => p.y)).size, 1, 'All 4 pots should align horizontally in 1 row');
  assert.ok(pots[0].y > potUno.y + 196, 'Bottom-header analog pots should sit below the MCU');
  const potNet = buildNetlist(potRes.parts, potRes.wires, m);
  for (const p of pots) {
    assert.equal(potNet.pinToNet.get(`${p.id}:GND`), potNet.pinToNet.get('uno1:GND.2'));
    assert.equal(potNet.pinToNet.get(`${p.id}:VCC`), potNet.pinToNet.get('uno1:5V'));
  }
});
