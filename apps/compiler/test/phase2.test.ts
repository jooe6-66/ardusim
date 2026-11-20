import assert from 'node:assert/strict';
import test from 'node:test';
import { AvrSimulator } from '@ardusim/sim-core';
import { PART_MANIFEST_MAP } from '@ardusim/parts';
import { CompilerService } from '../src/runner.js';

test('Arduino Mega 2560 compiles and runs D42 digital output, A12 ADC, and Serial0 TX', async () => {
  const compiler = new CompilerService();
  const sketch = `
void setup() {
  pinMode(42, OUTPUT);
  pinMode(13, OUTPUT);
  Serial.begin(9600);
}
void loop() {
  digitalWrite(42, HIGH);
  digitalWrite(13, HIGH);
  int val = analogRead(A12);
  Serial.print("MEGA_A12=");
  Serial.println(val);
  delay(50);
}
`;
  const { hex } = await compiler.compile('arduino-mega', sketch);
  let serial = '';
  const sim = new AvrSimulator(hex, {
    board: 'arduino-mega',
    onSerialByte: (b) => {
      serial += String.fromCharCode(b);
    },
  });
  const parts = [
    { id: 'mega1', type: 'arduino-mega', x: 0, y: 0, rotation: 0 as const, props: {} },
    { id: 'pot1', type: 'potentiometer', x: 0, y: 0, rotation: 0 as const, props: { value: 10, unit: 'kohm', position: 0.5 } },
    { id: 'r1', type: 'resistor', x: 0, y: 0, rotation: 0 as const, props: { value: 220, unit: 'ohm' } },
    { id: 'led1', type: 'led', x: 0, y: 0, rotation: 0 as const, props: { color: 'red' } },
  ];
  const wires = [
    { id: 'w1', from: { partId: 'mega1', pinId: '5V' }, to: { partId: 'pot1', pinId: 'VCC' }, color: '#c00' },
    { id: 'w2', from: { partId: 'mega1', pinId: 'GND.2' }, to: { partId: 'pot1', pinId: 'GND' }, color: '#000' },
    { id: 'w3', from: { partId: 'pot1', pinId: 'SIG' }, to: { partId: 'mega1', pinId: 'A12' }, color: '#0a0' },
    { id: 'w4', from: { partId: 'mega1', pinId: '42' }, to: { partId: 'r1', pinId: '1' }, color: '#00c' },
    { id: 'w5', from: { partId: 'r1', pinId: '2' }, to: { partId: 'led1', pinId: 'A' }, color: '#00c' },
    { id: 'w6', from: { partId: 'led1', pinId: 'C' }, to: { partId: 'mega1', pinId: 'GND.1' }, color: '#000' },
  ];
  sim.setCircuit(parts, wires, PART_MANIFEST_MAP);
  sim.setRunning(true);

  let snap;
  for (let i = 0; i < 6; i++) snap = sim.stepCycles(160_000);
  assert.equal(snap!.onboardLed, true, 'Mega D13 (PB7) onboard LED must be ON');
  assert.ok(snap!.ledStates.led1.brightness > 0.7, 'Mega D42 LED must be lit');
  assert.match(serial, /MEGA_A12=(50[0-9]|51[0-9])/, `Expected ~512 from Mega A12, got: ${serial}`);
});

test('Arduino Nano compiles and reads A6 analog channel with LM35 sensor', async () => {
  const compiler = new CompilerService();
  const sketch = `
void setup() { Serial.begin(9600); }
void loop() {
  int raw = analogRead(A6);
  Serial.print("NANO_A6=");
  Serial.println(raw);
  delay(40);
}
`;
  const { hex } = await compiler.compile('arduino-nano', sketch);
  let serial = '';
  const sim = new AvrSimulator(hex, {
    board: 'arduino-nano',
    onSerialByte: (b) => {
      serial += String.fromCharCode(b);
    },
  });
  const parts = [
    { id: 'nano1', type: 'arduino-nano', x: 0, y: 0, rotation: 0 as const, props: {} },
    { id: 'lm1', type: 'lm35', x: 0, y: 0, rotation: 0 as const, props: { tempC: 50 } }, // 0.50V -> ADC ~102
  ];
  const wires = [
    { id: 'w1', from: { partId: 'lm1', pinId: 'OUT' }, to: { partId: 'nano1', pinId: 'A6' }, color: '#0a0' },
  ];
  sim.setCircuit(parts, wires, PART_MANIFEST_MAP);
  sim.setRunning(true);
  for (let i = 0; i < 4; i++) sim.stepCycles(160_000);
  assert.match(serial, /NANO_A6=(9[8-9]|10[0-6])/, `Expected ~102 from Nano A6 (0.50V), got: ${serial}`);
});

