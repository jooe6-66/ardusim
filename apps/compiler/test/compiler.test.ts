import assert from 'node:assert/strict';
import test from 'node:test';
import { AvrSimulator, MultiMcuSimulator, PartInstance, PartManifest, Wire, parseIntelHex } from '@ardusim/sim-core';
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

test('HTTP API queues concurrent compiles up to maxQueueSize and sets Private-Network header', async () => {
  let markFirstStarted!: () => void;
  const firstStarted = new Promise<void>((r) => {
    markFirstStarted = r;
  });
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((r) => {
    releaseFirst = r;
  });
  let callCount = 0;
  const stubCompiler = {
    resolveEngine: async () => 'arduino-cli' as const,
    compile: async () => {
      callCount++;
      if (callCount === 1) {
        markFirstStarted();
        await firstGate;
      }
      return { hex: ':00000001FF', cached: false, engine: 'arduino-cli' as const, durationMs: 1, logs: '' };
    },
  } as unknown as CompilerService;

  const app = createCompilerServer(stubCompiler, {
    rateLimitPerMin: 50,
    maxConcurrentCompiles: 1,
    maxQueueSize: 1,
  });

  const preflight = await app.inject({
    method: 'OPTIONS',
    url: '/api/compile',
    headers: {
      origin: 'https://ardusim.pages.dev',
      'access-control-request-method': 'POST',
      'access-control-request-private-network': 'true',
    },
  });
  assert.equal(preflight.headers['access-control-allow-private-network'], 'true');

  const payload = { board: 'arduino-uno', sketch: 'void setup(){} void loop(){}' };
  const p1 = app.inject({ method: 'POST', url: '/api/compile', payload });
  await firstStarted;

  const p2 = app.inject({ method: 'POST', url: '/api/compile', payload });
  for (let i = 0; i < 20; i++) {
    const h = (await app.inject({ method: 'GET', url: '/api/health' })).json() as { queuedCompiles: number };
    if (h.queuedCompiles === 1) break;
    await new Promise((r) => setTimeout(r, 10));
  }

  const r3 = await app.inject({ method: 'POST', url: '/api/compile', payload });
  assert.equal(r3.statusCode, 503);

  releaseFirst();
  const [r1, r2] = await Promise.all([p1, p2]);
  assert.equal(r1.statusCode, 200);
  assert.equal(r2.statusCode, 200);

  await app.close();
});

test('HTTP API ignores invalid non-numeric env overrides for rate limit and concurrency', async () => {
  const prevRl = process.env.RATE_LIMIT_PER_MIN;
  const prevConc = process.env.MAX_CONCURRENT_COMPILES;
  const prevQueue = process.env.MAX_QUEUE_SIZE;
  process.env.RATE_LIMIT_PER_MIN = 'abc';
  process.env.MAX_CONCURRENT_COMPILES = '';
  process.env.MAX_QUEUE_SIZE = '-5';
  try {
    const stubCompiler = {
      resolveEngine: async () => 'arduino-cli' as const,
      compile: async () => ({ hex: ':00000001FF', cached: false, engine: 'arduino-cli' as const, durationMs: 1, logs: '' }),
    } as unknown as CompilerService;
    const app = createCompilerServer(stubCompiler);
    const health = (await app.inject({ method: 'GET', url: '/api/health' })).json() as { maxConcurrentCompiles: number };
    assert.equal(health.maxConcurrentCompiles, 2);
    const res = await app.inject({
      method: 'POST',
      url: '/api/compile',
      payload: { board: 'arduino-uno', sketch: 'void setup(){} void loop(){}' },
    });
    assert.equal(res.statusCode, 200);
    await app.close();
  } finally {
    if (prevRl === undefined) delete process.env.RATE_LIMIT_PER_MIN;
    else process.env.RATE_LIMIT_PER_MIN = prevRl;
    if (prevConc === undefined) delete process.env.MAX_CONCURRENT_COMPILES;
    else process.env.MAX_CONCURRENT_COMPILES = prevConc;
    if (prevQueue === undefined) delete process.env.MAX_QUEUE_SIZE;
    else process.env.MAX_QUEUE_SIZE = prevQueue;
  }
});

