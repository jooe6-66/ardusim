import React, { useEffect, useRef, useState } from 'react';
import { CircuitDiagram } from '@ardusim/sim-core';
import { STARTER_TEMPLATES, StarterTemplate } from '../examples/templates';
import { Lang, Messages } from '../i18n/messages';
import { WiringImageFormat } from '../utils/exportWiring';

type ExportChoice = WiringImageFormat | 'json' | 'ino';

interface ProjectMenuProps {
  open: boolean;
  onClose: () => void;
  currentName: string;
  onRename: (name: string) => void;
  savedProjects: CircuitDiagram[];
  onNewBlank: () => void;
  onSaveCurrent: () => Promise<void>;
  onLoadDiagram: (diagram: CircuitDiagram, precompiledHex?: string) => void;
  onDeleteSaved: (id: string) => Promise<void>;
  onExportJson: () => void;
  onImportJson: (text: string) => boolean;
  onExportIno: () => void;
  onImportIno: (text: string) => boolean;
  onImportHex: (hex: string) => boolean;
  onExportImage: (format: WiringImageFormat) => Promise<boolean>;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onToggleLang: () => void;
  lang: Lang;
  t: Messages;
}

export const ProjectMenu: React.FC<ProjectMenuProps> = ({
  open,
  onClose,
  currentName,
  onRename,
  savedProjects,
  onNewBlank,
  onSaveCurrent,
  onLoadDiagram,
  onDeleteSaved,
  onExportJson,
  onImportJson,
  onExportIno,
  onImportIno,
  onImportHex,
  onExportImage,
  theme,
  onToggleTheme,
  onToggleLang,
  lang,
  t,
}) => {
  const [notice, setNotice] = useState<string | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportChoice>('png');
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setNotice(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const loadTemplate = (tpl: StarterTemplate) => {
    onLoadDiagram(structuredClone(tpl.diagram), tpl.precompiledHex);
    onClose();
  };

  return (
    <div
      className="sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={t.projectsTitle}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet-dialog">
        <div className="panel-header">
          <span>{t.projectsTitle}</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button type="button" className="btn btn-compact" onClick={onToggleLang}>
              {lang.toUpperCase()}
            </button>
            <button type="button" className="btn btn-compact" onClick={onToggleTheme}>
              {theme === 'light' ? 'Dark' : 'Light'}
            </button>
            <button type="button" className="btn btn-compact" onClick={onClose}>
              {t.close}
            </button>
          </div>
        </div>

        <div className="sheet-body">
          {/* Save & File IO */}
          <div className="field-group">
            <label className="field-label" htmlFor="proj-name-input">
              {t.projectNameLabel}
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                id="proj-name-input"
                className="text-input"
                style={{ flex: '1 1 180px' }}
                value={currentName}
                onChange={(e) => onRename(e.target.value)}
              />
              <button
                type="button"
                className="btn btn-primary"
                onClick={async () => {
                  try {
                    await onSaveCurrent();
                    setNotice(t.savedNotice);
                  } catch {
                    setNotice(t.invalidFileError);
                  }
                }}
              >
                {t.saveCurrent}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  onNewBlank();
                  onClose();
                }}
              >
                {t.newBlank}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-compact"
              title={t.importFileHint}
              onClick={() => fileInputRef.current?.click()}
            >
              {t.importFile}
            </button>
            <div style={{ display: 'flex', gap: 6, flex: '1 1 220px', alignItems: 'center' }}>
              <select
                className="select-input"
                style={{ flex: '1 1 150px', minWidth: 140 }}
                aria-label={t.exportFormatLabel}
                value={exportFormat}
                onChange={(e) => setExportFormat(e.target.value as ExportChoice)}
              >
                <option value="png">{t.exportOptPng}</option>
                <option value="svg">{t.exportOptSvg}</option>
                <option value="jpg">{t.exportOptJpg}</option>
                <option value="json">{t.exportOptJson}</option>
                <option value="ino">{t.exportOptIno}</option>
              </select>
              <button
                type="button"
                className="btn btn-compact btn-primary"
                disabled={exporting}
                onClick={async () => {
                  if (exportFormat === 'json') {
                    onExportJson();
                    setNotice(t.exportDoneNotice('JSON'));
                    return;
                  }
                  if (exportFormat === 'ino') {
                    onExportIno();
                    setNotice(t.exportDoneNotice('.ino'));
                    return;
                  }
                  setExporting(true);
                  try {
                    const ok = await onExportImage(exportFormat);
                    setNotice(ok ? t.exportDoneNotice(exportFormat.toUpperCase()) : t.exportImageEmpty);
                  } catch {
                    setNotice(t.invalidFileError);
                  } finally {
                    setExporting(false);
                  }
                }}
              >
                {t.downloadBtn}
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.ino,.cpp,.c,.h,.hex,.txt,application/json,text/plain"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const text = await file.text();
                const name = file.name.toLowerCase();
                const trimmed = text.trim();
                e.target.value = '';

                const looksHex =
                  name.endsWith('.hex') ||
                  (trimmed.startsWith(':') &&
                    trimmed
                      .split(/\r?\n/)
                      .filter(Boolean)
                      .every((line) => /^:[0-9a-fA-F]{10,}$/.test(line.trim())));
                const looksJson = name.endsWith('.json') || trimmed.startsWith('{');

                if (looksJson) {
                  const ok = onImportJson(text);
                  if (ok) onClose();
                  else setNotice(t.invalidFileError);
                } else if (looksHex) {
                  const ok = onImportHex(text);
                  setNotice(ok ? t.hexLoadedNotice : t.invalidFileError);
                } else {
                  const ok = onImportIno(text);
                  setNotice(ok ? t.inoLoadedNotice : t.invalidFileError);
                }
              }}
            />
          </div>

          {notice && (
            <div className="metric-card" role="status">
              <span>{notice}</span>
            </div>
          )}

          {/* Local IndexedDB projects */}
          <div className="field-group">
            <div className="field-label">{t.savedProjectsHeading}</div>
            {savedProjects.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 13 }}>{t.savedEmpty}</p>
            ) : (
              savedProjects.map((proj) => (
                <div key={proj.id} className="template-item">
                  <div>
                    <div style={{ fontWeight: 600 }}>{proj.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {proj.parts.length} parts, {proj.wires.length} wires
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      className="btn btn-compact btn-primary"
                      onClick={() => {
                        onLoadDiagram(proj);
                        onClose();
                      }}
                    >
                      {t.load}
                    </button>
                    <button
                      type="button"
                      className="btn btn-compact btn-danger"
                      onClick={() => onDeleteSaved(proj.id)}
                    >
                      {t.remove}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Starter templates */}
          <div className="field-group">
            <div className="field-label">{t.templatesHeading}</div>
            {STARTER_TEMPLATES.map((tpl) => (
              <div key={tpl.id} className="template-item">
                <div>
                  <div style={{ fontWeight: 600 }}>{tpl.title[lang]}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {tpl.summary[lang]}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-compact"
                  onClick={() => loadTemplate(tpl)}
                >
                  {t.load}
                </button>
              </div>
            ))}
          </div>

          {/* Pre-installed Arduino Libraries */}
          <div className="field-group">
            <div className="field-label">{t.libsHeading}</div>
            <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Wire.h, SPI.h, SoftwareSerial.h, Servo.h, Stepper.h, LiquidCrystal_I2C.h, DHT.h,
              Adafruit_SSD1306.h, Adafruit_GFX.h, Adafruit_NeoPixel.h, MFRC522.h, RTClib.h, LedControl.h
            </div>
          </div>

          {/* Concise touch guide */}
          <div className="field-group">
            <div className="field-label">{t.touchGuideHeading}</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--text-muted)' }}>
              <li>{t.touchGuideTap}</li>
              <li>{t.touchGuidePinch}</li>
              <li>{t.touchGuideWire}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
