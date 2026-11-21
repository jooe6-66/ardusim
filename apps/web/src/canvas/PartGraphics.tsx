import React, { useMemo } from 'react';
import {
  CapacitanceUnit,
  DiodeModel,
  LedColor,
  PartInstance,
  PartManifest,
  ResistanceUnit,
  SimSnapshot,
  ldrLuxToOhms,
  resistanceToOhms,
} from '@ardusim/sim-core';
import { formatCapacitance, formatResistance, getResistorColorBands } from '@ardusim/parts';

interface PartGraphicsProps {
  part: PartInstance;
  manifest: PartManifest;
  snapshot: SimSnapshot | null;
  pressed: boolean;
  pressedKeypadKeys?: Set<string>;
  selected: boolean;
}

const LED_PALETTE: Record<LedColor, { off: string; on: string; glow: string }> = {
  red: { off: '#8B2626', on: '#FF3B30', glow: '#FF6B6B' },
  green: { off: '#1E6B3A', on: '#22C55E', glow: '#4ADE80' },
  yellow: { off: '#8A6D1B', on: '#FACC15', glow: '#FEF08A' },
  blue: { off: '#1D4E89', on: '#3B82F6', glow: '#93C5FD' },
  white: { off: '#8B9593', on: '#FFFFFF', glow: '#E2E8F0' },
};

const KEYPAD_LABELS = [
  ['1', '2', '3', 'A'],
  ['4', '5', '6', 'B'],
  ['7', '8', '9', 'C'],
  ['*', '0', '#', 'D'],
];

/** Converts 128x64 packed SSD1306 GDDRAM pages into compact SVG path rectangles. */
function buildOledPixelPath(buffer: number[]): string {
  const parts: string[] = [];
  for (let page = 0; page < 8; page++) {
    for (let x = 0; x < 128; x++) {
      const byte = buffer[page * 128 + x] ?? 0;
      if (byte === 0) continue;
      for (let bit = 0; bit < 8; bit++) {
        if (byte & (1 << bit)) {
          const y = page * 8 + bit;
          parts.push(`M${x} ${y}h1v1h-1z`);
        }
      }
    }
  }
  return parts.join('');
}

