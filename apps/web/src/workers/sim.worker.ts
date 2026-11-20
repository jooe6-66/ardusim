import {
  AvrSimulator,
  BoardId,
  PartInstance,
  SimSnapshot,
  UNO_CLOCK_HZ,
  Wire,
} from '@ardusim/sim-core';
import { PART_MANIFEST_MAP } from '@ardusim/parts';

export type WorkerInMessage =
  | {
      type: 'start';
      board: BoardId;
      hex: string;
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
  | { type: 'serialInput'; text: string }
  | { type: 'btInput'; partId: string; text: string }
  | { type: 'btClear'; partId: string }
  | { type: 'stop' };

export type WorkerOutMessage =
  | { type: 'snapshot'; snapshot: SimSnapshot }
  | { type: 'serial'; text: string }
  | { type: 'error'; message: string };

let simulator: AvrSimulator | null = null;
let timerId: ReturnType<typeof setInterval> | null = null;
let lastWallTime = 0;
let serialChunk = '';

function stopLoop(): void {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
  if (simulator) {
    simulator.setRunning(false);
    simulator = null;
  }
  serialChunk = '';
}

self.onmessage = (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;

  if (msg.type === 'stop') {
    stopLoop();
    return;
  }

  if (msg.type === 'updateCircuit') {
    if (simulator) {
      simulator.setCircuit(
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
    if (simulator) simulator.queueSerialInput(msg.text);
    return;
  }

  if (msg.type === 'btInput') {
    if (simulator) simulator.sendBluetoothMessage(msg.partId, msg.text);
    return;
  }

  if (msg.type === 'btClear') {
    if (simulator) simulator.clearBluetoothLog(msg.partId);
    return;
  }

  if (msg.type === 'start') {
    stopLoop();
    try {
      simulator = new AvrSimulator(msg.hex, {
        board: msg.board,
        onSerialByte: (byte) => {
          serialChunk += String.fromCharCode(byte);
        },
      });
      simulator.setCircuit(
        msg.parts,
        msg.wires,
        PART_MANIFEST_MAP,
        new Set(msg.pressedButtons),
        new Set(msg.pressedKeypadKeys)
      );
      simulator.setRunning(true);
      lastWallTime = performance.now();

      timerId = setInterval(() => {
        if (!simulator) return;
        const now = performance.now();
        const dtMs = Math.min(45, Math.max(8, now - lastWallTime));
        lastWallTime = now;

        const cycles = Math.round((dtMs / 1000) * UNO_CLOCK_HZ);
        const snapshot = simulator.stepCycles(cycles);

        if (serialChunk.length > 0) {
          const out: WorkerOutMessage = { type: 'serial', text: serialChunk };
          self.postMessage(out);
          serialChunk = '';
        }
        const snapMsg: WorkerOutMessage = { type: 'snapshot', snapshot };
        self.postMessage(snapMsg);
      }, 33);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start AVR simulation';
      const errMsg: WorkerOutMessage = { type: 'error', message };
      self.postMessage(errMsg);
      stopLoop();
    }
  }
};