test('HC-SR04 pulseIn + Servo.h angle + LiquidCrystal_I2C display work end-to-end', async () => {
  const compiler = new CompilerService();
  const sketch = `
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Servo.h>

LiquidCrystal_I2C lcd(0x27, 16, 2);
Servo myServo;

void setup() {
  pinMode(7, OUTPUT);
  pinMode(6, INPUT);
  myServo.attach(9);
  myServo.write(135);
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("ArduSim LCD");
  Serial.begin(9600);
}

void loop() {
  digitalWrite(7, LOW);
  delayMicroseconds(2);
  digitalWrite(7, HIGH);
  delayMicroseconds(10);
  digitalWrite(7, LOW);
  long dur = pulseIn(6, HIGH, 30000);
  int cm = dur / 58;
  lcd.setCursor(0, 1);
  lcd.print("Dist:");
  lcd.print(cm);
  lcd.print("cm   ");
  Serial.print("CM=");
  Serial.println(cm);
  delay(60);
}
`;
  const { hex } = await compiler.compile('arduino-uno', sketch);
  let serial = '';
  const sim = new AvrSimulator(hex, {
    board: 'arduino-uno',
    onSerialByte: (b) => {
      serial += String.fromCharCode(b);
    },
  });
  const parts = [
    { id: 'uno1', type: 'arduino-uno', x: 0, y: 0, rotation: 0 as const, props: {} },
    { id: 'us1', type: 'hc-sr04', x: 0, y: 0, rotation: 0 as const, props: { distanceCm: 42 } },
    { id: 'srv1', type: 'servo', x: 0, y: 0, rotation: 0 as const, props: {} },
    { id: 'lcd1', type: 'lcd-1602-i2c', x: 0, y: 0, rotation: 0 as const, props: { i2cAddress: 0x27 } },
  ];
  const wires = [
    { id: 'w1', from: { partId: 'uno1', pinId: '7' }, to: { partId: 'us1', pinId: 'TRIG' }, color: '#0a0' },
    { id: 'w2', from: { partId: 'uno1', pinId: '6' }, to: { partId: 'us1', pinId: 'ECHO' }, color: '#00c' },
    { id: 'w3', from: { partId: 'uno1', pinId: '9' }, to: { partId: 'srv1', pinId: 'SIG' }, color: '#d90' },
    { id: 'w4', from: { partId: 'uno1', pinId: 'A4' }, to: { partId: 'lcd1', pinId: 'SDA' }, color: '#0aa' },
    { id: 'w5', from: { partId: 'uno1', pinId: 'A5' }, to: { partId: 'lcd1', pinId: 'SCL' }, color: '#a0a' },
  ];
  sim.setCircuit(parts, wires, PART_MANIFEST_MAP);
  sim.setRunning(true);

  let snap;
  // LiquidCrystal_I2C@1.1.2 init() calls delay(50) + delay(1000) before returning; run ~1.3s AVR time
  for (let i = 0; i < 13; i++) snap = sim.stepCycles(1_600_000);

  assert.match(serial, /CM=(4[0-4])/, `Expected ~42cm ultrasonic reading, got: ${serial}`);
  assert.ok(
    snap!.servoAngles.srv1 >= 130 && snap!.servoAngles.srv1 <= 140,
    `Expected Servo angle ~135°, got ${snap!.servoAngles.srv1}°`
  );
  assert.equal(snap!.lcdDisplays.lcd1.backlight, true);
  assert.ok(
    snap!.lcdDisplays.lcd1.rows[0].startsWith('ArduSim LCD'),
    `Expected LCD row 0 "ArduSim LCD", got "${snap!.lcdDisplays.lcd1.rows[0]}"`
  );
  assert.match(
    snap!.lcdDisplays.lcd1.rows[1],
    /Dist:4[0-4]cm/,
    `Expected LCD row 1 distance, got "${snap!.lcdDisplays.lcd1.rows[1]}"`
  );
});

