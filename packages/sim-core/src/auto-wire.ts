import { buildNetlist, pickWireColor } from './netlist.js';
import { autoTidyCircuit } from './router.js';
import {
  LedColor,
  PartInstance,
  PartManifest,
  PinRef,
  Wire,
  isMcuBoardType,
  pinKey,
} from './types.js';

export interface AutoWireResult {
  parts: PartInstance[];
  wires: Wire[];
  addedParts: number;
  addedWires: number;
  skippedWiredPins?: number;
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
  const pinToSyms = new Map<string, Set<string>>();
  const rawSketch = sketch;

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
      if (!pinToSyms.has(candidate)) pinToSyms.set(candidate, new Set());
      pinToSyms.get(candidate)!.add(origIdent);
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
          if (!pinToSyms.has(p)) pinToSyms.set(p, new Set());
          pinToSyms.get(p)!.add(arrName);
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

  // Build per-pin local context (decl lines, I/O call lines, comments, and Serial/LCD prints of read vars)
  const pinLocalContext = new Map<string, string>();
  const appendLocalCtx = (pinId: string, line: string) => {
    const prev = pinLocalContext.get(pinId) ?? '';
    pinLocalContext.set(pinId, prev ? `${prev}\n${line}` : line);
  };
  const pinReadVars = new Map<string, Set<string>>();
  const rawLines = rawSketch.split(/\r?\n/);
  const symPatterns = Array.from(pinToSyms.entries()).map(([pinId, syms]) => ({
    pinId,
    re: new RegExp(`\\b(?:${Array.from(syms).join('|')})\\b`),
  }));
  const directCallRe =
    /\b(?:analogRead|digitalRead|digitalWrite|analogWrite|pinMode|pulseIn(?:Long)?|tone|noTone|\.attach)\s*\(\s*([^,)]+)/g;
  const assignReadRe =
    /([A-Za-z_]\w*)\s*=\s*(?:analogRead|digitalRead|pulseIn(?:Long)?)\s*\(\s*([^,)]+)/g;

  for (const line of rawLines) {
    const matchedPins = new Set<string>();
    for (const sp of symPatterns) {
      if (sp.re.test(line)) {
        matchedPins.add(sp.pinId);
      }
    }
    for (const cm of line.matchAll(directCallRe)) {
      for (const p of resolvePins(cm[1])) matchedPins.add(p);
    }
    for (const p of matchedPins) appendLocalCtx(p, line);
    for (const am of line.matchAll(assignReadRe)) {
      for (const p of resolvePins(am[2])) {
        if (!pinReadVars.has(p)) pinReadVars.set(p, new Set());
        pinReadVars.get(p)!.add(am[1]);
      }
    }
  }
  const printLineRe = /\b(?:Serial\d*|lcd|display|oled)\s*\.\s*print(?:ln)?\s*\(/;
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (!printLineRe.test(line)) continue;
    for (const [p, vars] of pinReadVars) {
      for (const v of vars) {
        if (new RegExp(`\\b${v}\\b`).test(line)) {
          if (i > 0 && printLineRe.test(rawLines[i - 1])) {
            appendLocalCtx(p, rawLines[i - 1]);
          }
          appendLocalCtx(p, line);
          break;
        }
      }
    }
  }

