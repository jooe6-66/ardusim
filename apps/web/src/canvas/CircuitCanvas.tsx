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
  moveWireCorner,
  moveWireSegment,
  pinKey,
  rotateExitDir,
  routeWire,
  wirePointsToSvgPath,
} from '@ardusim/sim-core';
import { PART_MANIFEST_MAP } from '@ardusim/parts';
import { Lang, Messages } from '../i18n/messages';
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
  onMovePart: (partId: string, x: number, y: number, commit: boolean, recordHistory?: boolean) => void;
  onRotatePart: (partId: string) => void;
  onFlipPart: (partId: string, axis: 'x' | 'y') => void;
  onAddWire: (from: PinRef, to: PinRef, waypoints: Point[]) => void;
  onUpdateWireWaypoints: (wireId: string, waypoints: Point[] | undefined, recordHistory: boolean) => void;
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
  hasManualLayout: boolean;
  fitTrigger: number;
  inspectorOpen: boolean;
  onOpenPartPicker: () => void;
  onOpenFileMenu: () => void;
  onOpenInspector: () => void;
  lang: Lang;
  t: Messages;
}

interface WorldPin {
  part: PartInstance;
  pin: PinDef;
  world: Point;
  key: string;
  displayLabel: string;
}

interface RoutedWireRender {
  wire: Wire;
  fromPin: WorldPin;
  toPin: WorldPin;
  pts: Point[];
  d: string;
}

const SNAP_GRID = 12;
const PIN_CAPTURE_TOUCH_WIRE_PX = 30;
const PIN_CAPTURE_TOUCH_AUTO_PX = 26;
const PIN_CAPTURE_TOUCH_IN_PART_PX = 15;
const PIN_CAPTURE_MOUSE_PX = 17;

function snap(v: number): number {
  return Math.round(v / SNAP_GRID) * SNAP_GRID;
}

