import React, { useEffect, useState } from 'react';
import { PartManifest } from '@ardusim/sim-core';
import { PART_CATALOG } from '@ardusim/parts';
import { Lang, Messages } from '../i18n/messages';

interface PartPickerSheetProps {
  open: boolean;
  onClose: () => void;
  onPickPart: (type: string) => void;
  lang: Lang;
  t: Messages;
}

type FilterCat = 'all' | PartManifest['category'];

export const PartPickerSheet: React.FC<PartPickerSheetProps> = ({
  open,
  onClose,
  onPickPart,
  lang,
  t,
}) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<FilterCat>('all');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const items = PART_CATALOG.filter((item) => {
    if (category !== 'all' && item.category !== category) return false;
    if (!q) return true;
    return (
      item.name[lang].toLowerCase().includes(q) ||
      item.description[lang].toLowerCase().includes(q) ||
      item.type.includes(q)
    );
  });

  const cats: Array<{ id: FilterCat; label: string }> = [
    { id: 'all', label: t.catAll },
    { id: 'mcu', label: t.catMcu },
    { id: 'breadboard', label: t.catBreadboard },
    { id: 'passive', label: t.catPassive },
    { id: 'sensor', label: t.catSensor },
    { id: 'display', label: t.catDisplay },
    { id: 'input', label: t.catInput },
    { id: 'output', label: t.catOutput },
    { id: 'motor', label: t.catMotor },
  ];

  return (
    <div
      className="sheet-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={t.partPickerTitle}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="sheet-dialog">
        <div className="panel-header">
          <span>{t.partPickerTitle}</span>
          <button type="button" className="btn btn-compact" onClick={onClose}>
            {t.close}
          </button>
        </div>
        <div className="sheet-body">
          <input
            type="search"
            className="text-input"
            placeholder={t.partSearchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />

          <div className="cat-chips">
            {cats.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`btn btn-compact ${category === c.id ? 'btn-active' : ''}`}
                onClick={() => setCategory(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>

          {items.length === 0 ? (
            <p style={{ margin: '12px 0', color: 'var(--text-muted)', textAlign: 'center' }}>
              {t.partSearchEmpty}
            </p>
          ) : (
            <div className="part-grid">
              {items.map((item) => (
                <button
                  key={item.type}
                  type="button"
                  className="part-card"
                  onClick={() => {
                    onPickPart(item.type);
                    onClose();
                  }}
                >
                  <span className="part-card-title">{item.name[lang]}</span>
                  <span className="part-card-desc">{item.description[lang]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