export const PartGraphics: React.FC<PartGraphicsProps> = ({
  part,
  manifest,
  snapshot,
  pressed,
  pressedKeypadKeys,
  selected,
}) => {
  const strokeSel = selected ? 'var(--primary)' : 'transparent';

  const oledPath = useMemo(() => {
    if (part.type !== 'oled-ssd1306') return '';
    const oled = snapshot?.oledDisplays?.[part.id];
    if (!oled || !oled.displayOn || !snapshot?.running) return '';
    return buildOledPixelPath(oled.buffer);
  }, [part.type, part.id, snapshot]);

  // --- MCU BOARDS ---
  if (part.type === 'arduino-uno') {
    const running = Boolean(snapshot?.running);
    const lOn = Boolean(snapshot?.onboardLed);
    return (
      <g>
        <rect
          x={10}
          y={4}
          width={262}
          height={188}
          rx={6}
          fill="#0B5F66"
          stroke={selected ? 'var(--accent)' : '#073F44'}
          strokeWidth={selected ? 2.5 : 1.5}
        />
        <rect x={0} y={32} width={34} height={42} rx={3} fill="#CBD5E1" stroke="#475569" strokeWidth={1.2} />
        <rect x={4} y={38} width={22} height={30} rx={2} fill="#94A3B8" />
        <rect x={2} y={132} width={36} height={32} rx={3} fill="#1E293B" stroke="#0F172A" strokeWidth={1.2} />
        <rect x={68} y={6} width={96} height={16} rx={2} fill="#141819" />
        <rect x={170} y={6} width={96} height={16} rx={2} fill="#141819" />
        <rect x={104} y={174} width={72} height={16} rx={2} fill="#141819" />
        <rect x={194} y={174} width={72} height={16} rx={2} fill="#141819" />
        <rect x={112} y={102} width={118} height={38} rx={3} fill="#1B2021" stroke="#334155" strokeWidth={1} />
        <circle cx={120} cy={121} r={3.5} fill="#334155" />
        <text x={171} y={124} textAnchor="middle" fill="#CBD5E1" fontSize={9.5} fontFamily="var(--font-mono)">
          ATMEGA328P
        </text>
        <text x={52} y={92} fill="#E6F4F1" fontSize={14} fontWeight={700} fontFamily="var(--font-sans)">
          UNO
        </text>
        <text x={52} y={106} fill="#99D6D0" fontSize={8.5} fontFamily="var(--font-mono)">
          16 MHz AVR
        </text>
        <g transform="translate(88, 52)">
          <circle cx={0} cy={0} r={4.5} fill={lOn ? '#F59E0B' : '#4A3D1C'} stroke="#0F172A" strokeWidth={0.8} />
          {lOn && <circle cx={0} cy={0} r={8.5} fill="#F59E0B" opacity={0.35} />}
          <text x={9} y={3} fill="#E6F4F1" fontSize={8} fontFamily="var(--font-mono)">L (13)</text>
        </g>
        <g transform="translate(154, 52)">
          <circle cx={0} cy={0} r={4.5} fill={running ? '#22C55E' : '#1E462C'} stroke="#0F172A" strokeWidth={0.8} />
          {running && <circle cx={0} cy={0} r={8} fill="#22C55E" opacity={0.3} />}
          <text x={9} y={3} fill="#E6F4F1" fontSize={8} fontFamily="var(--font-mono)">ON</text>
        </g>
        {manifest.pins.map((pin) => {
          const isTop = pin.y < 100;
          return (
            <g key={pin.id}>
              <rect x={pin.x - 3.5} y={pin.y - 3.5} width={7} height={7} rx={1} fill="#374151" stroke="#0B0F10" strokeWidth={0.8} />
              <text
                x={pin.x}
                y={isTop ? pin.y + 18 : pin.y - 12}
                textAnchor="middle"
                fill="#E2F2F0"
                fontSize={7}
                fontFamily="var(--font-mono)"
              >
                {pin.id.replace(/\.\d+$/, '')}
              </text>
            </g>
          );
        })}
      </g>
    );
  }

  if (part.type === 'arduino-nano') {
    const running = Boolean(snapshot?.running);
    const lOn = Boolean(snapshot?.onboardLed);
    return (
      <g>
        <rect
          x={14}
          y={4}
          width={206}
          height={88}
          rx={5}
          fill="#0B5F66"
          stroke={selected ? 'var(--accent)' : '#073F44'}
          strokeWidth={selected ? 2.5 : 1.5}
        />
        {/* Mini-USB connector */}
        <rect x={0} y={30} width={28} height={36} rx={3} fill="#CBD5E1" stroke="#475569" strokeWidth={1.2} />
        <rect x={4} y={35} width={18} height={26} rx={2} fill="#94A3B8" />
        {/* TQFP-32 rotated ATmega328P */}
        <g transform="translate(114, 48) rotate(45)">
          <rect x={-14} y={-14} width={28} height={28} rx={2} fill="#1B2021" stroke="#475569" strokeWidth={1} />
        </g>
        <text x={52} y={46} fill="#E6F4F1" fontSize={11} fontWeight={700}>NANO</text>
        <text x={52} y={58} fill="#99D6D0" fontSize={7.5} fontFamily="var(--font-mono)">328P A0-A7</text>
        {/* Status LEDs */}
        <circle cx={154} cy={42} r={3.5} fill={lOn ? '#F59E0B' : '#4A3D1C'} />
        <text x={161} y={45} fill="#E6F4F1" fontSize={7} fontFamily="var(--font-mono)">L</text>
        <circle cx={154} cy={55} r={3.5} fill={running ? '#22C55E' : '#1E462C'} />
        <text x={161} y={58} fill="#E6F4F1" fontSize={7} fontFamily="var(--font-mono)">PWR</text>
        {/* Reset tactile switch */}
        <rect x={184} y={41} width={14} height={14} rx={2} fill="#E2E8F0" stroke="#475569" strokeWidth={1} />
        <circle cx={191} cy={48} r={4} fill="#F8FAFC" stroke="#64748B" strokeWidth={0.8} />
        {manifest.pins.map((pin) => {
          const isTop = pin.y < 48;
          return (
            <g key={pin.id}>
              <circle cx={pin.x} cy={pin.y} r={3.6} fill="#D4AF37" stroke="#0B0F10" strokeWidth={0.8} />
              <circle cx={pin.x} cy={pin.y} r={1.6} fill="#1E293B" />
              <text
                x={pin.x}
                y={isTop ? pin.y + 13 : pin.y - 8}
                textAnchor="middle"
                fill="#E2F2F0"
                fontSize={6.2}
                fontFamily="var(--font-mono)"
              >
                {pin.id.replace(/\.\d+$/, '').replace('RESET', 'RS')}
              </text>
            </g>
          );
        })}
      </g>
    );
  }

  if (part.type === 'arduino-mega') {
    const running = Boolean(snapshot?.running);
    const lOn = Boolean(snapshot?.onboardLed);
    return (
      <g>
        <rect
          x={10}
          y={4}
          width={418}
          height={208}
          rx={6}
          fill="#0B5F66"
          stroke={selected ? 'var(--accent)' : '#073F44'}
          strokeWidth={selected ? 2.5 : 1.5}
        />
        <rect x={0} y={32} width={34} height={42} rx={3} fill="#CBD5E1" stroke="#475569" strokeWidth={1.2} />
        <rect x={4} y={38} width={22} height={30} rx={2} fill="#94A3B8" />
        <rect x={2} y={148} width={36} height={32} rx={3} fill="#1E293B" stroke="#0F172A" strokeWidth={1.2} />
        {/* Header strips */}
        <rect x={64} y={6} width={96} height={16} rx={2} fill="#141819" />
        <rect x={168} y={6} width={96} height={16} rx={2} fill="#141819" />
        <rect x={272} y={6} width={96} height={16} rx={2} fill="#141819" />
        <rect x={90} y={194} width={72} height={16} rx={2} fill="#141819" />
        <rect x={170} y={194} width={96} height={16} rx={2} fill="#141819" />
        <rect x={272} y={194} width={96} height={16} rx={2} fill="#141819" />
        <rect x={397} y={12} width={28} height={192} rx={2} fill="#141819" />
        {/* ATmega2560 QFP-100 chip */}
        <rect x={208} y={76} width={66} height={66} rx={4} fill="#1B2021" stroke="#475569" strokeWidth={1.2} />
        <text x={241} y={107} textAnchor="middle" fill="#CBD5E1" fontSize={8.5} fontFamily="var(--font-mono)">
          ATMEGA
        </text>
        <text x={241} y={119} textAnchor="middle" fill="#CBD5E1" fontSize={8.5} fontFamily="var(--font-mono)">
          2560
        </text>
        <text x={56} y={96} fill="#E6F4F1" fontSize={14} fontWeight={700}>MEGA 2560</text>
        <text x={56} y={112} fill="#99D6D0" fontSize={8.5} fontFamily="var(--font-mono)">
          54 Digital | 16 Analog | 4 UART
        </text>
        <g transform="translate(88, 56)">
          <circle cx={0} cy={0} r={4.5} fill={lOn ? '#F59E0B' : '#4A3D1C'} />
          {lOn && <circle cx={0} cy={0} r={8.5} fill="#F59E0B" opacity={0.35} />}
          <text x={9} y={3} fill="#E6F4F1" fontSize={8} fontFamily="var(--font-mono)">L (13)</text>
        </g>
        <g transform="translate(154, 56)">
          <circle cx={0} cy={0} r={4.5} fill={running ? '#22C55E' : '#1E462C'} />
          <text x={9} y={3} fill="#E6F4F1" fontSize={8} fontFamily="var(--font-mono)">ON</text>
        </g>
        {manifest.pins.map((pin) => {
          const isRight = pin.exitDir === 'right';
          const isTop = pin.y < 100 && !isRight;
          return (
            <g key={pin.id}>
              <rect x={pin.x - 3} y={pin.y - 3} width={6} height={6} rx={1} fill="#374151" stroke="#0B0F10" strokeWidth={0.7} />
              {!isRight ? (
                <text
                  x={pin.x}
                  y={isTop ? pin.y + 17 : pin.y - 11}
                  textAnchor="middle"
                  fill="#E2F2F0"
                  fontSize={6.5}
                  fontFamily="var(--font-mono)"
                >
                  {pin.id.replace(/\.\d+$/, '')}
                </text>
              ) : Number(pin.id) % 4 === 2 ? (
                <text x={392} y={pin.y + 3} textAnchor="end" fill="#E2F2F0" fontSize={6.5} fontFamily="var(--font-mono)">
                  {pin.id}
                </text>
              ) : null}
            </g>
          );
        })}
      </g>
    );
  }

  // --- BREADBOARD ---
  if (part.type === 'breadboard-half') {
    return (
      <g>
        <rect
          x={0}
          y={0}
          width={manifest.width}
          height={manifest.height}
          rx={6}
          fill="#FAF8F2"
          stroke={selected ? 'var(--primary)' : '#A8A29E'}
          strokeWidth={selected ? 2.5 : 1.5}
        />
        <line x1={18} y1={10} x2={378} y2={10} stroke="#DC2626" strokeWidth={1.6} />
        <line x1={18} y1={34} x2={378} y2={34} stroke="#2563EB" strokeWidth={1.6} />
        <line x1={18} y1={180} x2={378} y2={180} stroke="#DC2626" strokeWidth={1.6} />
        <line x1={18} y1={204} x2={378} y2={204} stroke="#2563EB" strokeWidth={1.6} />
        <text x={12} y={20} fill="#DC2626" fontSize={10} fontWeight={700}>+</text>
        <text x={13} y={31} fill="#2563EB" fontSize={11} fontWeight={700}>-</text>
        <text x={12} y={190} fill="#DC2626" fontSize={10} fontWeight={700}>+</text>
        <text x={13} y={201} fill="#2563EB" fontSize={11} fontWeight={700}>-</text>
        <rect x={14} y={103} width={368} height={8} rx={2} fill="#E7E2D8" stroke="#D6D0C4" strokeWidth={0.8} />
        {[1, 5, 10, 15, 20, 25, 30].map((col) => (
          <text key={col} x={24 + (col - 1) * 12} y={44} textAnchor="middle" fill="#57534E" fontSize={7.5} fontFamily="var(--font-mono)">
            {col}
          </text>
        ))}
        {manifest.pins.map((pin) => (
          <rect key={pin.id} x={pin.x - 2.3} y={pin.y - 2.3} width={4.6} height={4.6} rx={1} fill="#3F3F46" />
        ))}
      </g>
    );
  }

  // --- PASSIVES ---
  if (part.type === 'resistor') {
    const val = Number(part.props.value ?? 220);
    const unit = (part.props.unit as ResistanceUnit) ?? 'ohm';
    const [b1, b2, b3, b4] = getResistorColorBands(resistanceToOhms(val, unit));
    return (
      <g>
        {selected && <rect x={1} y={1} width={82} height={26} rx={5} fill="none" stroke={strokeSel} strokeWidth={2} />}
        <line x1={6} y1={14} x2={22} y2={14} stroke="#94A3B8" strokeWidth={2.6} strokeLinecap="round" />
        <line x1={62} y1={14} x2={78} y2={14} stroke="#94A3B8" strokeWidth={2.6} strokeLinecap="round" />
        <rect x={21} y={5} width={42} height={18} rx={6} fill="#E6CFA8" stroke="#8C6E45" strokeWidth={1.2} />
        <rect x={27} y={5.6} width={4.5} height={16.8} fill={b1} />
        <rect x={35} y={5.6} width={4.5} height={16.8} fill={b2} />
        <rect x={43} y={5.6} width={4.5} height={16.8} fill={b3} />
        <rect x={53} y={5.6} width={4} height={16.8} fill={b4} />
        <text x={42} y={-2} textAnchor="middle" fill="var(--text-primary)" fontSize={9.5} fontWeight={600} fontFamily="var(--font-mono)">
          {formatResistance(val, unit)}
        </text>
      </g>
    );
  }

  if (part.type === 'capacitor') {
    const val = Number(part.props.value ?? 100);
    const unit = (part.props.unit as CapacitanceUnit) ?? 'uf';
    const isElec = part.props.kind !== 'ceramic';
    const capV = snapshot?.capacitorVoltages?.[part.id];
    return (
      <g>
        {selected && <rect x={2} y={2} width={56} height={48} rx={6} fill="none" stroke={strokeSel} strokeWidth={2} />}
        <line x1={18} y1={32} x2={18} y2={48} stroke="#94A3B8" strokeWidth={2.4} />
        <line x1={42} y1={32} x2={42} y2={48} stroke="#94A3B8" strokeWidth={2.4} />
        {isElec ? (
          <>
            <rect x={11} y={6} width={38} height={28} rx={6} fill="#1E3A5F" stroke="#0F233D" strokeWidth={1.3} />
            <rect x={37} y={6.5} width={11} height={27} rx={3} fill="#CBD5E1" />
            <text x={42.5} y={23} textAnchor="middle" fill="#1E293B" fontSize={11} fontWeight={700}>-</text>
            <text x={20} y={23} textAnchor="middle" fill="#E2E8F0" fontSize={10} fontWeight={700}>+</text>
          </>
        ) : (
          <>
            <ellipse cx={30} cy={20} rx={17} ry={13} fill="#D97706" stroke="#92400E" strokeWidth={1.3} />
            <text x={30} y={23} textAnchor="middle" fill="#FFFBEB" fontSize={8.5} fontWeight={700} fontFamily="var(--font-mono)">CER</text>
          </>
        )}
        <text x={30} y={-2} textAnchor="middle" fill="var(--text-primary)" fontSize={9.5} fontWeight={600} fontFamily="var(--font-mono)">
          {formatCapacitance(val, unit)}
        </text>
        {capV !== undefined && snapshot?.running && (
          <text x={30} y={61} textAnchor="middle" fill="var(--primary)" fontSize={9} fontWeight={600} fontFamily="var(--font-mono)">
            {capV.toFixed(2)}V
          </text>
        )}
      </g>
    );
  }

  if (part.type === 'diode') {
    const model = (part.props.model as DiodeModel) ?? '1N4007';
    const conducting = Boolean(snapshot?.diodeConducting?.[part.id]);
    const bodyFill = model === 'zener' ? '#B45309' : model === '1N5819' ? '#334155' : '#18181B';
    return (
      <g>
        {selected && <rect x={1} y={1} width={82} height={26} rx={5} fill="none" stroke={strokeSel} strokeWidth={2} />}
        <line x1={6} y1={14} x2={22} y2={14} stroke="#94A3B8" strokeWidth={2.6} />
        <line x1={62} y1={14} x2={78} y2={14} stroke="#94A3B8" strokeWidth={2.6} />
        <rect x={21} y={5} width={42} height={18} rx={4} fill={bodyFill} stroke="#0F172A" strokeWidth={1.2} />
        <rect x={51} y={5.6} width={6} height={16.8} fill="#E2E8F0" />
        <path
          d="M31 14 H45 M41 10 L46 14 L41 18"
          fill="none"
          stroke={conducting ? '#4ADE80' : '#94A3B8'}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <text x={42} y={-2} textAnchor="middle" fill="var(--text-primary)" fontSize={9} fontWeight={600} fontFamily="var(--font-mono)">
          {model === 'zener' ? `Z ${part.props.zenerVz ?? 3.3}V` : model}
        </text>
      </g>
    );
  }

  // --- SENSORS ---
  if (part.type === 'hc-sr04') {
    const cm = Number(part.props.distanceCm ?? 45);
    return (
      <g>
        <rect x={2} y={4} width={112} height={48} rx={5} fill="#1D4ED8" stroke={selected ? 'var(--accent)' : '#1E3A8A'} strokeWidth={selected ? 2.5 : 1.4} />
        {/* Twin transducer cans */}
        <circle cx={30} cy={28} r={17} fill="#E2E8F0" stroke="#475569" strokeWidth={2} />
        <circle cx={30} cy={28} r={11} fill="#334155" />
        <circle cx={86} cy={28} r={17} fill="#E2E8F0" stroke="#475569" strokeWidth={2} />
        <circle cx={86} cy={28} r={11} fill="#334155" />
        <text x={58} y={24} textAnchor="middle" fill="#EFF6FF" fontSize={7.5} fontWeight={700} fontFamily="var(--font-mono)">HC-SR04</text>
        <text x={58} y={37} textAnchor="middle" fill="#FDE047" fontSize={8.5} fontWeight={700} fontFamily="var(--font-mono)">{cm} cm</text>
        {manifest.pins.map((p) => (
          <line key={p.id} x1={p.x} y1={52} x2={p.x} y2={60} stroke="#CBD5E1" strokeWidth={2.4} />
        ))}
      </g>
    );
  }

  if (part.type === 'dht22') {
    const is11 = part.props.model === 'DHT11';
    const temp = Number(part.props.tempC ?? 27.5);
    const hum = Number(part.props.humidityPct ?? 60);
    return (
      <g>
        <rect
          x={6}
          y={4}
          width={56}
          height={56}
          rx={5}
          fill={is11 ? '#2563EB' : '#F8FAFC'}
          stroke={selected ? 'var(--primary)' : '#475569'}
          strokeWidth={selected ? 2.5 : 1.4}
        />
        {/* Sensor grille */}
        {[14, 22, 30, 38].map((y) => (
          <line key={y} x1={16} y1={y} x2={52} y2={y} stroke={is11 ? '#93C5FD' : '#CBD5E1'} strokeWidth={2.4} strokeDasharray="5 3" />
        ))}
        <text x={34} y={53} textAnchor="middle" fill={is11 ? '#FFFFFF' : '#0F172A'} fontSize={8} fontWeight={700} fontFamily="var(--font-mono)">
          {is11 ? 'DHT11' : 'DHT22'}
        </text>
        <text x={34} y={-3} textAnchor="middle" fill="var(--text-primary)" fontSize={8.5} fontWeight={600} fontFamily="var(--font-mono)">
          {temp.toFixed(1)}°C {Math.round(hum)}%
        </text>
        {manifest.pins.map((p) => (
          <line key={p.id} x1={p.x} y1={60} x2={p.x} y2={72} stroke="#94A3B8" strokeWidth={2.4} />
        ))}
      </g>
    );
  }

  if (part.type === 'pir') {
    const motion = Boolean(part.props.motion);
    return (
      <g>
        <rect x={6} y={4} width={60} height={54} rx={6} fill="#15803D" stroke={selected ? 'var(--accent)' : '#14532D'} strokeWidth={selected ? 2.5 : 1.4} />
        <circle cx={36} cy={31} r={20} fill={motion ? '#FEF08A' : '#F8FAFC'} stroke={motion ? '#D97706' : '#94A3B8'} strokeWidth={2} />
        <circle cx={36} cy={31} r={11} fill="none" stroke="#94A3B8" strokeWidth={1} strokeDasharray="3 2" />
        <text x={36} y={-3} textAnchor="middle" fill={motion ? 'var(--accent)' : 'var(--text-primary)'} fontSize={8.5} fontWeight={700} fontFamily="var(--font-mono)">
          PIR {motion ? 'ACTIVE' : 'IDLE'}
        </text>
        {manifest.pins.map((p) => (
          <line key={p.id} x1={p.x} y1={58} x2={p.x} y2={68} stroke="#94A3B8" strokeWidth={2.4} />
        ))}
      </g>
    );
  }

  if (part.type === 'ldr') {
    const lux = Number(part.props.lux ?? 300);
    const ohms = ldrLuxToOhms(lux);
    return (
      <g>
        {selected && <rect x={4} y={2} width={52} height={48} rx={6} fill="none" stroke={strokeSel} strokeWidth={2} />}
        <line x1={24} y1={34} x2={24} y2={52} stroke="#94A3B8" strokeWidth={2.4} />
        <line x1={36} y1={34} x2={36} y2={52} stroke="#94A3B8" strokeWidth={2.4} />
        <circle cx={30} cy={22} r={14} fill="#FDE68A" stroke="#92400E" strokeWidth={1.4} />
        <path d="M21 17 H39 M21 22 H39 M21 27 H39" stroke="#B91C1C" strokeWidth={2} strokeLinecap="round" />
        <text x={30} y={-2} textAnchor="middle" fill="var(--text-primary)" fontSize={8.5} fontWeight={600} fontFamily="var(--font-mono)">
          {lux}lx ({ohms >= 1000 ? `${(ohms / 1000).toFixed(1)}k` : ohms}Ω)
        </text>
      </g>
    );
  }

  if (part.type === 'lm35') {
    const temp = Number(part.props.tempC ?? 28);
    return (
      <g>
        {selected && <rect x={2} y={2} width={52} height={50} rx={6} fill="none" stroke={strokeSel} strokeWidth={2} />}
        {manifest.pins.map((p) => (
          <line key={p.id} x1={p.x} y1={36} x2={p.x} y2={54} stroke="#94A3B8" strokeWidth={2.4} />
        ))}
        <path d="M12 36 V14 Q28 6 44 14 V36 Z" fill="#1E293B" stroke="#0F172A" strokeWidth={1.3} />
        <text x={28} y={27} textAnchor="middle" fill="#E2E8F0" fontSize={8.5} fontWeight={700} fontFamily="var(--font-mono)">LM35</text>
        <text x={28} y={-2} textAnchor="middle" fill="var(--text-primary)" fontSize={8.5} fontWeight={600} fontFamily="var(--font-mono)">
          {temp}°C ({Math.round(temp * 10)}mV)
        </text>
      </g>
    );
  }

  if (part.type === 'mq2') {
    const gas = Number(part.props.gasPct ?? 18);
    const thresh = Number(part.props.thresholdPct ?? 50);
    const alarm = gas >= thresh;
    return (
      <g>
        <rect x={4} y={4} width={64} height={58} rx={5} fill="#1E3A8A" stroke={selected ? 'var(--accent)' : '#172554'} strokeWidth={selected ? 2.5 : 1.4} />
        <circle cx={36} cy={30} r={18} fill="#94A3B8" stroke="#475569" strokeWidth={2} />
        <circle cx={36} cy={30} r={12} fill="#CBD5E1" stroke="#64748B" strokeDasharray="2 2" />
        <circle cx={58} cy={52} r={3.5} fill={alarm ? '#EF4444' : '#334155'} />
        <text x={36} y={-3} textAnchor="middle" fill={alarm ? 'var(--danger)' : 'var(--text-primary)'} fontSize={8.5} fontWeight={700} fontFamily="var(--font-mono)">
          MQ-2 {gas}%
        </text>
        {manifest.pins.map((p) => (
          <line key={p.id} x1={p.x} y1={62} x2={p.x} y2={72} stroke="#94A3B8" strokeWidth={2.4} />
        ))}
      </g>
    );
  }

  // --- DISPLAYS ---
  if (part.type === 'lcd-1602-i2c') {
    const lcd = snapshot?.lcdDisplays?.[part.id];
    const isBlue = part.props.color === 'blue';
    const lit = Boolean(snapshot?.running && lcd?.backlight);
    const screenBg = isBlue ? (lit ? '#1D4ED8' : '#1E293B') : lit ? '#84CC16' : '#3F6212';
    const screenFg = isBlue ? '#F8FAFC' : '#1A2E05';
    const row0 = snapshot?.running && lcd ? lcd.rows[0] : 'LCD 16x2 I2C    ';
    const row1 = snapshot?.running && lcd ? lcd.rows[1] : `Addr 0x${Number(part.props.i2cAddress ?? 0x27).toString(16).toUpperCase()}       `;
    return (
      <g>
        <rect x={14} y={4} width={178} height={84} rx={5} fill="#166534" stroke={selected ? 'var(--accent)' : '#14532D'} strokeWidth={selected ? 2.5 : 1.5} />
        <rect x={24} y={16} width={158} height={58} rx={3} fill="#0F172A" />
        <g className="unflip-display">
          <rect x={30} y={22} width={146} height={46} rx={2} fill={screenBg} />
          <text x={36} y={40} fill={screenFg} fontSize={12} fontWeight={600} fontFamily="var(--font-mono)" xmlSpace="preserve">
            {row0}
          </text>
          <text x={36} y={59} fill={screenFg} fontSize={12} fontWeight={600} fontFamily="var(--font-mono)" xmlSpace="preserve">
            {row1}
          </text>
        </g>
        {manifest.pins.map((p) => (
          <g key={p.id}>
            <line x1={6} y1={p.y} x2={16} y2={p.y} stroke="#CBD5E1" strokeWidth={2.4} />
            <text x={18} y={p.y + 3} fill="#DCFCE7" fontSize={6.5} fontFamily="var(--font-mono)">{p.label}</text>
          </g>
        ))}
      </g>
    );
  }

  if (part.type === 'oled-ssd1306') {
    const oled = snapshot?.oledDisplays?.[part.id];
    const displayOn = Boolean(snapshot?.running && oled?.displayOn);
    const inv = Boolean(oled?.inverted);
    return (
      <g>
        <rect x={4} y={14} width={148} height={90} rx={5} fill="#1E3A8A" stroke={selected ? 'var(--accent)' : '#172554'} strokeWidth={selected ? 2.5 : 1.5} />
        <rect x={12} y={28} width={132} height={68} rx={2} fill="#020617" stroke="#334155" strokeWidth={1} />
        <g className="unflip-display">
          <rect x={14} y={30} width={128} height={64} fill={inv && displayOn ? '#38BDF8' : '#020617'} />
          {displayOn && oledPath ? (
            <g transform="translate(14, 30)">
              <path d={oledPath} fill={inv ? '#020617' : '#38BDF8'} />
            </g>
          ) : (
            <text x={78} y={65} textAnchor="middle" fill="#64748B" fontSize={9} fontFamily="var(--font-mono)">
              OLED 128x64
            </text>
          )}
        </g>
        {manifest.pins.map((p) => (
          <g key={p.id}>
            <line x1={p.x} y1={6} x2={p.x} y2={16} stroke="#CBD5E1" strokeWidth={2.2} />
            <text x={p.x} y={24} textAnchor="middle" fill="#DBEAFE" fontSize={6} fontFamily="var(--font-mono)">{p.label}</text>
          </g>
        ))}
      </g>
    );
  }

  if (part.type === 'seven-seg') {
    const segs = snapshot?.running ? (snapshot.sevenSegStates?.[part.id] ?? {}) : {};
    const segFill = (k: string) => ((segs[k] ?? 0) > 0.1 ? '#EF4444' : '#334155');
    return (
      <g>
        <rect x={6} y={14} width={60} height={68} rx={4} fill="#18181B" stroke={selected ? 'var(--primary)' : '#3F3F46'} strokeWidth={selected ? 2.5 : 1.4} />
        {/* Classic 7 segments: a, b, c, d, e, f, g, dp */}
        <rect x={22} y={22} width={24} height={5} rx={2} fill={segFill('a')} />
        <rect x={46} y={27} width={5} height={19} rx={2} fill={segFill('b')} />
        <rect x={46} y={50} width={5} height={19} rx={2} fill={segFill('c')} />
        <rect x={22} y={69} width={24} height={5} rx={2} fill={segFill('d')} />
        <rect x={17} y={50} width={5} height={19} rx={2} fill={segFill('e')} />
        <rect x={17} y={27} width={5} height={19} rx={2} fill={segFill('f')} />
        <rect x={22} y={45.5} width={24} height={5} rx={2} fill={segFill('g')} />
        <circle cx={56} cy={71} r={3} fill={segFill('dp')} />
        {manifest.pins.map((p) => (
          <line key={p.id} x1={p.x} y1={p.y < 50 ? 6 : 82} x2={p.x} y2={p.y < 50 ? 14 : 90} stroke="#94A3B8" strokeWidth={2.2} />
        ))}
      </g>
    );
  }

  // --- OUTPUTS & MOTORS ---
  if (part.type === 'led') {
    const color = (part.props.color as LedColor) ?? 'red';
    const pal = LED_PALETTE[color] ?? LED_PALETTE.red;
    const ledState = snapshot?.ledStates?.[part.id];
    const brightness = snapshot?.running ? (ledState?.brightness ?? 0) : 0;
    const overcurrent = Boolean(snapshot?.running && ledState?.overcurrent);
    return (
      <g>
        {selected && <rect x={2} y={2} width={40} height={54} rx={6} fill="none" stroke={strokeSel} strokeWidth={2} />}
        {brightness > 0.05 && (
          <circle cx={22} cy={22} r={18 + brightness * 6} fill={pal.glow} opacity={0.18 + brightness * 0.35} />
        )}
        <line x1={16} y1={36} x2={16} y2={54} stroke="#94A3B8" strokeWidth={2.4} />
        <line x1={28} y1={36} x2={28} y2={54} stroke="#94A3B8" strokeWidth={2.4} />
        <path
          d="M11 35 V21 A11 11 0 0 1 33 21 V35 Z"
          fill={brightness > 0.05 ? pal.on : pal.off}
          stroke="#1E293B"
          strokeWidth={1.2}
          opacity={brightness > 0.05 ? 0.55 + brightness * 0.45 : 0.9}
        />
        <rect x={9} y={33} width={26} height={5} rx={1.5} fill={brightness > 0.05 ? pal.on : pal.off} stroke="#1E293B" strokeWidth={1} />
        <text x={11} y={49} fill="var(--text-muted)" fontSize={8} fontWeight={700}>+</text>
        <text x={31} y={49} fill="var(--text-muted)" fontSize={8} fontWeight={700}>-</text>
        {overcurrent && (
          <g transform="translate(34, 8)">
            <circle cx={0} cy={0} r={8} fill="#B42318" />
            <text x={0} y={3.5} textAnchor="middle" fill="#FFFFFF" fontSize={11} fontWeight={700}>!</text>
          </g>
        )}
      </g>
    );
  }

  if (part.type === 'rgb-led') {
    const rgb = snapshot?.running ? (snapshot.rgbLedStates?.[part.id] ?? { r: 0, g: 0, b: 0 }) : { r: 0, g: 0, b: 0 };
    const lit = rgb.r + rgb.g + rgb.b > 0.05;
    const fill = lit
      ? `rgb(${Math.round(rgb.r * 255)}, ${Math.round(rgb.g * 255)}, ${Math.round(rgb.b * 255)})`
      : '#CBD5E1';
    return (
      <g>
        {selected && <rect x={2} y={2} width={56} height={56} rx={6} fill="none" stroke={strokeSel} strokeWidth={2} />}
        {lit && <circle cx={30} cy={22} r={22} fill={fill} opacity={0.35} />}
        {manifest.pins.map((p) => (
          <line key={p.id} x1={p.x} y1={38} x2={p.x} y2={56} stroke="#94A3B8" strokeWidth={2.2} />
        ))}
        <path d="M16 37 V22 A14 14 0 0 1 44 22 V37 Z" fill={fill} stroke="#334155" strokeWidth={1.3} />
        <text x={30} y={-2} textAnchor="middle" fill="var(--text-primary)" fontSize={8.5} fontWeight={600} fontFamily="var(--font-mono)">RGB</text>
      </g>
    );
  }

  if (part.type === 'buzzer') {
    const hz = snapshot?.running ? (snapshot.buzzerHz?.[part.id] ?? 0) : 0;
    return (
      <g>
        {selected && <rect x={2} y={2} width={56} height={58} rx={6} fill="none" stroke={strokeSel} strokeWidth={2} />}
        <line x1={24} y1={46} x2={24} y2={60} stroke="#94A3B8" strokeWidth={2.4} />
        <line x1={36} y1={46} x2={36} y2={60} stroke="#94A3B8" strokeWidth={2.4} />
        <circle cx={30} cy={28} r={20} fill="#18181B" stroke="#3F3F46" strokeWidth={1.5} />
        <circle cx={30} cy={28} r={6} fill="#334155" stroke="#64748B" strokeWidth={1} />
        {hz > 20 && (
          <>
            <circle cx={30} cy={28} r={24} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="4 4" />
            <text x={30} y={-2} textAnchor="middle" fill="var(--accent)" fontSize={8.5} fontWeight={700} fontFamily="var(--font-mono)">
              {hz} Hz
            </text>
          </>
        )}
        <text x={18} y={20} fill="#E2E8F0" fontSize={8} fontWeight={700}>+</text>
      </g>
    );
  }

  if (part.type === 'relay') {
    const on = Boolean(snapshot?.running && snapshot.relayEnergized?.[part.id]);
    return (
      <g>
        <rect x={12} y={4} width={68} height={64} rx={5} fill="#0F766E" stroke={selected ? 'var(--accent)' : '#115E59'} strokeWidth={selected ? 2.5 : 1.5} />
        <rect x={26} y={12} width={40} height={48} rx={3} fill="#2563EB" stroke="#1E40AF" strokeWidth={1.2} />
        <text x={46} y={30} textAnchor="middle" fill="#EFF6FF" fontSize={7.5} fontWeight={700} fontFamily="var(--font-mono)">5V RELAY</text>
        <circle cx={20} cy={14} r={3.5} fill={on ? '#22C55E' : '#14532D'} />
        {/* Live SPDT switch schematic inside relay body */}
        <line x1={34} y1={46} x2={56} y2={on ? 38 : 52} stroke="#FDE047" strokeWidth={2} strokeLinecap="round" />
        <circle cx={34} cy={46} r={2} fill="#FDE047" />
        <circle cx={58} cy={38} r={2} fill="#BFDBFE" />
        <circle cx={58} cy={52} r={2} fill="#BFDBFE" />
        {manifest.pins.map((p) => (
          <line key={p.id} x1={p.x < 45 ? 6 : 80} y1={p.y} x2={p.x < 45 ? 14 : 86} y2={p.y} stroke="#CBD5E1" strokeWidth={2.4} />
        ))}
      </g>
    );
  }

  if (part.type === 'servo') {
    const angle = snapshot?.running ? (snapshot.servoAngles?.[part.id] ?? 90) : 90;
    return (
      <g>
        <rect x={8} y={14} width={80} height={46} rx={5} fill="#2563EB" stroke={selected ? 'var(--accent)' : '#1E3A8A'} strokeWidth={selected ? 2.5 : 1.5} />
        <rect x={2} y={24} width={92} height={10} rx={2} fill="#1D4ED8" />
        {/* Rotating servo horn centered at (34, 37) */}
        <circle cx={34} cy={37} r={13} fill="#1E40AF" stroke="#93C5FD" strokeWidth={1} />
        <g transform={`rotate(${angle - 90} 34 37)`}>
          <rect x={30} y={12} width={8} height={29} rx={4} fill="#F8FAFC" stroke="#475569" strokeWidth={1.1} />
          <circle cx={34} cy={37} r={3.5} fill="#334155" />
        </g>
        <text x={68} y={40} textAnchor="middle" fill="#EFF6FF" fontSize={9.5} fontWeight={700} fontFamily="var(--font-mono)">
          {angle}°
        </text>
        {manifest.pins.map((p) => (
          <line key={p.id} x1={p.x} y1={60} x2={p.x} y2={72} stroke={p.id === 'VCC' ? '#DC2626' : p.id === 'SIG' ? '#D97706' : '#334155'} strokeWidth={2.6} />
        ))}
      </g>
    );
  }

  if (part.type === 'dc-motor') {
    const motor = snapshot?.running ? (snapshot.motorStates?.[part.id] ?? { voltage: 0, rpm: 0 }) : { voltage: 0, rpm: 0 };
    const spinAngle = ((snapshot?.timeMs ?? 0) * motor.rpm * 0.006) % 360;
    return (
      <g>
        {selected && <rect x={2} y={2} width={80} height={70} rx={6} fill="none" stroke={strokeSel} strokeWidth={2} />}
        <line x1={30} y1={56} x2={30} y2={72} stroke="#DC2626" strokeWidth={2.5} />
        <line x1={54} y1={56} x2={54} y2={72} stroke="#334155" strokeWidth={2.5} />
        <circle cx={42} cy={34} r={24} fill="#CBD5E1" stroke="#475569" strokeWidth={1.8} />
        <g transform={`rotate(${spinAngle} 42 34)`}>
          <rect x={39} y={14} width={6} height={40} rx={3} fill="#0F6660" />
          <rect x={22} y={31} width={40} height={6} rx={3} fill="#0F6660" />
        </g>
        <circle cx={42} cy={34} r={7} fill="#334155" />
        <text x={42} y={-2} textAnchor="middle" fill="var(--text-primary)" fontSize={8.5} fontWeight={600} fontFamily="var(--font-mono)">
          {motor.rpm !== 0 ? `${motor.rpm} RPM (${motor.voltage.toFixed(1)}V)` : 'DC Motor'}
        </text>
      </g>
    );
  }

  // --- INPUTS ---
  if (part.type === 'pushbutton') {
    const active = pressed || Boolean(part.props.locked);
    return (
      <g>
        {selected && <rect x={1} y={1} width={54} height={54} rx={6} fill="none" stroke={strokeSel} strokeWidth={2} />}
        <rect x={7} y={7} width={6} height={10} rx={1} fill="#94A3B8" />
        <rect x={43} y={7} width={6} height={10} rx={1} fill="#94A3B8" />
        <rect x={7} y={39} width={6} height={10} rx={1} fill="#94A3B8" />
        <rect x={43} y={39} width={6} height={10} rx={1} fill="#94A3B8" />
        <rect x={10} y={10} width={36} height={36} rx={4} fill="#CBD5E1" stroke="#475569" strokeWidth={1.4} />
        <circle
          cx={28}
          cy={28}
          r={active ? 10.5 : 12}
          fill={active ? '#0F6660' : '#334155'}
          stroke={active ? '#2DD4BF' : '#0F172A'}
          strokeWidth={1.6}
        />
        {Boolean(part.props.locked) && (
          <text x={28} y={64} textAnchor="middle" fill="var(--accent)" fontSize={8} fontWeight={700} fontFamily="var(--font-mono)">
            HOLD
          </text>
        )}
      </g>
    );
  }

  if (part.type === 'potentiometer') {
    const pos = Math.min(1, Math.max(0, Number(part.props.position ?? 0.5)));
    const val = Number(part.props.value ?? 10);
    const unit = (part.props.unit as ResistanceUnit) ?? 'kohm';
    const angleDeg = -135 + pos * 270;
    return (
      <g>
        {selected && <rect x={2} y={2} width={60} height={64} rx={6} fill="none" stroke={strokeSel} strokeWidth={2} />}
        <line x1={20} y1={52} x2={20} y2={64} stroke="#94A3B8" strokeWidth={2.4} />
        <line x1={32} y1={52} x2={32} y2={64} stroke="#94A3B8" strokeWidth={2.4} />
        <line x1={44} y1={52} x2={44} y2={64} stroke="#94A3B8" strokeWidth={2.4} />
        <rect x={10} y={8} width={44} height={44} rx={6} fill="#1E40AF" stroke="#1E3A8A" strokeWidth={1.4} />
        <circle cx={32} cy={30} r={15} fill="#F8FAFC" stroke="#334155" strokeWidth={1.4} />
        <g transform={`rotate(${angleDeg} 32 30)`}>
          <line x1={32} y1={30} x2={32} y2={17} stroke="#0F6660" strokeWidth={3} strokeLinecap="round" />
        </g>
        <text x={32} y={-2} textAnchor="middle" fill="var(--text-primary)" fontSize={9} fontWeight={600} fontFamily="var(--font-mono)">
          {formatResistance(val, unit)} ({Math.round(pos * 100)}%)
        </text>
      </g>
    );
  }

  if (part.type === 'keypad-4x4') {
    return (
      <g>
        <rect x={4} y={4} width={108} height={112} rx={6} fill="#1F2937" stroke={selected ? 'var(--accent)' : '#111827'} strokeWidth={selected ? 2.5 : 1.5} />
        {KEYPAD_LABELS.map((row, r) =>
          row.map((label, c) => {
            const token = `${part.id}:${r}:${c}`;
            const isDown = Boolean(pressedKeypadKeys?.has(token) || part.props.activeKey === `${r}:${c}`);
            const isColA = c === 3;
            const fill = isDown ? '#F59E0B' : isColA ? '#B91C1C' : '#2563EB';
            return (
              <g key={label} transform={`translate(${12 + c * 24}, ${12 + r * 24})`}>
                <rect width={20} height={20} rx={3} fill={fill} stroke="#0F172A" strokeWidth={0.8} />
                <text x={10} y={14} textAnchor="middle" fill="#FFFFFF" fontSize={10} fontWeight={700} fontFamily="var(--font-mono)">
                  {label}
                </text>
              </g>
            );
          })
        )}
        {manifest.pins.map((p) => (
          <line key={p.id} x1={p.x} y1={116} x2={p.x} y2={126} stroke="#94A3B8" strokeWidth={2.2} />
        ))}
      </g>
    );
  }

  // --- PHASE 3 COMPONENTS ---
  if (part.type === 'ds3231-rtc') {
    const rtcTime = snapshot?.running ? snapshot.rtcTimes?.[part.id] : undefined;
    return (
      <g>
        <rect x={14} y={4} width={66} height={64} rx={5} fill="#1E3A8A" stroke={selected ? 'var(--accent)' : '#172554'} strokeWidth={selected ? 2.5 : 1.4} />
        <circle cx={48} cy={36} r={19} fill="#CBD5E1" stroke="#475569" strokeWidth={1.6} />
        <text x={48} y={35} textAnchor="middle" fill="#1E293B" fontSize={7.5} fontWeight={700} fontFamily="var(--font-mono)">CR2032</text>
        <text x={48} y={45} textAnchor="middle" fill="#334155" fontSize={7} fontFamily="var(--font-mono)">DS3231</text>
        {rtcTime && (
          <text x={48} y={-2} textAnchor="middle" fill="var(--primary)" fontSize={8.5} fontWeight={700} fontFamily="var(--font-mono)">
            {rtcTime}
          </text>
        )}
        {manifest.pins.map((p) => (
          <line key={p.id} x1={6} y1={p.y} x2={16} y2={p.y} stroke="#CBD5E1" strokeWidth={2.2} />
        ))}
      </g>
    );
  }

  if (part.type === 'mpu6050') {
    const pitch = Number(part.props.pitchDeg ?? 0);
    const roll = Number(part.props.rollDeg ?? 0);
    const dotX = 44 + Math.max(-14, Math.min(14, (roll / 90) * 14));
    const dotY = 30 + Math.max(-12, Math.min(12, (pitch / 90) * 12));
    return (
      <g>
        <rect x={6} y={4} width={76} height={52} rx={5} fill="#1D4ED8" stroke={selected ? 'var(--accent)' : '#1E3A8A'} strokeWidth={selected ? 2.5 : 1.4} />
        <rect x={24} y={14} width={40} height={32} rx={3} fill="#0F172A" stroke="#60A5FA" strokeWidth={1} />
        <line x1={28} y1={30} x2={60} y2={30} stroke="#334155" strokeWidth={0.8} />
        <line x1={44} y1={18} x2={44} y2={42} stroke="#334155" strokeWidth={0.8} />
        <circle cx={dotX} cy={dotY} r={3.5} fill="#2DD4BF" />
        <text x={44} y={-2} textAnchor="middle" fill="var(--text-primary)" fontSize={8.5} fontWeight={600} fontFamily="var(--font-mono)">
          MPU6050 P:{pitch}° R:{roll}°
        </text>
        {manifest.pins.map((p) => (
          <line key={p.id} x1={p.x} y1={56} x2={p.x} y2={64} stroke="#CBD5E1" strokeWidth={2.2} />
        ))}
      </g>
    );
  }

  if (part.type === 'max7219') {
    const mat = snapshot?.running ? snapshot.max7219Displays?.[part.id] : undefined;
    const rows = mat?.active ? mat.rows : [0, 0, 0, 0, 0, 0, 0, 0];
    return (
      <g>
        <rect x={14} y={6} width={94} height={98} rx={5} fill="#18181B" stroke={selected ? 'var(--accent)' : '#3F3F46'} strokeWidth={selected ? 2.5 : 1.4} />
        {rows.map((rowByte, r) =>
          Array.from({ length: 8 }, (_, c) => {
            const on = Boolean(rowByte & (1 << (7 - c)));
            return (
              <circle
                key={`${r}-${c}`}
                cx={24 + c * 10.5}
                cy={18 + r * 10.5}
                r={3.8}
                fill={on ? '#EF4444' : '#334155'}
              />
            );
          })
        )}
        <text x={61} y={-2} textAnchor="middle" fill="var(--text-primary)" fontSize={8.5} fontWeight={600} fontFamily="var(--font-mono)">
          MAX7219 8x8
        </text>
        {manifest.pins.map((p) => (
          <line key={p.id} x1={6} y1={p.y} x2={16} y2={p.y} stroke="#CBD5E1" strokeWidth={2.2} />
        ))}
      </g>
    );
  }

  if (part.type === 'neopixel-strip') {
    const pixels = snapshot?.running ? snapshot.neoPixelStrips?.[part.id] : undefined;
    return (
      <g>
        <rect x={14} y={4} width={174} height={36} rx={5} fill="#18181B" stroke={selected ? 'var(--accent)' : '#3F3F46'} strokeWidth={selected ? 2.5 : 1.4} />
        {Array.from({ length: 8 }, (_, i) => {
          const [r, g, b] = pixels?.[i] ?? [0, 0, 0];
          const lit = r + g + b > 10;
          const color = lit ? `rgb(${r}, ${g}, ${b})` : '#334155';
          const cx = 28 + i * 21;
          return (
            <g key={i}>
              {lit && <circle cx={cx} cy={22} r={10} fill={color} opacity={0.35} />}
              <rect x={cx - 7} y={15} width={14} height={14} rx={2} fill="#E2E8F0" stroke="#475569" strokeWidth={0.8} />
              <circle cx={cx} cy={22} r={5.2} fill={color} />
            </g>
          );
        })}
        <text x={101} y={-2} textAnchor="middle" fill="var(--text-primary)" fontSize={8.5} fontWeight={600} fontFamily="var(--font-mono)">
          NeoPixel WS2812B (8)
        </text>
        {manifest.pins.map((p) => (
          <line key={p.id} x1={6} y1={p.y} x2={16} y2={p.y} stroke={p.id === 'VCC' ? '#DC2626' : p.id === 'DIN' ? '#22C55E' : '#64748B'} strokeWidth={2.2} />
        ))}
      </g>
    );
  }

  if (part.type === 'rfid-rc522') {
    const cardPresent = Boolean(part.props.cardPresent);
    const uid = String(part.props.uid ?? 'DEADBEEF').toUpperCase();
    return (
      <g>
        <rect x={6} y={4} width={96} height={98} rx={6} fill="#1D4ED8" stroke={selected ? 'var(--accent)' : '#1E3A8A'} strokeWidth={selected ? 2.5 : 1.5} />
        {/* Antenna coil rings */}
        <rect x={16} y={14} width={76} height={54} rx={6} fill="none" stroke="#93C5FD" strokeWidth={1.6} />
        <rect x={22} y={20} width={64} height={42} rx={4} fill="none" stroke="#93C5FD" strokeWidth={1.2} />
        <text x={54} y={40} textAnchor="middle" fill="#EFF6FF" fontSize={9.5} fontWeight={700} fontFamily="var(--font-mono)">RC522</text>
        <text x={54} y={53} textAnchor="middle" fill="#BFDBFE" fontSize={7.5} fontFamily="var(--font-mono)">13.56 MHz</text>
        {/* Virtual RFID card badge when placed on reader */}
        {cardPresent && (
          <g>
            <rect x={18} y={66} width={72} height={26} rx={4} fill="#F8FAFC" stroke="#F59E0B" strokeWidth={1.8} />
            <text x={54} y={82} textAnchor="middle" fill="#0F172A" fontSize={8} fontWeight={700} fontFamily="var(--font-mono)">
              {uid.slice(0, 8)}
            </text>
          </g>
        )}
        {manifest.pins.map((p) => (
          <line key={p.id} x1={p.x} y1={102} x2={p.x} y2={112} stroke="#CBD5E1" strokeWidth={2.2} />
        ))}
      </g>
    );
  }

  if (part.type === 'stepper') {
    const st = snapshot?.running ? snapshot.stepperStates?.[part.id] : undefined;
    const angle = st?.angleDeg ?? 0;
    const steps = st?.steps ?? 0;
    return (
      <g>
        <rect x={12} y={8} width={72} height={70} rx={6} fill="#334155" stroke={selected ? 'var(--accent)' : '#1E293B'} strokeWidth={selected ? 2.5 : 1.5} />
        <circle cx={48} cy={43} r={25} fill="#CBD5E1" stroke="#475569" strokeWidth={1.6} />
        <g transform={`rotate(${angle} 48 43)`}>
          <line x1={48} y1={43} x2={48} y2={21} stroke="#0F6660" strokeWidth={3.2} strokeLinecap="round" />
          <circle cx={48} cy={22} r={2.5} fill="#F59E0B" />
        </g>
        <circle cx={48} cy={43} r={5} fill="#1E293B" />
        <text x={48} y={-1} textAnchor="middle" fill="var(--text-primary)" fontSize={8.5} fontWeight={600} fontFamily="var(--font-mono)">
          Stepper {Math.round(angle)}° ({steps})
        </text>
        {manifest.pins.map((p) => (
          <line key={p.id} x1={p.x} y1={78} x2={p.x} y2={88} stroke="#94A3B8" strokeWidth={2.2} />
        ))}
      </g>
    );
  }

  if (part.type === 'gps-neo6m') {
    const lat = Number(part.props.lat ?? -6.2088);
    const lon = Number(part.props.lon ?? 106.8456);
    return (
      <g>
        <rect x={6} y={4} width={84} height={58} rx={5} fill="#1E3A8A" stroke={selected ? 'var(--accent)' : '#172554'} strokeWidth={selected ? 2.5 : 1.4} />
        <rect x={16} y={12} width={38} height={38} rx={3} fill="#D6D3D1" stroke="#78716C" strokeWidth={1.2} />
        <circle cx={35} cy={31} r={4} fill="#A8A29E" />
        <circle cx={72} cy={22} r={4} fill={snapshot?.running ? '#22C55E' : '#14532D'} />
        <text x={72} y={42} textAnchor="middle" fill="#DBEAFE" fontSize={8} fontWeight={700} fontFamily="var(--font-mono)">GPS</text>
        <text x={48} y={-2} textAnchor="middle" fill="var(--text-primary)" fontSize={8} fontWeight={600} fontFamily="var(--font-mono)">
          {lat.toFixed(2)}, {lon.toFixed(2)}
        </text>
        {manifest.pins.map((p) => (
          <line key={p.id} x1={p.x} y1={62} x2={p.x} y2={72} stroke="#CBD5E1" strokeWidth={2.2} />
        ))}
      </g>
    );
  }

  if (part.type === 'hc-05') {
    const hasLog = Boolean(snapshot?.bluetoothLogs?.[part.id]);
    return (
      <g>
        <rect x={6} y={4} width={84} height={54} rx={5} fill="#0F766E" stroke={selected ? 'var(--accent)' : '#115E59'} strokeWidth={selected ? 2.5 : 1.4} />
        <rect x={14} y={10} width={52} height={42} rx={3} fill="#1E40AF" />
        {/* Gold PCB trace antenna zigzag */}
        <path d="M70 14 H82 V22 H72 V30 H82 V38 H72" fill="none" stroke="#F59E0B" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={24} cy={20} r={3.5} fill={snapshot?.running ? (hasLog ? '#38BDF8' : '#EF4444') : '#1E293B'} />
        <text x={40} y={36} textAnchor="middle" fill="#EFF6FF" fontSize={9} fontWeight={700} fontFamily="var(--font-mono)">HC-05</text>
        <text x={40} y={46} textAnchor="middle" fill="#BFDBFE" fontSize={7} fontFamily="var(--font-mono)">BT 9600</text>
        {manifest.pins.map((p) => (
          <line key={p.id} x1={p.x} y1={58} x2={p.x} y2={68} stroke="#CBD5E1" strokeWidth={2.2} />
        ))}
      </g>
    );
  }

  return <rect x={0} y={0} width={manifest.width} height={manifest.height} fill="#64748B" rx={4} />;
};
