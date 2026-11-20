import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PartInstance,
  PinDef,
  PinRef,
  Point,
  SimSnapshot,
  Wire,
  buildNetlist,
  getPinWorldPosition,
  isMcuBoardType,
  pinKey,
  rotateExitDir,
  routeWire,
  wirePointsToSvgPath,
} from '@ardusim/sim-core';
import { PART_MANIFEST_MAP } from '@ardusim/parts';
import { Messages } from '../i18n/messages';
import { PartGraphics } from './PartGraphics';

export type CanvasToolMode = 'auto' | 'wire' | 'move' | 'delete';

export interface ActiveWireDraft {
  from: PinRef;
  fromLabel: string;
  waypoints: Point[];
  cursorWorld: Point;
}

interface CircuitCanvasProps {
  parts: PartInstance[];
  wires: Wire[];
  snapshot: SimSnapshot | null;
  running: boolean;
  mode: CanvasToolMode;
  onModeChange: (m: CanvasToolMode) => void;
  selectedPartId: string | null;
  selectedWireId: string | null;
  onSelectPart: (id: string | null) => void;
  onSelectWire: (id: string | null) => void;
  onMovePart: (partId: string, x: number, y: number, commit: boolean) => void;
  onRotatePart: (partId: string) => void;
  onAddWire: (from: PinRef, to: PinRef, waypoints: Point[]) => void;
  onDeleteWire: (wireId: string) => void;
  onDeletePart: (partId: string) => void;
  onPressButton: (partId: string, pressed: boolean) => void;
  onPressKeypadKey: (partId: string, row: number, col: number, pressed: boolean) => void;
  pressedButtons: Set<string>;
  pressedKeypadKeys: Set<string>;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onTidyWires: () => void;
  fitTrigger: number;
  onOpenPartPicker: () => void;
  onOpenFileMenu: () => void;
  onOpenInspector: () => void;
  t: Messages;
}

interface WorldPin {
  part: PartInstance;
  pin: PinDef;
  world: Point;
  key: string;
  displayLabel: string;
}

const SNAP_GRID = 12;
const PIN_CAPTURE_SCREEN_PX = 30;

function snap(v: number): number {
  return Math.round(v / SNAP_GRID) * SNAP_GRID;
}

function boardShortPrefix(type: string, id: string): string {
  if (type === 'arduino-uno') return 'UNO';
  if (type === 'arduino-nano') return 'NANO';
  if (type === 'arduino-mega') return 'MEGA';
  return id.toUpperCase();
}

