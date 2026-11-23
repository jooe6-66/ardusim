import { pickWireColor } from './netlist.js';
import { autoTidyCircuit } from './router.js';
import {
  LedColor,
  PartInstance,
  PartManifest,
  PinRef,
  Wire,
  isMcuBoardType,
} from './types.js';

export interface AutoWireResult {
  parts: PartInstance[];
  wires: Wire[];
  addedParts: number;
  addedWires: number;
}

function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ');
}

function parseHexOrInt(raw: string | undefined): number | null {
  if (!raw) return null;
  const s = raw.trim();
  if (/^0x[0-9a-f]+$/i.test(s)) return parseInt(s, 16);
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  return null;
}

function splitTopLevelArgs(argStr: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of argStr) {
    if (ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === ')' || ch === '}' || ch === ']') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/**
 * Offline static Arduino `.ino` sketch analyzer:
 * - Resolves `#define`, `const int`, `int`, `byte`, arrays, and `LED_BUILTIN`
 * - Detects I2C, SPI, UART, sensor, display, motor driver, and generic GPIO/ADC parts
 * - Reuses compatible existing parts on canvas, auto-adds missing code-referenced parts,
 *   keeps unrelated manual/power components intact, assigns net-aware wire colors, and auto-tidies layout.
 */
export function autoWireFromSketch(
  sketch: string,
  mcuPart: PartInstance,
  existingParts: PartInstance[],
  existingWires: Wire[],
  manifests: Map<string, PartManifest>
): AutoWireResult {
  const mcuManifest = manifests.get(mcuPart.type);
  if (!mcuManifest || !isMcuBoardType(mcuPart.type)) {
    return { parts: existingParts, wires: existingWires, addedParts: 0, addedWires: 0 };
  }

  const code = stripComments(sketch);
  if (!code.trim()) {
    return { parts: existingParts, wires: existingWires, addedParts: 0, addedWires: 0 };
  }

  const isMega = mcuPart.type === 'arduino-mega';
  const validMcuPins = new Set(mcuManifest.pins.map((p) => p.id));
  const gndPins = mcuManifest.pins.filter((p) => p.type === 'gnd').map((p) => p.id);
  const v5Pin = validMcuPins.has('5V') ? '5V' : null;
  const v33Pin = validMcuPins.has('3.3V') ? '3.3V' : null;
  const i2cSda = isMega ? '20' : 'A4';
  const i2cScl = isMega ? '21' : 'A5';
  const spiSck = isMega ? '52' : '13';
  const spiMiso = isMega ? '50' : '12';
  const spiMosi = isMega ? '51' : '11';

  // 1. Symbol table for pin constants & arrays
  const symValues = new Map<string, string>([
    ['LED_BUILTIN', '13'],
    ['SDA', i2cSda],
    ['SCL', i2cScl],
    ['SS', isMega ? '53' : '10'],
    ['MOSI', spiMosi],
    ['MISO', spiMiso],
    ['SCK', spiSck],
  ]);
  const symArrays = new Map<string, string[]>();
  const pinVarHints = new Map<string, string>(); // mcuPinId -> original variable name(s)

  for (const m of code.matchAll(/#\s*define\s+([A-Za-z_]\w*)\s+([^\r\n]+)/g)) {
    const val = m[2].trim().replace(/^\((.*)\)$/, '$1').trim();
    if (/^[A-Za-z0-9_]+$/.test(val)) {
      symValues.set(m[1], val);
    }
  }
  const scalarDeclRe =
    /\b(?:(?:const(?:expr)?|static|unsigned)\s+)*(?:int|byte|uint8_t|short|long|char)\s+([A-Za-z_]\w*)\s*=\s*([A-Za-z0-9_]+)\s*;/g;
  for (const m of code.matchAll(scalarDeclRe)) {
    symValues.set(m[1], m[2]);
  }
  const arrayDeclRe =
    /\b(?:(?:const(?:expr)?|static|unsigned)\s+)*(?:int|byte|uint8_t|char)\s+([A-Za-z_]\w*)\s*\[[^\]]*\]\s*=\s*\{([^}]+)\}/g;
  for (const m of code.matchAll(arrayDeclRe)) {
    symArrays.set(
      m[1],
      m[2]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    );
  }

  const resolvePin = (expr: string | undefined): string | null => {
    if (!expr) return null;
    let cur = expr.trim().replace(/^\((.*)\)$/, '$1').trim();
    const seen = new Set<string>();
    const origIdent = /^[A-Za-z_]\w*$/.test(cur) ? cur : '';
    while (symValues.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      cur = symValues.get(cur)!;
    }
    const upper = cur.toUpperCase();
    let candidate = upper;
    if (/^D(\d+)$/.test(upper)) {
      candidate = upper.slice(1);
    } else if (/^\d+$/.test(cur)) {
      candidate = String(parseInt(cur, 10));
    }
    if (!validMcuPins.has(candidate)) return null;
    if (origIdent && !/^A\d+$/i.test(origIdent) && origIdent !== 'LED_BUILTIN') {
      const prev = pinVarHints.get(candidate) ?? '';
      if (!prev.includes(origIdent)) {
        pinVarHints.set(candidate, prev ? `${prev} ${origIdent}` : origIdent);
      }
    }
    return candidate;
  };

  /** Resolves a scalar pin expression or an indexed pin array (`LED_PINS[i]` / `LED_PINS[0]`). */
  const resolvePins = (expr: string | undefined): string[] => {
    if (!expr) return [];
    const cleaned = expr.trim().replace(/^\((.*)\)$/, '$1').trim();
    const arrMatch = cleaned.match(/^([A-Za-z_]\w*)\s*\[([^\]]+)\]$/);
    if (arrMatch) {
      const arrName = arrMatch[1];
      const arr = symArrays.get(arrName);
      if (arr) {
        const idx = parseHexOrInt(arrMatch[2]);
        const items = idx !== null && idx >= 0 && idx < arr.length ? [arr[idx]] : arr;
        const pins: string[] = [];
        for (const item of items) {
          const p = resolvePin(item);
          if (!p) continue;
          const prev = pinVarHints.get(p) ?? '';
          if (!prev.includes(arrName)) {
            pinVarHints.set(p, prev ? `${prev} ${arrName}` : arrName);
          }
          if (!pins.includes(p)) pins.push(p);
        }
        return pins;
      }
    }
    const single = resolvePin(cleaned);
    return single ? [single] : [];
  };

  // Seed variable-name hints from all known pin symbols
  for (const [sym] of symValues) {
    resolvePin(sym);
  }

  // 2. Working part/wire registry: keep all existing parts; reuse unmatched existing peripherals before creating new ones
  const parts: PartInstance[] = existingParts.map((p) => ({
    ...p,
    props: structuredClone(p.props),
  }));
  const usedIds = new Set(parts.map((p) => p.id));
  const claimedPartIds = new Set<string>([mcuPart.id]);
  const claimedMcuPins = new Set<string>();
  const pendingLinks: Array<{ from: PinRef; to: PinRef }> = [];
  const railReqs: Array<{ partId: string; pinId: string; rail: 'gnd' | '5v' | '3v3' }> = [];
  let addedParts = 0;

  const nextId = (prefix: string): string => {
    const clean = prefix.replace(/[^a-z]/g, '').slice(0, 3) || 'p';
    for (let i = 1; i < 999; i++) {
      const cand = `${clean}${i}`;
      if (!usedIds.has(cand)) {
        usedIds.add(cand);
        return cand;
      }
    }
    const rand = `${clean}${Math.random().toString(36).slice(2, 6)}`;
    usedIds.add(rand);
    return rand;
  };

  const ensurePart = (type: string, propsPatch?: Record<string, unknown>): PartInstance | null => {
    const manifest = manifests.get(type);
    if (!manifest) return null;
    const reusable = parts.find((p) => p.type === type && !claimedPartIds.has(p.id));
    if (reusable) {
      claimedPartIds.add(reusable.id);
      if (propsPatch) reusable.props = { ...reusable.props, ...propsPatch };
      return reusable;
    }
    const created: PartInstance = {
      id: nextId(type),
      type,
      x: mcuPart.x + 320,
      y: mcuPart.y,
      rotation: 0,
      props: { ...structuredClone(manifest.defaultProps), ...(propsPatch ?? {}) },
    };
    parts.push(created);
    claimedPartIds.add(created.id);
    addedParts++;
    return created;
  };

  const link = (fromPartId: string, fromPinId: string, toPartId: string, toPinId: string) => {
    if (fromPartId === toPartId && fromPinId === toPinId) return;
    const dup = pendingLinks.some(
      (l) =>
        (l.from.partId === fromPartId &&
          l.from.pinId === fromPinId &&
          l.to.partId === toPartId &&
          l.to.pinId === toPinId) ||
        (l.from.partId === toPartId &&
          l.from.pinId === toPinId &&
          l.to.partId === fromPartId &&
          l.to.pinId === fromPinId)
    );
    if (!dup) {
      pendingLinks.push({
        from: { partId: fromPartId, pinId: fromPinId },
        to: { partId: toPartId, pinId: toPinId },
      });
    }
  };

  const linkMcu = (mcuPinId: string, partId: string, partPinId: string, claim = true) => {
    if (!validMcuPins.has(mcuPinId)) return;
    if (claim) claimedMcuPins.add(mcuPinId);
    link(mcuPart.id, mcuPinId, partId, partPinId);
  };

  const requestRail = (partId: string, pinId: string, rail: 'gnd' | '5v' | '3v3') => {
    if (rail === 'gnd' && gndPins.length === 0) return;
    if (rail === '5v' && !v5Pin) return;
    if (rail === '3v3' && !v33Pin) return;
    if (!railReqs.some((r) => r.partId === partId && r.pinId === pinId && r.rail === rail)) {
      railReqs.push({ partId, pinId, rail });
    }
  };

  const linkPower = (partId: string, vccPin = 'VCC', gndPin = 'GND', use3v3 = false) => {
    if (vccPin) requestRail(partId, vccPin, use3v3 ? '3v3' : '5v');
    if (gndPin) requestRail(partId, gndPin, 'gnd');
  };

  const usesHardwareSerial = /\bSerial\.begin\s*\(/.test(code);

  // 3. Dedicated Library & Bus Peripherals
  // 3a. LCD 16x2 I2C
  for (const m of code.matchAll(/\bLiquidCrystal_I2C\s+\w+\s*\(([^)]*)\)/g)) {
    const args = splitTopLevelArgs(m[1]);
    const addr = parseHexOrInt(args[0]);
    const part = ensurePart('lcd-1602-i2c', addr ? { i2cAddress: addr } : undefined);
    if (part) {
      linkPower(part.id);
      linkMcu(i2cSda, part.id, 'SDA');
      linkMcu(i2cScl, part.id, 'SCL');
    }
  }

  // 3b. OLED SSD1306
  if (/\bAdafruit_SSD1306\b/.test(code)) {
    const addrMatch = code.match(/\.begin\s*\([^)]*?(0x3[cCdD])/);
    const addr = addrMatch ? parseHexOrInt(addrMatch[1]) : null;
    const part = ensurePart('oled-ssd1306', addr ? { i2cAddress: addr } : undefined);
    if (part) {
      linkPower(part.id);
      linkMcu(i2cSda, part.id, 'SDA');
      linkMcu(i2cScl, part.id, 'SCL');
    }
  }

  // 3c. DS3231 RTC
  if (/\b(?:RTC_DS3231|DS3231)\b/.test(code)) {
    const part = ensurePart('ds3231-rtc');
    if (part) {
      linkPower(part.id);
      linkMcu(i2cSda, part.id, 'SDA');
      linkMcu(i2cScl, part.id, 'SCL');
    }
  }

  // 3d. MPU6050 IMU
  if (/\b(?:MPU6050|Adafruit_MPU6050)\b/.test(code)) {
    const part = ensurePart('mpu6050');
    if (part) {
      linkPower(part.id);
      linkMcu(i2cSda, part.id, 'SDA');
      linkMcu(i2cScl, part.id, 'SCL');
    }
  }

  // 3e. RFID RC522 (SPI)
  for (const m of code.matchAll(/\bMFRC522\s+\w+\s*\(([^)]*)\)/g)) {
    const args = splitTopLevelArgs(m[1]);
    const ss = resolvePin(args[0]) ?? (isMega ? '53' : '10');
    const rst = resolvePin(args[1]) ?? '9';
    const part = ensurePart('rfid-rc522');
    if (part) {
      linkPower(part.id, '3.3V', 'GND', true);
      linkMcu(ss, part.id, 'SDA');
      linkMcu(rst, part.id, 'RST');
      linkMcu(spiSck, part.id, 'SCK');
      linkMcu(spiMosi, part.id, 'MOSI');
      linkMcu(spiMiso, part.id, 'MISO');
    }
  }

  // 3f. MAX7219 LED Matrix
  for (const m of code.matchAll(/\bLedControl\s+\w+\s*\(([^)]*)\)/g)) {
    const args = splitTopLevelArgs(m[1]);
    const din = resolvePin(args[0]);
    const clk = resolvePin(args[1]);
    const cs = resolvePin(args[2]);
    if (din && clk && cs) {
      const part = ensurePart('max7219');
      if (part) {
        linkPower(part.id);
        linkMcu(din, part.id, 'DIN');
        linkMcu(clk, part.id, 'CLK');
        linkMcu(cs, part.id, 'CS');
      }
    }
  }

  // 3g. DHT22 / DHT11
  for (const m of code.matchAll(/\bDHT\s+\w+\s*\(([^)]*)\)/g)) {
    const args = splitTopLevelArgs(m[1]);
    const dataPin = resolvePin(args[0]);
    if (dataPin) {
      const model = /DHT11/i.test(args[1] ?? '') ? 'DHT11' : 'DHT22';
      const part = ensurePart('dht22', { model });
      if (part) {
        linkPower(part.id);
        linkMcu(dataPin, part.id, 'DATA');
      }
    }
  }

  // 3h. Servo motors
  const servoVars = new Set<string>();
  for (const m of code.matchAll(/\bServo\s+([A-Za-z_]\w*)/g)) {
    servoVars.add(m[1]);
  }
  for (const varName of servoVars) {
    const attachRe = new RegExp(`\\b${varName}(?:\\s*\\[[^\\]]*\\])?\\.attach\\s*\\(([^)]*)\\)`, 'g');
    for (const m of code.matchAll(attachRe)) {
      for (const pin of resolvePins(splitTopLevelArgs(m[1])[0])) {
        if (claimedMcuPins.has(pin)) continue;
        const part = ensurePart('servo');
        if (part) {
          linkPower(part.id);
          linkMcu(pin, part.id, 'SIG');
        }
      }
    }
  }

  // 3i. NeoPixel Strip
  for (const m of code.matchAll(/\bAdafruit_NeoPixel\s+\w+\s*\(([^)]*)\)/g)) {
    const args = splitTopLevelArgs(m[1]);
    const din = resolvePin(args[1]);
    if (din) {
      const part = ensurePart('neopixel-strip');
      if (part) {
        linkPower(part.id);
        linkMcu(din, part.id, 'DIN');
      }
    }
  }

  // 3j. Stepper Motor
  for (const m of code.matchAll(/\bStepper\s+\w+\s*\(([^)]*)\)/g)) {
    const args = splitTopLevelArgs(m[1]);
    const steps = parseHexOrInt(args[0]);
    const p1 = resolvePin(args[1]);
    const p2 = resolvePin(args[2]);
    const p3 = resolvePin(args[3]);
    const p4 = resolvePin(args[4]);
    if (p1 && p2 && p3 && p4) {
      const part = ensurePart('stepper', steps && steps >= 8 ? { stepsPerRev: steps } : undefined);
      if (part) {
        linkMcu(p1, part.id, 'IN1');
        linkMcu(p2, part.id, 'IN2');
        linkMcu(p3, part.id, 'IN3');
        linkMcu(p4, part.id, 'IN4');
      }
    }
  }

  // 3k. Keypad 4x4
  for (const m of code.matchAll(/\bKeypad\s+\w+\s*\(([^)]*)\)/g)) {
    const args = splitTopLevelArgs(m[1]);
    const rowArr = symArrays.get(args[1] ?? '');
    const colArr = symArrays.get(args[2] ?? '');
    if (rowArr && colArr && rowArr.length >= 4 && colArr.length >= 4) {
      const rows = rowArr.slice(0, 4).map((x) => resolvePin(x));
      const cols = colArr.slice(0, 4).map((x) => resolvePin(x));
      if (rows.every(Boolean) && cols.every(Boolean)) {
        const part = ensurePart('keypad-4x4');
        if (part) {
          rows.forEach((p, i) => linkMcu(p!, part.id, `R${i + 1}`));
          cols.forEach((p, i) => linkMcu(p!, part.id, `C${i + 1}`));
        }
      }
    }
  }

  // 3l. SoftwareSerial -> GPS NEO-6M or Bluetooth HC-05
  for (const m of code.matchAll(/\bSoftwareSerial\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/g)) {
    const varName = m[1];
    const args = splitTopLevelArgs(m[2]);
    const rxPin = resolvePin(args[0]);
    const txPin = resolvePin(args[1]);
    if (rxPin && txPin) {
      const isGps = /gps|nmea|tinygps|gpgga|gprmc/i.test(`${varName} ${code}`);
      const part = ensurePart(isGps ? 'gps-neo6m' : 'hc-05');
      if (part) {
        linkPower(part.id);
        linkMcu(rxPin, part.id, isGps ? 'TX' : 'TXD');
        linkMcu(txPin, part.id, isGps ? 'RX' : 'RXD');
      }
    }
  }

  // 3m. HC-SR04 Ultrasonic (pulseIn ECHO + TRIG)
  for (const m of code.matchAll(/\bpulseIn\s*\(\s*([^,)]+)\s*,\s*HIGH/g)) {
    const echoPin = resolvePin(m[1]);
    if (!echoPin || claimedMcuPins.has(echoPin)) continue;
    let trigPin: string | null = null;
    for (const [sym] of symValues) {
      if (/trig/i.test(sym)) {
        const p = resolvePin(sym);
        if (p && p !== echoPin && !claimedMcuPins.has(p)) {
          trigPin = p;
          break;
        }
      }
    }
    if (!trigPin) {
      const trigMatch = code.match(/\bdigitalWrite\s*\(\s*([^,)]+)\s*,\s*HIGH\s*\)\s*;\s*delayMicroseconds\s*\(\s*10\s*\)/);
      if (trigMatch) {
        const p = resolvePin(trigMatch[1]);
        if (p && p !== echoPin) trigPin = p;
      }
    }
    if (trigPin) {
      const part = ensurePart('hc-sr04');
      if (part) {
        linkPower(part.id);
        linkMcu(trigPin, part.id, 'TRIG');
        linkMcu(echoPin, part.id, 'ECHO');
      }
    }
  }

  // 3n. Buzzer via tone()
  for (const m of code.matchAll(/\btone\s*\(\s*([^,)]+)/g)) {
    for (const pin of resolvePins(m[1])) {
      if (!claimedMcuPins.has(pin)) {
        const part = ensurePart('buzzer');
        if (part) {
          linkMcu(pin, part.id, '+');
          requestRail(part.id, '-', 'gnd');
        }
      }
    }
  }

  // 4. Collect remaining pinMode / digital / analog usages
  const outputPins = new Set<string>();
  const inputPins = new Set<string>();
  const analogPins = new Set<string>();

  for (const m of code.matchAll(/\bpinMode\s*\(\s*([^,)]+)\s*,\s*(OUTPUT|INPUT_PULLUP|INPUT)\s*\)/g)) {
    for (const p of resolvePins(m[1])) {
      if (claimedMcuPins.has(p)) continue;
      if (m[2] === 'OUTPUT') outputPins.add(p);
      else inputPins.add(p);
    }
  }
  for (const m of code.matchAll(/\b(?:digitalWrite|analogWrite)\s*\(\s*([^,)]+)/g)) {
    for (const p of resolvePins(m[1])) {
      if (!claimedMcuPins.has(p) && !inputPins.has(p)) outputPins.add(p);
    }
  }
  for (const m of code.matchAll(/\bdigitalRead\s*\(\s*([^)]+)\)/g)) {
    for (const p of resolvePins(m[1])) {
      if (!claimedMcuPins.has(p) && !outputPins.has(p)) inputPins.add(p);
    }
  }
  for (const m of code.matchAll(/\banalogRead\s*\(\s*([^)]+)\)/g)) {
    for (const p of resolvePins(m[1])) {
      if (!claimedMcuPins.has(p)) analogPins.add(p);
    }
  }

  if (usesHardwareSerial) {
    outputPins.delete('0');
    outputPins.delete('1');
    inputPins.delete('0');
    inputPins.delete('1');
  }

  // 4a. L298N Motor Driver (when IN1 + IN2 output pins are named in sketch)
  const findOutputByHint = (re: RegExp): string | null => {
    for (const p of outputPins) {
      if (!claimedMcuPins.has(p) && re.test(pinVarHints.get(p) ?? '')) return p;
    }
    return null;
  };
  const in1Pin = findOutputByHint(/\bin1\b|\bmotor_?a1\b/i);
  const in2Pin = findOutputByHint(/\bin2\b|\bmotor_?a2\b/i);
  if (in1Pin && in2Pin) {
    const in3Pin = findOutputByHint(/\bin3\b|\bmotor_?b1\b/i);
    const in4Pin = findOutputByHint(/\bin4\b|\bmotor_?b2\b/i);
    const enaPin = findOutputByHint(/\bena\b/i);
    const enbPin = findOutputByHint(/\benb\b/i);
    const drv = ensurePart('l298n');
    if (drv) {
      linkMcu(in1Pin, drv.id, 'IN1');
      linkMcu(in2Pin, drv.id, 'IN2');
      if (enaPin) linkMcu(enaPin, drv.id, 'ENA');
      if (in3Pin) linkMcu(in3Pin, drv.id, 'IN3');
      if (in4Pin) linkMcu(in4Pin, drv.id, 'IN4');
      if (enbPin) linkMcu(enbPin, drv.id, 'ENB');
      requestRail(drv.id, 'GND', 'gnd');
      const motorA = ensurePart('dc-motor');
      if (motorA) {
        link(drv.id, 'OUT1', motorA.id, '+');
        link(drv.id, 'OUT2', motorA.id, '-');
      }
      if (in3Pin && in4Pin) {
        const motorB = ensurePart('dc-motor');
        if (motorB) {
          link(drv.id, 'OUT3', motorB.id, '+');
          link(drv.id, 'OUT4', motorB.id, '-');
        }
      }
    }
  }

  // 4b. RGB LED (3 named R/G/B output pins)
  const rPin = findOutputByHint(/\b(?:r_?pin|red_?pin|led_?r|pin_?r|rgb_?r)\b/i);
  const gPin = findOutputByHint(/\b(?:g_?pin|green_?pin|led_?g|pin_?g|rgb_?g)\b/i);
  const bPin = findOutputByHint(/\b(?:b_?pin|blue_?pin|led_?b|pin_?b|rgb_?b)\b/i);
  if (rPin && gPin && bPin && rPin !== gPin && gPin !== bPin && rPin !== bPin) {
    const rgb = ensurePart('rgb-led');
    if (rgb) {
      linkMcu(rPin, rgb.id, 'R');
      linkMcu(gPin, rgb.id, 'G');
      linkMcu(bPin, rgb.id, 'B');
      requestRail(rgb.id, 'COM', 'gnd');
    }
  }

  // 4c. Analog sensors (MQ-2, LM35, LDR, Potentiometer)
  let sharedMq2: PartInstance | null = null;
  for (const p of analogPins) {
    if (claimedMcuPins.has(p)) continue;
    const hint = pinVarHints.get(p) ?? '';
    if (/mq2|gas|smoke|asap/i.test(hint)) {
      const part: PartInstance | null = sharedMq2 ?? ensurePart('mq2');
      if (part) {
        if (!sharedMq2) {
          sharedMq2 = part;
          linkPower(part.id);
        }
        linkMcu(p, part.id, 'AOUT');
      }
    } else if (/lm35|temp|suhu/i.test(hint)) {
      const part = ensurePart('lm35');
      if (part) {
        linkPower(part.id);
        linkMcu(p, part.id, 'OUT');
      }
    } else if (/ldr|light|cahaya|lux|photo/i.test(hint)) {
      const ldr = ensurePart('ldr');
      const res = ensurePart('resistor', { value: 10, unit: 'kohm' });
      if (ldr && res) {
        requestRail(ldr.id, '1', '5v');
        linkMcu(p, ldr.id, '2');
        link(ldr.id, '2', res.id, '1');
        requestRail(res.id, '2', 'gnd');
      }
    } else {
      const pot = ensurePart('potentiometer');
      if (pot) {
        linkPower(pot.id);
        linkMcu(p, pot.id, 'SIG');
      }
    }
  }

  // 4d. Digital inputs (PIR, MQ-2 DOUT, Pushbutton)
  for (const p of inputPins) {
    if (claimedMcuPins.has(p)) continue;
    const hint = pinVarHints.get(p) ?? '';
    if (/pir|motion|gerak/i.test(hint)) {
      const part = ensurePart('pir');
      if (part) {
        linkPower(part.id);
        linkMcu(p, part.id, 'OUT');
      }
    } else if (/mq2|gas|smoke|asap/i.test(hint)) {
      const part: PartInstance | null = sharedMq2 ?? ensurePart('mq2');
      if (part) {
        if (!sharedMq2) {
          sharedMq2 = part;
          linkPower(part.id);
        }
        linkMcu(p, part.id, 'DOUT');
      }
    } else {
      const btn = ensurePart('pushbutton');
      if (btn) {
        const btnManifest = manifests.get('pushbutton');
        const hasBottomLegs = btnManifest?.pins.some((pin) => pin.id === '1b') ?? false;
        linkMcu(p, btn.id, hasBottomLegs ? '1b' : '1a');
        requestRail(btn.id, hasBottomLegs ? '2b' : '2a', 'gnd');
      }
    }
  }

  // 4e. Digital / PWM outputs (Relay, Buzzer, DC Motor, or LED + 220 Ohm Resistor)
  for (const p of outputPins) {
    if (claimedMcuPins.has(p)) continue;
    const hint = pinVarHints.get(p) ?? '';
    if (/relay|relai/i.test(hint)) {
      const part = ensurePart('relay');
      if (part) {
        linkPower(part.id);
        linkMcu(p, part.id, 'IN');
      }
    } else if (/buzz|piezo|speaker|nada/i.test(hint)) {
      const part = ensurePart('buzzer');
      if (part) {
        linkMcu(p, part.id, '+');
        requestRail(part.id, '-', 'gnd');
      }
    } else if (/motor/i.test(hint)) {
      const part = ensurePart('dc-motor');
      if (part) {
        linkMcu(p, part.id, '+');
        requestRail(part.id, '-', 'gnd');
      }
    } else {
      const ledColor: LedColor = /green|hijau/i.test(hint)
        ? 'green'
        : /yellow|kuning/i.test(hint)
          ? 'yellow'
          : /blue|biru/i.test(hint)
            ? 'blue'
            : /white|putih/i.test(hint)
              ? 'white'
              : 'red';
      const res = ensurePart('resistor', { value: 220, unit: 'ohm' });
      const led = ensurePart('led', { color: ledColor });
      if (res && led) {
        linkMcu(p, res.id, '1');
        link(res.id, '2', led.id, 'A');
        requestRail(led.id, 'C', 'gnd');
      }
    }
  }

  if (pendingLinks.length === 0) {
    return { parts: existingParts, wires: existingWires, addedParts: 0, addedWires: 0 };
  }

  // 4f. Wire common GND / 5V / 3.3V buses per header zone so aligned parts share one clean rail
  const pinMetaById = new Map(mcuManifest.pins.map((p) => [p.id, p]));
  const inferZone = (pinId: string): 'top' | 'bottom' | 'right' | 'left' => {
    const p = pinMetaById.get(pinId);
    if (!p) return 'top';
    if (p.exitDir === 'up') return 'top';
    if (p.exitDir === 'down') return 'bottom';
    if (p.exitDir === 'right') return 'right';
    if (p.exitDir === 'left') return 'left';
    if (p.y <= mcuManifest.height * 0.25) return 'top';
    if (p.y >= mcuManifest.height * 0.75) return 'bottom';
    if (p.x >= mcuManifest.width * 0.75) return 'right';
    if (p.x <= mcuManifest.width * 0.25) return 'left';
    return p.y <= mcuManifest.height / 2 ? 'top' : 'bottom';
  };

  // Propagate MCU signal pin position across peripheral signal chains (e.g. MCU -> Resistor -> LED)
  const sigAdj = new Map<string, Set<string>>();
  const partSigAnchor = new Map<string, { zone: 'top' | 'bottom' | 'right' | 'left'; x: number; y: number }>();
  for (const l of pendingLinks) {
    if (l.from.partId === mcuPart.id && l.to.partId !== mcuPart.id) {
      const mp = pinMetaById.get(l.from.pinId);
      if (mp && !partSigAnchor.has(l.to.partId)) {
        partSigAnchor.set(l.to.partId, { zone: inferZone(mp.id), x: mp.x, y: mp.y });
      }
    } else if (l.to.partId === mcuPart.id && l.from.partId !== mcuPart.id) {
      const mp = pinMetaById.get(l.to.pinId);
      if (mp && !partSigAnchor.has(l.from.partId)) {
        partSigAnchor.set(l.from.partId, { zone: inferZone(mp.id), x: mp.x, y: mp.y });
      }
    } else if (l.from.partId !== mcuPart.id && l.to.partId !== mcuPart.id) {
      if (!sigAdj.has(l.from.partId)) sigAdj.set(l.from.partId, new Set());
      if (!sigAdj.has(l.to.partId)) sigAdj.set(l.to.partId, new Set());
      sigAdj.get(l.from.partId)!.add(l.to.partId);
      sigAdj.get(l.to.partId)!.add(l.from.partId);
    }
  }
  const bfsQueue = Array.from(partSigAnchor.keys());
  while (bfsQueue.length > 0) {
    const curr = bfsQueue.shift()!;
    const anchor = partSigAnchor.get(curr)!;
    for (const nb of sigAdj.get(curr) ?? []) {
      if (!partSigAnchor.has(nb)) {
        partSigAnchor.set(nb, anchor);
        bfsQueue.push(nb);
      }
    }
  }

  const railGroups = new Map<
    string,
    Array<{ partId: string; pinId: string; rail: 'gnd' | '5v' | '3v3'; zone: 'top' | 'bottom' | 'right' | 'left'; x: number; y: number }>
  >();
  for (const req of railReqs) {
    const anchor = partSigAnchor.get(req.partId) ?? { zone: 'top' as const, x: mcuManifest.width / 2, y: 0 };
    const key = `${req.rail}:${anchor.zone}`;
    if (!railGroups.has(key)) railGroups.set(key, []);
    railGroups.get(key)!.push({ ...req, ...anchor });
  }

  const pickClosestRailPin = (
    rail: 'gnd' | '5v' | '3v3',
    target: { zone: 'top' | 'bottom' | 'right' | 'left'; x: number; y: number }
  ): string | null => {
    const candidates =
      rail === 'gnd' ? gndPins : rail === '5v' ? (v5Pin ? [v5Pin] : []) : v33Pin ? [v33Pin] : [];
    if (candidates.length === 0) return null;
    let bestPin = candidates[0];
    let bestScore = Infinity;
    for (const cid of candidates) {
      const mp = pinMetaById.get(cid);
      if (!mp) continue;
      const sameZoneBonus = inferZone(cid) === target.zone ? 0 : 250;
      const dist = Math.abs(mp.x - target.x) + Math.abs(mp.y - target.y) + sameZoneBonus;
      if (dist < bestScore) {
        bestScore = dist;
        bestPin = cid;
      }
    }
    return bestPin;
  };

  for (const group of railGroups.values()) {
    const zone = group[0].zone;
    const rail = group[0].rail;
    group.sort((a, b) => (zone === 'top' || zone === 'bottom' ? a.x - b.x : a.y - b.y));
    const firstPin = pickClosestRailPin(rail, group[0]);
    const lastPin = pickClosestRailPin(rail, group[group.length - 1]);
    if (!firstPin) continue;

    // Pick whichever end of the aligned row sits closer to an MCU rail pin, then daisy-chain outward
    const firstMp = pinMetaById.get(firstPin)!;
    const lastMp = lastPin ? pinMetaById.get(lastPin)! : firstMp;
    const firstDist =
      Math.abs(firstMp.x - group[0].x) +
      Math.abs(firstMp.y - group[0].y) +
      (inferZone(firstPin) === zone ? 0 : 250);
    const lastDist =
      Math.abs(lastMp.x - group[group.length - 1].x) +
      Math.abs(lastMp.y - group[group.length - 1].y) +
      (lastPin && inferZone(lastPin) === zone ? 0 : 250);

    if (firstDist <= lastDist) {
      link(mcuPart.id, firstPin, group[0].partId, group[0].pinId);
      for (let i = 1; i < group.length; i++) {
        link(group[i - 1].partId, group[i - 1].pinId, group[i].partId, group[i].pinId);
      }
    } else {
      link(mcuPart.id, lastPin ?? firstPin, group[group.length - 1].partId, group[group.length - 1].pinId);
      for (let i = group.length - 2; i >= 0; i--) {
        link(group[i + 1].partId, group[i + 1].pinId, group[i].partId, group[i].pinId);
      }
    }
  }

  // 5. Preserve wires outside the auto-wired subgraph (keeps inter-MCU links & manual power wiring intact,
  //    while replacing any stale wire attached to an MCU pin newly claimed by this sketch)
  const preservedWires = existingWires.filter((w) => {
    if (claimedPartIds.has(w.from.partId) && claimedPartIds.has(w.to.partId)) return false;
    if (w.from.partId === mcuPart.id && claimedMcuPins.has(w.from.pinId)) return false;
    if (w.to.partId === mcuPart.id && claimedMcuPins.has(w.to.pinId)) return false;
    return true;
  });
  const usedWireIds = new Set(preservedWires.map((w) => w.id));
  const nextWireId = (): string => {
    for (let i = 1; i < 9999; i++) {
      const id = `aw${i}`;
      if (!usedWireIds.has(id)) {
        usedWireIds.add(id);
        return id;
      }
    }
    return `aw${Math.random().toString(36).slice(2, 7)}`;
  };

  let wires: Wire[] = [...preservedWires];
  for (const item of pendingLinks) {
    const { color, unifyWireIds } = pickWireColor(parts, wires, item.from, item.to, manifests);
    if (unifyWireIds.length > 0) {
      const uSet = new Set(unifyWireIds);
      wires = wires.map((w) => (uSet.has(w.id) ? { ...w, color } : w));
    }
    wires.push({
      id: nextWireId(),
      from: item.from,
      to: item.to,
      color,
    });
  }

  const tidied = autoTidyCircuit(parts, wires, manifests);
  return {
    parts: tidied.parts,
    wires: tidied.wires,
    addedParts,
    addedWires: pendingLinks.length,
  };
}
