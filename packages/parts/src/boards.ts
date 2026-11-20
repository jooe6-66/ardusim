import { AvrPortName, PartManifest, PinDef } from '@ardusim/sim-core';

function buildUnoPins(): PinDef[] {
  const topLeft: Array<{ id: string; label: string; type: PinDef['type']; avrPort?: AvrPortName; avrBit?: number; fixedVoltage?: number }> = [
    { id: 'AREF', label: 'AREF', type: 'analog' },
    { id: 'GND.1', label: 'GND', type: 'gnd', fixedVoltage: 0 },
    { id: '13', label: 'D13', type: 'digital', avrPort: 'B', avrBit: 5 },
    { id: '12', label: 'D12', type: 'digital', avrPort: 'B', avrBit: 4 },
    { id: '11', label: 'D11~', type: 'digital', avrPort: 'B', avrBit: 3 },
    { id: '10', label: 'D10~', type: 'digital', avrPort: 'B', avrBit: 2 },
    { id: '9', label: 'D9~', type: 'digital', avrPort: 'B', avrBit: 1 },
    { id: '8', label: 'D8', type: 'digital', avrPort: 'B', avrBit: 0 },
  ];
  const topRight: Array<{ id: string; label: string; type: PinDef['type']; avrPort: AvrPortName; avrBit: number }> = [
    { id: '7', label: 'D7', type: 'digital', avrPort: 'D', avrBit: 7 },
    { id: '6', label: 'D6~', type: 'digital', avrPort: 'D', avrBit: 6 },
    { id: '5', label: 'D5~', type: 'digital', avrPort: 'D', avrBit: 5 },
    { id: '4', label: 'D4', type: 'digital', avrPort: 'D', avrBit: 4 },
    { id: '3', label: 'D3~', type: 'digital', avrPort: 'D', avrBit: 3 },
    { id: '2', label: 'D2', type: 'digital', avrPort: 'D', avrBit: 2 },
    { id: '1', label: 'D1 TX', type: 'uart', avrPort: 'D', avrBit: 1 },
    { id: '0', label: 'D0 RX', type: 'uart', avrPort: 'D', avrBit: 0 },
  ];

  const pins: PinDef[] = [];
  topLeft.forEach((p, idx) => pins.push({ ...p, x: 74 + idx * 12, y: 14, exitDir: 'up' }));
  topRight.forEach((p, idx) => pins.push({ ...p, x: 176 + idx * 12, y: 14, exitDir: 'up' }));

  const bottomPower: Array<{ id: string; label: string; type: PinDef['type']; fixedVoltage?: number }> = [
    { id: 'RESET', label: 'RST', type: 'digital' },
    { id: '3.3V', label: '3.3V', type: 'power', fixedVoltage: 3.3 },
    { id: '5V', label: '5V', type: 'power', fixedVoltage: 5.0 },
    { id: 'GND.2', label: 'GND', type: 'gnd', fixedVoltage: 0 },
    { id: 'GND.3', label: 'GND', type: 'gnd', fixedVoltage: 0 },
    { id: 'VIN', label: 'VIN', type: 'power', fixedVoltage: 5.0 },
  ];
  bottomPower.forEach((p, idx) => pins.push({ ...p, x: 110 + idx * 12, y: 182, exitDir: 'down' }));

  for (let a = 0; a <= 5; a++) {
    pins.push({
      id: `A${a}`,
      label: a === 4 ? 'A4 SDA' : a === 5 ? 'A5 SCL' : `A${a}`,
      type: a >= 4 ? 'i2c' : 'analog',
      avrPort: 'C',
      avrBit: a,
      adcChannel: a,
      x: 200 + a * 12,
      y: 182,
      exitDir: 'down',
    });
  }
  return pins;
}

