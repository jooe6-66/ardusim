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
    description: {
      id: 'Papan proyek 30 kolom dengan rel daya atas dan bawah',
      en: '30-column solderless breadboard with top and bottom power rails',
    },
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
    description: {
      id: 'Hambatan kustom (Ω, kΩ, MΩ) dengan kode warna 4 pita otomatis',
      en: 'Custom resistance (Ω, kΩ, MΩ) with automatic 4-band color code',
    },
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
    description: {
      id: 'Kapasitansi kustom (pF, nF, µF, mF) tipe keramik atau elektrolit',
      en: 'Custom capacitance (pF, nF, µF, mF), ceramic or electrolytic',
    },
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
    description: {
      id: 'Penyearah searah: 1N4007, Schottky 1N5819, Zener, atau Vf kustom',
      en: 'Unidirectional diode: 1N4007, 1N5819 Schottky, Zener, or custom Vf',
    },
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
    description: {
      id: 'Sakelar taktil 4 kaki (tekan sesaat atau kunci tahan untuk layar sentuh)',
      en: '4-pin tactile switch (momentary press or latch hold for touchscreens)',
    },
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
    description: {
      id: 'Pembagi tegangan putar untuk input analog (nilai kustom)',
      en: 'Rotary voltage divider for analog input (custom resistance)',
    },
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
    description: {
      id: 'Matriks 16 tombol (1-9, 0, A-D, *, #) dengan 4 baris dan 4 kolom',
      en: '16-key membrane keypad (1-9, 0, A-D, *, #) across R1-R4 & C1-C4',
    },
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
    description: {
      id: 'Sensor jarak 2-400 cm (TRIG/ECHO mikrodetik untuk pulseIn)',
      en: '2-400 cm distance sensor (microsecond TRIG/ECHO for pulseIn)',
    },
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
    description: {
      id: 'Sensor suhu & kelembapan 1-wire (kompatibel library DHT.h)',
      en: 'Single-wire temperature & humidity sensor (DHT.h compatible)',
    },
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
    description: {
      id: 'Deteksi gerakan inframerah (OUT HIGH 5V saat aktif)',
      en: 'Passive infrared motion detector (drives OUT HIGH 5V when triggered)',
    },
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
    description: {
      id: 'Hambatan berubah sesuai cahaya (lux), pasang dengan resistor sebagai pembagi tegangan',
      en: 'Light-dependent resistor (lux slider), pair with a resistor as voltage divider',
    },
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
    description: {
      id: 'Output analog linear 10 mV/°C ke pin A0-A15',
      en: 'Linear analog output 10 mV/°C directly to A0-A15',
    },
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
    description: {
      id: 'Deteksi asap/gas dengan output analog (AOUT) dan ambang digital (DOUT)',
      en: 'Smoke/gas sensor with analog voltage (AOUT) and threshold digital (DOUT)',
    },
    defaultProps: { gasPct: 18, thresholdPct: 50 },
    pins: [
      { id: 'VCC', label: 'VCC', x: 18, y: 72, type: 'power', exitDir: 'down' },
      { id: 'GND', label: 'GND', x: 30, y: 72, type: 'gnd', exitDir: 'down' },
      { id: 'DOUT', label: 'DO', x: 42, y: 72, type: 'digital', exitDir: 'down' },
      { id: 'AOUT', label: 'AO', x: 54, y: 72, type: 'analog', exitDir: 'down' },
    ],
  },
  // --- DISPLAYS ---
  {
    type: 'lcd-1602-i2c',
    category: 'display',
    width: 196,
    height: 92,
    name: { id: 'LCD 16x2 I2C', en: 'LCD 16x2 I2C' },
    description: {
      id: 'Layar karakter 16x2 PCF8574 alamat 0x27/0x3F (LiquidCrystal_I2C)',
      en: '16x2 character display via PCF8574 I2C 0x27/0x3F (LiquidCrystal_I2C)',
    },
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
    description: {
      id: 'Layar grafis I2C 128x64 alamat 0x3C (Adafruit_SSD1306)',
      en: '128x64 monochrome I2C graphic OLED at 0x3C (Adafruit_SSD1306)',
    },
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
    description: {
      id: 'Layar angka 7 segmen (a-g, dp) pilih Common Cathode atau Anode',
      en: 'Single-digit 7-segment display (a-g, dp), Common Cathode or Anode',
    },
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
    description: {
      id: 'Indikator cahaya dengan deteksi arus berlebih (pilih warna)',
      en: 'Light-emitting diode with current limiting check and color options',
    },
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
    description: {
      id: 'LED 3 warna (R, G, B) dengan pencampuran PWM Common Cathode / Anode',
      en: '3-channel R/G/B LED with PWM color mixing (Common Cathode / Anode)',
    },
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
    description: {
      id: 'Penghasil nada dari tone() atau gelombang digital (indikator Hz)',
      en: 'Audio transducer driven by tone() or digital waves (live Hz meter)',
    },
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
    description: {
      id: 'Sakelar elektromagnetik SPDT (COM, NO, NC) aktif HIGH atau LOW',
      en: 'SPDT electromechanical relay (COM, NO, NC), active HIGH or LOW',
    },
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
    description: {
      id: 'Motor servo 0-180° (kompatibel penuh library Servo.h)',
      en: '0-180° rotary servo motor (full Servo.h compatibility)',
    },
    defaultProps: {},
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
    description: {
      id: 'Motor DC dua arah (CW/CCW) dengan pembacaan tegangan dan RPM',
      en: 'Bidirectional DC motor (CW/CCW) with live terminal voltage and RPM',
    },
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
    description: {
      id: 'Modul jam waktu nyata I2C alamat 0x68 (kompatibel RTClib)',
      en: 'Real-time clock module over I2C at 0x68 (RTClib compatible)',
    },
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
    description: {
      id: 'Akselerometer & giroskop 6-sumbu I2C (0x68/0x69) dengan slider pitch/roll',
      en: '6-axis accelerometer & gyroscope over I2C (0x68/0x69) with pitch/roll sliders',
    },
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
    description: {
      id: 'Layar dot-matrix 8x8 merah (kompatibel SPI & LedControl)',
      en: '8x8 red dot-matrix display (hardware SPI & LedControl compatible)',
    },
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
    description: {
      id: '8 LED RGB WS2812B 1-kabel (kompatibel Adafruit_NeoPixel)',
      en: '8 addressable WS2812B RGB LEDs (Adafruit_NeoPixel compatible)',
    },
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
    description: {
      id: 'Pembaca kartu RFID 13.56 MHz SPI (kompatibel MFRC522) dengan kartu UID virtual',
      en: '13.56 MHz SPI RFID reader (MFRC522 compatible) with tap-to-scan virtual card UID',
    },
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
    description: {
      id: 'Motor stepper 4 kumparan IN1-IN4 (kompatibel Stepper.h bawaan Arduino)',
      en: '4-phase IN1-IN4 stepper motor (compatible with built-in Arduino Stepper.h)',
    },
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
    description: {
      id: 'Modul GPS NMEA-0183 9600 baud (SoftwareSerial / Serial1) dengan koordinat kustom',
      en: '9600-baud NMEA-0183 GPS module (SoftwareSerial / Serial1) with custom lat/lon',
    },
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
    description: {
      id: 'Transceiver serial Bluetooth 9600 baud dengan terminal kirim/terima di Properti',
      en: '9600-baud Bluetooth UART transceiver with interactive terminal in Inspector',
    },
    defaultProps: {},
    pins: [
      { id: 'VCC', label: 'VCC', x: 30, y: 68, type: 'power', exitDir: 'down' },
      { id: 'GND', label: 'GND', x: 42, y: 68, type: 'gnd', exitDir: 'down' },
      { id: 'TXD', label: 'TXD', x: 54, y: 68, type: 'uart', exitDir: 'down' },
      { id: 'RXD', label: 'RXD', x: 66, y: 68, type: 'uart', exitDir: 'down' },
    ],
  },
];

export const PART_MANIFEST_MAP: Map<string, PartManifest> = new Map(
  PART_CATALOG.map((manifest) => [manifest.type, manifest])
);
