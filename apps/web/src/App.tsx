import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BoardId,
  CircuitDiagram,
  PartInstance,
  PinRef,
  Point,
  SimSnapshot,
  Wire,
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

function createBlankDiagram(lang: Lang, board: BoardId = 'arduino-uno'): CircuitDiagram {
  return {
    version: 1,
    id: makeId('proj-'),
    name: lang === 'id' ? 'Proyek Baru' : 'Untitled Project',
    board,
    parts: [],
    wires: [],
    sketch: '',
    updatedAt: Date.now(),
  };
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

  const [mode, setMode] = useState<CanvasToolMode>('auto');
  const [mobileTab, setMobileTab] = useState<'circuit' | 'code' | 'serial'>('circuit');
  const [tabletShowCode, setTabletShowCode] = useState(true);
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

  const workerRef = useRef<Worker | null>(null);
  const audioRef = useRef<{ ctx: AudioContext; osc: OscillatorNode; gain: GainNode } | null>(null);
  const latestDraftRef = useRef({ diagram, overrideHex });
  latestDraftRef.current = { diagram, overrideHex };
  const t = MESSAGES[lang];

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.lang = lang;
    localStorage.setItem('ardusim_theme', theme);
    localStorage.setItem('ardusim_lang', lang);
  }, [theme, lang]);

  // Auto-persist active workspace in localStorage so page refresh keeps current project
  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveWorkspaceDraft(diagram, overrideHex);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [diagram, overrideHex]);

  useEffect(() => {
    const flushDraft = () => {
      saveWorkspaceDraft(latestDraftRef.current.diagram, latestDraftRef.current.overrideHex);
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
    (prevBoard: BoardId, prevParts: PartInstance[], prevWires: Wire[]) => {
      setUndoStack((stack) => [
        ...stack.slice(-39),
        { board: prevBoard, parts: prevParts, wires: prevWires },
      ]);
      setRedoStack([]);
    },
    []
  );

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setRedoStack((r) => [...r, { board: diagram.board, parts: diagram.parts, wires: diagram.wires }]);
    setUndoStack((u) => u.slice(0, -1));
    setDiagram((d) => ({ ...d, board: prev.board, parts: prev.parts, wires: prev.wires }));
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((u) => [...u, { board: diagram.board, parts: diagram.parts, wires: diagram.wires }]);
    setRedoStack((r) => r.slice(0, -1));
    setDiagram((d) => ({ ...d, board: next.board, parts: next.parts, wires: next.wires }));
  };

  const handleStop = useCallback(() => {
    workerRef.current?.postMessage({ type: 'stop' } satisfies WorkerInMessage);
    setRunning(false);
    setSnapshot(null);
    setStatusText('');
  }, []);

  const handleBoardSwitch = (nextBoard: BoardId) => {
    if (nextBoard === diagram.board) return;
    handleStop();
    commitHistory(diagram.board, diagram.parts, diagram.wires);
    const nextManifest = PART_MANIFEST_MAP.get(nextBoard);
    const validPins = new Set(nextManifest?.pins.map((p) => p.id) ?? []);

    const oldMcu = diagram.parts.find((p) => isMcuBoardType(p.type));
    const mcuId = oldMcu?.id ?? 'mcu1';
    const nextParts = oldMcu
      ? diagram.parts.map((p) => (p.id === oldMcu.id ? { ...p, type: nextBoard } : p))
      : diagram.parts;

    // Keep wires whose endpoints remain valid on the new board
    const nextWires = oldMcu
      ? diagram.wires.filter((w) => {
          if (w.from.partId === mcuId && !validPins.has(w.from.pinId)) return false;
          if (w.to.partId === mcuId && !validPins.has(w.to.pinId)) return false;
          return true;
        })
      : diagram.wires;

    setOverrideHex(null);
    setDiagram((d) => ({ ...d, board: nextBoard, parts: nextParts, wires: nextWires }));
    if (oldMcu) setFitTrigger((n) => n + 1);
  };

  const handleTidyWires = () => {
    if (diagram.wires.length === 0) return;
    commitHistory(diagram.board, diagram.parts, diagram.wires);
    const tidied = autoTidyWires(diagram.parts, diagram.wires, PART_MANIFEST_MAP);
    setDiagram((d) => ({ ...d, wires: tidied }));
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

      const res = await fetch(`${COMPILER_BASE}/api/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ board: diagram.board, sketch: diagram.sketch }),
      });

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
    if (id) setInspectorOpen(true);
  };

  const handleSelectWire = (id: string | null) => {
    setSelectedWireId(id);
    setSelectedPartId(null);
    if (id) setInspectorOpen(true);
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
        setInspectorOpen(true);
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
      setInspectorOpen(true);
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
    setInspectorOpen(true);
  };

  const handleMovePart = (partId: string, x: number, y: number, commit: boolean) => {
    if (commit) {
      commitHistory(diagram.board, diagram.parts, diagram.wires);
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
    commitHistory(diagram.board, diagram.parts, diagram.wires);
    setDiagram((d) => ({
      ...d,
      parts: d.parts.map((p) =>
        p.id === partId
          ? { ...p, rotation: (((p.rotation + 90) % 360) as PartInstance['rotation']) }
          : p
      ),
    }));
  };

  const handleDeletePart = (partId: string) => {
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
            <span>{t.appName}</span>
          </div>

          <select
            className="select-input"
            aria-label={t.boardLabel}
            value={diagram.board}
            onChange={(e) => handleBoardSwitch(e.target.value as BoardId)}
            style={{ width: 'auto', minHeight: 36, padding: '2px 8px', fontSize: 13, fontWeight: 600 }}
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
            {t.fileMenu}
          </button>

          <button
            type="button"
            className={`btn btn-compact tablet-only-btn ${tabletShowCode ? 'btn-active' : ''}`}
            onClick={() => setTabletShowCode((v) => !v)}
            aria-pressed={tabletShowCode}
          >
            {t.tabCode}
          </button>

          <button
            type="button"
            className={`btn ${running ? 'btn-accent' : 'btn-primary'}`}
            onClick={handleRun}
            disabled={compiling}
          >
            {compiling ? t.compiling : running ? t.stop : t.run}
          </button>

          <button
            type="button"
            className="btn btn-compact"
            onClick={() => setLang((l) => (l === 'id' ? 'en' : 'id'))}
            aria-label="Toggle language ID/EN"
            title="ID / EN"
          >
            {lang.toUpperCase()}
          </button>

          <button
            type="button"
            className="btn btn-compact"
            onClick={() => setTheme((th) => (th === 'light' ? 'dark' : 'light'))}
            aria-label={theme === 'light' ? t.themeDark : t.themeLight}
            title={theme === 'light' ? t.themeDark : t.themeLight}
          >
            {theme === 'light' ? 'Dark' : 'Light'}
          </button>
        </div>
      </header>

      {/* Compact Live Status Ribbon */}
      <div className="status-strip" role="status" aria-live="polite">
        <div className="status-left">
          <span
            className={`status-dot ${compileError ? 'error' : running ? 'running' : ''}`}
            aria-hidden="true"
          />
          <span>
            {boardDisplayName} |{' '}
            {compiling
              ? t.compiling
              : statusText || (running ? t.statusRunning : t.statusIdle)}
          </span>
        </div>
        <span className="status-time">
          {snapshot ? `${(snapshot.timeMs / 1000).toFixed(2)}s` : '0.00s'}
        </span>
      </div>

      {/* Main Responsive Workspace */}
      <main className="workspace">
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
            className={mobileTab === 'code' ? 'mobile-hidden' : ''}
            style={{ display: 'flex', flexDirection: 'column', flex: mobileTab === 'serial' ? 1 : undefined }}
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
            onAddWire={handleAddWire}
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
            fitTrigger={fitTrigger}
            onOpenPartPicker={() => setPartPickerOpen(true)}
            onOpenFileMenu={() => setProjectMenuOpen(true)}
            onOpenInspector={() => setInspectorOpen(true)}
            t={t}
          />
        </section>

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
            onDeletePart={handleDeletePart}
            onUpdateWireColor={handleUpdateWireColor}
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
          {t.tabCircuit}
        </button>
        <button
          type="button"
          className={`nav-tab-btn ${mobileTab === 'code' ? 'active' : ''}`}
          aria-current={mobileTab === 'code' ? 'page' : undefined}
          onClick={() => setMobileTab('code')}
        >
          {t.tabCode}
        </button>
        <button
          type="button"
          className={`nav-tab-btn ${mobileTab === 'serial' ? 'active' : ''}`}
          aria-current={mobileTab === 'serial' ? 'page' : undefined}
          onClick={() => setMobileTab('serial')}
        >
          {t.tabSerial}
        </button>
      </nav>

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
          const cleanedWires = autoTidyWires(loaded.parts, loaded.wires, PART_MANIFEST_MAP);
          setDiagram({ ...structuredClone(loaded), wires: cleanedWires });
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
            const parsed = JSON.parse(text) as CircuitDiagram;
            if (!Array.isArray(parsed.parts) || !Array.isArray(parsed.wires)) return false;
            handleStop();
            const board: BoardId = isMcuBoardType(parsed.board) ? parsed.board : 'arduino-uno';
            const cleanedWires = autoTidyWires(parsed.parts, parsed.wires, PART_MANIFEST_MAP);
            setDiagram({
              ...parsed,
              version: 1,
              id: parsed.id || makeId('proj-'),
              name:
                typeof parsed.name === 'string' && parsed.name.trim()
                  ? parsed.name
                  : lang === 'id'
                    ? 'Proyek Impor'
                    : 'Imported Project',
              board,
              wires: cleanedWires,
              sketch: typeof parsed.sketch === 'string' ? parsed.sketch : '',
              updatedAt: Date.now(),
            });
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
        lang={lang}
        t={t}
      />
    </div>
  );
};
