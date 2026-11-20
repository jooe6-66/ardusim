import assert from 'node:assert/strict';
import test from 'node:test';
import { AvrSimulator } from '@ardusim/sim-core';
import { PART_MANIFEST_MAP } from '@ardusim/parts';
import { CompilerService } from '../src/runner.js';

test('RFID RC522 reads virtual card UID using official MFRC522 library over hardware SPI', async () => {
  const compiler = new CompilerService();
  const sketch = `
#include <SPI.h>
#include <MFRC522.h>

MFRC522 rfid(10, 9);

void setup() {
  Serial.begin(9600);
  SPI.begin();
  rfid.PCD_Init();
  Serial.print("VER=");
  Serial.println(rfid.PCD_ReadRegister(MFRC522::VersionReg), HEX);
}

void loop() {
  if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
    Serial.print("UID=");
    for (byte i = 0; i < rfid.uid.size; i++) {
      if (rfid.uid.uidByte[i] < 0x10) Serial.print("0");
      Serial.print(rfid.uid.uidByte[i], HEX);
    }
    Serial.println();
    delay(200);
  }
  delay(20);
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
    { id: 'rf1', type: 'rfid-rc522', x: 0, y: 0, rotation: 0 as const, props: { cardPresent: true, uid: 'CAFEBABE' } },
  ];
  const wires = [
    { id: 'w1', from: { partId: 'uno1', pinId: '10' }, to: { partId: 'rf1', pinId: 'SDA' }, color: '#00c' },
    { id: 'w2', from: { partId: 'uno1', pinId: '13' }, to: { partId: 'rf1', pinId: 'SCK' }, color: '#0a0' },
    { id: 'w3', from: { partId: 'uno1', pinId: '11' }, to: { partId: 'rf1', pinId: 'MOSI' }, color: '#c00' },
    { id: 'w4', from: { partId: 'uno1', pinId: '12' }, to: { partId: 'rf1', pinId: 'MISO' }, color: '#d90' },
    { id: 'w5', from: { partId: 'uno1', pinId: '9' }, to: { partId: 'rf1', pinId: 'RST' }, color: '#808' },
  ];
  sim.setCircuit(parts, wires, PART_MANIFEST_MAP);
  sim.setRunning(true);

  for (let i = 0; i < 12; i++) sim.stepCycles(160_000);
  assert.ok(serial.includes('VER=92'), `Expected MFRC522 VersionReg 0x92, got: ${serial}`);
  assert.ok(serial.includes('UID=CAFEBABE'), `Expected scanned UID CAFEBABE, got: ${serial}`);
});

test('NeoPixel WS2812B 8-LED strip decodes Adafruit_NeoPixel colors accurately', async () => {
  const compiler = new CompilerService();
  const sketch = `
#include <Adafruit_NeoPixel.h>
Adafruit_NeoPixel strip(8, 6, NEO_GRB + NEO_KHZ800);
void setup() {
  strip.begin();
  strip.setPixelColor(0, strip.Color(255, 0, 0));
  strip.setPixelColor(3, strip.Color(0, 200, 50));
  strip.setPixelColor(7, strip.Color(10, 20, 255));
  strip.show();
}
void loop() { delay(50); }
`;
  const { hex } = await compiler.compile('arduino-uno', sketch);
  const sim = new AvrSimulator(hex, { board: 'arduino-uno' });
  const parts = [
    { id: 'uno1', type: 'arduino-uno', x: 0, y: 0, rotation: 0 as const, props: {} },
    { id: 'np1', type: 'neopixel-strip', x: 0, y: 0, rotation: 0 as const, props: {} },
  ];
  const wires = [
    { id: 'w1', from: { partId: 'uno1', pinId: '6' }, to: { partId: 'np1', pinId: 'DIN' }, color: '#0a0' },
  ];
  sim.setCircuit(parts, wires, PART_MANIFEST_MAP);
  sim.setRunning(true);

  const snap = sim.stepCycles(320_000);
  const px = snap.neoPixelStrips.np1;
  assert.deepEqual(px[0], [255, 0, 0]);
  assert.deepEqual(px[3], [0, 200, 50]);
  assert.deepEqual(px[7], [10, 20, 255]);
});

test('MAX7219 8x8 Matrix (LedControl), Stepper.h, DS3231 RTC (RTClib), and MPU6050 work end-to-end', async () => {
  const compiler = new CompilerService();
  const sketch = `
#include <Wire.h>
#include <LedControl.h>
#include <Stepper.h>
#include <RTClib.h>

LedControl lc = LedControl(11, 13, 10, 1);
Stepper stepper(200, 2, 3, 4, 5);
RTC_DS3231 rtc;

void setup() {
  Serial.begin(9600);
  Wire.begin();
  lc.shutdown(0, false);
  lc.setRow(0, 0, B10101010);
  lc.setRow(0, 7, B11110000);

  stepper.setSpeed(120);
  stepper.step(10);

  if (rtc.begin()) {
    DateTime now = rtc.now();
    Serial.print("RTC_YR=");
    Serial.println(now.year());
  }

  // Read MPU6050 WHO_AM_I at 0x69
  Wire.beginTransmission(0x69);
  Wire.write(0x75);
  Wire.endTransmission(false);
  Wire.requestFrom(0x69, 1);
  if (Wire.available()) {
    Serial.print("MPU=");
    Serial.println(Wire.read(), HEX);
  }
}
void loop() { delay(50); }
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
    { id: 'mx1', type: 'max7219', x: 0, y: 0, rotation: 0 as const, props: {} },
    { id: 'st1', type: 'stepper', x: 0, y: 0, rotation: 0 as const, props: { stepsPerRev: 200 } },
    { id: 'rtc1', type: 'ds3231-rtc', x: 0, y: 0, rotation: 0 as const, props: {} },
    { id: 'imu1', type: 'mpu6050', x: 0, y: 0, rotation: 0 as const, props: { i2cAddress: 0x69, pitchDeg: 30, rollDeg: 0 } },
  ];
  const wires = [
    { id: 'w1', from: { partId: 'uno1', pinId: '11' }, to: { partId: 'mx1', pinId: 'DIN' }, color: '#0a0' },
    { id: 'w2', from: { partId: 'uno1', pinId: '13' }, to: { partId: 'mx1', pinId: 'CLK' }, color: '#00c' },
    { id: 'w3', from: { partId: 'uno1', pinId: '10' }, to: { partId: 'mx1', pinId: 'CS' }, color: '#c00' },
    { id: 'w4', from: { partId: 'uno1', pinId: '2' }, to: { partId: 'st1', pinId: 'IN1' }, color: '#111' },
    { id: 'w5', from: { partId: 'uno1', pinId: '3' }, to: { partId: 'st1', pinId: 'IN2' }, color: '#222' },
    { id: 'w6', from: { partId: 'uno1', pinId: '4' }, to: { partId: 'st1', pinId: 'IN3' }, color: '#333' },
    { id: 'w7', from: { partId: 'uno1', pinId: '5' }, to: { partId: 'st1', pinId: 'IN4' }, color: '#444' },
    { id: 'w8', from: { partId: 'uno1', pinId: 'A4' }, to: { partId: 'rtc1', pinId: 'SDA' }, color: '#0aa' },
    { id: 'w9', from: { partId: 'uno1', pinId: 'A5' }, to: { partId: 'rtc1', pinId: 'SCL' }, color: '#a0a' },
    { id: 'w10', from: { partId: 'uno1', pinId: 'A4' }, to: { partId: 'imu1', pinId: 'SDA' }, color: '#0aa' },
    { id: 'w11', from: { partId: 'uno1', pinId: 'A5' }, to: { partId: 'imu1', pinId: 'SCL' }, color: '#a0a' },
  ];
  sim.setCircuit(parts, wires, PART_MANIFEST_MAP);
  sim.setRunning(true);

  let snap;
  for (let i = 0; i < 12; i++) snap = sim.stepCycles(320_000);
  assert.equal(snap!.max7219Displays.mx1.active, true);
  assert.equal(snap!.max7219Displays.mx1.rows[0], 0b10101010);
  assert.equal(snap!.max7219Displays.mx1.rows[7], 0b11110000);
  assert.ok(snap!.stepperStates.st1.steps >= 8, `Expected stepper to step >=8, got ${snap!.stepperStates.st1.steps}`);
  assert.match(serial, /RTC_YR=20\d\d/, `Expected DS3231 RTC year, got: ${serial}`);
  assert.ok(serial.includes('MPU=68'), `Expected MPU6050 WHO_AM_I=68, got: ${serial}`);
});

test('GPS NEO-6M emits valid NMEA sentence over SoftwareSerial 9600 baud', async () => {
  const compiler = new CompilerService();
  const sketch = `
#include <SoftwareSerial.h>
SoftwareSerial gps(8, 9);
void setup() {
  Serial.begin(9600);
  gps.begin(9600);
}
void loop() {
  while (gps.available()) {
    Serial.write(gps.read());
  }
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
    { id: 'gps1', type: 'gps-neo6m', x: 0, y: 0, rotation: 0 as const, props: { lat: -6.2088, lon: 106.8456 } },
  ];
  const wires = [
    { id: 'w1', from: { partId: 'gps1', pinId: 'TX' }, to: { partId: 'uno1', pinId: '8' }, color: '#0a0' },
  ];
  sim.setCircuit(parts, wires, PART_MANIFEST_MAP);
  sim.setRunning(true);

  // Run ~120ms AVR time (enough for ~70-char NMEA sentence at 9600 baud = ~73ms)
  for (let i = 0; i < 12; i++) sim.stepCycles(160_000);
  assert.ok(serial.includes('$GPRMC,') && serial.includes(',S,') && serial.includes(',E,'), `Expected valid NMEA sentence from GPS, got: ${JSON.stringify(serial)}`);
});
