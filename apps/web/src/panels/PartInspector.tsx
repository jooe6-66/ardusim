import React, { useState } from 'react';
import {
  CapacitanceUnit,
  CapacitorKind,
  DiodeModel,
  LedColor,
  PartInstance,
  ResistanceUnit,
  SimSnapshot,
  Wire,
  isMcuBoardType,
  ldrLuxToOhms,
} from '@ardusim/sim-core';
import {
  CAPACITANCE_UNITS,
  DIODE_MODELS,
  PART_MANIFEST_MAP,
  RESISTANCE_UNITS,
} from '@ardusim/parts';
import { Lang, Messages } from '../i18n/messages';

const WIRE_COLORS = [
  '#DC2626',
  '#1F2937',
  '#0F6660',
  '#2563EB',
  '#D97706',
  '#16A34A',
  '#7C3AED',
  '#EA580C',
];

const LED_COLORS: Array<{ id: LedColor; hex: string; label: string }> = [
  { id: 'red', hex: '#EF4444', label: 'Red' },
  { id: 'green', hex: '#22C55E', label: 'Green' },
  { id: 'yellow', hex: '#EAB308', label: 'Yellow' },
  { id: 'blue', hex: '#3B82F6', label: 'Blue' },
  { id: 'white', hex: '#F1F5F9', label: 'White' },
];

const RESISTOR_PRESETS: Array<{ value: number; unit: ResistanceUnit; label: string }> = [
  { value: 220, unit: 'ohm', label: '220 Ω' },
  { value: 1, unit: 'kohm', label: '1 kΩ' },
  { value: 10, unit: 'kohm', label: '10 kΩ' },
  { value: 100, unit: 'kohm', label: '100 kΩ' },
];

const CAPACITOR_PRESETS: Array<{ value: number; unit: CapacitanceUnit; label: string }> = [
  { value: 100, unit: 'nf', label: '100 nF' },
  { value: 10, unit: 'uf', label: '10 µF' },
  { value: 100, unit: 'uf', label: '100 µF' },
  { value: 1, unit: 'mf', label: '1 mF' },
];

const KEYPAD_ROWS = [
  ['1', '2', '3', 'A'],
  ['4', '5', '6', 'B'],
  ['7', '8', '9', 'C'],
  ['*', '0', '#', 'D'],
];

interface PartInspectorProps {
  selectedPart: PartInstance | null;
  selectedWire: Wire | null;
  snapshot: SimSnapshot | null;
  pressedButtons: Set<string>;
  pressedKeypadKeys: Set<string>;
  buzzerAudioEnabled: boolean;
  onToggleBuzzerAudio: () => void;
  onUpdatePartProps: (partId: string, patch: Record<string, unknown>) => void;
  onRotatePart: (partId: string) => void;
  onFlipPart: (partId: string, axis: 'x' | 'y') => void;
  onDeletePart: (partId: string) => void;
  onUpdateWireColor: (wireId: string, color: string) => void;
  onResetWireShape: (wireId: string) => void;
  onDeleteWire: (wireId: string) => void;
  onPressButton: (partId: string, pressed: boolean) => void;
  onPressKeypadKey: (partId: string, row: number, col: number, pressed: boolean) => void;
  onSendBluetooth: (partId: string, text: string) => void;
  onClearBluetooth: (partId: string) => void;
  onCloseDrawer: () => void;
  lang: Lang;
  t: Messages;
}

