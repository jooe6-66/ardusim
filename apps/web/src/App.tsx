import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BoardId,
  CircuitDiagram,
  PartInstance,
  PinRef,
  Point,
  SimSnapshot,
  Wire,
  autoTidyCircuit,
  autoTidyWires,
  isMcuBoardType,
  parseIntelHex,
} from '@ardusim/sim-core';
import { PART_MANIFEST_MAP } from '@ardusim/parts';
import { CanvasToolMode, CircuitCanvas } from './canvas/CircuitCanvas';
import { CodeEditor } from './editor/CodeEditor';
import { STARTER_TEMPLATES } from './examples/templates';
import { Lang, MESSAGES } from './i18n/messages';
import { PartInspector } from './panels/PartInspector';
import { PartPickerSheet } from './panels/PartPickerSheet';
import { ProjectMenu } from './panels/ProjectMenu';
import { SerialMonitor } from './panels/SerialMonitor';
import {
  deleteProjectFromDb,
  getCachedHex,
  listSavedProjects,
  loadWorkspaceDraft,
  saveCachedHex,
  saveProjectToDb,
  saveWorkspaceDraft,
} from './store/storage';
import type { WorkerInMessage, WorkerOutMessage } from './workers/sim.worker';

const COMPILER_BASE = (import.meta.env.VITE_COMPILER_URL as string | undefined) || '';

interface CircuitHistoryState {
  board: BoardId;
  parts: PartInstance[];
  wires: Wire[];
  hasManualLayout: boolean;
}

function makeId(prefix: string): string {
  return `${prefix}${Math.random().toString(36).slice(2, 7)}`;
}

function downloadText(filename: string, content: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function isLocalCompilerUrl(url: string): boolean {
  if (!url) return true;
  try {
    const host = new URL(url).hostname;
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === '[::1]' ||
      host.startsWith('192.168.') ||
      host.startsWith('10.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    );
  } catch {
    return true;
  }
}

function tidyUnroutedWires(parts: PartInstance[], wires: Wire[]): Wire[] {
  if (wires.length === 0 || wires.every((w) => Array.isArray(w.waypoints) && w.waypoints.length > 0)) {
    return wires;
  }
  const tidiedAll = autoTidyWires(parts, wires, PART_MANIFEST_MAP);
  return wires.map((w) => {
    if (Array.isArray(w.waypoints) && w.waypoints.length > 0) return w;
    return tidiedAll.find((tw) => tw.id === w.id) ?? w;
  });
}

function sanitizeImportedDiagram(raw: unknown): { parts: PartInstance[]; wires: Wire[] } | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.parts) || !Array.isArray(obj.wires)) return null;

  const validRotations = new Set([0, 90, 180, 270]);
  const parts: PartInstance[] = [];
  for (const item of obj.parts) {
    if (!item || typeof item !== 'object') return null;
    const p = item as Record<string, unknown>;
    if (typeof p.id !== 'string' || !p.id || typeof p.type !== 'string' || !p.type) return null;
    if (typeof p.x !== 'number' || !Number.isFinite(p.x) || typeof p.y !== 'number' || !Number.isFinite(p.y)) {
      return null;
    }
    const rotation = (validRotations.has(Number(p.rotation)) ? Number(p.rotation) : 0) as PartInstance['rotation'];
    const props = p.props && typeof p.props === 'object' && !Array.isArray(p.props)
      ? (p.props as Record<string, unknown>)
      : {};
    parts.push({
      id: p.id,
      type: p.type,
      x: p.x,
      y: p.y,
      rotation,
      flipX: p.flipX === true ? true : undefined,
      flipY: p.flipY === true ? true : undefined,
      props,
    });
  }

  const wires: Wire[] = [];
  for (const item of obj.wires) {
    if (!item || typeof item !== 'object') return null;
    const w = item as Record<string, unknown>;
    const from = w.from as Record<string, unknown> | undefined;
    const to = w.to as Record<string, unknown> | undefined;
    if (
      typeof w.id !== 'string' ||
      !w.id ||
      !from ||
      typeof from.partId !== 'string' ||
      typeof from.pinId !== 'string' ||
      !to ||
      typeof to.partId !== 'string' ||
      typeof to.pinId !== 'string'
    ) {
      return null;
    }
    let waypoints: Point[] | undefined;
    if (Array.isArray(w.waypoints)) {
      const validPts: Point[] = [];
      for (const pt of w.waypoints) {
        if (!pt || typeof pt !== 'object') return null;
        const { x, y } = pt as Record<string, unknown>;
        if (typeof x !== 'number' || !Number.isFinite(x) || typeof y !== 'number' || !Number.isFinite(y)) {
          return null;
        }
        validPts.push({ x, y });
      }
      if (validPts.length > 0) waypoints = validPts;
    }
    wires.push({
      id: w.id,
      from: { partId: from.partId, pinId: from.pinId },
      to: { partId: to.partId, pinId: to.pinId },
      color: typeof w.color === 'string' && w.color ? w.color : '#0F6660',
      waypoints,
    });
  }

  return { parts, wires };
}

