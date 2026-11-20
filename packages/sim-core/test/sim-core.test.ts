import assert from 'node:assert/strict';
import test from 'node:test';
import {
  autoTidyWires,
  buildNetlist,
  parseIntelHex,
  PassiveCircuitSolver,
  routeWire,
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
      description: { id: '', en: '' },
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
      description: { id: '', en: '' },
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
      description: { id: '', en: '' },
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
      description: { id: '', en: '' },
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
      description: { id: '', en: '' },
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
      description: { id: '', en: '' },
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
