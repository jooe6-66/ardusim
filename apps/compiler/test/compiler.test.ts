import assert from 'node:assert/strict';
import test from 'node:test';
import { AvrSimulator, parseIntelHex } from '@ardusim/sim-core';
import { CompilerService } from '../src/runner.js';
import { createCompilerServer } from '../src/server.js';

const BLINK_SERIAL_SKETCH = `
void setup() {
  pinMode(13, OUTPUT);
  Serial.begin(9600);
  Serial.println("ARDUSIM_OK");
}

void loop() {
  digitalWrite(13, HIGH);
  delay(20);
  digitalWrite(13, LOW);
  delay(20);
}
`;

test('CompilerService compiles Arduino Uno sketch and avr8js runs it with Serial TX + D13 toggle', async () => {
  const compiler = new CompilerService();
  const res = await compiler.compile('arduino-uno', BLINK_SERIAL_SKETCH);
  assert.equal(res.cached, false);
  assert.ok(res.hex.startsWith(':'), 'Expected valid Intel HEX output');
  assert.ok(parseIntelHex(res.hex).length > 0);

  // Second compile must hit SHA-256 cache
  const res2 = await compiler.compile('arduino-uno', BLINK_SERIAL_SKETCH);
  assert.equal(res2.cached, true);
  assert.equal(res2.hex, res.hex);

  // Run the real compiled .hex inside AvrSimulator (avr8js)
  let serialOut = '';
  const sim = new AvrSimulator(res.hex, {
    onSerialByte: (b) => {
      serialOut += String.fromCharCode(b);
    },
  });
  sim.setRunning(true);

  let sawHigh = false;
  let sawLow = false;
  for (let i = 0; i < 12; i++) {
    const snap = sim.stepCycles(160_000); // 10ms per step => 120ms total
    if (snap.onboardLed) sawHigh = true;
    else sawLow = true;
  }

  assert.ok(serialOut.includes('ARDUSIM_OK'), `Expected Serial output to contain ARDUSIM_OK, got: ${JSON.stringify(serialOut)}`);
  assert.ok(sawHigh && sawLow, `Expected D13 LED to toggle HIGH and LOW (sawHigh=${sawHigh}, sawLow=${sawLow})`);
});

test('HTTP API rejects dangerous #include and reports syntax error line numbers', async () => {
  const app = createCompilerServer();

  const badInclude = await app.inject({
    method: 'POST',
    url: '/api/compile',
    payload: { board: 'arduino-uno', sketch: '#include "/etc/passwd"\nvoid setup(){}\nvoid loop(){}' },
  });
  assert.equal(badInclude.statusCode, 400);

  const syntaxErr = await app.inject({
    method: 'POST',
    url: '/api/compile',
    payload: { board: 'arduino-uno', sketch: 'void setup() {\n  undeclaredFn();\n}\nvoid loop() {}' },
  });
  assert.equal(syntaxErr.statusCode, 400);
  const body = syntaxErr.json() as { diagnostics?: Array<{ line?: number }> };
  assert.ok((body.diagnostics?.length ?? 0) > 0, 'Expected structured diagnostics on compile error');
  assert.equal(body.diagnostics?.[0]?.line, 2);

  await app.close();
});

test('INPUT_PULLUP pushbutton reads HIGH when released and LOW when pressed', async () => {
  const compiler = new CompilerService();
  const sketch = `
void setup() {
  pinMode(2, INPUT_PULLUP);
  pinMode(13, OUTPUT);
}
void loop() {
  digitalWrite(13, digitalRead(2) == LOW ? HIGH : LOW);
}
`;
  const { hex } = await compiler.compile('arduino-uno', sketch);
  const manifests = new Map([
    [
      'arduino-uno',
      {
        type: 'arduino-uno',
        category: 'mcu' as const,
        width: 276,
        height: 196,
        name: { id: 'Uno', en: 'Uno' },
        description: { id: '', en: '' },
        defaultProps: {},
        pins: [
          { id: '2', label: 'D2', x: 0, y: 0, type: 'digital' as const, avrPort: 'D' as const, avrBit: 2 },
          { id: '13', label: 'D13', x: 0, y: 0, type: 'digital' as const, avrPort: 'B' as const, avrBit: 5 },
          { id: 'GND.1', label: 'GND', x: 0, y: 0, type: 'gnd' as const, fixedVoltage: 0 },
          { id: 'GND.2', label: 'GND', x: 0, y: 0, type: 'gnd' as const, fixedVoltage: 0 },
          { id: 'GND.3', label: 'GND', x: 0, y: 0, type: 'gnd' as const, fixedVoltage: 0 },
        ],
      },
    ],
    [
      'pushbutton',
      {
        type: 'pushbutton',
        category: 'input' as const,
        width: 56,
        height: 56,
        name: { id: 'Btn', en: 'Btn' },
        description: { id: '', en: '' },
        defaultProps: {},
        pins: [
          { id: '1a', label: '1a', x: 0, y: 0, type: 'passive' as const },
          { id: '1b', label: '1b', x: 0, y: 0, type: 'passive' as const },
          { id: '2a', label: '2a', x: 0, y: 0, type: 'passive' as const },
          { id: '2b', label: '2b', x: 0, y: 0, type: 'passive' as const },
        ],
      },
    ],
  ]);
  const parts = [
    { id: 'uno1', type: 'arduino-uno', x: 0, y: 0, rotation: 0 as const, props: {} },
    { id: 'btn1', type: 'pushbutton', x: 0, y: 0, rotation: 0 as const, props: {} },
  ];
  const wires = [
    { id: 'w1', from: { partId: 'uno1', pinId: '2' }, to: { partId: 'btn1', pinId: '1a' }, color: '#0f0' },
    { id: 'w2', from: { partId: 'btn1', pinId: '2a' }, to: { partId: 'uno1', pinId: 'GND.1' }, color: '#000' },
  ];

  const sim = new AvrSimulator(hex);
  sim.setCircuit(parts, wires, manifests, new Set());
  sim.setRunning(true);
  const releasedSnap = sim.stepCycles(80_000);
  assert.equal(releasedSnap.onboardLed, false, 'Released INPUT_PULLUP button must keep LED OFF');

  sim.setCircuit(parts, wires, manifests, new Set(['btn1']));
  const pressedSnap = sim.stepCycles(80_000);
  assert.equal(pressedSnap.onboardLed, true, 'Pressed INPUT_PULLUP button must turn LED ON');
});

test('HTTP API enforces rate limiting (429) and security response headers', async () => {
  const app = createCompilerServer(undefined, { rateLimitPerMin: 2 });
  const h = await app.inject({ method: 'GET', url: '/api/health' });
  assert.equal(h.headers['x-content-type-options'], 'nosniff');

  const payload = { board: 'arduino-uno', sketch: 'void setup(){} void loop(){}' };
  const r1 = await app.inject({ method: 'POST', url: '/api/compile', payload });
  assert.equal(r1.statusCode, 200);
  const r2 = await app.inject({ method: 'POST', url: '/api/compile', payload });
  assert.equal(r2.statusCode, 200);
  const r3 = await app.inject({ method: 'POST', url: '/api/compile', payload });
  assert.equal(r3.statusCode, 429);
  assert.ok(r3.headers['retry-after'], 'Expected Retry-After header on 429');

  await app.close();
});
