import React, { useEffect, useMemo, useState } from 'react';
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

const PICKABLE_PARTS = PART_CATALOG.filter((item) => item.category !== 'mcu');

export const PartPickerSheet: React.FC<PartPickerSheetProps> = ({
  open,
  onClose,
  onPickPart,
  lang,
  t,
}) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<FilterCat>('all');
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: PICKABLE_PARTS.length };
    for (const part of PICKABLE_PARTS) {
      counts[part.category] = (counts[part.category] ?? 0) + 1;
    }
    return counts;
  }, []);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const items = PICKABLE_PARTS.filter((item) => {
    if (category !== 'all' && item.category !== category) return false;
    if (!q) return true;
    return (
      item.name.id.toLowerCase().includes(q) ||
      item.name.en.toLowerCase().includes(q) ||
      item.type.toLowerCase().includes(q)
    );
  });

  const cats: Array<{ id: FilterCat; label: string }> = [
    { id: 'all', label: t.catAll },
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
      <div className="sheet-dialog sheet-dialog--parts">
        <div className="panel-header">
          <span className="panel-header-title">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="2" y="2" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
              <rect x="9" y="2" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
              <rect x="2" y="9" width="5" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
              <path d="M11.5 9V14M9 11.5H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <span>{t.partPickerTitle}</span>
            <span className="panel-count-tag">{items.length}</span>
          </span>
          <button type="button" className="btn btn-compact" onClick={onClose}>
            {t.close}
          </button>
        </div>

        <div className="sheet-body sheet-body--parts">
          <div className="search-field">
            <svg
              className="search-field-icon"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.6" />
              <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <input
              type="search"
              className="text-input search-field-input"
              placeholder={t.partSearchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
          </div>

          <div className="cat-chips" role="group" aria-label={t.partPickerTitle}>
            {cats.map((c) => {
              const count = categoryCounts[c.id] ?? 0;
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`cat-chip ${category === c.id ? 'is-active' : ''}`}
                  aria-pressed={category === c.id}
                  onClick={() => setCategory(c.id)}
                >
                  <span>{c.label}</span>
                  <span className="cat-chip-count">{count}</span>
                </button>
              );
            })}
          </div>

          {items.length === 0 ? (
            <div className="part-empty-state">
              <p>{t.partSearchEmpty}</p>
              <button
                type="button"
                className="btn btn-compact"
                onClick={() => {
                  setQuery('');
                  setCategory('all');
                }}
              >
                {t.clearSearch}
              </button>
            </div>
          ) : (
            <div className="part-grid">
              {items.map((item, idx) => (
                <button
                  key={item.type}
                  type="button"
                  className="part-card"
                  style={{ '--card-idx': Math.min(idx, 12) } as React.CSSProperties}
                  onClick={() => {
                    onPickPart(item.type);
                    onClose();
                  }}
                >
                  <span className="part-card-media">
                    {!failedImages[item.type] ? (
                      <img
                        src={`/parts/${item.type}.webp`}
                        alt={item.name[lang]}
                        className="part-card-img"
                        loading="lazy"
                        decoding="async"
                        onError={() =>
                          setFailedImages((prev) => ({ ...prev, [item.type]: true }))
                        }
                      />
                    ) : (
                      <span className="part-card-fallback" aria-hidden="true">
                        {item.type.toUpperCase()}
                      </span>
                    )}
                  </span>
                  <span className="part-card-title">{item.name[lang]}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