test('MultiMcuSimulator runs two Arduino Uno boards communicating over UART TX->RX and digital GPIO', async () => {
  const masterSketch = `
    void setup() {
      Serial.begin(9600);
      pinMode(7, OUTPUT);
      digitalWrite(7, HIGH);
      delay(5);
      Serial.println("PING");
    }
    void loop() {}
  `;
  const slaveSketch = `
    String rx = "";
    void setup() {
      Serial.begin(9600);
      pinMode(8, INPUT);
      pinMode(13, OUTPUT);
    }
    void loop() {
      while (Serial.available() > 0) {
        char c = Serial.read();
        if (c == '\\n') {
          rx.trim();
          int sig = digitalRead(8);
          if (rx == "PING" && sig == HIGH) {
            digitalWrite(13, HIGH);
            Serial.println("SLAVE_ACK_OK");
          }
          rx = "";
        } else {
          rx += c;
        }
      }
    }
  `;

  const compiler = new CompilerService();
  const [mRes, sRes] = await Promise.all([
    compiler.compile('arduino-uno', masterSketch),
    compiler.compile('arduino-uno', slaveSketch),
  ]);

  const unoManifest: PartManifest = {
    type: 'arduino-uno',
    category: 'mcu',
    width: 276,
    height: 196,
    name: { id: 'Uno', en: 'Uno' },
    defaultProps: {},
    pins: [
      { id: '0', label: 'RX', x: 0, y: 0, type: 'uart', avrPort: 'D', avrBit: 0 },
      { id: '1', label: 'TX', x: 0, y: 0, type: 'uart', avrPort: 'D', avrBit: 1 },
      { id: '7', label: 'D7', x: 0, y: 0, type: 'digital', avrPort: 'D', avrBit: 7 },
      { id: '8', label: 'D8', x: 0, y: 0, type: 'digital', avrPort: 'B', avrBit: 0 },
      { id: '13', label: 'D13', x: 0, y: 0, type: 'digital', avrPort: 'B', avrBit: 5 },
      { id: 'GND.1', label: 'GND', x: 0, y: 0, type: 'gnd', fixedVoltage: 0 },
    ],
  };
  const manifests = new Map<string, PartManifest>([['arduino-uno', unoManifest]]);
  const parts: PartInstance[] = [
    { id: 'mcu1', type: 'arduino-uno', x: 0, y: 0, rotation: 0, props: {} },
    { id: 'mcu2', type: 'arduino-uno', x: 400, y: 0, rotation: 0, props: {} },
  ];
  const wires: Wire[] = [
    { id: 'w1', from: { partId: 'mcu1', pinId: '1' }, to: { partId: 'mcu2', pinId: '0' }, color: '#2563EB' },
    { id: 'w2', from: { partId: 'mcu1', pinId: '7' }, to: { partId: 'mcu2', pinId: '8' }, color: '#16A34A' },
    { id: 'w3', from: { partId: 'mcu1', pinId: 'GND.1' }, to: { partId: 'mcu2', pinId: 'GND.1' }, color: '#1F2937' },
  ];

  const logs: Record<string, string> = { mcu1: '', mcu2: '' };
  const sim = new MultiMcuSimulator(
    [
      { partId: 'mcu1', board: 'arduino-uno', hex: mRes.hex },
      { partId: 'mcu2', board: 'arduino-uno', hex: sRes.hex },
    ],
    {
      onSerialByte: (id, byte) => {
        logs[id] = (logs[id] ?? '') + String.fromCharCode(byte);
      },
    }
  );
  sim.setCircuit(parts, wires, manifests);
  sim.setRunning(true);

  let slaveLedOn = false;
  for (let step = 0; step < 30; step++) {
    const snap = sim.stepCycles(400_000);
    if (snap.onboardLeds?.mcu2) slaveLedOn = true;
    if (logs.mcu2.includes('SLAVE_ACK_OK') && slaveLedOn) break;
  }

  assert.ok(logs.mcu1.includes('PING'), `Expected Master Serial PING, got: ${JSON.stringify(logs.mcu1)}`);
  assert.ok(logs.mcu2.includes('SLAVE_ACK_OK'), `Expected Slave Serial SLAVE_ACK_OK, got: ${JSON.stringify(logs.mcu2)}`);
  assert.equal(slaveLedOn, true, 'Expected Slave onboard D13 LED to turn ON after receiving PING + D8 HIGH');
});