  const hwPwmPins = isMega
    ? new Set(['2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '44', '45', '46'])
    : new Set(['3', '5', '6', '9', '10', '11']);
  const isHwPwmPin = (pinId: string): boolean => hwPwmPins.has(pinId);
  const pwmWritePins = new Set<string>();
  for (const m of code.matchAll(/\banalogWrite\s*\(\s*([^,)]+)/g)) {
    for (const p of resolvePins(m[1])) pwmWritePins.add(p);
  }

  // 2. Working part/wire registry: protect existing wired MCU pins & passive chains (diodes, RC filters, custom circuits),
  //    reuse unwired existing peripherals before creating new ones, and only add missing code-referenced pins.
  const parts: PartInstance[] = existingParts.map((p) => ({
    ...p,
    props: structuredClone(p.props),
  }));
  const usedIds = new Set(parts.map((p) => p.id));
  const pinMetaById = new Map(mcuManifest.pins.map((p) => [p.id, p]));

  const existingNetlist = buildNetlist(existingParts, existingWires, manifests);
  const existingRailNets = new Set<string>();
  for (const pin of mcuManifest.pins) {
    if (pin.type === 'gnd' || pin.type === 'power') {
      const net = existingNetlist.pinToNet.get(`${mcuPart.id}:${pin.id}`);
      if (net) existingRailNets.add(net);
    }
  }
  const existingWiredMcuPins = new Set<string>();
  const protectedPartIds = new Set<string>([mcuPart.id]);
  const existingSigAdj = new Map<string, Set<string>>();
  const protQueue: string[] = [];

  for (const w of existingWires) {
    const net = existingNetlist.pinToNet.get(pinKey(w.from));
    if (net && existingRailNets.has(net)) continue;
    const a = w.from.partId;
    const b = w.to.partId;
    if (a === mcuPart.id && b !== mcuPart.id) {
      const mp = pinMetaById.get(w.from.pinId);
      if (mp && mp.type !== 'power' && mp.type !== 'gnd') {
        existingWiredMcuPins.add(w.from.pinId);
        if (!protectedPartIds.has(b)) {
          protectedPartIds.add(b);
          protQueue.push(b);
        }
      }
    } else if (b === mcuPart.id && a !== mcuPart.id) {
      const mp = pinMetaById.get(w.to.pinId);
      if (mp && mp.type !== 'power' && mp.type !== 'gnd') {
        existingWiredMcuPins.add(w.to.pinId);
        if (!protectedPartIds.has(a)) {
          protectedPartIds.add(a);
          protQueue.push(a);
        }
      }
    } else if (a !== b) {
      if (!existingSigAdj.has(a)) existingSigAdj.set(a, new Set());
      if (!existingSigAdj.has(b)) existingSigAdj.set(b, new Set());
      existingSigAdj.get(a)!.add(b);
      existingSigAdj.get(b)!.add(a);
    }
  }
  while (protQueue.length > 0) {
    const curr = protQueue.shift()!;
    for (const nb of existingSigAdj.get(curr) ?? []) {
      if (!protectedPartIds.has(nb)) {
        protectedPartIds.add(nb);
        protQueue.push(nb);
      }
    }
  }

  const newlyWiredPartIds = new Set<string>();
  const claimedMcuPins = new Set<string>();
  const pendingLinks: Array<{ from: PinRef; to: PinRef }> = [];
  const railReqs: Array<{ partId: string; pinId: string; rail: 'gnd' | '5v' | '3v3' }> = [];
  let addedParts = 0;
  let skippedWiredPins = 0;

  const isPinOccupied = (pinId: string): boolean =>
    claimedMcuPins.has(pinId) || existingWiredMcuPins.has(pinId);
  const hasProtectedPart = (type: string): boolean =>
    parts.some((p) => p.type === type && protectedPartIds.has(p.id));
  const hasExistingWiredPart = (type: string): boolean =>
    hasProtectedPart(type) ||
    existingWires.some((w) => {
      const fp = parts.find((p) => p.id === w.from.partId);
      const tp = parts.find((p) => p.id === w.to.partId);
      return fp?.type === type || tp?.type === type;
    });

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
    const reusable = parts.find(
      (p) => p.type === type && !protectedPartIds.has(p.id) && !newlyWiredPartIds.has(p.id)
    );
    if (reusable) {
      newlyWiredPartIds.add(reusable.id);
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
    newlyWiredPartIds.add(created.id);
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
  let hasLcd = false;
  for (const m of code.matchAll(/\bLiquidCrystal_I2C\s+\w+\s*(?:=\s*LiquidCrystal_I2C\s*)?\(([^)]*)\)/g)) {
    hasLcd = true;
    if (hasProtectedPart('lcd-1602-i2c')) {
      claimedMcuPins.add(i2cSda);
      claimedMcuPins.add(i2cScl);
      skippedWiredPins += 2;
      continue;
    }
    const args = splitTopLevelArgs(m[1]);
    const addr = parseHexOrInt(args[0]);
    const part = ensurePart('lcd-1602-i2c', addr ? { i2cAddress: addr } : undefined);
    if (part) {
      linkPower(part.id);
      linkMcu(i2cSda, part.id, 'SDA');
      linkMcu(i2cScl, part.id, 'SCL');
    }
  }
  if (!hasLcd && /#\s*include\s*<LiquidCrystal_I2C\.h>/.test(code)) {
    if (hasProtectedPart('lcd-1602-i2c')) {
      claimedMcuPins.add(i2cSda);
      claimedMcuPins.add(i2cScl);
      skippedWiredPins += 2;
    } else {
      const part = ensurePart('lcd-1602-i2c');
      if (part) {
        linkPower(part.id);
        linkMcu(i2cSda, part.id, 'SDA');
        linkMcu(i2cScl, part.id, 'SCL');
      }
    }
  }

  // 3b. OLED SSD1306
  if (/\b(?:Adafruit_SSD1306|U8G2_SSD1306|SSD1306Ascii)\b/.test(code) || /#\s*include\s*<Adafruit_SSD1306\.h>/.test(code)) {
    if (hasProtectedPart('oled-ssd1306')) {
      claimedMcuPins.add(i2cSda);
      claimedMcuPins.add(i2cScl);
      skippedWiredPins += 2;
    } else {
      const addrMatch = code.match(/\.begin\s*\([^)]*?(0x3[cCdD])/);
      const addr = addrMatch ? parseHexOrInt(addrMatch[1]) : null;
      const part = ensurePart('oled-ssd1306', addr ? { i2cAddress: addr } : undefined);
      if (part) {
        linkPower(part.id);
        linkMcu(i2cSda, part.id, 'SDA');
        linkMcu(i2cScl, part.id, 'SCL');
      }
    }
  }

  // 3c. DS3231 RTC
  const usesWireOrRtc = /\bWire\b|#\s*include\s*<(?:RTClib|DS3231|Wire)\.h>/.test(code);
  const isMpuSketch =
    /\b(?:MPU6050|Adafruit_MPU6050)\b/i.test(rawSketch) ||
    (/\bWire\.beginTransmission\s*\(\s*0x6[89]\s*\)/.test(code) && /\b0x6[bB]\b|\b0x3[bB]\b/.test(code));
  const isDs3231 =
    /\b(?:RTC_DS3231|DS3231)\b/.test(code) ||
    (usesWireOrRtc && /\b(?:RTC_DS3231|DS3231)\b/i.test(rawSketch)) ||
    (/\bWire\.beginTransmission\s*\(\s*0x68\s*\)/.test(code) &&
      /\b(?:rtc|ds3231|clock|jam|waktu)\b/i.test(rawSketch) &&
      !isMpuSketch);
  if (isDs3231) {
    if (hasProtectedPart('ds3231-rtc')) {
      claimedMcuPins.add(i2cSda);
      claimedMcuPins.add(i2cScl);
      skippedWiredPins += 2;
    } else {
      const part = ensurePart('ds3231-rtc');
      if (part) {
        linkPower(part.id);
        linkMcu(i2cSda, part.id, 'SDA');
        linkMcu(i2cScl, part.id, 'SCL');
      }
    }
  }

  // 3d. MPU6050 IMU
  const isMpu6050 =
    /\b(?:MPU6050|Adafruit_MPU6050)\b/.test(code) ||
    (/\bWire\.beginTransmission\s*\(\s*0x6[89]\s*\)/.test(code) && /\b0x6[bB]\b|\b0x3[bB]\b/.test(code)) ||
    (/\bWire\b|#\s*include\s*<Wire\.h>/.test(code) && /\bmpu[\s_-]*6050\b/i.test(rawSketch));
  if (isMpu6050) {
    if (hasProtectedPart('mpu6050')) {
      claimedMcuPins.add(i2cSda);
      claimedMcuPins.add(i2cScl);
      skippedWiredPins += 2;
    } else {
      const part = ensurePart('mpu6050');
      if (part) {
        linkPower(part.id);
        linkMcu(i2cSda, part.id, 'SDA');
        linkMcu(i2cScl, part.id, 'SCL');
      }
    }
  }

  // 3e. RFID RC522 (SPI)
  let hasRfid = false;
  for (const m of code.matchAll(/\bMFRC522\s+\w+\s*(?:=\s*MFRC522\s*)?\(([^)]*)\)/g)) {
    hasRfid = true;
    const args = splitTopLevelArgs(m[1]);
    const ss = resolvePin(args[0]) ?? (isMega ? '53' : '10');
    const rst = resolvePin(args[1]) ?? '9';
    if (hasProtectedPart('rfid-rc522') || isPinOccupied(ss)) {
      claimedMcuPins.add(ss);
      claimedMcuPins.add(rst);
      claimedMcuPins.add(spiSck);
      claimedMcuPins.add(spiMosi);
      claimedMcuPins.add(spiMiso);
      skippedWiredPins += 1;
      continue;
    }
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
  if (!hasRfid && /\bMFRC522\s+\w+\s*;/.test(code)) {
    const ss = isMega ? '53' : '10';
    const rst = '9';
    if (hasProtectedPart('rfid-rc522') || isPinOccupied(ss)) {
      claimedMcuPins.add(ss);
      claimedMcuPins.add(rst);
      claimedMcuPins.add(spiSck);
      claimedMcuPins.add(spiMosi);
      claimedMcuPins.add(spiMiso);
      skippedWiredPins += 1;
    } else {
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
  }

  // 3f. MAX7219 LED Matrix
  for (const m of code.matchAll(/\bLedControl\s+\w+\s*(?:=\s*LedControl\s*)?\(([^)]*)\)/g)) {
    const args = splitTopLevelArgs(m[1]);
    const din = resolvePin(args[0]);
    const clk = resolvePin(args[1]);
    const cs = resolvePin(args[2]);
    if (din && clk && cs) {
      if (isPinOccupied(din) || isPinOccupied(clk) || isPinOccupied(cs)) {
        claimedMcuPins.add(din);
        claimedMcuPins.add(clk);
        claimedMcuPins.add(cs);
        skippedWiredPins += 1;
        continue;
      }
      const part = ensurePart('max7219');
      if (part) {
        linkPower(part.id);
        linkMcu(din, part.id, 'DIN');
        linkMcu(clk, part.id, 'CLK');
        linkMcu(cs, part.id, 'CS');
      }
    }
  }
  for (const m of code.matchAll(/\bMD_(?:MAX72XX|Parola)\s+\w+\s*(?:=\s*MD_(?:MAX72XX|Parola)\s*)?\(([^)]*)\)/g)) {
    const args = splitTopLevelArgs(m[1]);
    const cs = resolvePin(args[1]) ?? (isMega ? '53' : '10');
    const din = spiMosi;
    const clk = spiSck;
    if (isPinOccupied(din) || isPinOccupied(clk) || isPinOccupied(cs)) {
      claimedMcuPins.add(din);
      claimedMcuPins.add(clk);
      claimedMcuPins.add(cs);
      skippedWiredPins += 1;
      continue;
    }
    const part = ensurePart('max7219');
    if (part) {
      linkPower(part.id);
      linkMcu(din, part.id, 'DIN');
      linkMcu(clk, part.id, 'CLK');
      linkMcu(cs, part.id, 'CS');
    }
  }

  // 3g. DHT22 / DHT11
  let hasDht = false;
  for (const m of code.matchAll(/\bDHT(?:_Unified)?\s+\w+\s*(?:=\s*DHT(?:_Unified)?\s*)?\(([^)]*)\)/g)) {
    hasDht = true;
    const args = splitTopLevelArgs(m[1]);
    const dataPin = resolvePin(args[0]);
    if (dataPin) {
      if (isPinOccupied(dataPin)) {
        claimedMcuPins.add(dataPin);
        skippedWiredPins += 1;
        continue;
      }
      const model = /DHT11/i.test(args[1] ?? '') ? 'DHT11' : 'DHT22';
      const part = ensurePart('dht22', { model });
      if (part) {
        linkPower(part.id);
        linkMcu(dataPin, part.id, 'DATA');
      }
    }
  }
  for (const m of code.matchAll(/\bSimpleDHT(11|22)\s+([A-Za-z_]\w*)/g)) {
    hasDht = true;
    const model = m[1] === '11' ? 'DHT11' : 'DHT22';
    const readMatch = code.match(new RegExp(`\\b${m[2]}\\.read\\s*\\(\\s*([^,)]+)`));
    const dataPin = resolvePin(readMatch?.[1]);
    if (dataPin) {
      if (isPinOccupied(dataPin)) {
        claimedMcuPins.add(dataPin);
        skippedWiredPins += 1;
        continue;
      }
      const part = ensurePart('dht22', { model });
      if (part) {
        linkPower(part.id);
        linkMcu(dataPin, part.id, 'DATA');
      }
    }
  }

  // 3h. Servo motors (servo vs servo-360)
  const servoVars = new Set<string>();
  for (const m of code.matchAll(/\bServo\s+([^;]+);/g)) {
    for (const decl of m[1].split(',')) {
      const vm = decl.trim().match(/^([A-Za-z_]\w*)/);
      if (vm) servoVars.add(vm[1]);
    }
  }
  const servo360LocalRe = /360|continuous|kontinu|wheel|roda|drive/i;
  const servo360GlobalRe = /360|continuous|kontinu|\bwheel\w*|\broda\w*/i;
  const servo180Re = /\bsg90\b|\b180\b|mg996|mg995|sudut|angle|palang|pintu|\bgate\b/i;
  for (const varName of servoVars) {
    const attachRe = new RegExp(`\\b${varName}(?:\\s*\\[[^\\]]*\\])?\\.attach\\s*\\(([^)]*)\\)`, 'g');
    for (const m of code.matchAll(attachRe)) {
      for (const pin of resolvePins(splitTopLevelArgs(m[1])[0])) {
        if (isPinOccupied(pin)) {
          claimedMcuPins.add(pin);
          skippedWiredPins += 1;
          continue;
        }
        const localHint = `${varName} ${pinVarHints.get(pin) ?? ''} ${pinLocalContext.get(pin) ?? ''}`;
        let servoType: 'servo' | 'servo-360' = 'servo';
        if (servo180Re.test(localHint) && !/360|continuous|kontinu/i.test(localHint)) {
          servoType = 'servo';
        } else if (servo360LocalRe.test(localHint) || servo360GlobalRe.test(rawSketch)) {
          servoType = 'servo-360';
        }
        const part = ensurePart(servoType);
        if (part) {
          linkPower(part.id);
          linkMcu(pin, part.id, 'SIG');
        }
      }
    }
  }

  // 3i. NeoPixel Strip
  for (const m of code.matchAll(/\bAdafruit_NeoPixel\s+\w+\s*(?:=\s*Adafruit_NeoPixel\s*)?\(([^)]*)\)/g)) {
    const args = splitTopLevelArgs(m[1]);
    const din = resolvePin(args[1]);
    if (din) {
      if (isPinOccupied(din)) {
        claimedMcuPins.add(din);
        skippedWiredPins += 1;
        continue;
      }
      const part = ensurePart('neopixel-strip');
      if (part) {
        linkPower(part.id);
        linkMcu(din, part.id, 'DIN');
      }
    }
  }
  for (const m of code.matchAll(/\bFastLED\.addLeds\s*<[^>]*,\s*([^,>]+)\s*(?:,[^>]*)?>/g)) {
    const din = resolvePin(m[1]);
    if (din) {
      if (isPinOccupied(din)) {
        claimedMcuPins.add(din);
        skippedWiredPins += 1;
        continue;
      }
      const part = ensurePart('neopixel-strip');
      if (part) {
        linkPower(part.id);
        linkMcu(din, part.id, 'DIN');
      }
    }
  }