function buildNanoPins(): PinDef[] {
  // Compact DIP-30 Arduino Nano layout (15 pins top, 15 pins bottom, 12px pitch -> width 228, height 96)
  const topRow: Array<Omit<PinDef, 'x' | 'y' | 'exitDir'>> = [
    { id: '12', label: 'D12', type: 'digital', avrPort: 'B', avrBit: 4 },
    { id: '11', label: 'D11~', type: 'digital', avrPort: 'B', avrBit: 3 },
    { id: '10', label: 'D10~', type: 'digital', avrPort: 'B', avrBit: 2 },
    { id: '9', label: 'D9~', type: 'digital', avrPort: 'B', avrBit: 1 },
    { id: '8', label: 'D8', type: 'digital', avrPort: 'B', avrBit: 0 },
    { id: '7', label: 'D7', type: 'digital', avrPort: 'D', avrBit: 7 },
    { id: '6', label: 'D6~', type: 'digital', avrPort: 'D', avrBit: 6 },
    { id: '5', label: 'D5~', type: 'digital', avrPort: 'D', avrBit: 5 },
    { id: '4', label: 'D4', type: 'digital', avrPort: 'D', avrBit: 4 },
    { id: '3', label: 'D3~', type: 'digital', avrPort: 'D', avrBit: 3 },
    { id: '2', label: 'D2', type: 'digital', avrPort: 'D', avrBit: 2 },
    { id: 'GND.1', label: 'GND', type: 'gnd', fixedVoltage: 0 },
    { id: 'RESET.1', label: 'RST', type: 'digital' },
    { id: '0', label: 'RX0', type: 'uart', avrPort: 'D', avrBit: 0 },
    { id: '1', label: 'TX1', type: 'uart', avrPort: 'D', avrBit: 1 },
  ];
  const bottomRow: Array<Omit<PinDef, 'x' | 'y' | 'exitDir'>> = [
    { id: '13', label: 'D13', type: 'digital', avrPort: 'B', avrBit: 5 },
    { id: '3.3V', label: '3.3V', type: 'power', fixedVoltage: 3.3 },
    { id: 'AREF', label: 'REF', type: 'analog' },
    { id: 'A0', label: 'A0', type: 'analog', avrPort: 'C', avrBit: 0, adcChannel: 0 },
    { id: 'A1', label: 'A1', type: 'analog', avrPort: 'C', avrBit: 1, adcChannel: 1 },
    { id: 'A2', label: 'A2', type: 'analog', avrPort: 'C', avrBit: 2, adcChannel: 2 },
    { id: 'A3', label: 'A3', type: 'analog', avrPort: 'C', avrBit: 3, adcChannel: 3 },
    { id: 'A4', label: 'A4 SDA', type: 'i2c', avrPort: 'C', avrBit: 4, adcChannel: 4 },
    { id: 'A5', label: 'A5 SCL', type: 'i2c', avrPort: 'C', avrBit: 5, adcChannel: 5 },
    { id: 'A6', label: 'A6', type: 'analog', adcChannel: 6 },
    { id: 'A7', label: 'A7', type: 'analog', adcChannel: 7 },
    { id: '5V', label: '5V', type: 'power', fixedVoltage: 5.0 },
    { id: 'RESET.2', label: 'RST', type: 'digital' },
    { id: 'GND.2', label: 'GND', type: 'gnd', fixedVoltage: 0 },
    { id: 'VIN', label: 'VIN', type: 'power', fixedVoltage: 5.0 },
  ];

  const pins: PinDef[] = [];
  topRow.forEach((p, i) => pins.push({ ...p, x: 36 + i * 12, y: 12, exitDir: 'up' }));
  bottomRow.forEach((p, i) => pins.push({ ...p, x: 36 + i * 12, y: 84, exitDir: 'down' }));
  return pins;
}