export const CircuitCanvas: React.FC<CircuitCanvasProps> = ({
  parts,
  wires,
  snapshot,
  running,
  mode,
  onModeChange,
  selectedPartId,
  selectedWireId,
  onSelectPart,
  onSelectWire,
  onMovePart,
  onRotatePart,
  onAddWire,
  onDeleteWire,
  onDeletePart,
  onPressButton,
  onPressKeypadKey,
  pressedButtons,
  pressedKeypadKeys,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onTidyWires,
  fitTrigger,
  onOpenPartPicker,
  onOpenFileMenu,
  onOpenInspector,
  t,
}) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ x: 16, y: 20, scale: 1 });
  const [wireDraft, setWireDraft] = useState<ActiveWireDraft | null>(null);
  const [loupe, setLoupe] = useState<{ x: number; y: number; text: string } | null>(null);
  const [hoveredPinKey, setHoveredPinKey] = useState<string | null>(null);

  const pointersRef = useRef<Map<number, { clientX: number; clientY: number }>>(new Map());
  const pinchStartRef = useRef<{
    dist: number;
    midX: number;
    midY: number;
    viewX: number;
    viewY: number;
    scale: number;
  } | null>(null);
  const dragStateRef = useRef<
    | { kind: 'pan'; startClient: Point; startView: Point; moved: boolean }
    | { kind: 'part'; partId: string; startWorld: Point; origPart: Point; moved: boolean; wasSelected: boolean }
    | { kind: 'button'; partId: string }
    | { kind: 'keypad'; partId: string; row: number; col: number }
    | null
  >(null);

  const worldPins = useMemo<WorldPin[]>(() => {
    const list: WorldPin[] = [];
    for (const part of parts) {
      const manifest = PART_MANIFEST_MAP.get(part.type);
      if (!manifest) continue;
      for (const pin of manifest.pins) {
        const world = getPinWorldPosition(part, manifest, pin);
        list.push({
          part,
          pin,
          world,
          key: `${part.id}:${pin.id}`,
          displayLabel: `${boardShortPrefix(part.type, part.id)} · ${pin.label}`,
        });
      }
    }
    return list;
  }, [parts]);

  const pinLookup = useMemo(() => {
    const m = new Map<string, WorldPin>();
    for (const wp of worldPins) m.set(wp.key, wp);
    return m;
  }, [worldPins]);

  const netlist = useMemo(
    () =>
      buildNetlist(parts, wires, PART_MANIFEST_MAP, {
        pressedButtons,
        pressedKeypadKeys,
      }),
    [parts, wires, pressedButtons, pressedKeypadKeys]
  );

  const highlightedNet = useMemo(() => {
    if (selectedWireId) {
      const w = wires.find((item) => item.id === selectedWireId);
      if (w) return netlist.pinToNet.get(pinKey(w.from)) ?? null;
    }
    if (wireDraft) {
      return netlist.pinToNet.get(pinKey(wireDraft.from)) ?? null;
    }
    if (hoveredPinKey) {
      return netlist.pinToNet.get(hoveredPinKey) ?? null;
    }
    return null;
  }, [selectedWireId, wireDraft, hoveredPinKey, wires, netlist]);

  const clientToStage = useCallback((clientX: number, clientY: number): Point => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: clientX, y: clientY };
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const clientToWorld = useCallback(
    (clientX: number, clientY: number): Point => {
      const st = clientToStage(clientX, clientY);
      return {
        x: (st.x - view.x) / view.scale,
        y: (st.y - view.y) / view.scale,
      };
    },
    [clientToStage, view]
  );

  const findNearestPin = useCallback(
    (clientX: number, clientY: number, isTouch: boolean): WorldPin | null => {
      const st = clientToStage(clientX, clientY);
      const maxPx = isTouch ? PIN_CAPTURE_SCREEN_PX : 18;
      let best: WorldPin | null = null;
      let bestDist = maxPx;
      for (const wp of worldPins) {
        const sx = wp.world.x * view.scale + view.x;
        const sy = wp.world.y * view.scale + view.y;
        const d = Math.hypot(sx - st.x, sy - st.y);
        const bias = wp.part.type === 'breadboard-half' ? 3 : 0;
        if (d + bias < bestDist) {
          bestDist = d + bias;
          best = wp;
        }
      }
      return best;
    },
    [clientToStage, view, worldPins]
  );

  const findPartAtWorld = useCallback(
    (world: Point): PartInstance | null => {
      const ordered = [...parts].sort((a, b) =>
        a.type === 'breadboard-half' ? -1 : b.type === 'breadboard-half' ? 1 : 0
      );
      for (let i = ordered.length - 1; i >= 0; i--) {
        const p = ordered[i];
        const m = PART_MANIFEST_MAP.get(p.type);
        if (!m) continue;
        const cx = p.x + m.width / 2;
        const cy = p.y + m.height / 2;
        const halfW = (p.rotation === 90 || p.rotation === 270 ? m.height : m.width) / 2;
        const halfH = (p.rotation === 90 || p.rotation === 270 ? m.width : m.height) / 2;
        if (
          world.x >= cx - halfW &&
          world.x <= cx + halfW &&
          world.y >= cy - halfH &&
          world.y <= cy + halfH
        ) {
          return p;
        }
      }
      return null;
    },
    [parts]
  );

  const fitView = useCallback(() => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || parts.length === 0) {
      setView({ x: 20, y: 20, scale: 1 });
      return;
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of parts) {
      const m = PART_MANIFEST_MAP.get(p.type);
      if (!m) continue;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + m.width);
      maxY = Math.max(maxY, p.y + m.height);
    }
    const pad = 48;
    const contentW = Math.max(200, maxX - minX + pad * 2);
    const contentH = Math.max(200, maxY - minY + pad * 2);
    const scale = Math.min(1.35, Math.max(0.42, Math.min(rect.width / contentW, rect.height / contentH)));
    const x = Math.round((rect.width - (maxX - minX) * scale) / 2 - minX * scale);
    const y = Math.round((rect.height - (maxY - minY) * scale) / 2 - minY * scale);
    setView({ x, y, scale });
  }, [parts]);

  // Auto-fit view & cancel dangling wire drafts whenever template or board switches (Bug #5 & #6 fix)
  useEffect(() => {
    setWireDraft(null);
    const raf = requestAnimationFrame(() => fitView());
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitTrigger]);

  // Escape cancels an active wire draft (Bug #6 fix)
  useEffect(() => {
    if (!wireDraft) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setWireDraft(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [wireDraft]);

  const zoomBy = useCallback((factor: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    const cx = rect ? rect.width / 2 : 300;
    const cy = rect ? rect.height / 2 : 200;
    setView((prev) => {
      const nextScale = Math.min(2.6, Math.max(0.4, prev.scale * factor));
      const ratio = nextScale / prev.scale;
      return {
        scale: nextScale,
        x: cx - (cx - prev.x) * ratio,
        y: cy - (cy - prev.y) * ratio,
      };
    });
  }, []);

  const handlePinTap = useCallback(
    (wp: WorldPin) => {
      const ref: PinRef = { partId: wp.part.id, pinId: wp.pin.id };
      if (!wireDraft) {
        setWireDraft({
          from: ref,
          fromLabel: wp.displayLabel,
          waypoints: [],
          cursorWorld: wp.world,
        });
        onSelectPart(null);
        onSelectWire(null);
        return;
      }

      if (wireDraft.from.partId === ref.partId && wireDraft.from.pinId === ref.pinId) {
        setWireDraft(null);
        return;
      }

      onAddWire(wireDraft.from, ref, wireDraft.waypoints);
      setWireDraft(null);
    },
    [wireDraft, onAddWire, onSelectPart, onSelectWire]
  );

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

    if (pointersRef.current.size === 2) {
      dragStateRef.current = null;
      const pts = Array.from(pointersRef.current.values());
      const dist = Math.hypot(pts[1].clientX - pts[0].clientX, pts[1].clientY - pts[0].clientY);
      const mid = clientToStage((pts[0].clientX + pts[1].clientX) / 2, (pts[0].clientY + pts[1].clientY) / 2);
      pinchStartRef.current = {
        dist: Math.max(10, dist),
        midX: mid.x,
        midY: mid.y,
        viewX: view.x,
        viewY: view.y,
        scale: view.scale,
      };
      return;
    }

    const isTouch = e.pointerType === 'touch';
    const world = clientToWorld(e.clientX, e.clientY);
    const st = clientToStage(e.clientX, e.clientY);

    if (mode === 'wire' || mode === 'auto' || wireDraft) {
      const nearPin = findNearestPin(e.clientX, e.clientY, isTouch);
      if (nearPin && mode !== 'delete') {
        const volt = snapshot?.pinVoltages?.[nearPin.key];
        const vText = running && volt !== undefined ? ` (${volt.toFixed(2)}V)` : '';
        setLoupe({ x: st.x, y: Math.max(36, st.y - (isTouch ? 48 : 22)), text: `${nearPin.displayLabel}${vText}` });
        handlePinTap(nearPin);
        return;
      }
    }

    if (wireDraft) {
      setWireDraft((prev) =>
        prev ? { ...prev, waypoints: [...prev.waypoints, { x: snap(world.x), y: snap(world.y) }] } : null
      );
      return;
    }

    const hitPart = findPartAtWorld(world);
    if (hitPart) {
      if (mode === 'delete') {
        onDeletePart(hitPart.id);
        return;
      }
      if (running && hitPart.type === 'pushbutton' && mode !== 'move') {
        onPressButton(hitPart.id, true);
        onSelectPart(hitPart.id);
        dragStateRef.current = { kind: 'button', partId: hitPart.id };
        return;
      }
      if (running && hitPart.type === 'keypad-4x4' && mode !== 'move' && hitPart.rotation === 0) {
        const lx = world.x - hitPart.x;
        const ly = world.y - hitPart.y;
        const col = Math.floor((lx - 12) / 24);
        const row = Math.floor((ly - 12) / 24);
        if (row >= 0 && row < 4 && col >= 0 && col < 4) {
          onPressKeypadKey(hitPart.id, row, col, true);
          onSelectPart(hitPart.id);
          dragStateRef.current = { kind: 'keypad', partId: hitPart.id, row, col };
          return;
        }
      }

      const wasSelected = selectedPartId === hitPart.id;
      onSelectPart(hitPart.id);
      dragStateRef.current = {
        kind: 'part',
        partId: hitPart.id,
        startWorld: world,
        origPart: { x: hitPart.x, y: hitPart.y },
        moved: false,
        wasSelected,
      };
      return;
    }

    dragStateRef.current = {
      kind: 'pan',
      startClient: { x: e.clientX, y: e.clientY },
      startView: { x: view.x, y: view.y },
      moved: false,
    };
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const isTouch = e.pointerType === 'touch';
    const st = clientToStage(e.clientX, e.clientY);
    const world = clientToWorld(e.clientX, e.clientY);

    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
    }

    if (pointersRef.current.size === 2 && pinchStartRef.current) {
      const pts = Array.from(pointersRef.current.values());
      const dist = Math.hypot(pts[1].clientX - pts[0].clientX, pts[1].clientY - pts[0].clientY);
      const mid = clientToStage((pts[0].clientX + pts[1].clientX) / 2, (pts[0].clientY + pts[1].clientY) / 2);
      const p0 = pinchStartRef.current;
      const nextScale = Math.min(2.6, Math.max(0.4, p0.scale * (dist / p0.dist)));
      const worldMidX = (p0.midX - p0.viewX) / p0.scale;
      const worldMidY = (p0.midY - p0.viewY) / p0.scale;
      setView({
        scale: nextScale,
        x: mid.x - worldMidX * nextScale,
        y: mid.y - worldMidY * nextScale,
      });
      return;
    }

    if (wireDraft) {
      const nearPin = findNearestPin(e.clientX, e.clientY, isTouch);
      setWireDraft((prev) =>
        prev ? { ...prev, cursorWorld: nearPin ? nearPin.world : world } : null
      );
      if (nearPin) {
        setLoupe({
          x: st.x,
          y: Math.max(36, st.y - (isTouch ? 48 : 22)),
          text: nearPin.displayLabel,
        });
      } else {
        setLoupe(null);
      }
      return;
    }

    const drag = dragStateRef.current;
    if (drag?.kind === 'part') {
      const dx = world.x - drag.startWorld.x;
      const dy = world.y - drag.startWorld.y;
      if (Math.hypot(dx, dy) > 4) {
        drag.moved = true;
        onMovePart(drag.partId, snap(drag.origPart.x + dx), snap(drag.origPart.y + dy), false);
      }
      return;
    }

    if (drag?.kind === 'pan') {
      const dx = e.clientX - drag.startClient.x;
      const dy = e.clientY - drag.startClient.y;
      if (Math.hypot(dx, dy) > 4) drag.moved = true;
      setView((prev) => ({
        ...prev,
        x: drag.startView.x + dx,
        y: drag.startView.y + dy,
      }));
      return;
    }

    if (!isTouch) {
      const nearPin = findNearestPin(e.clientX, e.clientY, false);
      if (nearPin) {
        const volt = snapshot?.pinVoltages?.[nearPin.key];
        const vText = running && volt !== undefined ? ` (${volt.toFixed(2)}V)` : '';
        setLoupe({ x: st.x, y: Math.max(28, st.y - 16), text: `${nearPin.displayLabel}${vText}` });
        setHoveredPinKey(nearPin.key);
      } else {
        if (loupe) setLoupe(null);
        if (hoveredPinKey) setHoveredPinKey(null);
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) {
      pinchStartRef.current = null;
    }

    const drag = dragStateRef.current;
    dragStateRef.current = null;

    if (drag?.kind === 'button') {
      onPressButton(drag.partId, false);
      return;
    }
    if (drag?.kind === 'keypad') {
      onPressKeypadKey(drag.partId, drag.row, drag.col, false);
      return;
    }
    if (drag?.kind === 'part') {
      if (drag.moved) {
        const p = parts.find((item) => item.id === drag.partId);
        if (p) onMovePart(p.id, p.x, p.y, true);
      } else if (drag.wasSelected) {
        onOpenInspector();
      }
      return;
    }
    if (drag?.kind === 'pan' && !drag.moved) {
      onSelectPart(null);
      onSelectWire(null);
    }

    if (e.pointerType === 'touch') {
      setTimeout(() => setLoupe(null), 900);
    }
  };

  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const st = clientToStage(e.clientX, e.clientY);
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setView((prev) => {
      const nextScale = Math.min(2.6, Math.max(0.4, prev.scale * factor));
      const ratio = nextScale / prev.scale;
      return {
        scale: nextScale,
        x: st.x - (st.x - prev.x) * ratio,
        y: st.y - (st.y - prev.y) * ratio,
      };
    });
  };

  const draftPath = useMemo(() => {
    if (!wireDraft) return '';
    const startPin = pinLookup.get(pinKey(wireDraft.from));
    if (!startPin) return '';
    const pts = routeWire(startPin.world, wireDraft.cursorWorld, {
      startExit: rotateExitDir(startPin.pin.exitDir, startPin.part.rotation),
      waypoints: wireDraft.waypoints,
    });
    return wirePointsToSvgPath(pts);
  }, [wireDraft, pinLookup]);

  const sortedParts = useMemo(
    () =>
      [...parts].sort((a, b) =>
        a.type === 'breadboard-half' ? -1 : b.type === 'breadboard-half' ? 1 : 0
      ),
    [parts]
  );

  const activeModeHint =
    mode === 'wire'
      ? t.modeWireHint
      : mode === 'move'
        ? t.modeMoveHint
        : mode === 'delete'
          ? t.modeDeleteHint
          : t.modeAutoHint;

  const selectedPartObj = useMemo(
    () => parts.find((p) => p.id === selectedPartId) ?? null,
    [parts, selectedPartId]
  );

  return (
    <div className="canvas-stage">
      {/* Docked single-row Canvas Toolbar (scrolls horizontally on compact/touch screens; never covers canvas) */}
      <div className="canvas-toolbar">
        <div className="toolbar-group" role="group" aria-label="Canvas interaction modes">
          <button
            type="button"
            className={`btn btn-compact ${mode === 'auto' ? 'btn-active' : ''}`}
            onClick={() => onModeChange('auto')}
            aria-pressed={mode === 'auto'}
            title={t.modeAutoHint}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 2.5L12.5 8L8 9.3L6.2 13.5L3 2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            <span>{t.modeAuto}</span>
          </button>
          <button
            type="button"
            className={`btn btn-compact ${mode === 'wire' ? 'btn-active' : ''}`}
            onClick={() => onModeChange('wire')}
            aria-pressed={mode === 'wire'}
            title={t.modeWireHint}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="3.5" cy="4" r="2" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="12.5" cy="12" r="2" stroke="currentColor" strokeWidth="1.5" />
              <path d="M5.5 4H8V12H10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{t.modeWire}</span>
          </button>
          <button
            type="button"
            className={`btn btn-compact ${mode === 'move' ? 'btn-active' : ''}`}
            onClick={() => onModeChange('move')}
            aria-pressed={mode === 'move'}
            title={t.modeMoveHint}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 2V14M2 8H14M8 2L6 4M8 2L10 4M8 14L6 12M8 14L10 12M2 8L4 6M2 8L4 10M14 8L12 6M14 8L12 10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{t.modeMove}</span>
          </button>
          <button
            type="button"
            className={`btn btn-compact ${mode === 'delete' ? 'btn-danger' : ''}`}
            onClick={() => onModeChange('delete')}
            aria-pressed={mode === 'delete'}
            title={t.modeDeleteHint}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 4.5H13M6 4.5V3H10V4.5M5 4.5L5.6 13H10.4L11 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{t.modeDelete}</span>
          </button>
        </div>

        <div className="toolbar-group">
          <button type="button" className="btn btn-compact btn-primary" onClick={onOpenPartPicker}>
            + {t.addPart}
          </button>
          <button type="button" className="btn btn-compact" onClick={onUndo} disabled={!canUndo} aria-label={t.undo} title={t.undo}>
            ↶
          </button>
          <button type="button" className="btn btn-compact" onClick={onRedo} disabled={!canRedo} aria-label={t.redo} title={t.redo}>
            ↷
          </button>
          <button
            type="button"
            className="btn btn-compact"
            onClick={onTidyWires}
            disabled={wires.length === 0}
            title={t.tidyWiresHint}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2 4H6V12H14M2 12H4M9 4H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{t.tidyWires}</span>
          </button>
          <button type="button" className="btn btn-compact" onClick={() => zoomBy(1.18)} aria-label={t.zoomIn} title={t.zoomIn}>
            +
          </button>
          <button type="button" className="btn btn-compact" onClick={() => zoomBy(0.85)} aria-label={t.zoomOut} title={t.zoomOut}>
            -
          </button>
          <button type="button" className="btn btn-compact" onClick={fitView} title={t.zoomFit}>
            {t.zoomFit}
          </button>
        </div>
      </div>

      {/* Unobstructed SVG Viewport */}
      <div ref={stageRef} className="canvas-viewport">
        <svg
          className="canvas-svg"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        role="img"
        aria-label="Arduino circuit workbench canvas"
      >
        <defs>
          <pattern
            id="workbench-pitch"
            width={24 * view.scale}
            height={24 * view.scale}
            patternUnits="userSpaceOnUse"
            x={view.x % (24 * view.scale)}
            y={view.y % (24 * view.scale)}
          >
            <circle cx={1.5} cy={1.5} r={1.1} fill="var(--bg-canvas-dot)" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#workbench-pitch)" />

        <g transform={`translate(${view.x}, ${view.y}) scale(${view.scale})`}>
          {sortedParts.map((part) => {
            const manifest = PART_MANIFEST_MAP.get(part.type);
            if (!manifest) return null;
            const cx = manifest.width / 2;
            const cy = manifest.height / 2;
            return (
              <g
                key={part.id}
                transform={`translate(${part.x}, ${part.y}) rotate(${part.rotation} ${cx} ${cy})`}
                style={{ cursor: mode === 'wire' ? 'crosshair' : mode === 'delete' ? 'not-allowed' : 'grab' }}
              >
                <PartGraphics
                  part={part}
                  manifest={manifest}
                  snapshot={snapshot}
                  pressed={pressedButtons.has(part.id)}
                  pressedKeypadKeys={pressedKeypadKeys}
                  selected={selectedPartId === part.id}
                />
              </g>
            );
          })}

          {wires.map((wire, index) => {
            const fromPin = pinLookup.get(pinKey(wire.from));
            const toPin = pinLookup.get(pinKey(wire.to));
            if (!fromPin || !toPin) return null;
            const pts = routeWire(fromPin.world, toPin.world, {
              startExit: rotateExitDir(fromPin.pin.exitDir, fromPin.part.rotation),
              endExit: rotateExitDir(toPin.pin.exitDir, toPin.part.rotation),
              waypoints: wire.waypoints,
              laneIndex: index,
            });
            const d = wirePointsToSvgPath(pts);
            const isSelected = selectedWireId === wire.id;
            const inSameNet =
              highlightedNet !== null && netlist.pinToNet.get(pinKey(wire.from)) === highlightedNet;

            return (
              <g key={wire.id}>
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={22 / view.scale}
                  style={{ cursor: mode === 'delete' ? 'not-allowed' : 'pointer' }}
                  onPointerDown={(ev) => {
                    // Bug #1 fix: never let a wire hit-stroke steal taps intended for nearby pins or active wiring
                    if (wireDraft || mode === 'wire') return;
                    const nearPin = findNearestPin(ev.clientX, ev.clientY, ev.pointerType === 'touch');
                    if (nearPin && mode !== 'delete') return;
                    ev.stopPropagation();
                    if (mode === 'delete') {
                      onDeleteWire(wire.id);
                    } else {
                      onSelectWire(wire.id);
                    }
                  }}
                />
                {(isSelected || inSameNet) && (
                  <path
                    d={d}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth={7.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.45}
                    pointerEvents="none"
                  />
                )}
                <path
                  d={d}
                  fill="none"
                  stroke={wire.color}
                  strokeWidth={3.4}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  pointerEvents="none"
                />
                <circle cx={fromPin.world.x} cy={fromPin.world.y} r={3.6} fill={wire.color} stroke="#FFFFFF" strokeWidth={1} pointerEvents="none" />
                <circle cx={toPin.world.x} cy={toPin.world.y} r={3.6} fill={wire.color} stroke="#FFFFFF" strokeWidth={1} pointerEvents="none" />
              </g>
            );
          })}

          {highlightedNet &&
            (netlist.netToPins.get(highlightedNet) ?? []).map((key) => {
              const wp = pinLookup.get(key);
              if (!wp) return null;
              return (
                <circle
                  key={`net-${key}`}
                  cx={wp.world.x}
                  cy={wp.world.y}
                  r={5.5}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  pointerEvents="none"
                />
              );
            })}

          {wireDraft && draftPath && (
            <g pointerEvents="none">
              <path
                d={draftPath}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={3.2}
                strokeDasharray="6 4"
                strokeLinecap="round"
              />
              {wireDraft.waypoints.map((pt, idx) => (
                <circle key={idx} cx={pt.x} cy={pt.y} r={4} fill="var(--accent)" />
              ))}
            </g>
          )}

          {(mode === 'wire' || wireDraft) &&
            worldPins
              .filter((wp) => wp.part.type !== 'breadboard-half')
              .map((wp) => (
                <circle
                  key={`anchor-${wp.key}`}
                  cx={wp.world.x}
                  cy={wp.world.y}
                  r={4.2}
                  fill="var(--primary)"
                  opacity={0.5}
                  pointerEvents="none"
                />
              ))}
        </g>
      </svg>

      {/* Empty canvas state card (R-27) */}
      {parts.length === 0 && (
        <div className="canvas-empty-overlay">
          <div className="canvas-empty-card">
            <div className="canvas-empty-title">{t.canvasEmptyTitle}</div>
            <div className="canvas-empty-desc">{t.canvasEmptyDesc}</div>
            <div className="canvas-empty-actions">
              <button type="button" className="btn btn-primary" onClick={onOpenPartPicker}>
                + {t.addPart}
              </button>
              <button type="button" className="btn" onClick={onOpenFileMenu}>
                {t.openFileMenu}
              </button>
            </div>
          </div>
        </div>
      )}

      {loupe && (
        <div className="pin-loupe" style={{ left: loupe.x, top: loupe.y }}>
          {loupe.text}
        </div>
      )}

      {/* Compact floating quick-action bar for touch/tablet when a part or wire is selected */}
      {!wireDraft && (selectedPartObj || selectedWireId) && (
        <div className="selection-pill" role="toolbar" aria-label={t.inspector}>
          <button type="button" className="btn btn-compact btn-primary" onClick={onOpenInspector}>
            {t.inspector}
          </button>
          {selectedPartObj && !isMcuBoardType(selectedPartObj.type) && (
            <button
              type="button"
              className="btn btn-compact"
              onClick={() => onRotatePart(selectedPartObj.id)}
              aria-label={t.rotate}
              title={t.rotate}
            >
              ↻
            </button>
          )}
          <button
            type="button"
            className="btn btn-compact btn-danger"
            onClick={() => {
              if (selectedPartObj) onDeletePart(selectedPartObj.id);
              else if (selectedWireId) onDeleteWire(selectedWireId);
            }}
            aria-label={t.deleteSelected}
            title={t.deleteSelected}
          >
            ✕
          </button>
        </div>
      )}

      {wireDraft ? (
        <div className="wiring-banner" role="status" aria-live="polite">
          <span>{t.wiringPrompt(wireDraft.fromLabel)}</span>
          <button
            type="button"
            className="btn btn-compact"
            onClick={() => setWireDraft(null)}
          >
            {t.cancelWire}
          </button>
        </div>
      ) : (
        <div className="canvas-hint-bar">{activeModeHint}</div>
      )}
      </div>
    </div>
  );
};