function boardShortPrefix(type: string, id: string): string {
  if (type === 'arduino-uno') return 'UNO';
  if (type === 'arduino-nano') return 'NANO';
  if (type === 'arduino-mega') return 'MEGA';
  return id.toUpperCase();
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function getKeypadCell(part: PartInstance, world: Point): { row: number; col: number } | null {
  const manifest = PART_MANIFEST_MAP.get(part.type);
  if (!manifest) return null;
  const cx = part.x + manifest.width / 2;
  const cy = part.y + manifest.height / 2;
  const dx = (world.x - cx) * (part.flipX ? -1 : 1);
  const dy = (world.y - cy) * (part.flipY ? -1 : 1);
  let rx = dx;
  let ry = dy;
  switch (part.rotation) {
    case 90:
      rx = dy;
      ry = -dx;
      break;
    case 180:
      rx = -dx;
      ry = -dy;
      break;
    case 270:
      rx = -dy;
      ry = dx;
      break;
    default:
      break;
  }
  const lx = rx + manifest.width / 2;
  const ly = ry + manifest.height / 2;
  const col = Math.floor((lx - 12) / 24);
  const row = Math.floor((ly - 12) / 24);
  if (row >= 0 && row < 4 && col >= 0 && col < 4) {
    return { row, col };
  }
  return null;
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
  onFlipPart,
  onAddWire,
  onUpdateWireWaypoints,
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
  hasManualLayout,
  fitTrigger,
  inspectorOpen,
  onOpenPartPicker,
  onOpenFileMenu,
  onOpenInspector,
  lang,
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
    | { kind: 'part'; partId: string; startWorld: Point; origPart: Point; moved: boolean; wasSelected: boolean; historySaved: boolean }
    | { kind: 'wire-corner'; wireId: string; cornerIdx: number; origPts: Point[]; startClient: Point; moved: boolean; historySaved: boolean }
    | { kind: 'wire-segment'; wireId: string; segIdx: number; origPts: Point[]; startClient: Point; moved: boolean; historySaved: boolean }
    | { kind: 'button'; partId: string }
    | { kind: 'keypad'; partId: string; row: number; col: number }
    | null
  >(null);
  const lastCornerTapRef = useRef<{ wireId: string; cornerIdx: number; time: number } | null>(null);
  const loupeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (loupeTimerRef.current !== null) window.clearTimeout(loupeTimerRef.current);
    };
  }, []);

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

  const routedWires = useMemo<RoutedWireRender[]>(() => {
    const list: RoutedWireRender[] = [];
    wires.forEach((wire, index) => {
      const fromPin = pinLookup.get(pinKey(wire.from));
      const toPin = pinLookup.get(pinKey(wire.to));
      if (!fromPin || !toPin) return;
      const pts = routeWire(fromPin.world, toPin.world, {
        startExit: rotateExitDir(fromPin.pin.exitDir, fromPin.part.rotation, fromPin.part.flipX, fromPin.part.flipY),
        endExit: rotateExitDir(toPin.pin.exitDir, toPin.part.rotation, toPin.part.flipX, toPin.part.flipY),
        waypoints: wire.waypoints,
        laneIndex: index,
      });
      list.push({ wire, fromPin, toPin, pts, d: wirePointsToSvgPath(pts) });
    });
    return list;
  }, [wires, pinLookup]);

  const selectedRoutedWire = useMemo(
    () => (selectedWireId ? routedWires.find((rw) => rw.wire.id === selectedWireId) ?? null : null),
    [routedWires, selectedWireId]
  );

  const findSelectedWireHandle = useCallback(
    (st: Point, isTouch: boolean): { kind: 'corner' | 'segment'; idx: number } | null => {
      if (!selectedRoutedWire) return null;
      const pts = selectedRoutedWire.pts;
      const cornerRadius = isTouch ? 22 : 12;
      let bestCorner: { idx: number; dist: number } | null = null;
      for (let i = 1; i < pts.length - 1; i++) {
        const sx = pts[i].x * view.scale + view.x;
        const sy = pts[i].y * view.scale + view.y;
        const d = Math.hypot(sx - st.x, sy - st.y);
        if (d <= cornerRadius && (!bestCorner || d < bestCorner.dist)) {
          bestCorner = { idx: i, dist: d };
        }
      }
      if (bestCorner) return { kind: 'corner', idx: bestCorner.idx };

      const segRadius = isTouch ? 20 : 11;
      let bestSeg: { idx: number; dist: number } | null = null;
      for (let i = 0; i < pts.length - 1; i++) {
        const x1 = pts[i].x * view.scale + view.x;
        const y1 = pts[i].y * view.scale + view.y;
        const x2 = pts[i + 1].x * view.scale + view.x;
        const y2 = pts[i + 1].y * view.scale + view.y;
        if (Math.hypot(x2 - x1, y2 - y1) < 24) continue;
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const d = Math.hypot(mx - st.x, my - st.y);
        if (d <= segRadius && (!bestSeg || d < bestSeg.dist)) {
          bestSeg = { idx: i, dist: d };
        }
      }
      if (bestSeg) return { kind: 'segment', idx: bestSeg.idx };
      return null;
    },
    [selectedRoutedWire, view]
  );

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

  const findNearestPinHit = useCallback(
    (clientX: number, clientY: number, maxPx: number): { wp: WorldPin; dist: number } | null => {
      const st = clientToStage(clientX, clientY);
      let best: { wp: WorldPin; dist: number } | null = null;
      let bestScore = maxPx;
      for (const wp of worldPins) {
        const sx = wp.world.x * view.scale + view.x;
        const sy = wp.world.y * view.scale + view.y;
        const d = Math.hypot(sx - st.x, sy - st.y);
        const bias = wp.part.type === 'breadboard-half' ? 3 : 0;
        if (d + bias < bestScore) {
          bestScore = d + bias;
          best = { wp, dist: d };
        }
      }
      return best;
    },
    [clientToStage, view, worldPins]
  );

  const findWireAtStage = useCallback(
    (st: Point, isTouch: boolean): { wire: Wire; dist: number } | null => {
      const maxPx = isTouch ? 16 : 9;
      let best: { wire: Wire; dist: number } | null = null;
      for (const rw of routedWires) {
        const pts = rw.pts;
        for (let i = 1; i < pts.length; i++) {
          const x1 = pts[i - 1].x * view.scale + view.x;
          const y1 = pts[i - 1].y * view.scale + view.y;
          const x2 = pts[i].x * view.scale + view.x;
          const y2 = pts[i].y * view.scale + view.y;
          const d = distToSegment(st.x, st.y, x1, y1, x2, y2);
          if (d <= maxPx && (!best || d < best.dist)) {
            best = { wire: rw.wire, dist: d };
          }
        }
      }
      return best;
    },
    [routedWires, view]
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
      const cx = p.x + m.width / 2;
      const cy = p.y + m.height / 2;
      const halfW = (p.rotation === 90 || p.rotation === 270 ? m.height : m.width) / 2;
      const halfH = (p.rotation === 90 || p.rotation === 270 ? m.width : m.height) / 2;
      minX = Math.min(minX, cx - halfW);
      minY = Math.min(minY, cy - halfH);
      maxX = Math.max(maxX, cx + halfW);
      maxY = Math.max(maxY, cy + halfH);
    }
    const pad = 48;
    const contentW = Math.max(200, maxX - minX + pad * 2);
    const contentH = Math.max(200, maxY - minY + pad * 2);
    const scale = Math.min(1.35, Math.max(0.42, Math.min(rect.width / contentW, rect.height / contentH)));
    const x = Math.round((rect.width - (maxX - minX) * scale) / 2 - minX * scale);
    const y = Math.round((rect.height - (maxY - minY) * scale) / 2 - minY * scale);
    setView({ x, y, scale });
  }, [parts]);

  useEffect(() => {
    setWireDraft(null);
    const raf = requestAnimationFrame(() => fitView());
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitTrigger]);

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

  const startPartInteraction = (part: PartInstance, world: Point) => {
    const wasSelected = selectedPartId === part.id;
    onSelectPart(part.id);
    dragStateRef.current = {
      kind: 'part',
      partId: part.id,
      startWorld: world,
      origPart: { x: part.x, y: part.y },
      moved: false,
      wasSelected,
      historySaved: false,
    };
  };

  const triggerPinTapWithLoupe = (wp: WorldPin, st: Point, isTouch: boolean) => {
    if (loupeTimerRef.current !== null) {
      window.clearTimeout(loupeTimerRef.current);
      loupeTimerRef.current = null;
    }
    const volt = snapshot?.pinVoltages?.[wp.key];
    const vText = running && volt !== undefined ? ` (${volt.toFixed(2)}V)` : '';
    setLoupe({ x: st.x, y: Math.max(36, st.y - (isTouch ? 48 : 22)), text: `${wp.displayLabel}${vText}` });
    handlePinTap(wp);
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });

    if (pointersRef.current.size === 2) {
      const prevDrag = dragStateRef.current;
      if (prevDrag?.kind === 'button') onPressButton(prevDrag.partId, false);
      else if (prevDrag?.kind === 'keypad') onPressKeypadKey(prevDrag.partId, prevDrag.row, prevDrag.col, false);
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

    // 1. Active wire draft always finishes on pin or adds a bend waypoint
    if (wireDraft) {
      const nearPin = findNearestPinHit(
        e.clientX,
        e.clientY,
        isTouch ? PIN_CAPTURE_TOUCH_WIRE_PX : PIN_CAPTURE_MOUSE_PX
      );
      if (nearPin) {
        triggerPinTapWithLoupe(nearPin.wp, st, isTouch);
        return;
      }
      setWireDraft((prev) =>
        prev ? { ...prev, waypoints: [...prev.waypoints, { x: snap(world.x), y: snap(world.y) }] } : null
      );
      return;
    }

    const hitPart = findPartAtWorld(world);
    const hitNonBbPart = hitPart && hitPart.type !== 'breadboard-half' ? hitPart : null;
    const hitWire = findWireAtStage(st, isTouch);

    // 1b. Drag handles on currently selected wire (reshape corners or slide/bend segments manually)
    if (
      selectedRoutedWire &&
      mode !== 'delete' &&
      mode !== 'wire' &&
      !(running && (hitNonBbPart?.type === 'pushbutton' || hitNonBbPart?.type === 'keypad-4x4'))
    ) {
      const handle = findSelectedWireHandle(st, isTouch);
      if (handle) {
        const origPts = selectedRoutedWire.pts.map((p) => ({ x: p.x, y: p.y }));
        if (handle.kind === 'corner') {
          dragStateRef.current = {
            kind: 'wire-corner',
            wireId: selectedRoutedWire.wire.id,
            cornerIdx: handle.idx,
            origPts,
            startClient: { x: e.clientX, y: e.clientY },
            moved: false,
            historySaved: false,
          };
        } else {
          dragStateRef.current = {
            kind: 'wire-segment',
            wireId: selectedRoutedWire.wire.id,
            segIdx: handle.idx,
            origPts,
            startClient: { x: e.clientX, y: e.clientY },
            moved: false,
            historySaved: false,
          };
        }
        return;
      }
    }

    // 2. Delete mode: unambiguous wire vs deletable component (MCU board is protected)
    if (mode === 'delete') {
      if (hitWire && (!hitNonBbPart || hitWire.dist <= (isTouch ? 9 : 6))) {
        onDeleteWire(hitWire.wire.id);
        return;
      }
      if (hitPart && !isMcuBoardType(hitPart.type)) {
        onDeletePart(hitPart.id);
        return;
      }
      if (hitWire) {
        onDeleteWire(hitWire.wire.id);
        return;
      }
      dragStateRef.current = {
        kind: 'pan',
        startClient: { x: e.clientX, y: e.clientY },
        startView: { x: view.x, y: view.y },
        moved: false,
      };
      return;
    }

    // 3. Dedicated Move mode: never steals taps for wires or pins
    if (mode === 'move') {
      if (hitPart) {
        startPartInteraction(hitPart, world);
        return;
      }
      dragStateRef.current = {
        kind: 'pan',
        startClient: { x: e.clientX, y: e.clientY },
        startView: { x: view.x, y: view.y },
        moved: false,
      };
      return;
    }

    // 4. Dedicated Wire mode: generous pin hit area, pan on open space
    if (mode === 'wire') {
      const nearPin = findNearestPinHit(
        e.clientX,
        e.clientY,
        isTouch ? PIN_CAPTURE_TOUCH_WIRE_PX : PIN_CAPTURE_MOUSE_PX
      );
      if (nearPin) {
        triggerPinTapWithLoupe(nearPin.wp, st, isTouch);
        return;
      }
      dragStateRef.current = {
        kind: 'pan',
        startClient: { x: e.clientX, y: e.clientY },
        startView: { x: view.x, y: view.y },
        moved: false,
      };
      return;
    }

    // 5. Smart mode while SIMULATION IS RUNNING:
    //    Interactive controls (pushbutton / keypad) and component bodies strictly beat wires & pins
    //    so touching a button or sensor never gets hijacked by nearby jumper wires.
    if (running) {
      if (hitNonBbPart?.type === 'pushbutton') {
        onPressButton(hitNonBbPart.id, true);
        onSelectPart(hitNonBbPart.id);
        dragStateRef.current = { kind: 'button', partId: hitNonBbPart.id };
        return;
      }
      if (hitNonBbPart?.type === 'keypad-4x4') {
        const cell = getKeypadCell(hitNonBbPart, world);
        if (cell) {
          onPressKeypadKey(hitNonBbPart.id, cell.row, cell.col, true);
          onSelectPart(hitNonBbPart.id);
          dragStateRef.current = { kind: 'keypad', partId: hitNonBbPart.id, row: cell.row, col: cell.col };
          return;
        }
      }
      if (hitNonBbPart) {
        startPartInteraction(hitNonBbPart, world);
        return;
      }
      if (hitWire) {
        onSelectWire(hitWire.wire.id);
        return;
      }
      if (hitPart) {
        startPartInteraction(hitPart, world);
        return;
      }
      dragStateRef.current = {
        kind: 'pan',
        startClient: { x: e.clientX, y: e.clientY },
        startView: { x: view.x, y: view.y },
        moved: false,
      };
      return;
    }

    // 6. Smart mode while EDITING (not running):
    //    Distinguish pin tips vs component centers vs open-space wires cleanly on touch & desktop.
    const nearPin = findNearestPinHit(
      e.clientX,
      e.clientY,
      isTouch ? PIN_CAPTURE_TOUCH_AUTO_PX : PIN_CAPTURE_MOUSE_PX
    );
    if (nearPin) {
      if (!hitNonBbPart) {
        triggerPinTapWithLoupe(nearPin.wp, st, isTouch);
        return;
      }
      const m = PART_MANIFEST_MAP.get(hitNonBbPart.type);
      const centerSx = (hitNonBbPart.x + (m?.width ?? 0) / 2) * view.scale + view.x;
      const centerSy = (hitNonBbPart.y + (m?.height ?? 0) / 2) * view.scale + view.y;
      const distToCenter = Math.hypot(centerSx - st.x, centerSy - st.y);
      const tightPinRadius = isTouch ? PIN_CAPTURE_TOUCH_IN_PART_PX : 13;
      // Only treat tap inside a part body as a pin tap if directly on the pin pad (and not center of small parts)
      const isMcuOrLargeHeader = isMcuBoardType(hitNonBbPart.type);
      if (nearPin.dist <= tightPinRadius && (isMcuOrLargeHeader || nearPin.dist < distToCenter)) {
        triggerPinTapWithLoupe(nearPin.wp, st, isTouch);
        return;
      }
    }

    if (hitNonBbPart) {
      startPartInteraction(hitNonBbPart, world);
      return;
    }

    if (hitWire) {
      onSelectWire(hitWire.wire.id);
      return;
    }

    if (hitPart) {
      startPartInteraction(hitPart, world);
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
      const nearPin = findNearestPinHit(
        e.clientX,
        e.clientY,
        isTouch ? PIN_CAPTURE_TOUCH_WIRE_PX : PIN_CAPTURE_MOUSE_PX
      );
      setWireDraft((prev) =>
        prev ? { ...prev, cursorWorld: nearPin ? nearPin.wp.world : world } : null
      );
      if (nearPin) {
        setLoupe({
          x: st.x,
          y: Math.max(36, st.y - (isTouch ? 48 : 22)),
          text: nearPin.wp.displayLabel,
        });
      } else {
        setLoupe(null);
      }
      return;
    }

    const drag = dragStateRef.current;
    if (drag?.kind === 'wire-corner') {
      const distPx = Math.hypot(e.clientX - drag.startClient.x, e.clientY - drag.startClient.y);
      if (drag.moved || distPx > 3) {
        const nextWp = moveWireCorner(drag.origPts, drag.cornerIdx, snap(world.x), snap(world.y));
        onUpdateWireWaypoints(drag.wireId, nextWp, !drag.historySaved);
        drag.moved = true;
        drag.historySaved = true;
      }
      return;
    }

    if (drag?.kind === 'wire-segment') {
      const distPx = Math.hypot(e.clientX - drag.startClient.x, e.clientY - drag.startClient.y);
      if (drag.moved || distPx > 3) {
        const nextWp = moveWireSegment(drag.origPts, drag.segIdx, snap(world.x), snap(world.y));
        onUpdateWireWaypoints(drag.wireId, nextWp, !drag.historySaved);
        drag.moved = true;
        drag.historySaved = true;
      }
      return;
    }

    if (drag?.kind === 'part') {
      const dx = world.x - drag.startWorld.x;
      const dy = world.y - drag.startWorld.y;
      if (drag.moved || Math.hypot(dx, dy) > 4) {
        onMovePart(
          drag.partId,
          snap(drag.origPart.x + dx),
          snap(drag.origPart.y + dy),
          false,
          !drag.historySaved
        );
        drag.moved = true;
        drag.historySaved = true;
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
      const nearPin = findNearestPinHit(e.clientX, e.clientY, PIN_CAPTURE_MOUSE_PX);
      if (nearPin) {
        const volt = snapshot?.pinVoltages?.[nearPin.wp.key];
        const vText = running && volt !== undefined ? ` (${volt.toFixed(2)}V)` : '';
        setLoupe({ x: st.x, y: Math.max(28, st.y - 16), text: `${nearPin.wp.displayLabel}${vText}` });
        setHoveredPinKey(nearPin.wp.key);
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

    if (drag?.kind === 'wire-corner') {
      if (!drag.moved) {
        const now = Date.now();
        const prev = lastCornerTapRef.current;
        if (prev && prev.wireId === drag.wireId && prev.cornerIdx === drag.cornerIdx && now - prev.time < 360) {
          const remaining = drag.origPts
            .slice(1, -1)
            .filter((_, idx) => idx !== drag.cornerIdx - 1);
          const startPin = drag.origPts[0];
          const endPin = drag.origPts[drag.origPts.length - 1];
          // Avoid falling back to undefined (which re-adds default stubs) when removing the last corner
          const nextWaypoints =
            remaining.length > 0
              ? remaining
              : Math.abs(startPin.x - endPin.x) < 0.5 || Math.abs(startPin.y - endPin.y) < 0.5
                ? [{ x: (startPin.x + endPin.x) / 2, y: (startPin.y + endPin.y) / 2 }]
                : [{ x: endPin.x, y: startPin.y }];
          onUpdateWireWaypoints(drag.wireId, nextWaypoints, true);
          lastCornerTapRef.current = null;
        } else {
          lastCornerTapRef.current = { wireId: drag.wireId, cornerIdx: drag.cornerIdx, time: now };
        }
      }
      return;
    }
    if (drag?.kind === 'wire-segment') {
      return;
    }
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
        if (p) onMovePart(p.id, p.x, p.y, true, false);
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
      if (loupeTimerRef.current !== null) window.clearTimeout(loupeTimerRef.current);
      loupeTimerRef.current = window.setTimeout(() => {
        setLoupe(null);
        loupeTimerRef.current = null;
      }, 900);
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
      startExit: rotateExitDir(startPin.pin.exitDir, startPin.part.rotation, startPin.part.flipX, startPin.part.flipY),
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
          : selectedWireId
            ? t.wireEditHint
            : running
              ? t.runningAutoHint
              : t.modeAutoHint;

  const selectedPartObj = useMemo(
    () => parts.find((p) => p.id === selectedPartId) ?? null,
    [parts, selectedPartId]
  );

  const selectedLabel = useMemo(() => {
    if (selectedPartObj) {
      return PART_MANIFEST_MAP.get(selectedPartObj.type)?.name[lang] ?? selectedPartObj.type;
    }
    if (selectedWireId) return t.modeWire;
    return '';
  }, [selectedPartObj, selectedWireId, lang, t.modeWire]);

  const canDeleteSelected =
    Boolean(selectedWireId) || (Boolean(selectedPartObj) && !isMcuBoardType(selectedPartObj!.type));

  return (
    <div className="canvas-stage">
      {/* Docked Canvas Toolbar (clean 2-row grid on phone portrait, crisp single row on wide screens) */}
      <div className="canvas-toolbar">
        <div className="toolbar-group toolbar-modes" role="group" aria-label="Canvas interaction modes">
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

        <div className="toolbar-group toolbar-actions">
          <button type="button" className="btn btn-compact btn-primary" onClick={onOpenPartPicker}>
            + {t.addPart}
          </button>
          <button
            type="button"
            className="btn btn-compact"
            onClick={onTidyWires}
            disabled={hasManualLayout ? wires.length === 0 : parts.length <= 1 && wires.length === 0}
            title={hasManualLayout ? t.tidyWiresOnlyHint : t.tidyWiresHint}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2 4H6V12H14M2 12H4M9 4H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{t.tidyWires}</span>
          </button>
          <button type="button" className="btn btn-compact" onClick={onUndo} disabled={!canUndo} aria-label={t.undo} title={t.undo}>
            ↶
          </button>
          <button type="button" className="btn btn-compact" onClick={onRedo} disabled={!canRedo} aria-label={t.redo} title={t.redo}>
            ↷
          </button>
          <button type="button" className="btn btn-compact zoom-step-btn" onClick={() => zoomBy(1.18)} aria-label={t.zoomIn} title={t.zoomIn}>
            +
          </button>
          <button type="button" className="btn btn-compact zoom-step-btn" onClick={() => zoomBy(0.85)} aria-label={t.zoomOut} title={t.zoomOut}>
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
              const sx = part.flipX ? -1 : 1;
              const sy = part.flipY ? -1 : 1;
              const partTransform =
                part.flipX || part.flipY
                  ? `translate(${part.x + cx}, ${part.y + cy}) scale(${sx}, ${sy}) rotate(${part.rotation}) translate(${-cx}, ${-cy})`
                  : `translate(${part.x}, ${part.y}) rotate(${part.rotation} ${cx} ${cy})`;
              const isSwapped = part.rotation === 90 || part.rotation === 270;
              const unflipClass = [
                (isSwapped ? part.flipY : part.flipX) ? 'part-unflip-x' : '',
                (isSwapped ? part.flipX : part.flipY) ? 'part-unflip-y' : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <g
                  key={part.id}
                  className={unflipClass || undefined}
                  transform={partTransform}
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

            {routedWires.map(({ wire, fromPin, toPin, d }) => {
              const isSelected = selectedWireId === wire.id;
              const inSameNet =
                highlightedNet !== null && netlist.pinToNet.get(pinKey(wire.from)) === highlightedNet;

              return (
                <g key={wire.id} pointerEvents="none">
                  {(isSelected || inSameNet) && (
                    <path
                      d={d}
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth={7.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={0.45}
                    />
                  )}
                  <path
                    d={d}
                    fill="none"
                    stroke={wire.color}
                    strokeWidth={3.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx={fromPin.world.x} cy={fromPin.world.y} r={3.6} fill={wire.color} stroke="#FFFFFF" strokeWidth={1} />
                  <circle cx={toPin.world.x} cy={toPin.world.y} r={3.6} fill={wire.color} stroke="#FFFFFF" strokeWidth={1} />
                </g>
              );
            })}

            {selectedRoutedWire && !wireDraft && mode !== 'delete' && mode !== 'wire' && (
              <g pointerEvents="none">
                {/* Segment midpoint handles: drag to slide segment or insert a new orthogonal bend */}
                {selectedRoutedWire.pts.slice(0, -1).map((a, idx) => {
                  const b = selectedRoutedWire.pts[idx + 1];
                  if (Math.hypot((b.x - a.x) * view.scale, (b.y - a.y) * view.scale) < 24) return null;
                  const mx = (a.x + b.x) / 2;
                  const my = (a.y + b.y) / 2;
                  const r = Math.max(3.8, Math.min(7, 4.8 / view.scale));
                  return (
                    <g key={`seg-h-${idx}`}>
                      <circle
                        cx={mx}
                        cy={my}
                        r={r}
                        fill="var(--bg-surface)"
                        stroke="var(--primary)"
                        strokeWidth={Math.max(1.5, 1.8 / view.scale)}
                      />
                      <circle
                        cx={mx}
                        cy={my}
                        r={r * 0.35}
                        fill="var(--primary)"
                      />
                    </g>
                  );
                })}
                {/* Corner handles: drag to reposition bend, double-tap to delete corner */}
                {selectedRoutedWire.pts.slice(1, -1).map((pt, idx) => {
                  const r = Math.max(4.6, Math.min(8.5, 5.8 / view.scale));
                  return (
                    <circle
                      key={`cor-h-${idx}`}
                      cx={pt.x}
                      cy={pt.y}
                      r={r}
                      fill="var(--bg-surface)"
                      stroke="var(--accent)"
                      strokeWidth={Math.max(2, 2.3 / view.scale)}
                    />
                  );
                })}
              </g>
            )}

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
                    opacity={0.55}
                    pointerEvents="none"
                  />
                ))}
          </g>
        </svg>

        {/* Empty canvas state card */}
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

        {/* Quick-action bar when a part or wire is selected and Inspector is closed */}
        {!wireDraft && !inspectorOpen && (selectedPartObj || selectedWireId) && (
          <div className="selection-pill" role="toolbar" aria-label={t.inspector}>
            {selectedLabel && <span className="selection-pill-label">{selectedLabel}</span>}
            <button type="button" className="btn btn-compact btn-primary" onClick={onOpenInspector}>
              {t.inspector}
            </button>
            {selectedPartObj && (
              <>
                <button
                  type="button"
                  className={`btn btn-compact ${selectedPartObj.flipX ? 'btn-active' : ''}`}
                  onClick={() => onFlipPart(selectedPartObj.id, 'x')}
                  aria-label={t.flipH}
                  title={t.flipH}
                >
                  ⇄
                </button>
                <button
                  type="button"
                  className={`btn btn-compact ${selectedPartObj.flipY ? 'btn-active' : ''}`}
                  onClick={() => onFlipPart(selectedPartObj.id, 'y')}
                  aria-label={t.flipV}
                  title={t.flipV}
                >
                  ⇅
                </button>
              </>
            )}
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
            {canDeleteSelected && (
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
            )}
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