function buildMegaPins(): PinDef[] {
  // Arduino Mega 2560 (width 432, height 216) - exact port/bit mappings from arduino:avr/variants/mega/pins_arduino.h
  const pins: PinDef[] = [];

  const topPwm1: Array<Omit<PinDef, 'x' | 'y' | 'exitDir'>> = [
    { id: 'AREF', label: 'AREF', type: 'analog' },
    { id: 'GND.1', label: 'GND', type: 'gnd', fixedVoltage: 0 },
    { id: '13', label: 'D13~', type: 'digital', avrPort: 'B', avrBit: 7 },
    { id: '12', label: 'D12~', type: 'digital', avrPort: 'B', avrBit: 6 },
    { id: '11', label: 'D11~', type: 'digital', avrPort: 'B', avrBit: 5 },
    { id: '10', label: 'D10~', type: 'digital', avrPort: 'B', avrBit: 4 },
    { id: '9', label: 'D9~', type: 'digital', avrPort: 'H', avrBit: 6 },
    { id: '8', label: 'D8~', type: 'digital', avrPort: 'H', avrBit: 5 },
  ];
  topPwm1.forEach((p, i) => pins.push({ ...p, x: 70 + i * 12, y: 14, exitDir: 'up' }));

  const topPwm2: Array<Omit<PinDef, 'x' | 'y' | 'exitDir'>> = [
    { id: '7', label: 'D7~', type: 'digital', avrPort: 'H', avrBit: 4 },
    { id: '6', label: 'D6~', type: 'digital', avrPort: 'H', avrBit: 3 },
    { id: '5', label: 'D5~', type: 'digital', avrPort: 'E', avrBit: 3 },
    { id: '4', label: 'D4~', type: 'digital', avrPort: 'G', avrBit: 5 },
    { id: '3', label: 'D3~', type: 'digital', avrPort: 'E', avrBit: 5 },
    { id: '2', label: 'D2~', type: 'digital', avrPort: 'E', avrBit: 4 },
    { id: '1', label: 'TX0', type: 'uart', avrPort: 'E', avrBit: 1 },
    { id: '0', label: 'RX0', type: 'uart', avrPort: 'E', avrBit: 0 },
  ];
  topPwm2.forEach((p, i) => pins.push({ ...p, x: 174 + i * 12, y: 14, exitDir: 'up' }));

  const topComm: Array<Omit<PinDef, 'x' | 'y' | 'exitDir'>> = [
    { id: '14', label: 'TX3', type: 'uart', avrPort: 'J', avrBit: 1 },
    { id: '15', label: 'RX3', type: 'uart', avrPort: 'J', avrBit: 0 },
    { id: '16', label: 'TX2', type: 'uart', avrPort: 'H', avrBit: 1 },
    { id: '17', label: 'RX2', type: 'uart', avrPort: 'H', avrBit: 0 },
    { id: '18', label: 'TX1', type: 'uart', avrPort: 'D', avrBit: 3 },
    { id: '19', label: 'RX1', type: 'uart', avrPort: 'D', avrBit: 2 },
    { id: '20', label: 'SDA 20', type: 'i2c', avrPort: 'D', avrBit: 1 },
    { id: '21', label: 'SCL 21', type: 'i2c', avrPort: 'D', avrBit: 0 },
  ];
  topComm.forEach((p, i) => pins.push({ ...p, x: 278 + i * 12, y: 14, exitDir: 'up' }));

  const bottomPower: Array<Omit<PinDef, 'x' | 'y' | 'exitDir'>> = [
    { id: 'RESET', label: 'RST', type: 'digital' },
    { id: '3.3V', label: '3.3V', type: 'power', fixedVoltage: 3.3 },
    { id: '5V', label: '5V', type: 'power', fixedVoltage: 5.0 },
    { id: 'GND.2', label: 'GND', type: 'gnd', fixedVoltage: 0 },
    { id: 'GND.3', label: 'GND', type: 'gnd', fixedVoltage: 0 },
    { id: 'VIN', label: 'VIN', type: 'power', fixedVoltage: 5.0 },
  ];
  bottomPower.forEach((p, i) => pins.push({ ...p, x: 96 + i * 12, y: 202, exitDir: 'down' }));

  for (let a = 0; a < 8; a++) {
    pins.push({
      id: `A${a}`,
      label: `A${a}`,
      type: 'analog',
      avrPort: 'F',
      avrBit: a,
      adcChannel: a,
      x: 176 + a * 12,
      y: 202,
      exitDir: 'down',
    });
  }
  for (let a = 0; a < 8; a++) {
    pins.push({
      id: `A${a + 8}`,
      label: `A${a + 8}`,
      type: 'analog',
      avrPort: 'K',
      avrBit: a,
      adcChannel: a + 8,
      x: 278 + a * 12,
      y: 202,
      exitDir: 'down',
    });
  }

  // Right dual-row digital expansion header (D22..D53)
  const expansion: Array<{ id: string; port: AvrPortName; bit: number }> = [
    { id: '22', port: 'A', bit: 0 }, { id: '23', port: 'A', bit: 1 },
    { id: '24', port: 'A', bit: 2 }, { id: '25', port: 'A', bit: 3 },
    { id: '26', port: 'A', bit: 4 }, { id: '27', port: 'A', bit: 5 },
    { id: '28', port: 'A', bit: 6 }, { id: '29', port: 'A', bit: 7 },
    { id: '30', port: 'C', bit: 7 }, { id: '31', port: 'C', bit: 6 },
    { id: '32', port: 'C', bit: 5 }, { id: '33', port: 'C', bit: 4 },
    { id: '34', port: 'C', bit: 3 }, { id: '35', port: 'C', bit: 2 },
    { id: '36', port: 'C', bit: 1 }, { id: '37', port: 'C', bit: 0 },
    { id: '38', port: 'D', bit: 7 }, { id: '39', port: 'G', bit: 2 },
    { id: '40', port: 'G', bit: 1 }, { id: '41', port: 'G', bit: 0 },
    { id: '42', port: 'L', bit: 7 }, { id: '43', port: 'L', bit: 6 },
    { id: '44', port: 'L', bit: 5 }, { id: '45', port: 'L', bit: 4 },
    { id: '46', port: 'L', bit: 3 }, { id: '47', port: 'L', bit: 2 },
    { id: '48', port: 'L', bit: 1 }, { id: '49', port: 'L', bit: 0 },
    { id: '50', port: 'B', bit: 3 }, { id: '51', port: 'B', bit: 2 },
    { id: '52', port: 'B', bit: 1 }, { id: '53', port: 'B', bit: 0 },
  ];
  expansion.forEach((p, idx) => {
    const col = idx % 2; // 0 = left col (even), 1 = right col (odd)
    const row = Math.floor(idx / 2);
    pins.push({
      id: p.id,
      label: `D${p.id}`,
      type: Number(p.id) >= 50 ? 'spi' : 'digital',
      avrPort: p.port,
      avrBit: p.bit,
      x: 404 + col * 14,
      y: 20 + row * 11.2,
      exitDir: 'right',
    });
  });

  return pins;
}