test('DHT22 sensor responds accurately to official Adafruit DHT.h library', async () => {
  const compiler = new CompilerService();
  const sketch = `
#include <DHT.h>
DHT dht(4, DHT22);
void setup() {
  Serial.begin(9600);
  dht.begin();
}
void loop() {
  float h = dht.readHumidity();
  float t = dht.readTemperature();
  Serial.print("T=");
  Serial.print(t, 1);
  Serial.print(" H=");
  Serial.println(h, 1);
  delay(200);
}
`;
  const { hex } = await compiler.compile('arduino-uno', sketch);
  let serial = '';
  const sim = new AvrSimulator(hex, {
    board: 'arduino-uno',
    onSerialByte: (b) => {
      serial += String.fromCharCode(b);
    },
  });
  const parts = [
    { id: 'uno1', type: 'arduino-uno', x: 0, y: 0, rotation: 0 as const, props: {} },
    { id: 'dht1', type: 'dht22', x: 0, y: 0, rotation: 0 as const, props: { model: 'DHT22', tempC: 27.5, humidityPct: 64.0 } },
  ];
  const wires = [
    { id: 'w1', from: { partId: 'uno1', pinId: '4' }, to: { partId: 'dht1', pinId: 'DATA' }, color: '#0a0' },
  ];
  sim.setCircuit(parts, wires, PART_MANIFEST_MAP);
  sim.setRunning(true);

  // Adafruit DHT.h enforces 2000ms min interval after begin(); run ~2.3s AVR time (~22M cycles)
  for (let i = 0; i < 23; i++) sim.stepCycles(1_600_000);
  assert.ok(serial.includes('T=27.5 H=64.0'), `Expected DHT22 reading T=27.5 H=64.0, got: ${serial}`);
});

test('OLED SSD1306 renders pixels via Adafruit_SSD1306 over hardware I2C', async () => {
  const compiler = new CompilerService();
  const sketch = `
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
Adafruit_SSD1306 display(128, 64, &Wire, -1);
void setup() {
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  display.clearDisplay();
  display.fillRect(10, 10, 20, 20, SSD1306_WHITE);
  display.display();
}
void loop() { delay(100); }
`;
  const { hex } = await compiler.compile('arduino-uno', sketch);
  const sim = new AvrSimulator(hex, { board: 'arduino-uno' });
  const parts = [
    { id: 'uno1', type: 'arduino-uno', x: 0, y: 0, rotation: 0 as const, props: {} },
    { id: 'oled1', type: 'oled-ssd1306', x: 0, y: 0, rotation: 0 as const, props: { i2cAddress: 0x3c } },
  ];
  const wires = [
    { id: 'w1', from: { partId: 'uno1', pinId: 'A4' }, to: { partId: 'oled1', pinId: 'SDA' }, color: '#0aa' },
    { id: 'w2', from: { partId: 'uno1', pinId: 'A5' }, to: { partId: 'oled1', pinId: 'SCL' }, color: '#a0a' },
  ];
  sim.setCircuit(parts, wires, PART_MANIFEST_MAP);
  sim.setRunning(true);

  let snap;
  for (let i = 0; i < 15; i++) snap = sim.stepCycles(320_000);
  const oled = snap!.oledDisplays.oled1;
  assert.equal(oled.displayOn, true, 'OLED display must turn ON');
  const litBytes = oled.buffer.filter((b) => b !== 0).length;
  assert.ok(litBytes >= 40, `Expected filled 20x20 rect to light >=40 GDDRAM bytes, got ${litBytes}`);
});
