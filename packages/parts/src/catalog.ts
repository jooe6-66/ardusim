import { PartManifest, PinDef } from '@ardusim/sim-core';
import { MCU_BOARD_MANIFESTS } from './boards.js';

function buildBreadboardPins(): PinDef[] {
  const pins: PinDef[] = [];
  for (let g = 0; g < 5; g++) {
    for (let i = 0; i < 5; i++) {
      const idx = g * 5 + i + 1;
      const x = 36 + g * 72 + i * 12;
      pins.push({ id: `tp${idx}`, label: `+${idx}`, type: 'power', x, y: 16, exitDir: 'up' });
      pins.push({ id: `tn${idx}`, label: `-${idx}`, type: 'gnd', x, y: 28, exitDir: 'up' });
      pins.push({ id: `bp${idx}`, label: `+${idx}`, type: 'power', x, y: 186, exitDir: 'down' });
      pins.push({ id: `bn${idx}`, label: `-${idx}`, type: 'gnd', x, y: 198, exitDir: 'down' });
    }
  }
  const upperRows = ['a', 'b', 'c', 'd', 'e'];
  const lowerRows = ['f', 'g', 'h', 'i', 'j'];
  for (let col = 1; col <= 30; col++) {
    const x = 24 + (col - 1) * 12;
    upperRows.forEach((r, ri) => {
      pins.push({ id: `${r}${col}`, label: `${r}${col}`, type: 'breadboard', x, y: 50 + ri * 12 });
    });
    lowerRows.forEach((r, ri) => {
      pins.push({ id: `${r}${col}`, label: `${r}${col}`, type: 'breadboard', x, y: 116 + ri * 12 });
    });
  }
  return pins;
}