  // 3j. Stepper Motor
  for (const m of code.matchAll(/\bStepper\s+\w+\s*(?:=\s*Stepper\s*)?\(([^)]*)\)/g)) {
    const args = splitTopLevelArgs(m[1]);
    const steps = parseHexOrInt(args[0]);
    const p1 = resolvePin(args[1]);
    const p2 = resolvePin(args[2]);
    const p3 = resolvePin(args[3]);
    const p4 = resolvePin(args[4]);
    if (p1 && p2 && p3 && p4) {
      if (isPinOccupied(p1) || isPinOccupied(p2) || isPinOccupied(p3) || isPinOccupied(p4)) {
        claimedMcuPins.add(p1);
        claimedMcuPins.add(p2);
        claimedMcuPins.add(p3);
        claimedMcuPins.add(p4);
        skippedWiredPins += 1;
        continue;
      }
      const part = ensurePart('stepper', steps && steps >= 8 ? { stepsPerRev: steps } : undefined);
      if (part) {
        linkMcu(p1, part.id, 'IN1');
        linkMcu(p2, part.id, 'IN2');
        linkMcu(p3, part.id, 'IN3');
        linkMcu(p4, part.id, 'IN4');
      }
    }
  }
  for (const m of code.matchAll(/\bAccelStepper\s+\w+\s*(?:=\s*AccelStepper\s*)?\(([^)]*)\)/g)) {
    const args = splitTopLevelArgs(m[1]);
    if (args.length >= 5) {
      const p1 = resolvePin(args[1]);
      const p2 = resolvePin(args[2]);
      const p3 = resolvePin(args[3]);
      const p4 = resolvePin(args[4]);
      if (p1 && p2 && p3 && p4) {
        if (isPinOccupied(p1) || isPinOccupied(p2) || isPinOccupied(p3) || isPinOccupied(p4)) {
          claimedMcuPins.add(p1);
          claimedMcuPins.add(p2);
          claimedMcuPins.add(p3);
          claimedMcuPins.add(p4);
          skippedWiredPins += 1;
          continue;
        }
        const part = ensurePart('stepper');
        if (part) {
          linkMcu(p1, part.id, 'IN1');
          linkMcu(p2, part.id, 'IN2');
          linkMcu(p3, part.id, 'IN3');
          linkMcu(p4, part.id, 'IN4');
        }
      }
    }
  }

  // 3k. Keypad 4x4
  let hasKeypad = false;
  for (const m of code.matchAll(/\bKeypad\s+\w+\s*(?:=\s*Keypad\s*)?\(([^)]*)\)/g)) {
    const args = splitTopLevelArgs(m[1]);
    const rowArr = symArrays.get(args[1] ?? '');
    const colArr = symArrays.get(args[2] ?? '');
    if (rowArr && colArr && rowArr.length >= 4 && colArr.length >= 4) {
      const rows = rowArr.slice(0, 4).map((x) => resolvePin(x));
      const cols = colArr.slice(0, 4).map((x) => resolvePin(x));
      if (rows.every(Boolean) && cols.every(Boolean)) {
        hasKeypad = true;
        const allPins = [...rows, ...cols] as string[];
        if (allPins.some((p) => isPinOccupied(p))) {
          allPins.forEach((p) => claimedMcuPins.add(p));
          skippedWiredPins += 1;
          continue;
        }
        const part = ensurePart('keypad-4x4');
        if (part) {
          rows.forEach((p, i) => linkMcu(p!, part.id, `R${i + 1}`));
          cols.forEach((p, i) => linkMcu(p!, part.id, `C${i + 1}`));
        }
      }
    }
  }

  // 3l. UART -> GPS NEO-6M or Bluetooth HC-05
  const gpsCtxRe = /gps|neo[\s_-]*6m|nmea|tinygps|gpgga|gprmc|satelit|latitude|longitude/i;
  const btCtxRe = /bluetooth|hc[\s_-]*05|hc05|\bbt\b/i;
  for (const m of code.matchAll(
    /\b(?:SoftwareSerial|AltSoftSerial|NeoSWSerial)\s+([A-Za-z_]\w*)\s*(?:=\s*(?:SoftwareSerial|AltSoftSerial|NeoSWSerial)\s*)?\(([^)]*)\)/g
  )) {
    const varName = m[1];
    const args = splitTopLevelArgs(m[2]);
    const rxPin = resolvePin(args[0]);
    const txPin = resolvePin(args[1]);
    if (rxPin && txPin) {
      if (isPinOccupied(rxPin) || isPinOccupied(txPin)) {
        claimedMcuPins.add(rxPin);
        claimedMcuPins.add(txPin);
        skippedWiredPins += 1;
        continue;
      }
      const isGps = gpsCtxRe.test(`${varName} ${rawSketch}`);
      const part = ensurePart(isGps ? 'gps-neo6m' : 'hc-05');
      if (part) {
        linkPower(part.id);
        linkMcu(rxPin, part.id, isGps ? 'TX' : 'TXD');
        linkMcu(txPin, part.id, isGps ? 'RX' : 'RXD');
      }
    }
  }
  if (isMega) {
    const megaSerialPins: Record<string, [string, string]> = {
      '1': ['19', '18'],
      '2': ['17', '16'],
      '3': ['15', '14'],
    };
    for (const m of code.matchAll(/\bSerial([123])\.begin\s*\(/g)) {
      const [rxPin, txPin] = megaSerialPins[m[1]];
      if (!gpsCtxRe.test(rawSketch) && !btCtxRe.test(rawSketch)) continue;
      if (isPinOccupied(rxPin) || isPinOccupied(txPin)) {
        claimedMcuPins.add(rxPin);
        claimedMcuPins.add(txPin);
        skippedWiredPins += 1;
        continue;
      }
      const isGps = gpsCtxRe.test(rawSketch);
      const part = ensurePart(isGps ? 'gps-neo6m' : 'hc-05');
      if (part) {
        linkPower(part.id);
        linkMcu(rxPin, part.id, isGps ? 'TX' : 'TXD');
        linkMcu(txPin, part.id, isGps ? 'RX' : 'RXD');
      }
    }
  }

  // 3m. HC-SR04 Ultrasonic (pulseIn ECHO + TRIG, or NewPing)
  const pendingPulseInEchoPins: string[] = [];
  for (const m of code.matchAll(/\bpulseIn(?:Long)?\s*\(\s*([^,)]+)\s*,\s*HIGH/g)) {
    const echoPin = resolvePin(m[1]);
    if (!echoPin || claimedMcuPins.has(echoPin)) continue;
    if (existingWiredMcuPins.has(echoPin)) {
      claimedMcuPins.add(echoPin);
      skippedWiredPins += 1;
      continue;
    }
    let trigPin: string | null = null;
    for (const [sym] of symValues) {
      if (/trig/i.test(sym)) {
        const p = resolvePin(sym);
        if (p && p !== echoPin && !isPinOccupied(p)) {
          trigPin = p;
          break;
        }
      }
    }
    if (!trigPin) {
      for (const tm of code.matchAll(/\bdigitalWrite\s*\(\s*([^,)]+)\s*,\s*HIGH\s*\)\s*;\s*delayMicroseconds\s*\(\s*\d+\s*\)/g)) {
        const p = resolvePin(tm[1]);
        if (p && p !== echoPin && !isPinOccupied(p)) {
          trigPin = p;
          break;
        }
      }
    }
    if (trigPin) {
      const part = ensurePart('hc-sr04');
      if (part) {
        linkPower(part.id);
        linkMcu(trigPin, part.id, 'TRIG');
        linkMcu(echoPin, part.id, 'ECHO');
      }
    } else if (!pendingPulseInEchoPins.includes(echoPin)) {
      pendingPulseInEchoPins.push(echoPin);
    }
  }
  for (const m of code.matchAll(/\bNewPing\s+\w+\s*(?:=\s*NewPing\s*)?\(([^)]*)\)/g)) {
    const args = splitTopLevelArgs(m[1]);
    const trigPin = resolvePin(args[0]);
    const echoPin = resolvePin(args[1]);
    if (trigPin && echoPin) {
      if (isPinOccupied(trigPin) || isPinOccupied(echoPin)) {
        claimedMcuPins.add(trigPin);
        claimedMcuPins.add(echoPin);
        skippedWiredPins += 1;
        continue;
      }
      const part = ensurePart('hc-sr04');
      if (part) {
        linkPower(part.id);
        linkMcu(trigPin, part.id, 'TRIG');
        linkMcu(echoPin, part.id, 'ECHO');
      }
    }
  }

  // 3n. Buzzer via tone() / noTone()
  for (const m of code.matchAll(/\b(?:noTone|tone)\s*\(\s*([^,)]+)/g)) {
    for (const pin of resolvePins(m[1])) {
      if (isPinOccupied(pin)) {
        claimedMcuPins.add(pin);
        skippedWiredPins += 1;
        continue;
      }
      const part = ensurePart('buzzer');
      if (part) {
        linkMcu(pin, part.id, '+');
        requestRail(part.id, '-', 'gnd');
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
      if (existingWiredMcuPins.has(p)) {
        claimedMcuPins.add(p);
        skippedWiredPins += 1;
        continue;
      }
      if (m[2] === 'OUTPUT') outputPins.add(p);
      else inputPins.add(p);
    }
  }
  for (const m of code.matchAll(/\b(?:digitalWrite|analogWrite)\s*\(\s*([^,)]+)/g)) {
    for (const p of resolvePins(m[1])) {
      if (claimedMcuPins.has(p) || inputPins.has(p)) continue;
      if (existingWiredMcuPins.has(p)) {
        claimedMcuPins.add(p);
        skippedWiredPins += 1;
        continue;
      }
      outputPins.add(p);
    }
  }
  for (const m of code.matchAll(/\bdigitalRead\s*\(\s*([^)]+)\)/g)) {
    for (const p of resolvePins(m[1])) {
      if (claimedMcuPins.has(p) || outputPins.has(p)) continue;
      if (existingWiredMcuPins.has(p)) {
        claimedMcuPins.add(p);
        skippedWiredPins += 1;
        continue;
      }
      inputPins.add(p);
    }
  }
  for (const m of code.matchAll(/\banalogRead\s*\(\s*([^)]+)\)/g)) {
    for (const p of resolvePins(m[1])) {
      if (claimedMcuPins.has(p)) continue;
      if (existingWiredMcuPins.has(p)) {
        claimedMcuPins.add(p);
        skippedWiredPins += 1;
        continue;
      }
      analogPins.add(p);
    }
  }

  if (usesHardwareSerial) {
    outputPins.delete('0');
    outputPins.delete('1');
    inputPins.delete('0');
    inputPins.delete('1');
  }

  // 4.0a. HC-SR04 fallback (unresolved pulseIn echo + generic output, or named trig/echo GPIO)
  for (const echoPin of pendingPulseInEchoPins) {
    if (claimedMcuPins.has(echoPin)) continue;
    const availOut = Array.from(outputPins).filter((p) => !claimedMcuPins.has(p) && p !== echoPin);
    let trigPin: string | null = availOut.find((p) => /trig/i.test(pinVarHints.get(p) ?? '')) ?? null;
    if (
      !trigPin &&
      (availOut.length === 1 || /hc[\s_-]*sr04|ultrasoni[ck]|jarak|distance|sonar/i.test(rawSketch))
    ) {
      trigPin = availOut[0] ?? null;
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
  const findUnclaimed = (set: Set<string>, re: RegExp): string | null => {
    for (const p of set) {
      if (!claimedMcuPins.has(p) && re.test(`${pinVarHints.get(p) ?? ''} ${pinLocalContext.get(p) ?? ''}`)) {
        return p;
      }
    }
    return null;
  };
  const namedTrig = findUnclaimed(outputPins, /\btrig/i);
  const namedEcho = findUnclaimed(inputPins, /\becho/i);
  if (namedTrig && namedEcho) {
    const part = ensurePart('hc-sr04');
    if (part) {
      linkPower(part.id);
      linkMcu(namedTrig, part.id, 'TRIG');
      linkMcu(namedEcho, part.id, 'ECHO');
    }
  }

  // 4.0b. Keypad 4x4 fallback (manual matrix scan without <Keypad.h>)
  if (!hasKeypad && /keypad|4\s*x\s*4|matri[xk]s?\s*4/i.test(rawSketch)) {
    const fourPinArrays: string[][] = [];
    for (const arr of symArrays.values()) {
      if (arr.length === 4) {
        const resolved = arr.map((x) => resolvePin(x)).filter((x): x is string => Boolean(x));
        if (resolved.length === 4 && resolved.every((p) => !isPinOccupied(p))) {
          fourPinArrays.push(resolved);
        }
      }
    }
    let rows: string[] | null = null;
    let cols: string[] | null = null;
    if (fourPinArrays.length >= 2) {
      rows = fourPinArrays[0];
      cols = fourPinArrays[1];
    } else {
      const availOut = Array.from(outputPins).filter((p) => !claimedMcuPins.has(p));
      const availIn = Array.from(inputPins).filter((p) => !claimedMcuPins.has(p));
      if (availOut.length >= 4 && availIn.length >= 4) {
        rows = availOut.slice(0, 4);
        cols = availIn.slice(0, 4);
      }
    }
    if (rows && cols) {
      const part = ensurePart('keypad-4x4');
      if (part) {
        rows.forEach((p, i) => linkMcu(p, part.id, `R${i + 1}`));
        cols.forEach((p, i) => linkMcu(p, part.id, `C${i + 1}`));
      }
    }
  }

  // 4a. L298N Motor Driver (named pins OR generic pins with l298n/h-bridge context)
  const findOutputByHint = (re: RegExp): string | null => {
    for (const p of outputPins) {
      if (!claimedMcuPins.has(p) && re.test(pinVarHints.get(p) ?? '')) return p;
    }
    return null;
  };
  let createdL298n: PartInstance | null = null;
  let in1Pin = findOutputByHint(/\bin1\b|\bmotor_?a1\b|\bdir_?1\b/i);
  let in2Pin = findOutputByHint(/\bin2\b|\bmotor_?a2\b|\bdir_?2\b/i);
  let in3Pin = findOutputByHint(/\bin3\b|\bmotor_?b1\b/i);
  let in4Pin = findOutputByHint(/\bin4\b|\bmotor_?b2\b/i);
  let enaPin = findOutputByHint(/\bena\b/i);
  let enbPin = findOutputByHint(/\benb\b/i);

  if (!(in1Pin && in2Pin) && /l298n|h[\s_-]*bridge|motor[\s_-]*driver|driver[\s_-]*motor/i.test(rawSketch)) {
    const driverCandidates = Array.from(outputPins).filter(
      (p) => !claimedMcuPins.has(p) && !/\b(?:led|buzz|relay|relai)\b/i.test(pinVarHints.get(p) ?? '')
    );
    if (driverCandidates.length >= 2) {
      const pwmCands = driverCandidates.filter((p) => pwmWritePins.has(p) || isHwPwmPin(p));
      const nonPwmCands = driverCandidates.filter((p) => !pwmCands.includes(p));
      const takeNonPwmOrFallback = (n: number): string[] => {
        const picked: string[] = [];
        for (const p of nonPwmCands) {
          if (picked.length < n) picked.push(p);
        }
        for (const p of pwmCands) {
          if (picked.length < n && !picked.includes(p)) picked.push(p);
        }
        return picked;
      };
      if (driverCandidates.length >= 6 && pwmCands.length >= 2) {
        enaPin = pwmCands[0];
        enbPin = pwmCands[1];
        const rest = driverCandidates.filter((p) => p !== enaPin && p !== enbPin);
        [in1Pin, in2Pin, in3Pin, in4Pin] = [rest[0], rest[1], rest[2], rest[3]];
      } else if (driverCandidates.length === 5 && pwmCands.length >= 1) {
        enaPin = pwmCands[0];
        const rest = driverCandidates.filter((p) => p !== enaPin);
        [in1Pin, in2Pin, in3Pin, in4Pin] = [rest[0], rest[1], rest[2], rest[3]];
      } else if (driverCandidates.length === 4) {
        [in1Pin, in2Pin, in3Pin, in4Pin] = driverCandidates.slice(0, 4);
      } else if (driverCandidates.length === 3 && pwmCands.length >= 1) {
        enaPin = pwmCands[0];
        const rest = driverCandidates.filter((p) => p !== enaPin);
        [in1Pin, in2Pin] = [rest[0], rest[1]];
      } else {
        const pair = takeNonPwmOrFallback(2);
        [in1Pin, in2Pin] = [pair[0], pair[1]];
      }
    }
  }

  if (in1Pin && in2Pin) {
    const drv = ensurePart('l298n');
    if (drv) {
      createdL298n = drv;
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

  // 4b. 7-Segment Display (SevSeg library OR 7-8 output pins with 7seg/segment context)
  const hasSevenSegCtx = /\bSevSeg\b/.test(code) || /7[\s_-]*seg|seven[\s_-]*seg|segment|segmen/i.test(rawSketch);
  if (hasSevenSegCtx) {
    let segPins: string[] = [];
    for (const arr of symArrays.values()) {
      if (arr.length === 7 || arr.length === 8) {
        const resolved = arr.map((x) => resolvePin(x)).filter((x): x is string => Boolean(x));
        if (resolved.length === arr.length && resolved.every((p) => !isPinOccupied(p))) {
          segPins = resolved;
          break;
        }
      }
    }
    if (segPins.length === 0) {
      const availOut = Array.from(outputPins).filter((p) => !claimedMcuPins.has(p));
      if (availOut.length >= 7 && availOut.length <= 8) {
        segPins = availOut;
      }
    }
    if (segPins.length >= 7) {
      const isAnode = /common[\s_-]*anode|anoda[\s_-]*bersama|COMMON_ANODE/i.test(rawSketch);
      const segPart = ensurePart('seven-seg', { common: isAnode ? 'anode' : 'cathode' });
      if (segPart) {
        const segNames = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'];
        const usedSegPins = new Set<string>();
        const assigned = new Map<string, string>();
        for (const p of segPins) {
          const hint = pinVarHints.get(p) ?? '';
          const sm = hint.match(/\b(?:seg_?)?(a|b|c|d|e|f|g|dp)\b/i);
          if (sm) {
            const name = sm[1].toLowerCase();
            if (!assigned.has(name)) {
              assigned.set(name, p);
              usedSegPins.add(p);
            }
          }
        }
        const remPins = segPins.filter((p) => !usedSegPins.has(p));
        let ri = 0;
        for (const name of segNames) {
          if (assigned.has(name)) {
            linkMcu(assigned.get(name)!, segPart.id, name);
          } else if (ri < remPins.length) {
            linkMcu(remPins[ri++], segPart.id, name);
          }
        }
        requestRail(segPart.id, 'COM', isAnode ? '5v' : 'gnd');
      }
    }
  }

  // 4c. RGB LED (3 named R/G/B output pins OR 3 PWM output pins with rgb context)
  let rPin = findOutputByHint(/\b(?:r_?pin|red_?pin|led_?r|pin_?r|rgb_?r)\b/i);
  let gPin = findOutputByHint(/\b(?:g_?pin|green_?pin|led_?g|pin_?g|rgb_?g)\b/i);
  let bPin = findOutputByHint(/\b(?:b_?pin|blue_?pin|led_?b|pin_?b|rgb_?b)\b/i);
  if (!(rPin && gPin && bPin) && /\brgb\b|led[\s_-]*rgb|warna[\s_-]*rgb|setColor/i.test(rawSketch)) {
    const availOut = Array.from(outputPins).filter((p) => !claimedMcuPins.has(p));
    const pwmCands = availOut.filter((p) => pwmWritePins.has(p) || isHwPwmPin(p));
    if (pwmCands.length >= 3) {
      [rPin, gPin, bPin] = [pwmCands[0], pwmCands[1], pwmCands[2]];
    }
  }
  if (rPin && gPin && bPin && rPin !== gPin && gPin !== bPin && rPin !== bPin) {
    const isRgbAnode = /common[\s_-]*anode|anoda[\s_-]*bersama|COMMON_ANODE/i.test(rawSketch);
    const rgb = ensurePart('rgb-led', isRgbAnode ? { common: 'anode' } : undefined);
    if (rgb) {
      linkMcu(rPin, rgb.id, 'R');
      linkMcu(gPin, rgb.id, 'G');
      linkMcu(bPin, rgb.id, 'B');
      requestRail(rgb.id, 'COM', isRgbAnode ? '5v' : 'gnd');
    }
  }

  // Shared context classification helpers for 4d / 4e / 4f
  let sharedMq2: PartInstance | null = null;
  let sharedIr: PartInstance | null = null;
  let sharedSoil: PartInstance | null = null;
  let sharedRain: PartInstance | null = null;

  const potExplicitRe = /(?:^|[^a-z])pot(?:en\w*)?(?:[^a-z]|$)|knob|dial|trim|setpoint|dimmer/i;
  const btnExplicitRe = /(?:^|[^a-z])(?:btn|sw)(?:[^a-z]|$)|button|tombol|saklar|switch|push/i;
  const ledExplicitRe = /(?:^|[^a-z])led(?:[^a-z]|$)|lampu[\s_-]*(?:merah|hijau|kuning|biru|putih|indikator)|indikator/i;

  const classifyAnalog = (text: string, isGlobal: boolean): string | null => {
    if (!text) return null;
    if (isGlobal) {
      if (/mq[\s_-]*2|mq2/i.test(text)) return 'mq2';
      if (/lm35|0\.488|500\.0\s*\/\s*1024/i.test(text)) return 'lm35';
      if (/\bldr\b|photoresistor|photocell/i.test(text)) return 'ldr';
      if (/yl[\s_-]*69|fc[\s_-]*28|soil[\s_-]*moist/i.test(text)) return 'soil-moisture';
      if (/fc[\s_-]*37|mh[\s_-]*rd|raindrop/i.test(text)) return 'rain-sensor';
      if (/tcrt|fc[\s_-]*51|ir[\s_-]*obstacle/i.test(text)) return 'ir-obstacle';
      if (/water[\s_-]*level/i.test(text)) return 'water-level';

      if (/sensor[\s_-]*gas|\bgas\b|smoke|asap|lpg|metana|methane|kebocoran/i.test(text)) return 'mq2';
      if (/water[\s_-]*level|level[\s_-]*air|ketinggian[\s_-]*air|tinggi[\s_-]*air|sensor[\s_-]*air|tangki|tandon|flood|banjir|muka[\s_-]*air/i.test(text))
        return 'water-level';
      if (/soil|moisture|tanah|kelembap\w*\s+tanah|siram|tanaman/i.test(text)) return 'soil-moisture';
      if (/rain|hujan|tetes(?:an)?|gerimis|jemuran/i.test(text)) return 'rain-sensor';
      if (/\bir\b.*(?:sensor|halang|obstacle|objek|garis)|infrared|infra\s*merah|obstacle|halangan|rintangan/i.test(text))
        return 'ir-obstacle';
      if (!hasDht && /suhu|temperatur|cel[cs]ius/i.test(text)) return 'lm35';
      if (/sensor[\s_-]*cahaya|light[\s_-]*sensor|cahaya|gelap|terang|\blux\b/i.test(text)) return 'ldr';
      return null;
    }
    if (/mq[\s_-]*2|mq2|\bgas\b|smoke|asap|lpg|metana|methane|kebocoran/i.test(text)) return 'mq2';
    if (/(?:^|[^a-z])ir(?:[^a-z]|sensor|pin|out|ao|do|obs|$)|infrared|infra\s*merah|obstacle|halang|rintang|tcrt|fc[\s_-]*51/i.test(text))
      return 'ir-obstacle';
    if (/soil|moist|tanah|kelembap|yl[\s_-]*69|fc[\s_-]*28|siram|tanaman/i.test(text)) return 'soil-moisture';
    if (/rain|hujan|drop|tetes|gerimis|jemuran|fc[\s_-]*37|mh[\s_-]*rd/i.test(text)) return 'rain-sensor';
    if (/water|air_?level|level_?air|tinggi_?air|tangki|tandon|tank|flood|banjir/i.test(text)) return 'water-level';
    if (/lm35|temp|suhu|cel[cs]ius|0\.488/i.test(text)) return 'lm35';
    if (/ldr|light|cahaya|gelap|terang|lux|photo/i.test(text)) return 'ldr';
    return null;
  };

  const classifyDigitalInput = (text: string, isGlobal: boolean): string | null => {
    if (!text) return null;
    if (/(?:^|[^a-z])pir(?:[^a-z]|$)|motion|gerak/i.test(text)) return 'pir';
    if (/mq[\s_-]*2|mq2|sensor[\s_-]*gas|\bgas\b|smoke|asap|lpg|metana|methane|kebocoran/i.test(text)) return 'mq2';
    if (isGlobal) {
      if (/tcrt|fc[\s_-]*51|ir[\s_-]*obstacle|\bir\b.*(?:sensor|halang|obstacle|objek|garis)|infrared|infra\s*merah|obstacle|halangan|rintangan/i.test(text))
        return 'ir-obstacle';
      if (/yl[\s_-]*69|fc[\s_-]*28|soil|moisture|tanah|kelembap\w*\s+tanah|siram|tanaman/i.test(text))
        return 'soil-moisture';
      if (/fc[\s_-]*37|mh[\s_-]*rd|raindrop|rain|hujan|tetes(?:an)?|gerimis|jemuran/i.test(text))
        return 'rain-sensor';
    } else {
      if (/(?:^|[^a-z])ir(?:[^a-z]|sensor|pin|out|ao|do|obs|$)|infrared|infra\s*merah|obstacle|halang|rintang|tcrt|fc[\s_-]*51/i.test(text))
        return 'ir-obstacle';
      if (/soil|moist|tanah|kelembap|yl[\s_-]*69|fc[\s_-]*28|siram|tanaman/i.test(text)) return 'soil-moisture';
      if (/rain|hujan|drop|tetes|gerimis|jemuran|fc[\s_-]*37|mh[\s_-]*rd/i.test(text)) return 'rain-sensor';
    }
    return null;
  };

  const classifyDigitalOutput = (text: string, isGlobal: boolean): string | null => {
    if (!text) return null;
    const isRelay = /relay|relai|pompa|pump|solenoid|katup|valve/i.test(text);
    const isStrongBuzz = /buzz|piezo|speaker|beep|sirin|siren|nada|bunyi/i.test(text);
    const isAlarm = /\balarm\b/i.test(text);
    if (isGlobal) {
      if (isRelay && !isStrongBuzz) return 'relay';
      if (isStrongBuzz || isAlarm) return 'buzzer';
      if (isRelay) return 'relay';
      if (/motor[\s_-]*dc|dc[\s_-]*motor|kipas|\bfan\b|dinamo|blower/i.test(text)) return 'dc-motor';
      return null;
    }
    if (isRelay) return 'relay';
    if (isStrongBuzz || isAlarm) return 'buzzer';
    if (/motor|kipas|\bfan\b|dinamo|blower/i.test(text)) return 'dc-motor';
    return null;
  };

  // 4d. Analog sensors (7 analog sensors -> Potentiometer fallback)
  for (const p of analogPins) {
    if (claimedMcuPins.has(p)) continue;
    const directHint = pinVarHints.get(p) ?? '';
    const localCtx = pinLocalContext.get(p) ?? '';

    let kind: string | null = null;
    if (potExplicitRe.test(directHint) || potExplicitRe.test(localCtx)) {
      kind = 'potentiometer';
    } else {
      kind =
        classifyAnalog(directHint, false) ??
        classifyAnalog(localCtx, false) ??
        classifyAnalog(rawSketch, true) ??
        'potentiometer';
    }

    if (kind === 'mq2') {
      const part: PartInstance | null = sharedMq2 ?? ensurePart('mq2');
      if (part) {
        if (!sharedMq2) {
          sharedMq2 = part;
          linkPower(part.id);
        }
        linkMcu(p, part.id, 'AOUT');
      }
    } else if (kind === 'ir-obstacle') {
      const part: PartInstance | null = sharedIr ?? ensurePart('ir-obstacle');
      if (part) {
        if (!sharedIr) {
          sharedIr = part;
          linkPower(part.id);
        }
        linkMcu(p, part.id, 'AO');
      }
    } else if (kind === 'soil-moisture') {
      const part: PartInstance | null = sharedSoil ?? ensurePart('soil-moisture');
      if (part) {
        if (!sharedSoil) {
          sharedSoil = part;
          linkPower(part.id);
        }
        linkMcu(p, part.id, 'AO');
      }
    } else if (kind === 'rain-sensor') {
      const part: PartInstance | null = sharedRain ?? ensurePart('rain-sensor');
      if (part) {
        if (!sharedRain) {
          sharedRain = part;
          linkPower(part.id);
        }
        linkMcu(p, part.id, 'AO');
      }
    } else if (kind === 'water-level') {
      const part = ensurePart('water-level');
      if (part) {
        linkPower(part.id);
        linkMcu(p, part.id, 'AO');
      }
    } else if (kind === 'lm35') {
      const part = ensurePart('lm35');
      if (part) {
        linkPower(part.id);
        linkMcu(p, part.id, 'OUT');
      }
    } else if (kind === 'ldr') {
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

  // 4e. Digital inputs (PIR, MQ-2 DOUT, IR Obstacle OUT, Soil DO, Rain DO, Pushbutton)
  for (const p of inputPins) {
    if (claimedMcuPins.has(p)) continue;
    const directHint = pinVarHints.get(p) ?? '';
    const localCtx = pinLocalContext.get(p) ?? '';

    let kind: string | null = null;
    if (btnExplicitRe.test(directHint) || btnExplicitRe.test(localCtx)) {
      kind = 'pushbutton';
    } else {
      kind =
        classifyDigitalInput(directHint, false) ??
        classifyDigitalInput(localCtx, false) ??
        classifyDigitalInput(rawSketch, true) ??
        'pushbutton';
    }

    if (kind === 'pir') {
      const part = ensurePart('pir');
      if (part) {
        linkPower(part.id);
        linkMcu(p, part.id, 'OUT');
      }
    } else if (kind === 'mq2') {
      const part: PartInstance | null = sharedMq2 ?? ensurePart('mq2');
      if (part) {
        if (!sharedMq2) {
          sharedMq2 = part;
          linkPower(part.id);
        }
        linkMcu(p, part.id, 'DOUT');
      }
    } else if (kind === 'ir-obstacle') {
      const part: PartInstance | null = sharedIr ?? ensurePart('ir-obstacle');
      if (part) {
        if (!sharedIr) {
          sharedIr = part;
          linkPower(part.id);
        }
        linkMcu(p, part.id, 'OUT');
      }
    } else if (kind === 'soil-moisture') {
      const part: PartInstance | null = sharedSoil ?? ensurePart('soil-moisture');
      if (part) {
        if (!sharedSoil) {
          sharedSoil = part;
          linkPower(part.id);
        }
        linkMcu(p, part.id, 'DO');
      }
    } else if (kind === 'rain-sensor') {
      const part: PartInstance | null = sharedRain ?? ensurePart('rain-sensor');
      if (part) {
        if (!sharedRain) {
          sharedRain = part;
          linkPower(part.id);
        }
        linkMcu(p, part.id, 'DO');
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

  // 4f. Digital / PWM outputs (Relay, Buzzer, DC Motor, or LED + 220 Ohm Resistor)
  for (const p of outputPins) {
    if (claimedMcuPins.has(p)) continue;
    const directHint = pinVarHints.get(p) ?? '';
    const localCtx = pinLocalContext.get(p) ?? '';

    let kind: string | null = null;
    if ((ledExplicitRe.test(directHint) || ledExplicitRe.test(localCtx)) && !/\brgb\b|relay|relai/i.test(`${directHint} ${localCtx}`)) {
      kind = 'led';
    } else {
      kind =
        classifyDigitalOutput(directHint, false) ??
        classifyDigitalOutput(localCtx, false) ??
        classifyDigitalOutput(rawSketch, true) ??
        'led';
    }

    if (kind === 'relay') {
      const part = ensurePart('relay');
      if (part) {
        linkPower(part.id);
        linkMcu(p, part.id, 'IN');
      }
    } else if (kind === 'buzzer') {
      const part = ensurePart('buzzer');
      if (part) {
        linkMcu(p, part.id, '+');
        requestRail(part.id, '-', 'gnd');
      }
    } else if (kind === 'dc-motor') {
      const part = ensurePart('dc-motor');
      if (part) {
        linkMcu(p, part.id, '+');
        requestRail(part.id, '-', 'gnd');
      }
    } else {
      const colorCtx = `${directHint} ${localCtx}`;
      const ledColor: LedColor = /green|hijau/i.test(colorCtx)
        ? 'green'
        : /yellow|kuning/i.test(colorCtx)
          ? 'yellow'
          : /blue|biru/i.test(colorCtx)
            ? 'blue'
            : /white|putih/i.test(colorCtx)
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

  // 4g. Explicit Power Modules & Breadboard (only when explicitly mentioned in sketch)
  let extBat: PartInstance | null = null;
  if (
    /\blipo\s*3s\b|\b3s\s*lipo\b|battery[\s_-]*lipo|baterai[\s_-]*lipo|\blipo\b|\b11\.1\s*v\b/i.test(rawSketch) &&
    !hasExistingWiredPart('battery-lipo-3s')
  ) {
    extBat = ensurePart('battery-lipo-3s');
  } else if (
    /\b18650\b|baterai[\s_-]*18650|battery[\s_-]*18650/i.test(rawSketch) &&
    !hasExistingWiredPart('battery-18650')
  ) {
    const cells = /\b3s\b/i.test(rawSketch) ? 3 : /\b2s\b|\b7\.4\s*v\b/i.test(rawSketch) ? 2 : 1;
    extBat = ensurePart('battery-18650', { cells, voltage: Number((cells * 3.7).toFixed(1)) });
  }

  let extBuck: PartInstance | null = null;
  if (/\blm2596\b|step[\s_-]*down|\bbuck\b/i.test(rawSketch) && !hasExistingWiredPart('buck-lm2596')) {
    extBuck = ensurePart('buck-lm2596');
  }

  let extBoost: PartInstance | null = null;
  if (/\bmt3608\b|step[\s_-]*up|\bboost\b/i.test(rawSketch) && !hasExistingWiredPart('boost-mt3608')) {
    extBoost = ensurePart('boost-mt3608');
  }

  if (extBat && extBuck) {
    link(extBat.id, '+', extBuck.id, 'IN+');
    link(extBat.id, '-', extBuck.id, 'IN-');
    requestRail(extBuck.id, 'OUT-', 'gnd');
    if (validMcuPins.has('VIN')) linkMcu('VIN', extBuck.id, 'OUT+', false);
  } else if (extBuck) {
    requestRail(extBuck.id, 'IN+', '5v');
    requestRail(extBuck.id, 'IN-', 'gnd');
    requestRail(extBuck.id, 'OUT-', 'gnd');
    if (validMcuPins.has('VIN')) linkMcu('VIN', extBuck.id, 'OUT+', false);
  }

  let l298nPoweredByExternal = false;
  if (extBat && extBoost && !extBuck) {
    link(extBat.id, '+', extBoost.id, 'IN+');
    link(extBat.id, '-', extBoost.id, 'IN-');
    requestRail(extBoost.id, 'OUT-', 'gnd');
    if (createdL298n) {
      link(extBoost.id, 'OUT+', createdL298n.id, '12V');
      l298nPoweredByExternal = true;
    }
  } else if (extBoost) {
    requestRail(extBoost.id, 'IN+', '5v');
    requestRail(extBoost.id, 'IN-', 'gnd');
    requestRail(extBoost.id, 'OUT-', 'gnd');
    if (createdL298n) {
      link(extBoost.id, 'OUT+', createdL298n.id, '12V');
      l298nPoweredByExternal = true;
    }
  }

  if (extBat && !extBuck && !extBoost) {
    if (createdL298n) {
      link(extBat.id, '+', createdL298n.id, '12V');
      l298nPoweredByExternal = true;
    } else if (validMcuPins.has('VIN')) {
      linkMcu('VIN', extBat.id, '+', false);
    }
    requestRail(extBat.id, '-', 'gnd');
  }

  if (createdL298n && !l298nPoweredByExternal) {
    requestRail(createdL298n.id, '12V', '5v');
  }

  if (/\bbreadboard\b|papan[\s_-]*rangkaian|protoboard/i.test(rawSketch) && !hasExistingWiredPart('breadboard-half')) {
    const bb = ensurePart('breadboard-half');
    if (bb) {
      const bbManifest = manifests.get('breadboard-half');
      if (bbManifest?.pins.some((pin) => pin.id === 'tp1')) requestRail(bb.id, 'tp1', '5v');
      if (bbManifest?.pins.some((pin) => pin.id === 'tn1')) requestRail(bb.id, 'tn1', 'gnd');
    }
  }

  if (pendingLinks.length === 0 && railReqs.length === 0 && addedParts === 0) {
    return {
      parts: existingParts,
      wires: existingWires,
      addedParts: 0,
      addedWires: 0,
      skippedWiredPins,
    };
  }

  // 4f. Wire common GND / 5V / 3.3V buses per header zone so aligned parts share one clean rail
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

  // 5. Preserve all existing wires outside newly auto-wired parts (protects diodes, RC filters, manual wiring, and shared buses)
  const preservedWires = existingWires.filter(
    (w) => !(newlyWiredPartIds.has(w.from.partId) && newlyWiredPartIds.has(w.to.partId))
  );
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
    skippedWiredPins,
  };
}