export const MCU_BOARD_MANIFESTS: PartManifest[] = [
  {
    type: 'arduino-uno',
    category: 'mcu',
    width: 276,
    height: 196,
    name: { id: 'Arduino Uno', en: 'Arduino Uno' },
    description: {
      id: 'ATmega328P (14 pin digital, 6 analog, I2C A4/A5)',
      en: 'ATmega328P (14 digital pins, 6 analog inputs, I2C A4/A5)',
    },
    defaultProps: {},
    pins: buildUnoPins(),
  },
  {
    type: 'arduino-nano',
    category: 'mcu',
    width: 228,
    height: 96,
    name: { id: 'Arduino Nano', en: 'Arduino Nano' },
    description: {
      id: 'ATmega328P ringkas (14 digital, 8 analog A0-A7, ramah breadboard)',
      en: 'Compact ATmega328P (14 digital, 8 analog A0-A7, breadboard form)',
    },
    defaultProps: {},
    pins: buildNanoPins(),
  },
  {
    type: 'arduino-mega',
    category: 'mcu',
    width: 432,
    height: 216,
    name: { id: 'Arduino Mega 2560', en: 'Arduino Mega 2560' },
    description: {
      id: 'ATmega2560 (54 digital, 16 analog, 4 UART, I2C D20/D21)',
      en: 'ATmega2560 (54 digital, 16 analog, 4 UARTs, I2C D20/D21)',
    },
    defaultProps: {},
    pins: buildMegaPins(),
  },
];