export const PART_CATALOG: PartManifest[] = [
  ...MCU_BOARD_MANIFESTS,
  {
    type: 'breadboard-half',
    category: 'breadboard',
    width: 396,
    height: 214,
    name: { id: 'Breadboard (Half)', en: 'Breadboard (Half)' },
    defaultProps: {},
    pins: buildBreadboardPins(),
  },
  // --- PASSIVE COMPONENTS ---
  {
    type: 'resistor',
    category: 'passive',
    width: 84,
    height: 28,
    name: { id: 'Resistor', en: 'Resistor' },
    defaultProps: { value: 220, unit: 'ohm' },
    pins: [
      { id: '1', label: 'Pin 1', x: 6, y: 14, type: 'passive', exitDir: 'left' },
      { id: '2', label: 'Pin 2', x: 78, y: 14, type: 'passive', exitDir: 'right' },
    ],
  },
  {
    type: 'capacitor',
    category: 'passive',
    width: 60,
    height: 52,
    name: { id: 'Kapasitor', en: 'Capacitor' },
    defaultProps: { value: 100, unit: 'uf', kind: 'electrolytic' },
    pins: [
      { id: '1', label: '+', x: 18, y: 48, type: 'passive', exitDir: 'down' },
      { id: '2', label: '-', x: 42, y: 48, type: 'passive', exitDir: 'down' },
    ],
  },
  {
    type: 'diode',
    category: 'passive',
    width: 84,
    height: 28,
    name: { id: 'Dioda', en: 'Diode' },
    defaultProps: { model: '1N4007', vf: 0.7, zenerVz: 3.3 },
    pins: [
      { id: 'A', label: 'Anoda (+)', x: 6, y: 14, type: 'passive', exitDir: 'left' },
      { id: 'C', label: 'Katoda (-)', x: 78, y: 14, type: 'passive', exitDir: 'right' },
    ],
  },
  // --- INPUTS ---
  {
    type: 'pushbutton',
    category: 'input',
    width: 56,
    height: 56,
    name: { id: 'Tombol Tekan', en: 'Pushbutton' },
    defaultProps: { color: 'teal', locked: false },
    pins: [
      { id: '1a', label: '1a', x: 10, y: 10, type: 'passive', exitDir: 'up' },
      { id: '2a', label: '2a', x: 46, y: 10, type: 'passive', exitDir: 'up' },
      { id: '1b', label: '1b', x: 10, y: 46, type: 'passive', exitDir: 'down' },
      { id: '2b', label: '2b', x: 46, y: 46, type: 'passive', exitDir: 'down' },
    ],
  },
  {
    type: 'potentiometer',
    category: 'input',
    width: 64,
    height: 68,
    name: { id: 'Potensiometer', en: 'Potentiometer' },
    defaultProps: { value: 10, unit: 'kohm', position: 0.5 },
    pins: [
      { id: 'GND', label: 'GND', x: 20, y: 64, type: 'gnd', exitDir: 'down' },
      { id: 'SIG', label: 'SIG', x: 32, y: 64, type: 'analog', exitDir: 'down' },
      { id: 'VCC', label: 'VCC', x: 44, y: 64, type: 'power', exitDir: 'down' },
    ],
  },
  {
    type: 'keypad-4x4',
    category: 'input',
    width: 116,
    height: 132,
    name: { id: 'Keypad 4x4', en: '4x4 Matrix Keypad' },
    defaultProps: { activeKey: '' },
    pins: [
      { id: 'R1', label: 'R1', x: 16, y: 126, type: 'digital', exitDir: 'down' },
      { id: 'R2', label: 'R2', x: 28, y: 126, type: 'digital', exitDir: 'down' },
      { id: 'R3', label: 'R3', x: 40, y: 126, type: 'digital', exitDir: 'down' },
      { id: 'R4', label: 'R4', x: 52, y: 126, type: 'digital', exitDir: 'down' },
      { id: 'C1', label: 'C1', x: 64, y: 126, type: 'digital', exitDir: 'down' },
      { id: 'C2', label: 'C2', x: 76, y: 126, type: 'digital', exitDir: 'down' },
      { id: 'C3', label: 'C3', x: 88, y: 126, type: 'digital', exitDir: 'down' },
      { id: 'C4', label: 'C4', x: 100, y: 126, type: 'digital', exitDir: 'down' },
    ],
  },
  // --- SENSORS ---
  {
    type: 'hc-sr04',
    category: 'sensor',
    width: 116,
    height: 64,
    name: { id: 'Ultrasonik HC-SR04', en: 'HC-SR04 Ultrasonic' },
    defaultProps: { distanceCm: 45 },
    pins: [
      { id: 'VCC', label: 'VCC', x: 40, y: 60, type: 'power', exitDir: 'down' },
      { id: 'TRIG', label: 'TRIG', x: 52, y: 60, type: 'digital', exitDir: 'down' },
      { id: 'ECHO', label: 'ECHO', x: 64, y: 60, type: 'digital', exitDir: 'down' },
      { id: 'GND', label: 'GND', x: 76, y: 60, type: 'gnd', exitDir: 'down' },
    ],
  },
  {
    type: 'dht22',
    category: 'sensor',
    width: 68,
    height: 76,
    name: { id: 'Suhu & Lembap DHT22/11', en: 'DHT22 / DHT11 Sensor' },
    defaultProps: { model: 'DHT22', tempC: 27.5, humidityPct: 60 },
    pins: [
      { id: 'VCC', label: 'VCC', x: 22, y: 72, type: 'power', exitDir: 'down' },
      { id: 'DATA', label: 'DATA', x: 34, y: 72, type: 'digital', exitDir: 'down' },
      { id: 'GND', label: 'GND', x: 46, y: 72, type: 'gnd', exitDir: 'down' },
    ],
  },
  {
    type: 'pir',
    category: 'sensor',
    width: 72,
    height: 72,
    name: { id: 'Sensor Gerak PIR', en: 'PIR Motion Sensor' },
    defaultProps: { motion: false },
    pins: [
      { id: 'VCC', label: 'VCC', x: 24, y: 68, type: 'power', exitDir: 'down' },
      { id: 'OUT', label: 'OUT', x: 36, y: 68, type: 'digital', exitDir: 'down' },
      { id: 'GND', label: 'GND', x: 48, y: 68, type: 'gnd', exitDir: 'down' },
    ],
  },
  {
    type: 'ldr',
    category: 'sensor',
    width: 60,
    height: 56,
    name: { id: 'Sensor Cahaya LDR', en: 'LDR Photoresistor' },
    defaultProps: { lux: 300 },
    pins: [
      { id: '1', label: 'Pin 1', x: 24, y: 52, type: 'passive', exitDir: 'down' },
      { id: '2', label: 'Pin 2', x: 36, y: 52, type: 'passive', exitDir: 'down' },
    ],
  },
  {
    type: 'lm35',
    category: 'sensor',
    width: 56,
    height: 58,
    name: { id: 'Sensor Suhu LM35', en: 'LM35 Temperature' },
    defaultProps: { tempC: 28 },
    pins: [
      { id: 'VCC', label: 'VCC', x: 16, y: 54, type: 'power', exitDir: 'down' },
      { id: 'OUT', label: 'OUT', x: 28, y: 54, type: 'analog', exitDir: 'down' },
      { id: 'GND', label: 'GND', x: 40, y: 54, type: 'gnd', exitDir: 'down' },
    ],
  },
  {
    type: 'mq2',
    category: 'sensor',
    width: 72,
    height: 76,
    name: { id: 'Sensor Gas MQ-2', en: 'MQ-2 Gas Sensor' },
    defaultProps: { gasPct: 18, thresholdPct: 50 },
    pins: [
      { id: 'VCC', label: 'VCC', x: 18, y: 72, type: 'power', exitDir: 'down' },
      { id: 'GND', label: 'GND', x: 30, y: 72, type: 'gnd', exitDir: 'down' },
      { id: 'DOUT', label: 'DO', x: 42, y: 72, type: 'digital', exitDir: 'down' },
      { id: 'AOUT', label: 'AO', x: 54, y: 72, type: 'analog', exitDir: 'down' },
    ],
  },
  {
    type: 'ir-obstacle',
    category: 'sensor',
    width: 72,
    height: 84,
    name: { id: 'Sensor Halangan IR', en: 'IR Obstacle Sensor' },
    defaultProps: { distanceCm: 20, thresholdCm: 10 },
    pins: [
      { id: 'VCC', label: 'VCC', x: 18, y: 80, type: 'power', exitDir: 'down' },
      { id: 'GND', label: 'GND', x: 30, y: 80, type: 'gnd', exitDir: 'down' },
      { id: 'OUT', label: 'OUT', x: 42, y: 80, type: 'digital', exitDir: 'down' },
      { id: 'AO', label: 'AO', x: 54, y: 80, type: 'analog', exitDir: 'down' },
    ],
  },
  {
    type: 'soil-moisture',
    category: 'sensor',
    width: 72,
    height: 92,
    name: { id: 'Sensor Kelembapan Tanah', en: 'Soil Moisture Sensor' },
    defaultProps: { moisturePct: 35, thresholdPct: 50 },
    pins: [
      { id: 'VCC', label: 'VCC', x: 18, y: 88, type: 'power', exitDir: 'down' },
      { id: 'GND', label: 'GND', x: 30, y: 88, type: 'gnd', exitDir: 'down' },
      { id: 'AO', label: 'AO', x: 42, y: 88, type: 'analog', exitDir: 'down' },
      { id: 'DO', label: 'DO', x: 54, y: 88, type: 'digital', exitDir: 'down' },
    ],
  },
  {
    type: 'water-level',
    category: 'sensor',
    width: 60,
    height: 92,
    name: { id: 'Sensor Level Air', en: 'Water Level Sensor' },
    defaultProps: { levelPct: 25 },
    pins: [
      { id: 'VCC', label: 'VCC', x: 18, y: 88, type: 'power', exitDir: 'down' },
      { id: 'GND', label: 'GND', x: 30, y: 88, type: 'gnd', exitDir: 'down' },
      { id: 'AO', label: 'S/AO', x: 42, y: 88, type: 'analog', exitDir: 'down' },
    ],
  },
  {
    type: 'rain-sensor',
    category: 'sensor',
    width: 84,
    height: 92,
    name: { id: 'Sensor Hujan', en: 'Raindrop Sensor' },
    defaultProps: { rainPct: 0, thresholdPct: 40 },
    pins: [
      { id: 'VCC', label: 'VCC', x: 24, y: 88, type: 'power', exitDir: 'down' },
      { id: 'GND', label: 'GND', x: 36, y: 88, type: 'gnd', exitDir: 'down' },
      { id: 'AO', label: 'AO', x: 48, y: 88, type: 'analog', exitDir: 'down' },
      { id: 'DO', label: 'DO', x: 60, y: 88, type: 'digital', exitDir: 'down' },
    ],
  },
  // --- DISPLAYS ---
  {
    type: 'lcd-1602-i2c',
    category: 'display',
    width: 196,
    height: 92,
    name: { id: 'LCD 16x2 I2C', en: 'LCD 16x2 I2C' },
    defaultProps: { i2cAddress: 0x27, color: 'green' },
    pins: [
      { id: 'GND', label: 'GND', x: 6, y: 26, type: 'gnd', exitDir: 'left' },
      { id: 'VCC', label: 'VCC', x: 6, y: 38, type: 'power', exitDir: 'left' },
      { id: 'SDA', label: 'SDA', x: 6, y: 50, type: 'i2c', exitDir: 'left' },
      { id: 'SCL', label: 'SCL', x: 6, y: 62, type: 'i2c', exitDir: 'left' },
    ],
  },
  {
    type: 'oled-ssd1306',
    category: 'display',
    width: 156,
    height: 108,
    name: { id: 'OLED SSD1306 (128x64)', en: 'OLED SSD1306 (128x64)' },
    defaultProps: { i2cAddress: 0x3c },
    pins: [
      { id: 'GND', label: 'GND', x: 54, y: 6, type: 'gnd', exitDir: 'up' },
      { id: 'VCC', label: 'VCC', x: 66, y: 6, type: 'power', exitDir: 'up' },
      { id: 'SCL', label: 'SCL', x: 78, y: 6, type: 'i2c', exitDir: 'up' },
      { id: 'SDA', label: 'SDA', x: 90, y: 6, type: 'i2c', exitDir: 'up' },
    ],
  },
  {
    type: 'seven-seg',
    category: 'display',
    width: 72,
    height: 96,
    name: { id: '7-Segment 1 Digit', en: '7-Segment Display' },
    defaultProps: { common: 'cathode' },
    pins: [
      { id: 'g', label: 'g', x: 12, y: 6, type: 'passive', exitDir: 'up' },
      { id: 'f', label: 'f', x: 24, y: 6, type: 'passive', exitDir: 'up' },
      { id: 'COM', label: 'COM', x: 36, y: 6, type: 'passive', exitDir: 'up' },
      { id: 'a', label: 'a', x: 48, y: 6, type: 'passive', exitDir: 'up' },
      { id: 'b', label: 'b', x: 60, y: 6, type: 'passive', exitDir: 'up' },
      { id: 'e', label: 'e', x: 12, y: 90, type: 'passive', exitDir: 'down' },
      { id: 'd', label: 'd', x: 24, y: 90, type: 'passive', exitDir: 'down' },
      { id: 'c', label: 'c', x: 48, y: 90, type: 'passive', exitDir: 'down' },
      { id: 'dp', label: 'dp', x: 60, y: 90, type: 'passive', exitDir: 'down' },
    ],
  },
  // --- OUTPUTS & MOTORS ---
  {
    type: 'led',
    category: 'output',
    width: 44,
    height: 58,
    name: { id: 'LED 5mm', en: '5mm LED' },
    defaultProps: { color: 'red' },
    pins: [
      { id: 'A', label: 'Anoda (+)', x: 16, y: 54, type: 'passive', exitDir: 'down' },
      { id: 'C', label: 'Katoda (-)', x: 28, y: 54, type: 'passive', exitDir: 'down' },
    ],
  },
  {
    type: 'rgb-led',
    category: 'output',
    width: 60,
    height: 60,
    name: { id: 'LED RGB', en: 'RGB LED' },
    defaultProps: { common: 'cathode' },
    pins: [
      { id: 'R', label: 'R', x: 12, y: 56, type: 'passive', exitDir: 'down' },
      { id: 'COM', label: 'COM', x: 24, y: 56, type: 'passive', exitDir: 'down' },
      { id: 'G', label: 'G', x: 36, y: 56, type: 'passive', exitDir: 'down' },
      { id: 'B', label: 'B', x: 48, y: 56, type: 'passive', exitDir: 'down' },
    ],
  },
  {
    type: 'buzzer',
    category: 'output',
    width: 60,
    height: 64,
    name: { id: 'Buzzer Piezo', en: 'Piezo Buzzer' },
    defaultProps: {},
    pins: [
      { id: '+', label: '+', x: 24, y: 60, type: 'digital', exitDir: 'down' },
      { id: '-', label: '-', x: 36, y: 60, type: 'gnd', exitDir: 'down' },
    ],
  },
  {
    type: 'relay',
    category: 'output',
    width: 92,
    height: 72,
    name: { id: 'Modul Relay 5V', en: '5V Relay Module' },
    defaultProps: { activeLow: false },
    pins: [
      { id: 'VCC', label: 'VCC', x: 6, y: 20, type: 'power', exitDir: 'left' },
      { id: 'GND', label: 'GND', x: 6, y: 36, type: 'gnd', exitDir: 'left' },
      { id: 'IN', label: 'IN', x: 6, y: 52, type: 'digital', exitDir: 'left' },
      { id: 'NO', label: 'NO', x: 86, y: 20, type: 'passive', exitDir: 'right' },
      { id: 'COM', label: 'COM', x: 86, y: 36, type: 'passive', exitDir: 'right' },
      { id: 'NC', label: 'NC', x: 86, y: 52, type: 'passive', exitDir: 'right' },
    ],
  },
  {
    type: 'servo',
    category: 'motor',
    width: 96,
    height: 76,
    name: { id: 'Servo SG90', en: 'SG90 Micro Servo' },
    defaultProps: {},
    pins: [
      { id: 'GND', label: 'GND', x: 24, y: 72, type: 'gnd', exitDir: 'down' },
      { id: 'VCC', label: 'VCC', x: 36, y: 72, type: 'power', exitDir: 'down' },
      { id: 'SIG', label: 'SIG', x: 48, y: 72, type: 'digital', exitDir: 'down' },
    ],
  },
  {
    type: 'servo-360',
    category: 'motor',
    width: 96,
    height: 76,
    name: { id: 'Servo 360° (Kontinu)', en: '360° Continuous Servo' },
    defaultProps: { maxRpm: 120 },
    pins: [
      { id: 'GND', label: 'GND', x: 24, y: 72, type: 'gnd', exitDir: 'down' },
      { id: 'VCC', label: 'VCC', x: 36, y: 72, type: 'power', exitDir: 'down' },
      { id: 'SIG', label: 'SIG', x: 48, y: 72, type: 'digital', exitDir: 'down' },
    ],
  },
  {
    type: 'dc-motor',
    category: 'motor',
    width: 84,
    height: 76,
    name: { id: 'Motor DC', en: 'DC Motor' },
    defaultProps: {},
    pins: [
      { id: '+', label: '+', x: 30, y: 72, type: 'passive', exitDir: 'down' },
      { id: '-', label: '-', x: 54, y: 72, type: 'passive', exitDir: 'down' },
    ],
  },
  // --- PHASE 3: SPI, I2C, UART & ADDRESSABLE PERIPHERALS ---
  {
    type: 'ds3231-rtc',
    category: 'sensor',
    width: 84,
    height: 72,
    name: { id: 'RTC DS3231 (I2C)', en: 'DS3231 RTC (I2C)' },
    defaultProps: {},
    pins: [
      { id: 'GND', label: 'GND', x: 6, y: 18, type: 'gnd', exitDir: 'left' },
      { id: 'VCC', label: 'VCC', x: 6, y: 30, type: 'power', exitDir: 'left' },
      { id: 'SDA', label: 'SDA', x: 6, y: 42, type: 'i2c', exitDir: 'left' },
      { id: 'SCL', label: 'SCL', x: 6, y: 54, type: 'i2c', exitDir: 'left' },
    ],
  },
  {
    type: 'mpu6050',
    category: 'sensor',
    width: 88,
    height: 68,
    name: { id: 'IMU MPU6050 (I2C)', en: 'MPU6050 IMU (I2C)' },
    defaultProps: { i2cAddress: 0x68, pitchDeg: 0, rollDeg: 0, tempC: 25 },
    pins: [
      { id: 'VCC', label: 'VCC', x: 26, y: 64, type: 'power', exitDir: 'down' },
      { id: 'GND', label: 'GND', x: 38, y: 64, type: 'gnd', exitDir: 'down' },
      { id: 'SCL', label: 'SCL', x: 50, y: 64, type: 'i2c', exitDir: 'down' },
      { id: 'SDA', label: 'SDA', x: 62, y: 64, type: 'i2c', exitDir: 'down' },
    ],
  },
  {
    type: 'max7219',
    category: 'display',
    width: 112,
    height: 112,
    name: { id: 'Matriks LED 8x8 MAX7219', en: 'MAX7219 8x8 LED Matrix' },
    defaultProps: {},
    pins: [
      { id: 'VCC', label: 'VCC', x: 6, y: 32, type: 'power', exitDir: 'left' },
      { id: 'GND', label: 'GND', x: 6, y: 44, type: 'gnd', exitDir: 'left' },
      { id: 'DIN', label: 'DIN', x: 6, y: 56, type: 'spi', exitDir: 'left' },
      { id: 'CS', label: 'CS', x: 6, y: 68, type: 'spi', exitDir: 'left' },
      { id: 'CLK', label: 'CLK', x: 6, y: 80, type: 'spi', exitDir: 'left' },
    ],
  },
  {
    type: 'neopixel-strip',
    category: 'output',
    width: 192,
    height: 44,
    name: { id: 'NeoPixel Strip (8 LED)', en: 'NeoPixel Strip (8 LEDs)' },
    defaultProps: {},
    pins: [
      { id: 'VCC', label: '5V', x: 6, y: 10, type: 'power', exitDir: 'left' },
      { id: 'DIN', label: 'DIN', x: 6, y: 22, type: 'digital', exitDir: 'left' },
      { id: 'GND', label: 'GND', x: 6, y: 34, type: 'gnd', exitDir: 'left' },
    ],
  },
  {
    type: 'rfid-rc522',
    category: 'sensor',
    width: 108,
    height: 116,
    name: { id: 'RFID RC522 (SPI)', en: 'RC522 RFID Reader (SPI)' },
    defaultProps: { cardPresent: false, uid: 'DEADBEEF' },
    pins: [
      { id: 'SDA', label: 'SS', x: 18, y: 112, type: 'spi', exitDir: 'down' },
      { id: 'SCK', label: 'SCK', x: 30, y: 112, type: 'spi', exitDir: 'down' },
      { id: 'MOSI', label: 'MOSI', x: 42, y: 112, type: 'spi', exitDir: 'down' },
      { id: 'MISO', label: 'MISO', x: 54, y: 112, type: 'spi', exitDir: 'down' },
      { id: 'GND', label: 'GND', x: 66, y: 112, type: 'gnd', exitDir: 'down' },
      { id: 'RST', label: 'RST', x: 78, y: 112, type: 'digital', exitDir: 'down' },
      { id: '3.3V', label: '3.3V', x: 90, y: 112, type: 'power', exitDir: 'down' },
    ],
  },
  {
    type: 'stepper',
    category: 'motor',
    width: 96,
    height: 92,
    name: { id: 'Motor Stepper 4-Fase', en: '4-Wire Stepper Motor' },
    defaultProps: { stepsPerRev: 200 },
    pins: [
      { id: 'IN1', label: 'IN1', x: 30, y: 88, type: 'digital', exitDir: 'down' },
      { id: 'IN2', label: 'IN2', x: 42, y: 88, type: 'digital', exitDir: 'down' },
      { id: 'IN3', label: 'IN3', x: 54, y: 88, type: 'digital', exitDir: 'down' },
      { id: 'IN4', label: 'IN4', x: 66, y: 88, type: 'digital', exitDir: 'down' },
    ],
  },
  {
    type: 'gps-neo6m',
    category: 'sensor',
    width: 96,
    height: 76,
    name: { id: 'GPS NEO-6M (UART)', en: 'NEO-6M GPS (UART)' },
    defaultProps: { lat: -6.2088, lon: 106.8456, speedKnots: 1.5 },
    pins: [
      { id: 'VCC', label: 'VCC', x: 30, y: 72, type: 'power', exitDir: 'down' },
      { id: 'RX', label: 'RX', x: 42, y: 72, type: 'uart', exitDir: 'down' },
      { id: 'TX', label: 'TX', x: 54, y: 72, type: 'uart', exitDir: 'down' },
      { id: 'GND', label: 'GND', x: 66, y: 72, type: 'gnd', exitDir: 'down' },
    ],
  },
  {
    type: 'hc-05',
    category: 'sensor',
    width: 96,
    height: 72,
    name: { id: 'Bluetooth HC-05 (UART)', en: 'HC-05 Bluetooth (UART)' },
    defaultProps: {},
    pins: [
      { id: 'VCC', label: 'VCC', x: 30, y: 68, type: 'power', exitDir: 'down' },
      { id: 'GND', label: 'GND', x: 42, y: 68, type: 'gnd', exitDir: 'down' },
      { id: 'TXD', label: 'TXD', x: 54, y: 68, type: 'uart', exitDir: 'down' },
      { id: 'RXD', label: 'RXD', x: 66, y: 68, type: 'uart', exitDir: 'down' },
    ],
  },
  // --- POWER SOURCES, CONVERTERS & MOTOR DRIVERS ---
  {
    type: 'l298n',
    category: 'motor',
    width: 132,
    height: 124,
    name: { id: 'Driver Motor L298N', en: 'L298N Motor Driver' },
    defaultProps: { reg5vEnabled: true },
    pins: [
      { id: 'OUT1', label: 'OUT1', x: 6, y: 36, type: 'passive', exitDir: 'left' },
      { id: 'OUT2', label: 'OUT2', x: 6, y: 56, type: 'passive', exitDir: 'left' },
      { id: 'OUT3', label: 'OUT3', x: 126, y: 36, type: 'passive', exitDir: 'right' },
      { id: 'OUT4', label: 'OUT4', x: 126, y: 56, type: 'passive', exitDir: 'right' },
      { id: '12V', label: '12V', x: 16, y: 118, type: 'power', exitDir: 'down' },
      { id: 'GND', label: 'GND', x: 28, y: 118, type: 'gnd', exitDir: 'down' },
      { id: '5V', label: '5V', x: 40, y: 118, type: 'power', exitDir: 'down' },
      { id: 'ENA', label: 'ENA', x: 58, y: 118, type: 'digital', exitDir: 'down' },
      { id: 'IN1', label: 'IN1', x: 70, y: 118, type: 'digital', exitDir: 'down' },
      { id: 'IN2', label: 'IN2', x: 82, y: 118, type: 'digital', exitDir: 'down' },
      { id: 'IN3', label: 'IN3', x: 94, y: 118, type: 'digital', exitDir: 'down' },
      { id: 'IN4', label: 'IN4', x: 106, y: 118, type: 'digital', exitDir: 'down' },
      { id: 'ENB', label: 'ENB', x: 118, y: 118, type: 'digital', exitDir: 'down' },
    ],
  },
  {
    type: 'buck-lm2596',
    category: 'power',
    width: 124,
    height: 68,
    name: { id: 'Step-Down LM2596', en: 'LM2596 Step-Down (Buck)' },
    defaultProps: { targetVoltage: 5.0 },
    pins: [
      { id: 'IN+', label: 'IN+', x: 6, y: 22, type: 'power', exitDir: 'left' },
      { id: 'IN-', label: 'IN-', x: 6, y: 46, type: 'gnd', exitDir: 'left' },
      { id: 'OUT+', label: 'OUT+', x: 118, y: 22, type: 'power', exitDir: 'right' },
      { id: 'OUT-', label: 'OUT-', x: 118, y: 46, type: 'gnd', exitDir: 'right' },
    ],
  },
  {
    type: 'boost-mt3608',
    category: 'power',
    width: 116,
    height: 64,
    name: { id: 'Step-Up MT3608', en: 'MT3608 Step-Up (Boost)' },
    defaultProps: { targetVoltage: 12.0 },
    pins: [
      { id: 'IN+', label: 'IN+', x: 6, y: 20, type: 'power', exitDir: 'left' },
      { id: 'IN-', label: 'IN-', x: 6, y: 44, type: 'gnd', exitDir: 'left' },
      { id: 'OUT+', label: 'OUT+', x: 110, y: 20, type: 'power', exitDir: 'right' },
      { id: 'OUT-', label: 'OUT-', x: 110, y: 44, type: 'gnd', exitDir: 'right' },
    ],
  },
  {
    type: 'battery-18650',
    category: 'power',
    width: 116,
    height: 64,
    name: { id: 'Baterai 18650', en: '18650 Battery Pack' },
    defaultProps: { cells: 1, voltage: 3.7 },
    pins: [
      { id: '+', label: '+', x: 110, y: 20, type: 'power', exitDir: 'right' },
      { id: '-', label: '-', x: 110, y: 44, type: 'gnd', exitDir: 'right' },
    ],
  },
  {
    type: 'battery-lipo-3s',
    category: 'power',
    width: 124,
    height: 68,
    name: { id: 'Baterai LiPo 3S', en: '3S LiPo Battery (11.1V)' },
    defaultProps: { voltage: 11.1 },
    pins: [
      { id: '+', label: '+', x: 118, y: 22, type: 'power', exitDir: 'right' },
      { id: '-', label: '-', x: 118, y: 46, type: 'gnd', exitDir: 'right' },
    ],
  },
];

export const PART_MANIFEST_MAP: Map<string, PartManifest> = new Map(
  PART_CATALOG.map((manifest) => [manifest.type, manifest])
);
