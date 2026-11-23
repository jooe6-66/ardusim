import {
  AvrSimulator,
  BoardId,
  MultiMcuBoardSpec,
  MultiMcuSimulator,
  PartInstance,
  SimSnapshot,
  UNO_CLOCK_HZ,
  Wire,
} from '@ardusim/sim-core';
import { PART_MANIFEST_MAP } from '@ardusim/parts';

export type WorkerInMessage =
  | {
      type: 'start';
      mcus: MultiMcuBoardSpec[];
      parts: PartInstance[];
      wires: Wire[];
      pressedButtons: string[];
      pressedKeypadKeys: string[];
    }
  | {
      type: 'updateCircuit';
      parts: PartInstance[];
      wires: Wire[];
      pressedButtons: string[];
      pressedKeypadKeys: string[];
    }
  | { type: 'serialInput'; mcuPartId: string; text: string }
  | { type: 'btInput'; partId: string; text: string }
  | { type: 'btClear'; partId: string }
  | { type: 'stop' };

export type WorkerOutMessage =
  | { type: 'snapshot'; snapshot: SimSnapshot }
  | { type: 'serial'; mcuPartId: string; text: string }
  | { type: 'error'; message: string };

let singleSim: AvrSimulator | null = null;
let multiSim: MultiMcuSimulator | null = null;
let timerId: ReturnType<typeof setInterval> | null = null;
let lastWallTime = 0;
const serialChunks = new Map<string, string>();

function stopLoop(): void {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
  if (singleSim) {
    singleSim.setRunning(false);
    singleSim = null;
  }
  if (multiSim) {
    multiSim.setRunning(false);
    multiSim = null;
  }
  serialChunks.clear();
}

self.onmessage = (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;

  if (msg.type === 'stop') {
    stopLoop();
    return;
  }

  if (msg.type === 'updateCircuit') {
    const active = multiSim ?? singleSim;
    if (active) {
      active.setCircuit(
        msg.parts,
        msg.wires,
        PART_MANIFEST_MAP,
        new Set(msg.pressedButtons),
        new Set(msg.pressedKeypadKeys)
      );
    }
    return;
  }

  if (msg.type === 'serialInput') {
    if (multiSim) multiSim.queueSerialInput(msg.mcuPartId, msg.text);
    else if (singleSim) singleSim.queueSerialInput(msg.text);
    return;
  }

  if (msg.type === 'btInput') {
    (multiSim ?? singleSim)?.sendBluetoothMessage(msg.partId, msg.text);
    return;
  }

  if (msg.type === 'btClear') {
    (multiSim ?? singleSim)?.clearBluetoothLog(msg.partId);
    return;
  }

  if (msg.type === 'start') {
    stopLoop();
    if (msg.mcus.length === 0) return;
    try {
      const appendByte = (mcuPartId: string, byte: number) => {
        serialChunks.set(mcuPartId, (serialChunks.get(mcuPartId) ?? '') + String.fromCharCode(byte));
      };

      if (msg.mcus.length === 1) {
        const m = msg.mcus[0];
        singleSim = new AvrSimulator(m.hex, {
          board: m.board as BoardId,
          mcuPartId: m.partId,
          onSerialByte: (byte) => appendByte(m.partId, byte),
        });
        singleSim.setCircuit(
          msg.parts,
          msg.wires,
          PART_MANIFEST_MAP,
          new Set(msg.pressedButtons),
          new Set(msg.pressedKeypadKeys)
        );
        singleSim.setRunning(true);
      } else {
        multiSim = new MultiMcuSimulator(msg.mcus, {
          onSerialByte: (mcuPartId, byte) => appendByte(mcuPartId, byte),
        });
        multiSim.setCircuit(
          msg.parts,
          msg.wires,
          PART_MANIFEST_MAP,
          new Set(msg.pressedButtons),
          new Set(msg.pressedKeypadKeys)
        );
        multiSim.setRunning(true);
      }

      lastWallTime = performance.now();

      timerId = setInterval(() => {
        const active = multiSim ?? singleSim;
        if (!active) return;
        const now = performance.now();
        const dtMs = Math.min(45, Math.max(8, now - lastWallTime));
        lastWallTime = now;

        const cycles = Math.round((dtMs / 1000) * UNO_CLOCK_HZ);
        const snapshot = active.stepCycles(cycles);

        for (const [mcuPartId, text] of serialChunks.entries()) {
          if (text.length > 0) {
            self.postMessage({ type: 'serial', mcuPartId, text } satisfies WorkerOutMessage);
          }
        }
        serialChunks.clear();
        self.postMessage({ type: 'snapshot', snapshot } satisfies WorkerOutMessage);
      }, 33);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start AVR simulation';
      self.postMessage({ type: 'error', message } satisfies WorkerOutMessage);
      stopLoop();
    }
  }
};