async function compileWithWakeRetry(
  board: BoardId,
  sketch: string,
  onWaking: (elapsedSec: number) => void
): Promise<Response> {
  const postCompile = () =>
    fetch(`${COMPILER_BASE}/api/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ board, sketch }),
    });

  const isJson = (res: Response) =>
    (res.headers.get('content-type') || '').toLowerCase().includes('application/json');

  try {
    const first = await postCompile();
    if (isJson(first)) return first;
  } catch {
    if (isLocalCompilerUrl(COMPILER_BASE) || navigator.onLine === false) throw new Error('offline');
  }

  // Only poll wake-up for remote cloud compilers (SnapDeploy / Render / HF) that sleep on idle
  if (isLocalCompilerUrl(COMPILER_BASE) || navigator.onLine === false) {
    throw new Error('offline');
  }

  const startedAt = Date.now();
  const maxWaitMs = 95_000;
  // Trigger wake-up with a simple no-cors GET in case the sleep proxy page omits CORS headers
  fetch(`${COMPILER_BASE}/api/health`, { mode: 'no-cors' }).catch(() => {});

  while (Date.now() - startedAt < maxWaitMs) {
    onWaking(Math.max(1, Math.round((Date.now() - startedAt) / 1000)));
    await new Promise((r) => setTimeout(r, 4000));
    try {
      const health = await fetch(`${COMPILER_BASE}/api/health`);
      if (health.ok && isJson(health)) {
        const res = await postCompile();
        if (isJson(res)) return res;
      }
    } catch {
      // Container still booting; retry until timeout
    }
  }
  throw new Error('offline');
}

function createDefaultBoardPart(board: BoardId): PartInstance {
  return {
    id: 'mcu1',
    type: board,
    x: 48,
    y: 156,
    rotation: 0,
    props: {},
  };
}

function createBlankDiagram(lang: Lang, board: BoardId = 'arduino-uno'): CircuitDiagram {
  return {
    version: 1,
    id: makeId('proj-'),
    name: lang === 'id' ? 'Proyek Baru' : 'Untitled Project',
    board,
    parts: [createDefaultBoardPart(board)],
    wires: [],
    sketch: '',
    updatedAt: Date.now(),
  };
}

function isDesktopViewport(): boolean {
  return typeof window !== 'undefined' && window.innerWidth >= 1100 && window.innerHeight > 540;
}

export const App: React.FC = () => {
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem('ardusim_lang');
    return saved === 'en' || saved === 'id' ? saved : 'id';
  });
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('ardusim_theme');
    return saved === 'dark' ? 'dark' : 'light';
  });

  const [initialDraft] = useState(() => loadWorkspaceDraft());
  const [diagram, setDiagram] = useState<CircuitDiagram>(
    () => initialDraft?.diagram ?? createBlankDiagram(lang)
  );
  const [undoStack, setUndoStack] = useState<CircuitHistoryState[]>([]);
  const [redoStack, setRedoStack] = useState<CircuitHistoryState[]>([]);
  const [hasManualLayout, setHasManualLayout] = useState(() => Boolean(initialDraft?.hasManualLayout));

  const [mode, setMode] = useState<CanvasToolMode>('auto');
  const [mobileTab, setMobileTab] = useState<'circuit' | 'code' | 'serial'>('circuit');
  const [tabletShowCode, setTabletShowCode] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 900 : true
  );
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [selectedWireId, setSelectedWireId] = useState<string | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [partPickerOpen, setPartPickerOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [savedProjects, setSavedProjects] = useState<CircuitDiagram[]>([]);

  const [running, setRunning] = useState(false);
  const [compiling, setCompiling] = useState(false);
  const [statusText, setStatusText] = useState<string>('');
  const [compileError, setCompileError] = useState<{
    message: string;
    logs: string;
  } | null>(null);
  const [snapshot, setSnapshot] = useState<SimSnapshot | null>(null);
  const [serialOutput, setSerialOutput] = useState('');
  const [pressedButtons, setPressedButtons] = useState<Set<string>>(new Set());
  const [pressedKeypadKeys, setPressedKeypadKeys] = useState<Set<string>>(new Set());
  const [buzzerAudioEnabled, setBuzzerAudioEnabled] = useState(false);
  const [fitTrigger, setFitTrigger] = useState(1);
  const [overrideHex, setOverrideHex] = useState<string | null>(
    () => initialDraft?.overrideHex ?? null
  );
  const [codePaneWidthPct, setCodePaneWidthPct] = useState<number>(() => {
    const saved = Number(localStorage.getItem('ardusim_split_pct'));
    return Number.isFinite(saved) && saved >= 24 && saved <= 58 ? saved : 38;
  });
  const [resizingSplit, setResizingSplit] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const audioRef = useRef<{ ctx: AudioContext; osc: OscillatorNode; gain: GainNode } | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const latestDraftRef = useRef({ diagram, overrideHex, hasManualLayout });
  latestDraftRef.current = { diagram, overrideHex, hasManualLayout };
  const t = MESSAGES[lang];

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMsg(null);
      toastTimerRef.current = null;
    }, 2300);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('ardusim_split_pct', String(codePaneWidthPct));
  }, [codePaneWidthPct]);

  const handleSplitterPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    setResizingSplit(true);

    const onMove = (ev: PointerEvent) => {
      const rect = workspaceRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0) return;
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setCodePaneWidthPct(Math.round(Math.min(58, Math.max(24, pct)) * 10) / 10);
    };
    const onUp = () => {
      setResizingSplit(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.lang = lang;
    localStorage.setItem('ardusim_theme', theme);
    localStorage.setItem('ardusim_lang', lang);
  }, [theme, lang]);

  // Sync tablet split-code panel when rotating iPad/tablet across portrait <-> landscape
  useEffect(() => {
    let lastWide = window.innerWidth >= 900;
    const onResize = () => {
      const w = window.innerWidth;
      const wide = w >= 900;
      if (w >= 720 && w < 1100 && wide !== lastWide) {
        setTabletShowCode(wide);
      }
      lastWide = wide;
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Auto-persist active workspace in localStorage so page refresh keeps current project
  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveWorkspaceDraft(diagram, overrideHex, hasManualLayout);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [diagram, overrideHex, hasManualLayout]);

  useEffect(() => {
    const flushDraft = () => {
      saveWorkspaceDraft(
        latestDraftRef.current.diagram,
        latestDraftRef.current.overrideHex,
        latestDraftRef.current.hasManualLayout
      );
    };
    window.addEventListener('pagehide', flushDraft);
    window.addEventListener('beforeunload', flushDraft);
    return () => {
      window.removeEventListener('pagehide', flushDraft);
      window.removeEventListener('beforeunload', flushDraft);
    };
  }, []);

  useEffect(() => {
    listSavedProjects().then(setSavedProjects);
  }, []);

  // Optional Web Audio buzzer playback (muted until user toggles on)
  useEffect(() => {
    const activeHz =
      running && buzzerAudioEnabled && snapshot
        ? Math.max(0, ...Object.values(snapshot.buzzerHz ?? {}))
        : 0;

    if (activeHz >= 40 && activeHz <= 12000) {
      if (!audioRef.current) {
        const AudioCtx = window.AudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'square';
          gain.gain.value = 0.04;
          osc.connect(gain).connect(ctx.destination);
          osc.start();
          audioRef.current = { ctx, osc, gain };
        }
      }
      if (audioRef.current) {
        audioRef.current.osc.frequency.setValueAtTime(activeHz, audioRef.current.ctx.currentTime);
        audioRef.current.gain.gain.setValueAtTime(0.04, audioRef.current.ctx.currentTime);
      }
    } else if (audioRef.current) {
      audioRef.current.gain.gain.setValueAtTime(0, audioRef.current.ctx.currentTime);
    }
  }, [running, buzzerAudioEnabled, snapshot]);

  useEffect(() => {
    return () => {
      audioRef.current?.ctx.close().catch(() => {});
      audioRef.current = null;
    };
  }, []);

  // Create Web Worker once and clean up on unmount
  useEffect(() => {
    const worker = new Worker(new URL('./workers/sim.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
      const msg = e.data;
      if (msg.type === 'snapshot') {
        setSnapshot(msg.snapshot);
      } else if (msg.type === 'serial') {
        setSerialOutput((prev) => (prev + msg.text).slice(-16000));
      } else if (msg.type === 'error') {
        setRunning(false);
        setStatusText(msg.message);
      }
    };
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // Push live circuit/input updates to running worker
  useEffect(() => {
    if (!running || !workerRef.current) return;
    const msg: WorkerInMessage = {
      type: 'updateCircuit',
      parts: diagram.parts,
      wires: diagram.wires,
      pressedButtons: Array.from(pressedButtons),
      pressedKeypadKeys: Array.from(pressedKeypadKeys),
    };
    workerRef.current.postMessage(msg);
  }, [running, diagram.parts, diagram.wires, pressedButtons, pressedKeypadKeys]);

  const commitHistory = useCallback(
    (prevBoard: BoardId, prevParts: PartInstance[], prevWires: Wire[], prevManual = hasManualLayout) => {
      setUndoStack((stack) => [
        ...stack.slice(-39),
        { board: prevBoard, parts: prevParts, wires: prevWires, hasManualLayout: prevManual },
      ]);
      setRedoStack([]);
    },
    [hasManualLayout]
  );

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack((r) => [
      ...r,
      { board: diagram.board, parts: diagram.parts, wires: diagram.wires, hasManualLayout },
    ]);
    setUndoStack((u) => u.slice(0, -1));
    setHasManualLayout(prev.hasManualLayout);
    setDiagram((d) => ({ ...d, board: prev.board, parts: prev.parts, wires: prev.wires }));
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((u) => [
      ...u,
      { board: diagram.board, parts: diagram.parts, wires: diagram.wires, hasManualLayout },
    ]);
    setRedoStack((r) => r.slice(0, -1));
    setHasManualLayout(next.hasManualLayout);
    setDiagram((d) => ({ ...d, board: next.board, parts: next.parts, wires: next.wires }));
  };

  const handleStop = useCallback(() => {
    workerRef.current?.postMessage({ type: 'stop' } satisfies WorkerInMessage);
    setRunning(false);
    setSnapshot(null);
    setStatusText('');
  }, []);

  const handleBoardSwitch = (nextBoard: BoardId) => {
    if (nextBoard === diagram.board && diagram.parts.some((p) => isMcuBoardType(p.type))) return;
    handleStop();
    commitHistory(diagram.board, diagram.parts, diagram.wires);
    const nextManifest = PART_MANIFEST_MAP.get(nextBoard);
    const validPins = new Set(nextManifest?.pins.map((p) => p.id) ?? []);

    const oldMcu = diagram.parts.find((p) => isMcuBoardType(p.type));
    const mcuId = oldMcu?.id ?? 'mcu1';
    const nextParts = oldMcu
      ? diagram.parts.map((p) => (p.id === oldMcu.id ? { ...p, type: nextBoard } : p))
      : [createDefaultBoardPart(nextBoard), ...diagram.parts];

    // Keep wires whose endpoints remain valid on the new board, then re-tidy around new geometry
    const filteredWires = oldMcu
      ? diagram.wires.filter((w) => {
          if (w.from.partId === mcuId && !validPins.has(w.from.pinId)) return false;
          if (w.to.partId === mcuId && !validPins.has(w.to.pinId)) return false;
          return true;
        })
      : diagram.wires;
    const nextWires = autoTidyWires(nextParts, filteredWires, PART_MANIFEST_MAP);

    setOverrideHex(null);
    setDiagram((d) => ({ ...d, board: nextBoard, parts: nextParts, wires: nextWires }));
    setFitTrigger((n) => n + 1);
    const nextLabel =
      nextBoard === 'arduino-mega'
        ? t.boardMega
        : nextBoard === 'arduino-nano'
          ? t.boardNano
          : t.boardUno;
    showToast(t.boardSwitchedToast(nextLabel));
  };

  const handleTidyWires = () => {
    if (hasManualLayout) {
      if (diagram.wires.length === 0) return;
      commitHistory(diagram.board, diagram.parts, diagram.wires);
      const tidiedWires = autoTidyWires(diagram.parts, diagram.wires, PART_MANIFEST_MAP);
      setDiagram((d) => ({ ...d, wires: tidiedWires }));
      showToast(t.wiresTidiedToast);
      return;
    }
    if (diagram.parts.length <= 1 && diagram.wires.length === 0) return;
    commitHistory(diagram.board, diagram.parts, diagram.wires);
    const tidied = autoTidyCircuit(diagram.parts, diagram.wires, PART_MANIFEST_MAP);
    setDiagram((d) => ({ ...d, parts: tidied.parts, wires: tidied.wires }));
    setFitTrigger((n) => n + 1);
    showToast(t.wiresTidiedToast);
  };

  const startWithHex = useCallback(
    (hex: string, statusLabel: string) => {
      setCompileError(null);
      setSerialOutput('');
      setRunning(true);
      setStatusText(statusLabel);
      workerRef.current?.postMessage({
        type: 'start',
        board: diagram.board,
        hex,
        parts: diagram.parts,
        wires: diagram.wires,
        pressedButtons: Array.from(pressedButtons),
        pressedKeypadKeys: Array.from(pressedKeypadKeys),
      } satisfies WorkerInMessage);
    },
    [diagram.board, diagram.parts, diagram.wires, pressedButtons, pressedKeypadKeys]
  );

  const handleRun = async () => {
    if (running) {
      handleStop();
      return;
    }

    setCompiling(true);
    setCompileError(null);
    setStatusText('');

    try {
      if (overrideHex) {
        startWithHex(overrideHex, t.statusOfflineCached);
        return;
      }

      const matchedTpl = STARTER_TEMPLATES.find(
        (tpl) =>
          tpl.precompiledHex &&
          tpl.diagram.board === diagram.board &&
          tpl.diagram.sketch.trim() === diagram.sketch.trim()
      );
      if (matchedTpl?.precompiledHex) {
        startWithHex(matchedTpl.precompiledHex, t.statusOfflineCached);
        return;
      }

      const cachedHex = await getCachedHex(diagram.board, diagram.sketch);
      if (cachedHex) {
        startWithHex(cachedHex, t.statusOfflineCached);
        return;
      }

      const res = await compileWithWakeRetry(diagram.board, diagram.sketch, (sec) =>
        setStatusText(t.statusWaking(sec))
      );

      const data = await res.json();
      if (!res.ok) {
        setCompileError({
          message: data.error || t.statusCompileError,
          logs: data.logs || '',
        });
        setStatusText(t.statusCompileError);
        setMobileTab('code');
        return;
      }

      await saveCachedHex(diagram.board, diagram.sketch, data.hex);
      startWithHex(data.hex, t.statusCompiled(data.durationMs ?? 0, Boolean(data.cached)));
    } catch {
      setCompileError({
        message: t.offlineNoCacheError,
        logs: '',
      });
      setStatusText(t.statusCompileError);
    } finally {
      setCompiling(false);
    }
  };

  const handleSelectPart = (id: string | null) => {
    setSelectedPartId(id);
    setSelectedWireId(null);
    if (!id) setInspectorOpen(false);
    else if (isDesktopViewport()) setInspectorOpen(true);
  };

  const handleSelectWire = (id: string | null) => {
    setSelectedWireId(id);
    setSelectedPartId(null);
    if (!id) setInspectorOpen(false);
    else if (isDesktopViewport()) setInspectorOpen(true);
  };

  const handleAddPart = (type: string) => {
    const manifest = PART_MANIFEST_MAP.get(type);
    if (!manifest) return;

    if (isMcuBoardType(type)) {
      const existingMcu = diagram.parts.find((p) => isMcuBoardType(p.type));
      if (existingMcu) {
        if (existingMcu.type !== type) {
          handleBoardSwitch(type);
        }
        setSelectedPartId(existingMcu.id);
        setSelectedWireId(null);
        if (isDesktopViewport()) setInspectorOpen(true);
        return;
      }
      handleStop();
      commitHistory(diagram.board, diagram.parts, diagram.wires);
      const nextBoard: PartInstance = {
        id: 'mcu1',
        type,
        x: 48,
        y: 156,
        rotation: 0,
        props: structuredClone(manifest.defaultProps),
      };
      setOverrideHex(null);
      setDiagram((d) => ({ ...d, board: type, parts: [nextBoard, ...d.parts] }));
      setSelectedPartId(nextBoard.id);
      setSelectedWireId(null);
      if (isDesktopViewport()) setInspectorOpen(true);
      setFitTrigger((n) => n + 1);
      return;
    }

    commitHistory(diagram.board, diagram.parts, diagram.wires);
    const offset = (diagram.parts.length % 5) * 24;
    const baseX =
      diagram.parts.length === 0 ? 168 : diagram.board === 'arduino-mega' ? 480 : 348;
    const nextPart: PartInstance = {
      id: makeId(type.replace(/[^a-z]/g, '').slice(0, 3) || 'p'),
      type,
      x: baseX + offset,
      y: 108 + offset,
      rotation: 0,
      props: structuredClone(manifest.defaultProps),
    };
    setDiagram((d) => ({ ...d, parts: [...d.parts, nextPart] }));
    setSelectedPartId(nextPart.id);
    setSelectedWireId(null);
    if (isDesktopViewport()) setInspectorOpen(true);
    showToast(t.partAddedToast(manifest.name[lang]));
  };

  const handleMovePart = (
    partId: string,
    x: number,
    y: number,
    commit: boolean,
    recordHistory = false
  ) => {
    if (recordHistory) {
      commitHistory(diagram.board, diagram.parts, diagram.wires);
    }
    if (commit) {
      setHasManualLayout(true);
    }
    setDiagram((d) => {
      const nextParts = d.parts.map((p) => (p.id === partId ? { ...p, x, y } : p));
      if (!commit) {
        // Clear stale manual/cached waypoints on wires attached to the moving part so they stretch smoothly
        const nextWires = d.wires.map((w) =>
          w.from.partId === partId || w.to.partId === partId ? { ...w, waypoints: undefined } : w
        );
        return { ...d, parts: nextParts, wires: nextWires };
      }
      // On drop, auto-route wires connected to the moved part cleanly around obstacles
      const tidiedAll = autoTidyWires(nextParts, d.wires, PART_MANIFEST_MAP);
      const nextWires = d.wires.map((w) => {
        if (w.from.partId === partId || w.to.partId === partId) {
          return tidiedAll.find((tw) => tw.id === w.id) ?? w;
        }
        return w;
      });
      return { ...d, parts: nextParts, wires: nextWires };
    });
  };

  const handleAddWire = (from: PinRef, to: PinRef, waypoints: Point[]) => {
    commitHistory(diagram.board, diagram.parts, diagram.wires);
    const defaultColor =
      from.pinId.includes('GND') || to.pinId.includes('GND')
        ? '#1F2937'
        : from.pinId === '5V' || to.pinId === '5V' || from.pinId === 'VCC' || to.pinId === 'VCC'
          ? '#DC2626'
          : '#0F6660';
    const wire: Wire = {
      id: makeId('w'),
      from,
      to,
      color: defaultColor,
      waypoints: waypoints.length > 0 ? waypoints : undefined,
    };
    const nextWires = [...diagram.wires, wire];
    // Auto-route cleanly around obstacles when user connects pin-to-pin without manual bends
    const finalWires =
      waypoints.length === 0
        ? (() => {
            const routed = autoTidyWires(diagram.parts, nextWires, PART_MANIFEST_MAP);
            const routedNew = routed.find((w) => w.id === wire.id);
            return [...diagram.wires, routedNew ?? wire];
          })()
        : nextWires;
    setDiagram((d) => ({ ...d, wires: finalWires }));
    setSelectedWireId(wire.id);
    setSelectedPartId(null);
  };

  const handleUpdatePartProps = (partId: string, patch: Record<string, unknown>) => {
    setDiagram((d) => ({
      ...d,
      parts: d.parts.map((p) =>
        p.id === partId ? { ...p, props: { ...p.props, ...patch } } : p
      ),
    }));
  };

  const handleRotatePart = (partId: string) => {
    const target = diagram.parts.find((p) => p.id === partId);
    if (!target || isMcuBoardType(target.type)) return;
    commitHistory(diagram.board, diagram.parts, diagram.wires);
    setDiagram((d) => {
      const nextParts = d.parts.map((p) =>
        p.id === partId
          ? { ...p, rotation: (((p.rotation + 90) % 360) as PartInstance['rotation']) }
          : p
      );
      const tidiedAll = autoTidyWires(nextParts, d.wires, PART_MANIFEST_MAP);
      const nextWires = d.wires.map((w) => {
        if (w.from.partId === partId || w.to.partId === partId) {
          return tidiedAll.find((tw) => tw.id === w.id) ?? w;
        }
        return w;
      });
      return { ...d, parts: nextParts, wires: nextWires };
    });
  };

  const handleFlipPart = (partId: string, axis: 'x' | 'y') => {
    commitHistory(diagram.board, diagram.parts, diagram.wires);
    setDiagram((d) => {
      const nextParts = d.parts.map((p) => {
        if (p.id !== partId) return p;
        return axis === 'x' ? { ...p, flipX: !p.flipX } : { ...p, flipY: !p.flipY };
      });
      const tidiedAll = autoTidyWires(nextParts, d.wires, PART_MANIFEST_MAP);
      const nextWires = d.wires.map((w) => {
        if (w.from.partId === partId || w.to.partId === partId) {
          return tidiedAll.find((tw) => tw.id === w.id) ?? w;
        }
        return w;
      });
      return { ...d, parts: nextParts, wires: nextWires };
    });
  };

  const handleDeletePart = (partId: string) => {
    const target = diagram.parts.find((p) => p.id === partId);
    if (target && isMcuBoardType(target.type)) return;
    commitHistory(diagram.board, diagram.parts, diagram.wires);
    setDiagram((d) => ({
      ...d,
      parts: d.parts.filter((p) => p.id !== partId),
      wires: d.wires.filter((w) => w.from.partId !== partId && w.to.partId !== partId),
    }));
    if (selectedPartId === partId) {
      setSelectedPartId(null);
      setInspectorOpen(false);
    }
  };

  const handleDeleteWire = (wireId: string) => {
    commitHistory(diagram.board, diagram.parts, diagram.wires);
    setDiagram((d) => ({ ...d, wires: d.wires.filter((w) => w.id !== wireId) }));
    if (selectedWireId === wireId) {
      setSelectedWireId(null);
      setInspectorOpen(false);
    }
  };

  const handleUpdateWireColor = (wireId: string, color: string) => {
    setDiagram((d) => ({
      ...d,
      wires: d.wires.map((w) => (w.id === wireId ? { ...w, color } : w)),
    }));
  };

  const handleUpdateWireWaypoints = (
    wireId: string,
    waypoints: Point[] | undefined,
    recordHistory: boolean
  ) => {
    if (recordHistory) {
      commitHistory(diagram.board, diagram.parts, diagram.wires);
    }
    setDiagram((d) => ({
      ...d,
      wires: d.wires.map((w) =>
        w.id === wireId ? { ...w, waypoints: waypoints && waypoints.length > 0 ? waypoints : undefined } : w
      ),
    }));
  };

  const handleResetWireShape = (wireId: string) => {
    commitHistory(diagram.board, diagram.parts, diagram.wires);
    setDiagram((d) => {
      const tidied = autoTidyWires(d.parts, d.wires, PART_MANIFEST_MAP);
      const resetWire = tidied.find((w) => w.id === wireId);
      return {
        ...d,
        wires: d.wires.map((w) => (w.id === wireId && resetWire ? resetWire : w)),
      };
    });
  };

  const handlePressButton = (partId: string, pressed: boolean) => {
    setPressedButtons((prev) => {
      const next = new Set(prev);
      if (pressed) next.add(partId);
      else next.delete(partId);
      return next;
    });
  };

  const handlePressKeypadKey = (partId: string, row: number, col: number, pressed: boolean) => {
    const token = `${partId}:${row}:${col}`;
    setPressedKeypadKeys((prev) => {
      const next = new Set(prev);
      if (pressed) next.add(token);
      else next.delete(token);
      return next;
    });
  };

  const selectedPart = diagram.parts.find((p) => p.id === selectedPartId) ?? null;
  const selectedWire = diagram.wires.find((w) => w.id === selectedWireId) ?? null;
  const boardDisplayName =
    diagram.board === 'arduino-mega'
      ? t.boardMega
      : diagram.board === 'arduino-nano'
        ? t.boardNano
        : t.boardUno;

  return (
    <div className="app-shell">
      {/* Top Workbench Header */}
      <header className="top-header">
        <div className="brand-group">
          <div className="brand-mark">
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
              <rect width="24" height="24" rx="5" fill="var(--primary)" />
              <circle cx="8" cy="9" r="2.3" fill="var(--accent)" stroke="var(--primary-fg)" strokeWidth="1.2" />
              <circle cx="16" cy="15" r="2.3" fill="var(--primary-fg)" />
              <path d="M10.3 9 H12 V15 H13.7" fill="none" stroke="var(--primary-fg)" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span className="brand-text">{t.appName}</span>
          </div>

          <select
            className="select-input board-select"
            aria-label={t.boardLabel}
            value={diagram.board}
            onChange={(e) => handleBoardSwitch(e.target.value as BoardId)}
          >
            <option value="arduino-uno">{t.boardUno}</option>
            <option value="arduino-nano">{t.boardNano}</option>
            <option value="arduino-mega">{t.boardMega}</option>
          </select>

          <span className="project-name-chip" title={diagram.name}>
            {diagram.name}
          </span>
        </div>

        <div className="header-actions">
          <button
            type="button"
            className="btn btn-compact"
            onClick={() => setProjectMenuOpen(true)}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2 4.5C2 3.7 2.7 3 3.5 3H6.2L7.6 4.6H12.5C13.3 4.6 14 5.3 14 6.1V11.5C14 12.3 13.3 13 12.5 13H3.5C2.7 13 2 12.3 2 11.5V4.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            <span>{t.fileMenu}</span>
          </button>

          <button
            type="button"
            className={`btn btn-compact tablet-only-btn ${tabletShowCode ? 'btn-active' : ''}`}
            onClick={() => setTabletShowCode((v) => !v)}
            aria-pressed={tabletShowCode}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M5.5 4.5L2 8L5.5 11.5M10.5 4.5L14 8L10.5 11.5M9 3L7 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{t.tabCode}</span>
          </button>

          <button
            type="button"
            className={`btn btn-compact inspector-toggle-btn ${inspectorOpen ? 'btn-active' : ''}`}
            onClick={() => setInspectorOpen((v) => !v)}
            aria-pressed={inspectorOpen}
          >
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M3 4.5H13M3 8H13M3 11.5H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="6" cy="4.5" r="1.5" fill="var(--bg-elevated)" stroke="currentColor" strokeWidth="1.4" />
              <circle cx="10.5" cy="8" r="1.5" fill="var(--bg-elevated)" stroke="currentColor" strokeWidth="1.4" />
              <circle cx="7" cy="11.5" r="1.5" fill="var(--bg-elevated)" stroke="currentColor" strokeWidth="1.4" />
            </svg>
            <span>{t.inspector}</span>
          </button>

          <button
            type="button"
            className={`btn btn-run ${running ? 'btn-accent' : 'btn-primary'}`}
            onClick={handleRun}
            disabled={compiling}
          >
            {running ? (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <rect x="3.5" y="3.5" width="9" height="9" rx="1.6" fill="currentColor" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M4.5 3L13 8L4.5 13V3Z" fill="currentColor" />
              </svg>
            )}
            <span>{compiling ? t.compiling : running ? t.stop : t.run}</span>
          </button>

          <button
            type="button"
            className="btn btn-compact header-secondary-btn"
            onClick={() => setLang((l) => (l === 'id' ? 'en' : 'id'))}
            aria-label="Toggle language ID/EN"
            title="ID / EN"
          >
            {lang.toUpperCase()}
          </button>

          <button
            type="button"
            className="btn btn-compact header-secondary-btn"
            onClick={() => setTheme((th) => (th === 'light' ? 'dark' : 'light'))}
            aria-label={theme === 'light' ? t.themeDark : t.themeLight}
            title={theme === 'light' ? t.themeDark : t.themeLight}
          >
            {theme === 'light' ? (
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M12.8 9.8A5.2 5.2 0 0 1 6.2 3.2A5.5 5.5 0 1 0 12.8 9.8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="2.8" stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 2V3.3M8 12.7V14M2 8H3.3M12.7 8H14M3.8 3.8L4.7 4.7M11.3 11.3L12.2 12.2M12.2 3.8L11.3 4.7M4.7 11.3L3.8 12.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            )}
            <span className="theme-btn-label">{theme === 'light' ? 'Dark' : 'Light'}</span>
          </button>
        </div>
      </header>

      {/* Compact Live Status Telemetry Ribbon */}
      <div className={`status-strip ${compiling ? 'is-compiling' : ''}`} role="status" aria-live="polite">
        <div className="status-left">
          <span
            className={`status-dot ${compileError ? 'error' : running ? 'running' : ''}`}
            aria-hidden="true"
          />
          <span className="status-board-tag">{boardDisplayName}</span>
          <span className="status-text">
            {compiling
              ? statusText || t.compiling
              : statusText || (running ? t.statusRunning : t.statusIdle)}
          </span>
        </div>
        <div className="status-right">
          <span className="status-metric">{t.partsCount(diagram.parts.length)}</span>
          <span className="status-metric">{t.wiresCount(diagram.wires.length)}</span>
          <span className="status-time">
            {snapshot ? `${(snapshot.timeMs / 1000).toFixed(2)}s` : '0.00s'}
          </span>
        </div>
      </div>

      {/* Main Responsive Workspace + Adaptive Bottom/Side-Rail Navigation */}
      <div className="shell-body">
        <main
          ref={workspaceRef}
          className={`workspace ${resizingSplit ? 'is-resizing' : ''}`}
          style={{ '--code-pane-width': `${codePaneWidthPct}%` } as React.CSSProperties}
        >
          <section
            className={`pane-code ${mobileTab === 'circuit' ? 'mobile-hidden' : ''} ${!tabletShowCode ? 'tablet-hidden' : ''}`}
            aria-label="Code and Serial workspace"
          >
            <div className={mobileTab === 'serial' ? 'mobile-hidden editor-container' : 'editor-container'}>
              <CodeEditor
                value={diagram.sketch}
                onChange={(next) => {
                  setOverrideHex(null);
                  setDiagram((d) => ({ ...d, sketch: next }));
                }}
                theme={theme}
                compileError={compileError}
                t={t}
              />
            </div>

            <div
              className={`serial-pane-wrap ${mobileTab === 'code' ? 'mobile-hidden' : ''} ${mobileTab === 'serial' ? 'mobile-full' : ''}`}
            >
              <SerialMonitor
                output={serialOutput}
                running={running}
                fullPane={mobileTab === 'serial'}
                onClear={() => setSerialOutput('')}
                onSend={(text) => {
                  workerRef.current?.postMessage({
                    type: 'serialInput',
                    text,
                  } satisfies WorkerInMessage);
                }}
                t={t}
              />
            </div>
          </section>

          <div
            className="pane-splitter"
            role="separator"
            aria-orientation="vertical"
            aria-label={t.resizeHandleLabel}
            aria-valuemin={24}
            aria-valuemax={58}
            aria-valuenow={Math.round(codePaneWidthPct)}
            tabIndex={0}
            title={t.resizeHandleLabel}
            onPointerDown={handleSplitterPointerDown}
            onDoubleClick={() => setCodePaneWidthPct(38)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') {
                e.preventDefault();
                setCodePaneWidthPct((v) => Math.max(24, v - 2));
              } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                setCodePaneWidthPct((v) => Math.min(58, v + 2));
              } else if (e.key === 'Home') {
                e.preventDefault();
                setCodePaneWidthPct(38);
              }
            }}
          >
            <span className="pane-splitter-grip" aria-hidden="true" />
          </div>

          <section
            className={`pane-canvas ${mobileTab !== 'circuit' ? 'mobile-hidden' : ''}`}
            aria-label={t.tabCircuit}
          >
            <CircuitCanvas
              parts={diagram.parts}
              wires={diagram.wires}
              snapshot={snapshot}
              running={running}
              mode={mode}
              onModeChange={setMode}
              selectedPartId={selectedPartId}
              selectedWireId={selectedWireId}
              onSelectPart={handleSelectPart}
              onSelectWire={handleSelectWire}
              onMovePart={handleMovePart}
              onRotatePart={handleRotatePart}
              onFlipPart={handleFlipPart}
              onAddWire={handleAddWire}
              onUpdateWireWaypoints={handleUpdateWireWaypoints}
              onDeleteWire={handleDeleteWire}
              onDeletePart={handleDeletePart}
              onPressButton={handlePressButton}
              onPressKeypadKey={handlePressKeypadKey}
              pressedButtons={pressedButtons}
              pressedKeypadKeys={pressedKeypadKeys}
              canUndo={undoStack.length > 0}
              canRedo={redoStack.length > 0}
              onUndo={handleUndo}
              onRedo={handleRedo}
              onTidyWires={handleTidyWires}
              hasManualLayout={hasManualLayout}
              fitTrigger={fitTrigger}
              inspectorOpen={inspectorOpen}
              onOpenPartPicker={() => setPartPickerOpen(true)}
              onOpenFileMenu={() => setProjectMenuOpen(true)}
              onOpenInspector={() => setInspectorOpen(true)}
              lang={lang}
              t={t}
            />
          </section>

          {inspectorOpen && (
            <div
              className="inspector-backdrop"
              onClick={() => setInspectorOpen(false)}
              aria-hidden="true"
            />
          )}

          <aside
            className={`pane-inspector ${!inspectorOpen ? 'drawer-closed' : ''}`}
            aria-label={t.inspector}
          >
            <PartInspector
              selectedPart={selectedPart}
              selectedWire={selectedWire}
              snapshot={snapshot}
              pressedButtons={pressedButtons}
              pressedKeypadKeys={pressedKeypadKeys}
              buzzerAudioEnabled={buzzerAudioEnabled}
              onToggleBuzzerAudio={() => setBuzzerAudioEnabled((v) => !v)}
              onUpdatePartProps={handleUpdatePartProps}
              onRotatePart={handleRotatePart}
              onFlipPart={handleFlipPart}
              onDeletePart={handleDeletePart}
              onUpdateWireColor={handleUpdateWireColor}
              onResetWireShape={handleResetWireShape}
              onDeleteWire={handleDeleteWire}
              onPressButton={handlePressButton}
              onPressKeypadKey={handlePressKeypadKey}
              onSendBluetooth={(partId, text) => {
                workerRef.current?.postMessage({
                  type: 'btInput',
                  partId,
                  text,
                } satisfies WorkerInMessage);
              }}
              onClearBluetooth={(partId) => {
                workerRef.current?.postMessage({
                  type: 'btClear',
                  partId,
                } satisfies WorkerInMessage);
              }}
              onCloseDrawer={() => setInspectorOpen(false)}
              lang={lang}
              t={t}
            />
          </aside>
        </main>

        <nav className="mobile-bottom-nav" aria-label="Mobile workspace tabs">
          <button
            type="button"
            className={`nav-tab-btn ${mobileTab === 'circuit' ? 'active' : ''}`}
            aria-current={mobileTab === 'circuit' ? 'page' : undefined}
            onClick={() => setMobileTab('circuit')}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" />
              <circle cx="5.5" cy="8" r="1.4" fill="currentColor" />
              <circle cx="10.5" cy="8" r="1.4" fill="currentColor" />
              <path d="M6.9 8H9.1" stroke="currentColor" strokeWidth="1.4" />
            </svg>
            <span>{t.tabCircuit}</span>
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${mobileTab === 'code' ? 'active' : ''}`}
            aria-current={mobileTab === 'code' ? 'page' : undefined}
            onClick={() => {
              setInspectorOpen(false);
              setMobileTab('code');
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M5.5 4.5L2 8L5.5 11.5M10.5 4.5L14 8L10.5 11.5M9 3L7 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{t.tabCode}</span>
          </button>
          <button
            type="button"
            className={`nav-tab-btn ${mobileTab === 'serial' ? 'active' : ''}`}
            aria-current={mobileTab === 'serial' ? 'page' : undefined}
            onClick={() => {
              setInspectorOpen(false);
              setMobileTab('serial');
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <rect x="2" y="3" width="12" height="10" rx="1.8" stroke="currentColor" strokeWidth="1.4" />
              <path d="M4.5 6.5L6.5 8L4.5 9.5M8 9.5H11.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{t.tabSerial}</span>
          </button>
        </nav>
      </div>

      <PartPickerSheet
        open={partPickerOpen}
        onClose={() => setPartPickerOpen(false)}
        onPickPart={handleAddPart}
        lang={lang}
        t={t}
      />

      <ProjectMenu
        open={projectMenuOpen}
        onClose={() => setProjectMenuOpen(false)}
        currentName={diagram.name}
        onRename={(name) => setDiagram((d) => ({ ...d, name }))}
        savedProjects={savedProjects}
        onNewBlank={() => {
          handleStop();
          setDiagram(createBlankDiagram(lang, diagram.board));
          setHasManualLayout(false);
          setOverrideHex(null);
          setUndoStack([]);
          setRedoStack([]);
          setSelectedPartId(null);
          setSelectedWireId(null);
          setInspectorOpen(false);
          setCompileError(null);
          setSerialOutput('');
          setFitTrigger((n) => n + 1);
        }}
        onSaveCurrent={async () => {
          const toSave: CircuitDiagram = {
            ...diagram,
            id: diagram.id.startsWith('tpl-') ? makeId('proj-') : diagram.id,
            updatedAt: Date.now(),
          };
          await saveProjectToDb(toSave);
          setDiagram(toSave);
          setSavedProjects(await listSavedProjects());
        }}
        onLoadDiagram={(loaded, precompiledHex) => {
          handleStop();
          const cloned = structuredClone(loaded);
          const cleanedWires = tidyUnroutedWires(cloned.parts, cloned.wires);
          setDiagram({ ...cloned, wires: cleanedWires });
          setHasManualLayout(false);
          setOverrideHex(precompiledHex ?? null);
          setUndoStack([]);
          setRedoStack([]);
          setSelectedPartId(null);
          setSelectedWireId(null);
          setCompileError(null);
          setFitTrigger((n) => n + 1);
        }}
        onDeleteSaved={async (id) => {
          await deleteProjectFromDb(id);
          setSavedProjects(await listSavedProjects());
        }}
        onExportJson={() => {
          const slug = diagram.name.replace(/\s+/g, '-').toLowerCase() || 'ardusim';
          downloadText(`${slug}.json`, JSON.stringify(diagram, null, 2), 'application/json');
        }}
        onImportJson={(text) => {
          try {
            const parsed = JSON.parse(text) as Partial<CircuitDiagram>;
            const sanitized = sanitizeImportedDiagram(parsed);
            if (!sanitized) return false;
            handleStop();
            const board: BoardId = isMcuBoardType(String(parsed.board ?? ''))
              ? (parsed.board as BoardId)
              : 'arduino-uno';
            const cleanedWires = tidyUnroutedWires(sanitized.parts, sanitized.wires);
            setDiagram({
              version: 1,
              id: typeof parsed.id === 'string' && parsed.id ? parsed.id : makeId('proj-'),
              name:
                typeof parsed.name === 'string' && parsed.name.trim()
                  ? parsed.name
                  : lang === 'id'
                    ? 'Proyek Impor'
                    : 'Imported Project',
              board,
              parts: sanitized.parts,
              wires: cleanedWires,
              sketch: typeof parsed.sketch === 'string' ? parsed.sketch : '',
              updatedAt: Date.now(),
            });
            setHasManualLayout(false);
            setOverrideHex(null);
            setUndoStack([]);
            setRedoStack([]);
            setSelectedPartId(null);
            setSelectedWireId(null);
            setCompileError(null);
            setFitTrigger((n) => n + 1);
            return true;
          } catch {
            return false;
          }
        }}
        onExportIno={() => {
          const slug = diagram.name.replace(/\s+/g, '-').toLowerCase() || 'sketch';
          downloadText(`${slug}.ino`, diagram.sketch, 'text/plain;charset=utf-8');
        }}
        onImportIno={(text) => {
          if (typeof text !== 'string' || text.trim().length === 0) return false;
          handleStop();
          setDiagram((d) => ({ ...d, sketch: text, updatedAt: Date.now() }));
          setOverrideHex(null);
          setCompileError(null);
          return true;
        }}
        onImportHex={(hex) => {
          try {
            parseIntelHex(hex, diagram.board === 'arduino-mega' ? 262144 : 32768);
            setOverrideHex(hex);
            return true;
          } catch {
            return false;
          }
        }}
        theme={theme}
        onToggleTheme={() => setTheme((th) => (th === 'light' ? 'dark' : 'light'))}
        onToggleLang={() => setLang((l) => (l === 'id' ? 'en' : 'id'))}
        lang={lang}
        t={t}
      />

      {toastMsg && (
        <div className="action-toast" role="status" aria-live="polite">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.6" />
            <path d="M5.4 8.2L7.2 10L10.8 6.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
};