export const PartInspector: React.FC<PartInspectorProps> = ({
  selectedPart,
  selectedWire,
  snapshot,
  pressedButtons,
  pressedKeypadKeys,
  buzzerAudioEnabled,
  onToggleBuzzerAudio,
  onUpdatePartProps,
  onRotatePart,
  onFlipPart,
  onDeletePart,
  onUpdateWireColor,
  onResetWireShape,
  onDeleteWire,
  onPressButton,
  onPressKeypadKey,
  onSendBluetooth,
  onClearBluetooth,
  onCloseDrawer,
  lang,
  t,
}) => {
  const [btInput, setBtInput] = useState('');
  if (!selectedPart && !selectedWire) {
    return (
      <>
        <div className="panel-header">
          <span>{t.inspector}</span>
          <button type="button" className="btn btn-compact" onClick={onCloseDrawer}>
            {t.close}
          </button>
        </div>
        <div className="inspector-body">
          <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>{t.inspectorEmpty}</p>
          {snapshot && snapshot.warnings.length > 0 && (
            <div className="field-group">
              <div className="field-label">{t.warningsTitle}</div>
              {snapshot.warnings.map((w, idx) => (
                <div key={idx} className="warning-banner">
                  <strong>{w.partId.toUpperCase()}:</strong> {w.detail}
                </div>
              ))}
            </div>
          )}
        </div>
      </>
    );
  }

  if (selectedWire) {
    return (
      <>
        <div className="panel-header">
          <span>{t.inspectorWireTitle}</span>
          <button type="button" className="btn btn-compact" onClick={onCloseDrawer}>
            {t.close}
          </button>
        </div>
        <div className="inspector-body">
          <div className="metric-card">
            <span>{selectedWire.from.partId}:{selectedWire.from.pinId}</span>
            <span className="metric-value">→ {selectedWire.to.partId}:{selectedWire.to.pinId}</span>
          </div>

          <div className="field-group">
            <span className="field-label">{t.wireColorLabel}</span>
            <div className="color-swatches">
              {WIRE_COLORS.map((hex) => (
                <button
                  key={hex}
                  type="button"
                  className={`color-swatch ${selectedWire.color === hex ? 'selected' : ''}`}
                  style={{ background: hex }}
                  aria-label={`Color ${hex}`}
                  onClick={() => onUpdateWireColor(selectedWire.id, hex)}
                />
              ))}
            </div>
          </div>

          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-muted)' }}>
            {t.wireEditHint}
          </p>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn"
              style={{ flex: 1 }}
              onClick={() => onResetWireShape(selectedWire.id)}
            >
              {t.wireResetShape}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              style={{ flex: 1 }}
              onClick={() => onDeleteWire(selectedWire.id)}
            >
              {t.wireRemove}
            </button>
          </div>
        </div>
      </>
    );
  }

  const part = selectedPart!;
  const manifest = PART_MANIFEST_MAP.get(part.type);
  const title = manifest ? manifest.name[lang] : part.type;

  const ledState = snapshot?.ledStates?.[part.id];
  const capVolt = snapshot?.capacitorVoltages?.[part.id];
  const diodeOn = snapshot?.diodeConducting?.[part.id];
  const servoAngle = snapshot?.servoAngles?.[part.id];
  const buzzerHz = snapshot?.buzzerHz?.[part.id];
  const relayOn = snapshot?.relayEnergized?.[part.id];
  const motorState = snapshot?.motorStates?.[part.id];

  return (
    <>
      <div className="panel-header">
        <span>
          {title} ({part.id})
        </span>
        <button type="button" className="btn btn-compact" onClick={onCloseDrawer}>
          {t.close}
        </button>
      </div>

      <div className="inspector-body">
        {/* --- PASSIVES --- */}
        {part.type === 'resistor' && (
          <>
            <div className="field-group">
              <label className="field-label" htmlFor="res-val">
                {t.valueLabel} & {t.unitLabel}
              </label>
              <div className="field-row">
                <input
                  id="res-val"
                  className="text-input"
                  type="number"
                  min={0.1}
                  step="any"
                  value={Number(part.props.value ?? 220)}
                  onChange={(e) => {
                    const num = parseFloat(e.target.value);
                    if (Number.isFinite(num) && num > 0) onUpdatePartProps(part.id, { value: num });
                  }}
                />
                <select
                  className="select-input"
                  aria-label={t.unitLabel}
                  value={(part.props.unit as ResistanceUnit) ?? 'ohm'}
                  onChange={(e) => onUpdatePartProps(part.id, { unit: e.target.value })}
                >
                  {RESISTANCE_UNITS.map((u) => (
                    <option key={u.id} value={u.id}>{u.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="cat-chips">
              {RESISTOR_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className="btn btn-compact"
                  onClick={() => onUpdatePartProps(part.id, { value: p.value, unit: p.unit })}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </>
        )}

        {part.type === 'capacitor' && (
          <>
            <div className="field-group">
              <label className="field-label" htmlFor="cap-val">
                {t.valueLabel} & {t.unitLabel}
              </label>
              <div className="field-row">
                <input
                  id="cap-val"
                  className="text-input"
                  type="number"
                  min={0.1}
                  step="any"
                  value={Number(part.props.value ?? 100)}
                  onChange={(e) => {
                    const num = parseFloat(e.target.value);
                    if (Number.isFinite(num) && num > 0) onUpdatePartProps(part.id, { value: num });
                  }}
                />
                <select
                  className="select-input"
                  aria-label={t.unitLabel}
                  value={(part.props.unit as CapacitanceUnit) ?? 'uf'}
                  onChange={(e) => onUpdatePartProps(part.id, { unit: e.target.value })}
                >
                  {CAPACITANCE_UNITS.map((u) => (
                    <option key={u.id} value={u.id}>{u.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="cat-chips">
              {CAPACITOR_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className="btn btn-compact"
                  onClick={() => onUpdatePartProps(part.id, { value: p.value, unit: p.unit })}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="cap-kind">{t.kindLabel}</label>
              <select
                id="cap-kind"
                className="select-input"
                value={(part.props.kind as CapacitorKind) ?? 'electrolytic'}
                onChange={(e) => onUpdatePartProps(part.id, { kind: e.target.value })}
              >
                <option value="electrolytic">{t.kindElectrolytic}</option>
                <option value="ceramic">{t.kindCeramic}</option>
              </select>
            </div>
            {snapshot?.running && capVolt !== undefined && (
              <>
                <div className="metric-card">
                  <span>{t.capVoltageLabel}</span>
                  <span className="metric-value">{capVolt.toFixed(2)} V</span>
                </div>
                {part.props.kind !== 'ceramic' && capVolt < -0.5 && (
                  <div className="warning-banner">{t.capReverseWarn}</div>
                )}
              </>
            )}
          </>
        )}

        {part.type === 'diode' && (
          <>
            <div className="field-group">
              <label className="field-label" htmlFor="diode-model">{t.diodeModelLabel}</label>
              <select
                id="diode-model"
                className="select-input"
                value={(part.props.model as DiodeModel) ?? '1N4007'}
                onChange={(e) => {
                  const model = e.target.value as DiodeModel;
                  const meta = DIODE_MODELS.find((m) => m.id === model);
                  onUpdatePartProps(part.id, { model, vf: meta?.defaultVf ?? 0.7 });
                }}
              >
                {DIODE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
            {(part.props.model === 'custom' || part.props.model === 'zener') && (
              <div className="field-group">
                <label className="field-label" htmlFor="diode-volt">
                  {part.props.model === 'zener' ? t.zenerVoltageLabel : t.forwardVoltageLabel} (V)
                </label>
                <input
                  id="diode-volt"
                  className="text-input"
                  type="number"
                  min={0.1}
                  max={12}
                  step={0.1}
                  value={part.props.model === 'zener' ? Number(part.props.zenerVz ?? 3.3) : Number(part.props.vf ?? 0.7)}
                  onChange={(e) => {
                    const num = parseFloat(e.target.value);
                    if (Number.isFinite(num) && num > 0) {
                      onUpdatePartProps(part.id, part.props.model === 'zener' ? { zenerVz: num } : { vf: num });
                    }
                  }}
                />
              </div>
            )}
            {snapshot?.running && (
              <div className="metric-card">
                <span>{t.diodeStateLabel}</span>
                <span className="metric-value">{diodeOn ? t.diodeConducting : t.diodeBlocking}</span>
              </div>
            )}
          </>
        )}

        {/* --- SENSORS (Interactive live touch sliders!) --- */}
        {part.type === 'hc-sr04' && (
          <div className="field-group">
            <label className="field-label" htmlFor="us-dist">
              {t.distanceLabel}: {Number(part.props.distanceCm ?? 45)} cm
            </label>
            <input
              id="us-dist"
              type="range"
              min={2}
              max={400}
              value={Number(part.props.distanceCm ?? 45)}
              onChange={(e) => onUpdatePartProps(part.id, { distanceCm: Number(e.target.value) })}
            />
          </div>
        )}

        {part.type === 'dht22' && (
          <>
            <div className="field-group">
              <label className="field-label" htmlFor="dht-model">{t.dhtModelLabel}</label>
              <select
                id="dht-model"
                className="select-input"
                value={String(part.props.model ?? 'DHT22')}
                onChange={(e) => onUpdatePartProps(part.id, { model: e.target.value })}
              >
                <option value="DHT22">DHT22</option>
                <option value="DHT11">DHT11</option>
              </select>
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="dht-temp">
                {t.tempLabel}: {Number(part.props.tempC ?? 27.5).toFixed(1)} °C
              </label>
              <input
                id="dht-temp"
                type="range"
                min={-10}
                max={60}
                step={0.5}
                value={Number(part.props.tempC ?? 27.5)}
                onChange={(e) => onUpdatePartProps(part.id, { tempC: Number(e.target.value) })}
              />
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="dht-hum">
                {t.humidityLabel}: {Number(part.props.humidityPct ?? 60).toFixed(0)} %
              </label>
              <input
                id="dht-hum"
                type="range"
                min={0}
                max={100}
                step={1}
                value={Number(part.props.humidityPct ?? 60)}
                onChange={(e) => onUpdatePartProps(part.id, { humidityPct: Number(e.target.value) })}
              />
            </div>
          </>
        )}

        {part.type === 'pir' && (
          <>
            <div className="metric-card">
              <span>{t.pirMotionLabel}</span>
              <span className="metric-value">
                {part.props.motion ? t.pirDetected : t.pirClear}
              </span>
            </div>
            <button
              type="button"
              className={`btn ${part.props.motion ? 'btn-accent' : 'btn-primary'}`}
              aria-pressed={Boolean(part.props.motion)}
              onClick={() => onUpdatePartProps(part.id, { motion: !part.props.motion })}
            >
              {part.props.motion ? t.pirClear : t.pirDetected}
            </button>
          </>
        )}

        {part.type === 'ldr' && (
          <>
            <div className="field-group">
              <label className="field-label" htmlFor="ldr-lux">
                {t.ldrLuxLabel}: {Number(part.props.lux ?? 300)} lux
              </label>
              <input
                id="ldr-lux"
                type="range"
                min={5}
                max={1000}
                step={5}
                value={Number(part.props.lux ?? 300)}
                onChange={(e) => onUpdatePartProps(part.id, { lux: Number(e.target.value) })}
              />
            </div>
            <div className="metric-card">
              <span>Resistance</span>
              <span className="metric-value">{ldrLuxToOhms(Number(part.props.lux ?? 300))} Ω</span>
            </div>
          </>
        )}

        {part.type === 'lm35' && (
          <>
            <div className="field-group">
              <label className="field-label" htmlFor="lm35-temp">
                {t.tempLabel}: {Number(part.props.tempC ?? 28)} °C
              </label>
              <input
                id="lm35-temp"
                type="range"
                min={0}
                max={150}
                value={Number(part.props.tempC ?? 28)}
                onChange={(e) => onUpdatePartProps(part.id, { tempC: Number(e.target.value) })}
              />
            </div>
            <div className="metric-card">
              <span>OUT</span>
              <span className="metric-value">{(Number(part.props.tempC ?? 28) * 0.01).toFixed(2)} V</span>
            </div>
          </>
        )}

        {part.type === 'mq2' && (
          <>
            <div className="field-group">
              <label className="field-label" htmlFor="mq2-gas">
                {t.gasLevelLabel}: {Number(part.props.gasPct ?? 18)}%
              </label>
              <input
                id="mq2-gas"
                type="range"
                min={0}
                max={100}
                value={Number(part.props.gasPct ?? 18)}
                onChange={(e) => onUpdatePartProps(part.id, { gasPct: Number(e.target.value) })}
              />
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="mq2-th">
                {t.gasThresholdLabel}: {Number(part.props.thresholdPct ?? 50)}%
              </label>
              <input
                id="mq2-th"
                type="range"
                min={10}
                max={95}
                value={Number(part.props.thresholdPct ?? 50)}
                onChange={(e) => onUpdatePartProps(part.id, { thresholdPct: Number(e.target.value) })}
              />
            </div>
          </>
        )}

        {/* --- DISPLAYS --- */}
        {part.type === 'lcd-1602-i2c' && (
          <>
            <div className="field-group">
              <label className="field-label" htmlFor="lcd-addr">{t.i2cAddrLabel}</label>
              <select
                id="lcd-addr"
                className="select-input"
                value={Number(part.props.i2cAddress ?? 0x27)}
                onChange={(e) => onUpdatePartProps(part.id, { i2cAddress: Number(e.target.value) })}
              >
                <option value={0x27}>0x27 (Default PCF8574)</option>
                <option value={0x3f}>0x3F (PCF8574A)</option>
              </select>
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="lcd-color">{t.lcdColorLabel}</label>
              <select
                id="lcd-color"
                className="select-input"
                value={String(part.props.color ?? 'green')}
                onChange={(e) => onUpdatePartProps(part.id, { color: e.target.value })}
              >
                <option value="green">{t.lcdGreen}</option>
                <option value="blue">{t.lcdBlue}</option>
              </select>
            </div>
          </>
        )}

        {part.type === 'oled-ssd1306' && (
          <div className="field-group">
            <label className="field-label" htmlFor="oled-addr">{t.i2cAddrLabel}</label>
            <select
              id="oled-addr"
              className="select-input"
              value={Number(part.props.i2cAddress ?? 0x3c)}
              onChange={(e) => onUpdatePartProps(part.id, { i2cAddress: Number(e.target.value) })}
            >
              <option value={0x3c}>0x3C (Default SSD1306)</option>
              <option value={0x3d}>0x3D</option>
            </select>
          </div>
        )}

        {(part.type === 'rgb-led' || part.type === 'seven-seg') && (
          <div className="field-group">
            <label className="field-label" htmlFor="common-mode">{t.commonModeLabel}</label>
            <select
              id="common-mode"
              className="select-input"
              value={String(part.props.common ?? 'cathode')}
              onChange={(e) => onUpdatePartProps(part.id, { common: e.target.value })}
            >
              <option value="cathode">{t.commonCathode}</option>
              <option value="anode">{t.commonAnode}</option>
            </select>
          </div>
        )}

        {/* --- OUTPUTS & MOTORS --- */}
        {part.type === 'led' && (
          <>
            <div className="field-group">
              <span className="field-label">{t.ledColorLabel}</span>
              <div className="color-swatches">
                {LED_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`color-swatch ${part.props.color === c.id ? 'selected' : ''}`}
                    style={{ background: c.hex }}
                    aria-label={c.label}
                    onClick={() => onUpdatePartProps(part.id, { color: c.id })}
                  />
                ))}
              </div>
            </div>
            {snapshot?.running && ledState && (
              <>
                <div className="metric-card">
                  <span>{t.ledCurrentLabel}</span>
                  <span className="metric-value">{ledState.currentMa.toFixed(1)} mA</span>
                </div>
                {ledState.overcurrent && <div className="warning-banner">{t.ledOvercurrentWarn}</div>}
              </>
            )}
          </>
        )}

        {part.type === 'relay' && (
          <>
            <div className="field-group">
              <label className="field-label" htmlFor="relay-trig">{t.relayTriggerLabel}</label>
              <select
                id="relay-trig"
                className="select-input"
                value={part.props.activeLow ? 'low' : 'high'}
                onChange={(e) => onUpdatePartProps(part.id, { activeLow: e.target.value === 'low' })}
              >
                <option value="high">{t.relayActiveHigh}</option>
                <option value="low">{t.relayActiveLow}</option>
              </select>
            </div>
            {snapshot?.running && (
              <div className="metric-card">
                <span>{t.relayStateLabel}</span>
                <span className="metric-value">{relayOn ? t.relayEnergized : t.relayIdle}</span>
              </div>
            )}
          </>
        )}

        {part.type === 'servo' && (
          <div className="metric-card">
            <span>{t.servoAngleLabel}</span>
            <span className="metric-value">{servoAngle ?? 90}°</span>
          </div>
        )}

        {part.type === 'buzzer' && (
          <>
            <div className="metric-card">
              <span>{t.buzzerFreqLabel}</span>
              <span className="metric-value">{buzzerHz ?? 0} Hz</span>
            </div>
            <button
              type="button"
              className={`btn ${buzzerAudioEnabled ? 'btn-primary' : ''}`}
              aria-pressed={buzzerAudioEnabled}
              onClick={onToggleBuzzerAudio}
            >
              {buzzerAudioEnabled ? t.buzzerAudioOn : t.buzzerAudioOff}
            </button>
          </>
        )}

        {part.type === 'dc-motor' && (
          <div className="metric-card">
            <span>{t.motorSpeedLabel}</span>
            <span className="metric-value">
              {motorState ? `${motorState.rpm} RPM (${motorState.voltage.toFixed(2)}V)` : '0 RPM'}
            </span>
          </div>
        )}

        {/* --- INPUTS --- */}
        {part.type === 'potentiometer' && (
          <>
            <div className="field-group">
              <label className="field-label" htmlFor="pot-slider">
                {t.potPositionLabel}: {Math.round(Number(part.props.position ?? 0.5) * 100)}%
              </label>
              <input
                id="pot-slider"
                type="range"
                min={0}
                max={100}
                value={Math.round(Number(part.props.position ?? 0.5) * 100)}
                onChange={(e) => onUpdatePartProps(part.id, { position: Number(e.target.value) / 100 })}
              />
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="pot-val">{t.valueLabel} & {t.unitLabel}</label>
              <div className="field-row">
                <input
                  id="pot-val"
                  className="text-input"
                  type="number"
                  min={1}
                  step="any"
                  value={Number(part.props.value ?? 10)}
                  onChange={(e) => {
                    const num = parseFloat(e.target.value);
                    if (Number.isFinite(num) && num > 0) onUpdatePartProps(part.id, { value: num });
                  }}
                />
                <select
                  className="select-input"
                  aria-label={t.unitLabel}
                  value={(part.props.unit as ResistanceUnit) ?? 'kohm'}
                  onChange={(e) => onUpdatePartProps(part.id, { unit: e.target.value })}
                >
                  {RESISTANCE_UNITS.map((u) => (
                    <option key={u.id} value={u.id}>{u.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </>
        )}

        {part.type === 'pushbutton' && (
          <>
            <div className="metric-card">
              <span>Status</span>
              <span className="metric-value">
                {pressedButtons.has(part.id) || Boolean(part.props.locked)
                  ? t.buttonPressed
                  : t.buttonReleased}
              </span>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onPointerDown={() => onPressButton(part.id, true)}
              onPointerUp={() => onPressButton(part.id, false)}
              onPointerLeave={() => onPressButton(part.id, false)}
              onPointerCancel={() => onPressButton(part.id, false)}
            >
              {t.buttonPress}
            </button>
            <button
              type="button"
              className={`btn ${part.props.locked ? 'btn-accent' : ''}`}
              aria-pressed={Boolean(part.props.locked)}
              onClick={() => onUpdatePartProps(part.id, { locked: !part.props.locked })}
            >
              {t.buttonLatch}
            </button>
          </>
        )}

        {part.type === 'keypad-4x4' && (
          <div className="field-group">
            <span className="field-label">{t.keypadHint}</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
              {KEYPAD_ROWS.map((row, r) =>
                row.map((label, c) => {
                  const isDown = pressedKeypadKeys.has(`${part.id}:${r}:${c}`);
                  return (
                    <button
                      key={label}
                      type="button"
                      className={`btn btn-compact ${isDown ? 'btn-accent' : ''}`}
                      onPointerDown={() => onPressKeypadKey(part.id, r, c, true)}
                      onPointerUp={() => onPressKeypadKey(part.id, r, c, false)}
                      onPointerLeave={() => onPressKeypadKey(part.id, r, c, false)}
                      onPointerCancel={() => onPressKeypadKey(part.id, r, c, false)}
                    >
                      {label}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* --- PHASE 3 INSPECTORS --- */}
        {part.type === 'rfid-rc522' && (
          <>
            <div className="metric-card">
              <span>{t.rfidStatusLabel}</span>
              <span className="metric-value">
                {part.props.cardPresent ? t.rfidPresent : t.rfidAbsent}
              </span>
            </div>
            <button
              type="button"
              className={`btn ${part.props.cardPresent ? 'btn-accent' : 'btn-primary'}`}
              aria-pressed={Boolean(part.props.cardPresent)}
              onClick={() => onUpdatePartProps(part.id, { cardPresent: !part.props.cardPresent })}
            >
              {part.props.cardPresent ? t.rfidRemoveCard : t.rfidTapCard}
            </button>
            <div className="field-group">
              <label className="field-label" htmlFor="rfid-uid">{t.rfidUidLabel}</label>
              <input
                id="rfid-uid"
                className="text-input"
                style={{ fontFamily: 'var(--font-mono)' }}
                maxLength={8}
                value={String(part.props.uid ?? 'DEADBEEF')}
                onChange={(e) =>
                  onUpdatePartProps(part.id, {
                    uid: e.target.value.replace(/[^0-9a-fA-F]/g, '').toUpperCase(),
                  })
                }
              />
            </div>
          </>
        )}

        {part.type === 'mpu6050' && (
          <>
            <div className="field-group">
              <label className="field-label" htmlFor="mpu-addr">{t.i2cAddrLabel}</label>
              <select
                id="mpu-addr"
                className="select-input"
                value={Number(part.props.i2cAddress ?? 0x68)}
                onChange={(e) => onUpdatePartProps(part.id, { i2cAddress: Number(e.target.value) })}
              >
                <option value={0x68}>0x68 (AD0 = LOW)</option>
                <option value={0x69}>0x69 (AD0 = HIGH)</option>
              </select>
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="mpu-pitch">
                {t.pitchLabel}: {Number(part.props.pitchDeg ?? 0)}°
              </label>
              <input
                id="mpu-pitch"
                type="range"
                min={-90}
                max={90}
                value={Number(part.props.pitchDeg ?? 0)}
                onChange={(e) => onUpdatePartProps(part.id, { pitchDeg: Number(e.target.value) })}
              />
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="mpu-roll">
                {t.rollLabel}: {Number(part.props.rollDeg ?? 0)}°
              </label>
              <input
                id="mpu-roll"
                type="range"
                min={-90}
                max={90}
                value={Number(part.props.rollDeg ?? 0)}
                onChange={(e) => onUpdatePartProps(part.id, { rollDeg: Number(e.target.value) })}
              />
            </div>
          </>
        )}

        {part.type === 'ds3231-rtc' && (
          <div className="metric-card">
            <span>{t.rtcTimeLabel}</span>
            <span className="metric-value">
              {snapshot?.running ? (snapshot.rtcTimes?.[part.id] ?? '--:--:--') : '0x68'}
            </span>
          </div>
        )}

        {part.type === 'stepper' && (
          <>
            <div className="metric-card">
              <span>{t.stepperStepsLabel}</span>
              <span className="metric-value">
                {snapshot?.stepperStates?.[part.id]
                  ? `${snapshot.stepperStates[part.id].angleDeg}° (${snapshot.stepperStates[part.id].steps})`
                  : '0° (0)'}
              </span>
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="step-rev">{t.stepsPerRevLabel}</label>
              <input
                id="step-rev"
                className="text-input"
                type="number"
                min={8}
                max={4096}
                value={Number(part.props.stepsPerRev ?? 200)}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (Number.isFinite(n) && n >= 8) onUpdatePartProps(part.id, { stepsPerRev: n });
                }}
              />
            </div>
          </>
        )}

        {part.type === 'gps-neo6m' && (
          <>
            <div className="field-group">
              <label className="field-label" htmlFor="gps-lat">{t.latLabel}</label>
              <input
                id="gps-lat"
                className="text-input"
                type="number"
                step={0.001}
                min={-90}
                max={90}
                value={Number(part.props.lat ?? -6.2088)}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (Number.isFinite(v)) onUpdatePartProps(part.id, { lat: v });
                }}
              />
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="gps-lon">{t.lonLabel}</label>
              <input
                id="gps-lon"
                className="text-input"
                type="number"
                step={0.001}
                min={-180}
                max={180}
                value={Number(part.props.lon ?? 106.8456)}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (Number.isFinite(v)) onUpdatePartProps(part.id, { lon: v });
                }}
              />
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="gps-spd">
                {t.speedLabel}: {Number(part.props.speedKnots ?? 1.5).toFixed(1)}
              </label>
              <input
                id="gps-spd"
                type="range"
                min={0}
                max={50}
                step={0.5}
                value={Number(part.props.speedKnots ?? 1.5)}
                onChange={(e) => onUpdatePartProps(part.id, { speedKnots: Number(e.target.value) })}
              />
            </div>
          </>
        )}

        {part.type === 'hc-05' && (
          <div className="field-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="field-label">{t.btTerminalLabel}</span>
              <button
                type="button"
                className="btn btn-compact"
                onClick={() => onClearBluetooth(part.id)}
              >
                {t.serialClear}
              </button>
            </div>
            <pre
              className="serial-output"
              style={{ minHeight: 84, maxHeight: 140, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}
            >
              {snapshot?.bluetoothLogs?.[part.id] || t.btEmpty}
            </pre>
            <form
              style={{ display: 'flex', gap: 6 }}
              onSubmit={(e) => {
                e.preventDefault();
                if (!btInput) return;
                onSendBluetooth(part.id, `${btInput}\n`);
                setBtInput('');
              }}
            >
              <input
                className="text-input"
                placeholder={t.btSendPlaceholder}
                value={btInput}
                onChange={(e) => setBtInput(e.target.value)}
                disabled={!snapshot?.running}
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!snapshot?.running || !btInput}
              >
                {t.serialSend}
              </button>
            </form>
          </div>
        )}

        {/* Flip horizontal & vertical available on every component */}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            type="button"
            className={`btn ${part.flipX ? 'btn-active' : ''}`}
            style={{ flex: 1 }}
            onClick={() => onFlipPart(part.id, 'x')}
            aria-pressed={Boolean(part.flipX)}
          >
            ⇄ {t.flipH}
          </button>
          <button
            type="button"
            className={`btn ${part.flipY ? 'btn-active' : ''}`}
            style={{ flex: 1 }}
            onClick={() => onFlipPart(part.id, 'y')}
            aria-pressed={Boolean(part.flipY)}
          >
            ⇅ {t.flipV}
          </button>
        </div>

        {/* Common rotation & deletion controls (MCU boards are switched from top-left selector) */}
        {!isMcuBoardType(part.type) && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn" style={{ flex: 1 }} onClick={() => onRotatePart(part.id)}>
              {t.rotate}
            </button>
            <button type="button" className="btn btn-danger" style={{ flex: 1 }} onClick={() => onDeletePart(part.id)}>
              {t.deleteSelected}
            </button>
          </div>
        )}
      </div>
    </>
  );
};
