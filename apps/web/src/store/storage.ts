import { isMcuBoardType, type BoardId, type CircuitDiagram } from '@ardusim/sim-core';

const DB_NAME = 'ardusim_local_db';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const STORE_HEX_CACHE = 'hex_cache';
const DRAFT_STORAGE_KEY = 'ardusim_workspace_draft_v1';

export interface WorkspaceDraft {
  diagram: CircuitDiagram;
  overrideHex: string | null;
}

export function loadWorkspaceDraft(): WorkspaceDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WorkspaceDraft>;
    const d = parsed?.diagram;
    if (!d || !Array.isArray(d.parts) || !Array.isArray(d.wires)) return null;
    const sketch = typeof d.sketch === 'string' ? d.sketch : '';
    const overrideHex = typeof parsed.overrideHex === 'string' ? parsed.overrideHex : null;
    if (d.parts.length === 0 && d.wires.length === 0 && sketch.trim().length === 0 && !overrideHex) {
      return null;
    }
    const board: BoardId = isMcuBoardType(d.board) ? d.board : 'arduino-uno';
    return {
      diagram: {
        version: 1,
        id: typeof d.id === 'string' && d.id ? d.id : 'proj-draft',
        name: typeof d.name === 'string' && d.name.trim() ? d.name : 'Proyek Baru',
        board,
        parts: d.parts,
        wires: d.wires,
        sketch,
        updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : Date.now(),
      },
      overrideHex,
    };
  } catch {
    return null;
  }
}

export function saveWorkspaceDraft(diagram: CircuitDiagram, overrideHex: string | null): void {
  try {
    const isEmpty =
      diagram.parts.length === 0 &&
      diagram.wires.length === 0 &&
      diagram.sketch.trim().length === 0 &&
      !overrideHex;
    if (isEmpty) {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      return;
    }
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ diagram, overrideHex }));
    } catch {
      // Retry without hex payload if quota is tight
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ diagram, overrideHex: null }));
    }
  } catch {
    // Ignore restricted storage environments (private browsing / full quota)
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_HEX_CACHE)) {
        db.createObjectStore(STORE_HEX_CACHE, { keyPath: 'hash' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function hashSketch(board: BoardId, sketch: string): Promise<string> {
  const payload = `${board}\0${sketch}`;
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(payload);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback deterministic FNV-1a hash for non-secure HTTP LAN contexts on older mobile browsers
  let h = 0x811c9dc5;
  for (let i = 0; i < payload.length; i++) {
    h ^= payload.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `fnv-${(h >>> 0).toString(16)}`;
}

export async function getCachedHex(board: BoardId, sketch: string): Promise<string | null> {
  try {
    const hash = await hashSketch(board, sketch);
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_HEX_CACHE, 'readonly');
      const req = tx.objectStore(STORE_HEX_CACHE).get(hash);
      req.onsuccess = () => resolve(req.result?.hex ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function saveCachedHex(board: BoardId, sketch: string, hex: string): Promise<void> {
  try {
    const hash = await hashSketch(board, sketch);
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_HEX_CACHE, 'readwrite');
      tx.objectStore(STORE_HEX_CACHE).put({ hash, hex, savedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore storage quota errors cleanly
  }
}

export async function listSavedProjects(): Promise<CircuitDiagram[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE_PROJECTS, 'readonly');
      const req = tx.objectStore(STORE_PROJECTS).getAll();
      req.onsuccess = () => {
        const items = (req.result as CircuitDiagram[]) || [];
        items.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
        resolve(items);
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function saveProjectToDb(diagram: CircuitDiagram): Promise<void> {
  const db = await openDb();
  const record: CircuitDiagram = { ...diagram, updatedAt: Date.now() };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_PROJECTS, 'readwrite');
    tx.objectStore(STORE_PROJECTS).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteProjectFromDb(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_PROJECTS, 'readwrite');
    tx.objectStore(STORE_PROJECTS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
