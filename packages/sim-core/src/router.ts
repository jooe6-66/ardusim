import { buildNetlist } from './netlist.js';
import {
  PartInstance,
  PartManifest,
  Point,
  Wire,
  getPinWorldPosition,
  isMcuBoardType,
  pinKey,
} from './types.js';

export type ExitDirection = 'up' | 'down' | 'left' | 'right';

export interface RouteOptions {
  startExit?: ExitDirection;
  endExit?: ExitDirection;
  waypoints?: Point[];
  laneIndex?: number;
}

const STUB_LEN = 24;
const GRID_STEP = 12;

function applyStub(pt: Point, dir?: ExitDirection, dist = STUB_LEN): Point {
  switch (dir) {
    case 'up':
      return { x: pt.x, y: pt.y - dist };
    case 'down':
      return { x: pt.x, y: pt.y + dist };
    case 'left':
      return { x: pt.x - dist, y: pt.y };
    case 'right':
      return { x: pt.x + dist, y: pt.y };
    default:
      return pt;
  }
}

function connectOrthogonal(
  a: Point,
  b: Point,
  preferHorizontalFirst: boolean,
  laneOffset: number
): Point[] {
  if (Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5) {
    return [b];
  }
  if (preferHorizontalFirst) {
    const midX = Math.round((a.x + b.x) / 2 + laneOffset);
    if (Math.abs(midX - a.x) > 4 && Math.abs(midX - b.x) > 4) {
      return [
        { x: midX, y: a.y },
        { x: midX, y: b.y },
        b,
      ];
    }
    return [{ x: b.x, y: a.y }, b];
  } else {
    const midY = Math.round((a.y + b.y) / 2 + laneOffset);
    if (Math.abs(midY - a.y) > 4 && Math.abs(midY - b.y) > 4) {
      return [
        { x: a.x, y: midY },
        { x: b.x, y: midY },
        b,
      ];
    }
    return [{ x: a.x, y: b.y }, b];
  }
}

/** Removes collinear redundant points while preserving strict orthogonality. */
export function simplifyOrthogonal(points: Point[]): Point[] {
  if (points.length <= 2) return points;
  const dedup: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = dedup[dedup.length - 1];
    const curr = points[i];
    if (Math.abs(curr.x - prev.x) > 0.25 || Math.abs(curr.y - prev.y) > 0.25) {
      dedup.push(curr);
    }
  }
  if (dedup.length <= 2) return dedup;

  const clean: Point[] = [dedup[0]];
  for (let i = 1; i < dedup.length - 1; i++) {
    const prev = clean[clean.length - 1];
    const curr = dedup[i];
    const next = dedup[i + 1];
    const sameX = Math.abs(prev.x - curr.x) < 0.5 && Math.abs(curr.x - next.x) < 0.5;
    const sameY = Math.abs(prev.y - curr.y) < 0.5 && Math.abs(curr.y - next.y) < 0.5;
    if (!sameX && !sameY) {
      clean.push(curr);
    }
  }
  clean.push(dedup[dedup.length - 1]);
  return clean;
}

/**
 * Generates an orthogonal (Manhattan) jumper wire polyline between two pins,
 * honoring optional intermediate touch-placed or auto-tidied waypoints.
 */
export function routeWire(start: Point, end: Point, opts: RouteOptions = {}): Point[] {
  const lane = opts.laneIndex ?? 0;
  const laneOffset = ((lane % 7) - 3) * 12;
  const hasWaypoints = (opts.waypoints?.length ?? 0) > 0;
  const points: Point[] = [start];

  const stubDist = STUB_LEN + (lane % 4) * 8;
  const startStub =
    !hasWaypoints && opts.startExit ? applyStub(start, opts.startExit, stubDist) : start;
  const endStub =
    !hasWaypoints && opts.endExit ? applyStub(end, opts.endExit, stubDist) : end;

  if (startStub !== start) {
    points.push(startStub);
  }

  const targets: Point[] = [...(opts.waypoints ?? []), endStub];
  let cursor = startStub;
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const preferHorizontal =
      i === 0 && opts.startExit
        ? opts.startExit === 'left' || opts.startExit === 'right'
        : Math.abs(target.x - cursor.x) >= Math.abs(target.y - cursor.y);
    const segment = connectOrthogonal(
      cursor,
      target,
      preferHorizontal,
      !hasWaypoints && i === 0 ? laneOffset : 0
    );
    points.push(...segment);
    cursor = target;
  }

  if (endStub !== end) {
    points.push(end);
  }

  return simplifyOrthogonal(points);
}

/** Converts orthogonal points into an SVG path string with crisp corner bevels. */
export function wirePointsToSvgPath(points: Point[], cornerRadius = 5): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  const cmds: string[] = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const len1 = Math.hypot(dx1, dy1);
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const len2 = Math.hypot(dx2, dy2);

    const r = Math.min(cornerRadius, len1 / 2, len2 / 2);
    if (r < 0.5) {
      cmds.push(`L ${curr.x} ${curr.y}`);
      continue;
    }

    const p1x = curr.x - (dx1 / len1) * r;
    const p1y = curr.y - (dy1 / len1) * r;
    const p2x = curr.x + (dx2 / len2) * r;
    const p2y = curr.y + (dy2 / len2) * r;

    cmds.push(`L ${p1x.toFixed(1)} ${p1y.toFixed(1)}`);
    cmds.push(`Q ${curr.x.toFixed(1)} ${curr.y.toFixed(1)} ${p2x.toFixed(1)} ${p2y.toFixed(1)}`);
  }
  const last = points[points.length - 1];
  cmds.push(`L ${last.x} ${last.y}`);
  return cmds.join(' ');
}

// --- Obstacle-Aware Orthogonal Auto-Tidy Router (A* on 12px workbench grid) ---

interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function rotateExitDir(
  dir: ExitDirection | undefined,
  rotation: PartInstance['rotation'],
  flipX?: boolean,
  flipY?: boolean
): ExitDirection | undefined {
  if (!dir) return undefined;
  const order: ExitDirection[] = ['up', 'right', 'down', 'left'];
  const idx = order.indexOf(dir);
  let out = order[(idx + rotation / 90) % 4];
  if (flipX) {
    if (out === 'left') out = 'right';
    else if (out === 'right') out = 'left';
  }
  if (flipY) {
    if (out === 'up') out = 'down';
    else if (out === 'down') out = 'up';
  }
  return out;
}

function getPartWorldRect(part: PartInstance, manifest: PartManifest): Rect {
  const cx = part.x + manifest.width / 2;
  const cy = part.y + manifest.height / 2;
  const rotated = part.rotation === 90 || part.rotation === 270;
  const w = rotated ? manifest.height : manifest.width;
  const h = rotated ? manifest.width : manifest.height;
  return {
    x1: cx - w / 2,
    y1: cy - h / 2,
    x2: cx + w / 2,
    y2: cy + h / 2,
  };
}

/** Computes a clean straight lead-out point well outside the owning component's bounding box. */
function computeExitStubPoint(
  world: Point,
  exitDir: ExitDirection | undefined,
  partRect: Rect,
  partType: string
): Point {
  if (!exitDir) return world;
  const clearance = isMcuBoardType(partType) ? 24 : 18;
  let distToEdge = 0;
  switch (exitDir) {
    case 'up':
      distToEdge = Math.max(0, world.y - partRect.y1);
      break;
    case 'down':
      distToEdge = Math.max(0, partRect.y2 - world.y);
      break;
    case 'left':
      distToEdge = Math.max(0, world.x - partRect.x1);
      break;
    case 'right':
      distToEdge = Math.max(0, partRect.x2 - world.x);
      break;
  }
  const dist = Math.max(20, distToEdge + clearance);
  return applyStub(world, exitDir, dist);
}

/**
 * Aligns the start/end legs of a grid-routed path directly onto the exact pin X or Y axis
 * so wires exit dead-straight from every pin without tiny off-grid kinks near component bodies.
 */
function stitchStraightPinExits(
  fromWorld: Point,
  fromExit: ExitDirection | undefined,
  fromStub: Point,
  toWorld: Point,
  toExit: ExitDirection | undefined,
  toStub: Point,
  gridWorldPts: Point[]
): Point[] {
  const pts = simplifyOrthogonal(gridWorldPts).map((p) => ({ x: p.x, y: p.y }));

  if (pts.length >= 2) {
    if (fromExit === 'up' || fromExit === 'down') {
      const firstVertical = Math.abs(pts[0].x - pts[1].x) < 0.5;
      if (firstVertical && pts.length >= 3) {
        pts[0].x = fromWorld.x;
        pts[1].x = fromWorld.x;
      } else if (!firstVertical) {
        pts[0].x = fromWorld.x;
      }
    } else if (fromExit === 'left' || fromExit === 'right') {
      const firstHoriz = Math.abs(pts[0].y - pts[1].y) < 0.5;
      if (firstHoriz && pts.length >= 3) {
        pts[0].y = fromWorld.y;
        pts[1].y = fromWorld.y;
      } else if (!firstHoriz) {
        pts[0].y = fromWorld.y;
      }
    }

    const lastIdx = pts.length - 1;
    if (toExit === 'up' || toExit === 'down') {
      const lastVertical = Math.abs(pts[lastIdx].x - pts[lastIdx - 1].x) < 0.5;
      if (lastVertical && pts.length >= 3) {
        pts[lastIdx].x = toWorld.x;
        pts[lastIdx - 1].x = toWorld.x;
      } else if (!lastVertical) {
        pts[lastIdx].x = toWorld.x;
      }
    } else if (toExit === 'left' || toExit === 'right') {
      const lastHoriz = Math.abs(pts[lastIdx].y - pts[lastIdx - 1].y) < 0.5;
      if (lastHoriz && pts.length >= 3) {
        pts[lastIdx].y = toWorld.y;
        pts[lastIdx - 1].y = toWorld.y;
      } else if (!lastHoriz) {
        pts[lastIdx].y = toWorld.y;
      }
    }
  } else if (pts.length === 1) {
    // Single-cell grid route: keep straight lead-outs through both stubs
    pts.length = 0;
    if (fromExit) pts.push(fromStub);
    if (toExit) pts.push(toStub);
  }

  const rawWorld: Point[] = [fromWorld, ...pts, toWorld];

  // Guarantee strict orthogonality while keeping lead-out legs dead straight along pin exit axes
  const ortho: Point[] = [rawWorld[0]];
  for (let i = 1; i < rawWorld.length; i++) {
    const prev = ortho[ortho.length - 1];
    const pt = rawWorld[i];
    if (Math.abs(pt.x - prev.x) > 0.5 && Math.abs(pt.y - prev.y) > 0.5) {
      if (i === 1 && (fromExit === 'up' || fromExit === 'down')) {
        ortho.push({ x: prev.x, y: pt.y });
      } else if (i === 1 && (fromExit === 'left' || fromExit === 'right')) {
        ortho.push({ x: pt.x, y: prev.y });
      } else if (i === rawWorld.length - 1 && (toExit === 'up' || toExit === 'down')) {
        ortho.push({ x: pt.x, y: prev.y });
      } else if (i === rawWorld.length - 1 && (toExit === 'left' || toExit === 'right')) {
        ortho.push({ x: prev.x, y: pt.y });
      } else {
        ortho.push({ x: pt.x, y: prev.y });
      }
    }
    ortho.push(pt);
  }

  return simplifyOrthogonal(ortho);
}

class MinHeap<T> {
  private data: Array<{ priority: number; item: T }> = [];

  get size(): number {
    return this.data.length;
  }

  push(item: T, priority: number): void {
    this.data.push({ priority, item });
    let i = this.data.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[parent].priority <= this.data[i].priority) break;
      const tmp = this.data[parent];
      this.data[parent] = this.data[i];
      this.data[i] = tmp;
      i = parent;
    }
  }

  pop(): T | undefined {
    if (this.data.length === 0) return undefined;
    const top = this.data[0].item;
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      let i = 0;
      const n = this.data.length;
      while (true) {
        let best = i;
        const left = 2 * i + 1;
        const right = 2 * i + 2;
        if (left < n && this.data[left].priority < this.data[best].priority) best = left;
        if (right < n && this.data[right].priority < this.data[best].priority) best = right;
        if (best === i) break;
        const tmp = this.data[i];
        this.data[i] = this.data[best];
        this.data[best] = tmp;
        i = best;
      }
    }
    return top;
  }
}

/**
 * Re-routes all jumper wires around component bodies with board clearance halos,
 * straight pin lead-outs, fast-path minimal-bend candidates (0/1/2 bends),
 * geometric wire-to-wire overlap prevention, and post-route bend reduction.
 * ponytail: dense 12px grid A* fallback bounded to circuit extents + 180px margin; handles up to ~100 wires in <60ms.
 */
export function autoTidyWires(
  parts: PartInstance[],
  wires: Wire[],
  manifests: Map<string, PartManifest>,
  preserveWireIds?: Set<string>
): Wire[] {
  if (wires.length === 0) return wires;

  interface PinMeta {
    partId: string;
    partType: string;
    partRect: Rect;
    world: Point;
    exitDir?: ExitDirection;
  }

  interface RoutedSegment {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    horiz: boolean;
    netId: string;
  }

  const netlist = buildNetlist(parts, wires, manifests);
  const pinPos = new Map<string, PinMeta>();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const partObstacles: Array<{ partId: string; rect: Rect; isMcu: boolean }> = [];
  const breadboards: Array<{ partId: string; rect: Rect }> = [];

  for (const part of parts) {
    const manifest = manifests.get(part.type);
    if (!manifest) continue;
    const rect = getPartWorldRect(part, manifest);
    minX = Math.min(minX, rect.x1);
    minY = Math.min(minY, rect.y1);
    maxX = Math.max(maxX, rect.x2);
    maxY = Math.max(maxY, rect.y2);

    if (part.type === 'breadboard-half') {
      breadboards.push({ partId: part.id, rect });
    } else {
      partObstacles.push({ partId: part.id, rect, isMcu: isMcuBoardType(part.type) });
    }

    for (const pin of manifest.pins) {
      pinPos.set(`${part.id}:${pin.id}`, {
        partId: part.id,
        partType: part.type,
        partRect: rect,
        world: getPinWorldPosition(part, manifest, pin),
        exitDir: rotateExitDir(pin.exitDir, part.rotation, part.flipX, part.flipY),
      });
    }
  }

  if (!Number.isFinite(minX)) return wires;

  const margin = 192;
  const gxMin = Math.floor((minX - margin) / GRID_STEP);
  const gyMin = Math.floor((minY - margin) / GRID_STEP);
  const gxMax = Math.ceil((maxX + margin) / GRID_STEP);
  const gyMax = Math.ceil((maxY + margin) / GRID_STEP);
  const cols = Math.max(12, gxMax - gxMin + 1);
  const rows = Math.max(12, gyMax - gyMin + 1);

  if (cols * rows > 65_000) {
    return wires.map((w) => ({ ...w, waypoints: undefined }));
  }

  const toGrid = (pt: Point): { gx: number; gy: number } => ({
    gx: Math.min(cols - 1, Math.max(0, Math.round(pt.x / GRID_STEP) - gxMin)),
    gy: Math.min(rows - 1, Math.max(0, Math.round(pt.y / GRID_STEP) - gyMin)),
  });

  // Static obstacle & clearance halo cost per grid cell
  const cellCost = new Float32Array(cols * rows);
  cellCost.fill(1);
  for (let gy = 0; gy < rows; gy++) {
    const wy = (gy + gyMin) * GRID_STEP;
    for (let gx = 0; gx < cols; gx++) {
      const wx = (gx + gxMin) * GRID_STEP;
      let cost = 1;
      for (const ob of partObstacles) {
        const { x1, y1, x2, y2 } = ob.rect;
        const dx = wx < x1 ? x1 - wx : wx > x2 ? wx - x2 : 0;
        const dy = wy < y1 ? y1 - wy : wy > y2 ? wy - y2 : 0;
        if (dx === 0 && dy === 0) {
          cost = Math.max(cost, 1200);
          break;
        }
        const dist = Math.max(dx, dy);
        if (dist <= GRID_STEP) {
          cost = Math.max(cost, ob.isMcu ? 44 : 32);
        } else if (dist <= GRID_STEP * 2) {
          cost = Math.max(cost, ob.isMcu ? 12 : 6);
        }
      }
      cellCost[gy * cols + gx] = cost;
    }
  }

  const pinPadCell = new Uint8Array(cols * rows);
  for (const meta of pinPos.values()) {
    if (meta.partType === 'breadboard-half') continue;
    const g = toGrid(meta.world);
    pinPadCell[g.gy * cols + g.gx] = 1;
  }

  // Exact geometric segment registry + grid lane occupancy (updated from FINAL world segments!)
  const usedSegs: RoutedSegment[] = [];
  const usedCellH = new Uint16Array(cols * rows);
  const usedCellV = new Uint16Array(cols * rows);
  const nearLaneH = new Uint16Array(cols * rows);
  const nearLaneV = new Uint16Array(cols * rows);

  const segHitsRect = (a: Point, b: Point, r: Rect, pad: number): boolean => {
    const rx1 = r.x1 - pad;
    const ry1 = r.y1 - pad;
    const rx2 = r.x2 + pad;
    const ry2 = r.y2 + pad;
    if (Math.abs(a.y - b.y) < 0.5) {
      const y = a.y;
      if (y <= ry1 || y >= ry2) return false;
      const sx1 = Math.min(a.x, b.x);
      const sx2 = Math.max(a.x, b.x);
      return sx2 > rx1 && sx1 < rx2;
    }
    if (Math.abs(a.x - b.x) < 0.5) {
      const x = a.x;
      if (x <= rx1 || x >= rx2) return false;
      const sy1 = Math.min(a.y, b.y);
      const sy2 = Math.max(a.y, b.y);
      return sy2 > ry1 && sy1 < ry2;
    }
    return true;
  };

  /** Checks if an orthogonal path stays clear of component interiors and non-owned breadboards. */
  const pathHitsObstacle = (
    pts: Point[],
    fromPartId: string,
    toPartId: string
  ): boolean => {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if (Math.abs(a.x - b.x) > 0.5 && Math.abs(a.y - b.y) > 0.5) return true;
      const isStartLeg = i === 1;
      const isEndLeg = i === pts.length - 1;
      for (const ob of partObstacles) {
        const isOwnStart = isStartLeg && ob.partId === fromPartId;
        const isOwnEnd = isEndLeg && ob.partId === toPartId;
        if (isOwnStart || isOwnEnd) continue;
        // Strict clearance around non-owned parts; zero interior intrusion on owned interior legs
        const pad = ob.partId === fromPartId || ob.partId === toPartId ? 0 : 8;
        if (segHitsRect(a, b, ob.rect, pad)) return true;
      }
      for (const bb of breadboards) {
        if (bb.partId === fromPartId || bb.partId === toPartId) continue;
        if (segHitsRect(a, b, bb.rect, 4)) return true;
      }
    }
    return false;
  };

  /** Evaluates exact collinear overlaps and perpendicular crossings against already-routed wires. */
  const evaluateWireConflicts = (
    pts: Point[],
    netId: string
  ): { overlaps: number; crossings: number; nearParallel: number } => {
    let overlaps = 0;
    let crossings = 0;
    let nearParallel = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const horiz = Math.abs(a.y - b.y) < 0.5;
      const minA = horiz ? Math.min(a.x, b.x) : Math.min(a.y, b.y);
      const maxA = horiz ? Math.max(a.x, b.x) : Math.max(a.y, b.y);
      const coordA = horiz ? a.y : a.x;
      if (maxA - minA < 1) continue;

      for (const seg of usedSegs) {
        const sameNet = seg.netId === netId;
        if (seg.horiz === horiz) {
          const coordB = horiz ? seg.y1 : seg.x1;
          const minB = horiz ? Math.min(seg.x1, seg.x2) : Math.min(seg.y1, seg.y2);
          const maxB = horiz ? Math.max(seg.x1, seg.x2) : Math.max(seg.y1, seg.y2);
          const span = Math.min(maxA, maxB) - Math.max(minA, minB);
          if (span <= 2) continue;
          const sep = Math.abs(coordA - coordB);
          if (sep < 7) {
            if (!sameNet) overlaps += 1;
          } else if (sep < 11.5) {
            nearParallel += 1;
          }
        } else {
          // Perpendicular crossing
          const hY = horiz ? a.y : seg.y1;
          const hX1 = horiz ? Math.min(a.x, b.x) : Math.min(seg.x1, seg.x2);
          const hX2 = horiz ? Math.max(a.x, b.x) : Math.max(seg.x1, seg.x2);
          const vX = horiz ? seg.x1 : a.x;
          const vY1 = horiz ? Math.min(seg.y1, seg.y2) : Math.min(a.y, b.y);
          const vY2 = horiz ? Math.max(seg.y1, seg.y2) : Math.max(a.y, b.y);
          if (vX > hX1 + 2 && vX < hX2 - 2 && hY > vY1 + 2 && hY < vY2 - 2) {
            crossings += 1;
          }
        }
      }
    }
    return { overlaps, crossings, nearParallel };
  };

  /** Registers every segment of the final world path into both exact geometry and grid occupancy. */
  const registerFinalPath = (pts: Point[], netId: string) => {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      if (Math.hypot(b.x - a.x, b.y - a.y) < 0.5) continue;
      const horiz = Math.abs(a.y - b.y) < 0.5;
      usedSegs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, horiz, netId });

      // Rasterize into 12px grid cells so subsequent A* searches avoid ALL segments including stubs
      const ga = toGrid(a);
      const gb = toGrid(b);
      if (horiz) {
        const y = ga.gy;
        const xStart = Math.min(ga.gx, gb.gx);
        const xEnd = Math.max(ga.gx, gb.gx);
        for (let gx = xStart; gx <= xEnd; gx++) {
          usedCellH[y * cols + gx]++;
          if (y > 0) nearLaneH[(y - 1) * cols + gx]++;
          if (y + 1 < rows) nearLaneH[(y + 1) * cols + gx]++;
        }
      } else {
        const x = ga.gx;
        const yStart = Math.min(ga.gy, gb.gy);
        const yEnd = Math.max(ga.gy, gb.gy);
        for (let gy = yStart; gy <= yEnd; gy++) {
          usedCellV[gy * cols + x]++;
          if (x > 0) nearLaneV[gy * cols + (x - 1)]++;
          if (x + 1 < cols) nearLaneV[gy * cols + (x + 1)]++;
        }
      }
    }
  };

  const pathLength = (pts: Point[]): number => {
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      total += Math.abs(pts[i].x - pts[i - 1].x) + Math.abs(pts[i].y - pts[i - 1].y);
    }
    return total;
  };

  /** Checks that first/last segments leave pins along their declared exitDir without backing into the part. */
  const respectsPinExits = (
    pts: Point[],
    fromExit: ExitDirection | undefined,
    toExit: ExitDirection | undefined
  ): boolean => {
    if (pts.length < 2) return false;
    if (fromExit) {
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      if (fromExit === 'up' && !(Math.abs(dx) < 0.5 && dy < -1)) return false;
      if (fromExit === 'down' && !(Math.abs(dx) < 0.5 && dy > 1)) return false;
      if (fromExit === 'left' && !(Math.abs(dy) < 0.5 && dx < -1)) return false;
      if (fromExit === 'right' && !(Math.abs(dy) < 0.5 && dx > 1)) return false;
    }
    if (toExit) {
      const last = pts.length - 1;
      // Vector going OUT of `to` toward `pts[last - 1]` must match `toExit`
      const dx = pts[last - 1].x - pts[last].x;
      const dy = pts[last - 1].y - pts[last].y;
      if (toExit === 'up' && !(Math.abs(dx) < 0.5 && dy < -1)) return false;
      if (toExit === 'down' && !(Math.abs(dx) < 0.5 && dy > 1)) return false;
      if (toExit === 'left' && !(Math.abs(dy) < 0.5 && dx < -1)) return false;
      if (toExit === 'right' && !(Math.abs(dy) < 0.5 && dx > 1)) return false;
    }
    return true;
  };

  /**
   * Tries clean 0-bend (dead-straight), 1-bend (L), and 2-bend (Z/U with staggered channels)
   * orthogonal routes before invoking full grid A*, keeping wires crisp with minimal turns.
   */
  const tryCleanFastRoute = (
    fromInfo: PinMeta,
    toInfo: PinMeta,
    startStub: Point,
    endStub: Point,
    netId: string
  ): Point[] | null => {
    const a = fromInfo.world;
    const b = toInfo.world;
    const candidates: Point[][] = [];

    // 0-bend: exact horizontal or vertical alignment
    if (Math.abs(a.x - b.x) < 0.5 || Math.abs(a.y - b.y) < 0.5) {
      candidates.push([a, b]);
    }

    // 1-bend L candidates (exact pin axes)
    candidates.push(simplifyOrthogonal([a, { x: b.x, y: a.y }, b]));
    candidates.push(simplifyOrthogonal([a, { x: a.x, y: b.y }, b]));

    // 2-bend & 3-bend clean stub-to-stub channel candidates at staggered 12px lane offsets
    const offsets = [0, 12, -12, 24, -24, 36, -36, 48, -48, 60, -60, 72, -72];
    const fromVert = fromInfo.exitDir === 'up' || fromInfo.exitDir === 'down';
    const toVert = toInfo.exitDir === 'up' || toInfo.exitDir === 'down';

    for (const off of offsets) {
      if (fromVert && toVert) {
        const y1 = snapGrid(startStub.y + off);
        const y2 = snapGrid(endStub.y + off);
        candidates.push(simplifyOrthogonal([a, { x: a.x, y: y1 }, { x: b.x, y: y1 }, b]));
        if (y2 !== y1) {
          candidates.push(simplifyOrthogonal([a, { x: a.x, y: y2 }, { x: b.x, y: y2 }, b]));
        }
        const midY = snapGrid((startStub.y + endStub.y) / 2 + off);
        candidates.push(simplifyOrthogonal([a, { x: a.x, y: midY }, { x: b.x, y: midY }, b]));
      } else if (!fromVert && !toVert) {
        const x1 = snapGrid(startStub.x + off);
        const x2 = snapGrid(endStub.x + off);
        candidates.push(simplifyOrthogonal([a, { x: x1, y: a.y }, { x: x1, y: b.y }, b]));
        if (x2 !== x1) {
          candidates.push(simplifyOrthogonal([a, { x: x2, y: a.y }, { x: x2, y: b.y }, b]));
        }
        const midX = snapGrid((startStub.x + endStub.x) / 2 + off);
        candidates.push(simplifyOrthogonal([a, { x: midX, y: a.y }, { x: midX, y: b.y }, b]));
      } else {
        // Mixed vertical + horizontal exits
        const sx = fromVert ? a.x : snapGrid(startStub.x + off);
        const sy = fromVert ? snapGrid(startStub.y + off) : a.y;
        const ex = toVert ? b.x : snapGrid(endStub.x + off);
        const ey = toVert ? snapGrid(endStub.y + off) : b.y;
        candidates.push(simplifyOrthogonal([a, { x: sx, y: sy }, { x: ex, y: sy }, { x: ex, y: ey }, b]));
        candidates.push(simplifyOrthogonal([a, { x: sx, y: sy }, { x: sx, y: ey }, { x: ex, y: ey }, b]));
      }
    }

    let bestPts: Point[] | null = null;
    let bestScore = Infinity;

    for (const cand of candidates) {
      if (cand.length < 2) continue;
      if (!respectsPinExits(cand, fromInfo.exitDir, toInfo.exitDir)) continue;
      if (pathHitsObstacle(cand, fromInfo.partId, toInfo.partId)) continue;
      const conf = evaluateWireConflicts(cand, netId);
      if (conf.overlaps > 0) continue;

      const bends = Math.max(0, cand.length - 2);
      const score = pathLength(cand) + bends * 48 + conf.crossings * 30 + conf.nearParallel * 20;
      if (score < bestScore) {
        bestScore = score;
        bestPts = cand;
      }
    }

    return bestPts;
  };

  /** Post-route bend reduction: collapses redundant U-jogs when the straightened shortcut stays clear. */
  const polishOrthogonalPath = (
    pts: Point[],
    fromInfo: PinMeta,
    toInfo: PinMeta,
    netId: string
  ): Point[] => {
    let cur = simplifyOrthogonal(pts);
    for (let pass = 0; pass < 3; pass++) {
      let improved = false;
      for (let i = 1; i + 2 < cur.length; i++) {
        const p0 = cur[i - 1];
        const p1 = cur[i];
        const p2 = cur[i + 1];
        const p3 = cur[i + 2];
        // Try collapsing interior segment p1->p2 onto p0 or p3 axis
        const trials = [
          simplifyOrthogonal([...cur.slice(0, i), { x: p3.x, y: p0.y }, ...cur.slice(i + 2)]),
          simplifyOrthogonal([...cur.slice(0, i), { x: p0.x, y: p3.y }, ...cur.slice(i + 2)]),
        ];
        for (const cand of trials) {
          if (cand.length >= cur.length) continue;
          if (!respectsPinExits(cand, fromInfo.exitDir, toInfo.exitDir)) continue;
          if (pathHitsObstacle(cand, fromInfo.partId, toInfo.partId)) continue;
          const conf = evaluateWireConflicts(cand, netId);
          if (conf.overlaps > 0) continue;
          cur = cand;
          improved = true;
          break;
        }
        if (improved) break;
      }
      if (!improved) break;
    }
    return cur;
  };

  // Route shorter & straight-aligned wires first; longer buses fan cleanly around the outside
  const indexedWires = wires.map((wire, origIdx) => {
    const a = pinPos.get(pinKey(wire.from));
    const b = pinPos.get(pinKey(wire.to));
    const aligned =
      a && b && (Math.abs(a.world.x - b.world.x) < 0.5 || Math.abs(a.world.y - b.world.y) < 0.5)
        ? 0
        : 1;
    const dist = a && b ? Math.abs(a.world.x - b.world.x) + Math.abs(a.world.y - b.world.y) : 0;
    return { wire, origIdx, aligned, dist };
  });
  indexedWires.sort((a, b) => a.aligned - b.aligned || a.dist - b.dist || a.origIdx - b.origIdx);

  // Track staggered lane slots per component side so parallel bus exits fan out cleanly
  const sideSlotCount = new Map<string, number>();
  const nextStaggeredStub = (info: PinMeta): Point => {
    const base = computeExitStubPoint(info.world, info.exitDir, info.partRect, info.partType);
    if (!info.exitDir) return base;
    const key = `${info.partId}:${info.exitDir}`;
    const slot = sideSlotCount.get(key) ?? 0;
    sideSlotCount.set(key, slot + 1);
    const extra = (slot % 6) * GRID_STEP;
    return applyStub(base, info.exitDir, extra);
  };

  const routedWaypoints = new Map<string, Point[]>();
  const storeRoutedPath = (wireId: string, pts: Point[], fromWorld: Point, toWorld: Point) => {
    const inner = pts.slice(1, -1);
    // Keep midpoint on 2-point straight lines so routeWire does not re-add default stubs
    routedWaypoints.set(
      wireId,
      inner.length > 0
        ? inner
        : [{ x: (fromWorld.x + toWorld.x) / 2, y: (fromWorld.y + toWorld.y) / 2 }]
    );
  };

  // Pre-register preserved wires (e.g. untouched manual bends) so newly routed wires avoid them
  if (preserveWireIds && preserveWireIds.size > 0) {
    wires.forEach((w, idx) => {
      if (!preserveWireIds.has(w.id)) return;
      const fromInfo = pinPos.get(pinKey(w.from));
      const toInfo = pinPos.get(pinKey(w.to));
      if (!fromInfo || !toInfo) return;
      const netId = netlist.pinToNet.get(pinKey(w.from)) ?? w.id;
      const pts = routeWire(fromInfo.world, toInfo.world, {
        startExit: fromInfo.exitDir,
        endExit: toInfo.exitDir,
        waypoints: w.waypoints,
        laneIndex: idx,
      });
      registerFinalPath(pts, netId);
    });
  }

  const dirs = [
    { dx: 1, dy: 0, horiz: true },
    { dx: -1, dy: 0, horiz: true },
    { dx: 0, dy: 1, horiz: false },
    { dx: 0, dy: -1, horiz: false },
  ];

  for (const { wire } of indexedWires) {
    if (preserveWireIds?.has(wire.id)) continue;
    const fromInfo = pinPos.get(pinKey(wire.from));
    const toInfo = pinPos.get(pinKey(wire.to));
    if (!fromInfo || !toInfo) continue;

    const netId = netlist.pinToNet.get(pinKey(wire.from)) ?? wire.id;
    const startPt = nextStaggeredStub(fromInfo);
    const endPt = nextStaggeredStub(toInfo);

    // 1. Fast path: clean 0/1/2-bend collision-free & overlap-free schematic route
    const fast = tryCleanFastRoute(fromInfo, toInfo, startPt, endPt, netId);
    if (fast) {
      registerFinalPath(fast, netId);
      storeRoutedPath(wire.id, fast, fromInfo.world, toInfo.world);
      continue;
    }

    // 2. Full obstacle-aware grid A* fallback with high turn & overlap penalties
    const sg = toGrid(startPt);
    const eg = toGrid(endPt);

    const totalStates = cols * rows * 2;
    const gScore = new Float32Array(totalStates);
    gScore.fill(Infinity);
    const cameFrom = new Int32Array(totalStates);
    cameFrom.fill(-1);

    const open = new MinHeap<number>();
    const startCell = sg.gy * cols + sg.gx;
    const endCell = eg.gy * cols + eg.gx;
    const startPreferredOrient =
      fromInfo.exitDir === 'left' || fromInfo.exitDir === 'right'
        ? 0
        : fromInfo.exitDir === 'up' || fromInfo.exitDir === 'down'
          ? 1
          : -1;

    const hInit = Math.abs(sg.gx - eg.gx) + Math.abs(sg.gy - eg.gy);
    for (let orient = 0; orient < 2; orient++) {
      const st = startCell * 2 + orient;
      const initCost = startPreferredOrient >= 0 && orient !== startPreferredOrient ? 10 : 0;
      gScore[st] = initCost;
      open.push(st, initCost + hInit);
    }

    let foundState = -1;
    let expanded = 0;
    const maxExpand = 26_000;

    while (open.size > 0 && expanded < maxExpand) {
      const curr = open.pop()!;
      const cell = curr >> 1;
      if (cell === endCell) {
        foundState = curr;
        break;
      }
      expanded++;
      const prevOrient = curr & 1;
      const cx = cell % cols;
      const cy = (cell - cx) / cols;
      const currG = gScore[curr];

      for (const d of dirs) {
        const nx = cx + d.dx;
        const ny = cy + d.dy;
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
        const nCell = ny * cols + nx;
        const nOrient = d.horiz ? 0 : 1;
        const nState = nCell * 2 + nOrient;

        let base = nCell === endCell ? 1 : cellCost[nCell];
        if (nCell !== endCell && breadboards.length > 0) {
          const wx = (nx + gxMin) * GRID_STEP;
          const wy = (ny + gyMin) * GRID_STEP;
          for (const bb of breadboards) {
            if (bb.partId === fromInfo.partId || bb.partId === toInfo.partId) continue;
            if (wx >= bb.rect.x1 && wx <= bb.rect.x2 && wy >= bb.rect.y1 && wy <= bb.rect.y2) {
              base += 90;
              break;
            }
          }
        }
        if (nCell !== endCell && pinPadCell[nCell]) {
          base += 45;
        }

        const turnPenalty = nOrient !== prevOrient ? 18 : 0;
        const sameLanePenalty = (d.horiz ? usedCellH[nCell] : usedCellV[nCell]) * 320;
        const nearParallelPenalty = (d.horiz ? nearLaneH[nCell] : nearLaneV[nCell]) * 10;
        const crossPenalty = (d.horiz ? usedCellV[nCell] : usedCellH[nCell]) * 16;

        const tentativeG =
          currG + base + turnPenalty + sameLanePenalty + nearParallelPenalty + crossPenalty;
        if (tentativeG < gScore[nState]) {
          gScore[nState] = tentativeG;
          cameFrom[nState] = curr;
          const h = Math.abs(nx - eg.gx) + Math.abs(ny - eg.gy);
          open.push(nState, tentativeG + h);
        }
      }
    }

    if (foundState < 0) {
      routedWaypoints.set(wire.id, []);
      continue;
    }

    const gridPath: Array<{ gx: number; gy: number }> = [];
    let s = foundState;
    while (s >= 0) {
      const cell = s >> 1;
      const gx = cell % cols;
      const gy = (cell - gx) / cols;
      gridPath.push({ gx, gy });
      s = cameFrom[s];
    }
    gridPath.reverse();

    const gridWorldPts = gridPath.map((gp) => ({
      x: (gp.gx + gxMin) * GRID_STEP,
      y: (gp.gy + gyMin) * GRID_STEP,
    }));

    const stitched = stitchStraightPinExits(
      fromInfo.world,
      fromInfo.exitDir,
      startPt,
      toInfo.world,
      toInfo.exitDir,
      endPt,
      gridWorldPts
    );
    const polished = polishOrthogonalPath(stitched, fromInfo, toInfo, netId);
    registerFinalPath(polished, netId);
    storeRoutedPath(wire.id, polished, fromInfo.world, toInfo.world);
  }

  return wires.map((w) => {
    const wp = routedWaypoints.get(w.id);
    return wp ? { ...w, waypoints: wp.length > 0 ? wp : undefined } : w;
  });
}

// --- Smart Component Auto-Layout + Wire Auto-Tidy ---

function snapGrid(v: number): number {
  return Math.round(v / GRID_STEP) * GRID_STEP;
}

function getEffectiveSize(part: PartInstance, manifest: PartManifest): { w: number; h: number } {
  const rotated = part.rotation === 90 || part.rotation === 270;
  return {
    w: rotated ? manifest.height : manifest.width,
    h: rotated ? manifest.width : manifest.height,
  };
}

/** Positions a part so its rotated visual bounding box starts at (boxX, boxY) snapped to the 12px grid. */
function placeAtVisualBox(
  part: PartInstance,
  manifest: PartManifest,
  boxX: number,
  boxY: number
): PartInstance {
  const { w, h } = getEffectiveSize(part, manifest);
  return {
    ...part,
    x: snapGrid(boxX + (w - manifest.width) / 2),
    y: snapGrid(boxY + (h - manifest.height) / 2),
  };
}

interface LayoutRowSpec {
  chains: PartInstance[][];
  width: number;
  height: number;
}

const CATEGORY_ORDER: Record<PartManifest['category'], number> = {
  mcu: 0,
  breadboard: 1,
  power: 2,
  sensor: 3,
  display: 4,
  input: 5,
  passive: 6,
  output: 7,
  motor: 8,
};

const TOP_ZONE_CATEGORIES = new Set<PartManifest['category']>(['sensor', 'display']);

/**
 * Groups directly wired non-MCU/non-breadboard peripherals into ordered signal chains
 * (for example diode -> resistor -> led or ldr -> resistor), ignoring shared power/GND bus wires.
 */
function buildPeripheralChains(
  peripherals: PartInstance[],
  wires: Wire[],
  mcuId: string | null,
  manifests: Map<string, PartManifest>,
  railNetIds?: Set<string>,
  pinToNet?: Map<string, string>
): PartInstance[][] {
  const partById = new Map(peripherals.map((p) => [p.id, p]));
  const adj = new Map<string, Set<string>>();
  const mcuConnected = new Set<string>();

  for (const p of peripherals) adj.set(p.id, new Set());
  for (const w of wires) {
    if (railNetIds && pinToNet) {
      const net = pinToNet.get(pinKey(w.from));
      if (net && railNetIds.has(net)) continue;
    }
    const a = w.from.partId;
    const b = w.to.partId;
    if (a === mcuId && partById.has(b)) mcuConnected.add(b);
    if (b === mcuId && partById.has(a)) mcuConnected.add(a);
    if (a !== b && partById.has(a) && partById.has(b)) {
      adj.get(a)!.add(b);
      adj.get(b)!.add(a);
    }
  }

  const visited = new Set<string>();
  const chains: PartInstance[][] = [];

  for (const p of peripherals) {
    if (visited.has(p.id)) continue;
    // BFS connected component of directly linked peripherals
    const compIds: string[] = [];
    const queue = [p.id];
    visited.add(p.id);
    while (queue.length > 0) {
      const curr = queue.shift()!;
      compIds.push(curr);
      for (const nb of adj.get(curr) ?? []) {
        if (!visited.has(nb)) {
          visited.add(nb);
          queue.push(nb);
        }
      }
    }

    // Order chain: start from an MCU-connected endpoint (preferring passive/sensor/input before output)
    if (compIds.length > 1) {
      const startId =
        compIds
          .slice()
          .sort((a, b) => {
            const aMcu = mcuConnected.has(a) ? 0 : 1;
            const bMcu = mcuConnected.has(b) ? 0 : 1;
            if (aMcu !== bMcu) return aMcu - bMcu;
            const aDeg = adj.get(a)!.size;
            const bDeg = adj.get(b)!.size;
            if (aDeg !== bDeg) return aDeg - bDeg;
            const aCat = CATEGORY_ORDER[manifests.get(partById.get(a)!.type)?.category ?? 'output'];
            const bCat = CATEGORY_ORDER[manifests.get(partById.get(b)!.type)?.category ?? 'output'];
            return aCat - bCat;
          })[0] ?? compIds[0];

      const ordered: PartInstance[] = [];
      const seen = new Set<string>([startId]);
      const walk = [startId];
      while (walk.length > 0) {
        const curr = walk.shift()!;
        ordered.push(partById.get(curr)!);
        const nexts = Array.from(adj.get(curr) ?? [])
          .filter((n) => !seen.has(n))
          .sort((a, b) => {
            const aCat = CATEGORY_ORDER[manifests.get(partById.get(a)!.type)?.category ?? 'output'];
            const bCat = CATEGORY_ORDER[manifests.get(partById.get(b)!.type)?.category ?? 'output'];
            return aCat - bCat;
          });
        for (const n of nexts) {
          seen.add(n);
          walk.push(n);
        }
      }
      chains.push(ordered);
    } else {
      chains.push([partById.get(compIds[0])!]);
    }
  }

  return chains;
}

function packChainsIntoRows(
  chains: PartInstance[][],
  manifests: Map<string, PartManifest>,
  maxRowWidth: number,
  itemGapX: number,
  chainGapX: number
): LayoutRowSpec[] {
  const rows: LayoutRowSpec[] = [];
  let currentChains: PartInstance[][] = [];
  let currentW = 0;
  let currentH = 0;

  const flush = () => {
    if (currentChains.length === 0) return;
    rows.push({ chains: currentChains, width: currentW, height: currentH });
    currentChains = [];
    currentW = 0;
    currentH = 0;
  };

  for (const chain of chains) {
    let chainW = 0;
    let chainH = 0;
    for (let i = 0; i < chain.length; i++) {
      const m = manifests.get(chain[i].type);
      if (!m) continue;
      const { w, h } = getEffectiveSize(chain[i], m);
      chainW += w + (i > 0 ? chainGapX : 0);
      chainH = Math.max(chainH, h);
    }

    const addedW = currentChains.length > 0 ? itemGapX + chainW : chainW;
    if (currentChains.length > 0 && currentW + addedW > maxRowWidth) {
      flush();
    }

    if (currentChains.length > 0) currentW += itemGapX;
    currentChains.push(chain);
    currentW += chainW;
    currentH = Math.max(currentH, chainH);
  }
  flush();
  return rows;
}

function placeRowsAt(
  rows: LayoutRowSpec[],
  startX: number,
  startY: number,
  rowGapY: number,
  itemGapX: number,
  chainGapX: number,
  manifests: Map<string, PartManifest>,
  out: Map<string, PartInstance>
): { bottomY: number; maxRightX: number } {
  let y = snapGrid(startY);
  let maxRightX = startX;

  for (const row of rows) {
    let x = snapGrid(startX);
    row.chains.forEach((chain, ci) => {
      if (ci > 0) x = snapGrid(x + itemGapX);
      chain.forEach((part, pi) => {
        const m = manifests.get(part.type);
        if (!m) return;
        if (pi > 0) x = snapGrid(x + chainGapX);
        const { w, h } = getEffectiveSize(part, m);
        // Vertically center shorter items (like resistors) against taller row neighbors (like LEDs)
        const centeredY = snapGrid(y + (row.height - h) / 2);
        out.set(part.id, placeAtVisualBox(part, m, x, centeredY));
        x = snapGrid(x + w);
        maxRightX = Math.max(maxRightX, x);
      });
    });
    y = snapGrid(y + row.height + rowGapY);
  }

  return {
    bottomY: rows.length > 0 ? y - rowGapY : startY,
    maxRightX,
  };
}

const isAxialPassive = (type: string): boolean => type === 'resistor' || type === 'diode';

/**
 * Checks whether a chain in a top/bottom header zone should stack vertically
 * (e.g. Resistor -> LED, Diode -> Resistor -> LED, LDR -> Resistor) so each slot
 * stays narrow and aligns straight with the MCU header pins.
 */
function shouldStackVertically(chain: PartInstance[]): boolean {
  return chain.length >= 2 && chain.length <= 3 && chain.some((p) => isAxialPassive(p.type));
}

/** Orients axial passives inside a vertically stacked top/bottom chain so signal flows straight along Y. */
function orientVerticalChain(
  chain: PartInstance[],
  direction: 'up' | 'down',
  wires: Wire[]
): PartInstance[] {
  return chain.map((part, idx) => {
    if (!isAxialPassive(part.type)) return part;
    // Determine which pin ('1'/'A' vs '2'/'C') faces the next item farther from the MCU
    const nextPart = chain[idx + 1];
    const prevPart = chain[idx - 1];
    const firstPinId = part.type === 'diode' ? 'A' : '1';
    const secondPinId = part.type === 'diode' ? 'C' : '2';

    let firstFacesMcu = true;
    if (nextPart) {
      const wToNext = wires.find(
        (w) =>
          (w.from.partId === part.id && w.to.partId === nextPart.id) ||
          (w.to.partId === part.id && w.from.partId === nextPart.id)
      );
      if (wToNext) {
        const myPin = wToNext.from.partId === part.id ? wToNext.from.pinId : wToNext.to.pinId;
        firstFacesMcu = myPin === secondPinId;
      }
    } else if (prevPart) {
      const wToPrev = wires.find(
        (w) =>
          (w.from.partId === part.id && w.to.partId === prevPart.id) ||
          (w.to.partId === part.id && w.from.partId === prevPart.id)
      );
      if (wToPrev) {
        const myPin = wToPrev.from.partId === part.id ? wToPrev.from.pinId : wToPrev.to.pinId;
        firstFacesMcu = myPin === firstPinId;
      }
    }

    // At rot=270: left pin ('1'/'A') points DOWN, right pin ('2'/'C') points UP.
    // At rot=90:  left pin ('1'/'A') points UP,   right pin ('2'/'C') points DOWN.
    const rotation: PartInstance['rotation'] =
      direction === 'up' ? (firstFacesMcu ? 270 : 90) : firstFacesMcu ? 90 : 270;
    return { ...part, rotation, flipX: false, flipY: false };
  });
}

function measureHeaderChain(
  chain: PartInstance[],
  manifests: Map<string, PartManifest>,
  chainGapX: number,
  stackGapY: number
): { w: number; h: number; vertical: boolean } {
  if (shouldStackVertically(chain)) {
    let w = 0;
    let h = 0;
    for (let i = 0; i < chain.length; i++) {
      const m = manifests.get(chain[i].type);
      if (!m) continue;
      const sz = getEffectiveSize(chain[i], m);
      w = Math.max(w, sz.w);
      h += sz.h + (i > 0 ? stackGapY : 0);
    }
    return { w, h, vertical: true };
  }
  let w = 0;
  let h = 0;
  for (let i = 0; i < chain.length; i++) {
    const m = manifests.get(chain[i].type);
    if (!m) continue;
    const sz = getEffectiveSize(chain[i], m);
    w += sz.w + (i > 0 ? chainGapX : 0);
    h = Math.max(h, sz.h);
  }
  return { w, h, vertical: false };
}

function packHeaderChainsIntoRows(
  chains: PartInstance[][],
  manifests: Map<string, PartManifest>,
  maxRowW: number,
  itemGapX: number,
  chainGapX: number,
  stackGapY: number
): LayoutRowSpec[] {
  const rows: LayoutRowSpec[] = [];
  let currentChains: PartInstance[][] = [];
  let currentW = 0;
  let currentH = 0;

  const flush = () => {
    if (currentChains.length === 0) return;
    rows.push({ chains: currentChains, width: currentW, height: currentH });
    currentChains = [];
    currentW = 0;
    currentH = 0;
  };

  for (const chain of chains) {
    const { w: chainW, h: chainH } = measureHeaderChain(chain, manifests, chainGapX, stackGapY);
    const addedW = currentChains.length > 0 ? itemGapX + chainW : chainW;
    if (currentChains.length > 0 && currentW + addedW > maxRowW) {
      flush();
    }
    if (currentChains.length > 0) currentW += itemGapX;
    currentChains.push(chain);
    currentW += chainW;
    currentH = Math.max(currentH, chainH);
  }
  flush();
  return rows;
}

/** Places header-facing rows (top or bottom of MCU), stacking axial series chains cleanly along Y. */
function placeHeaderRows(
  rows: LayoutRowSpec[],
  bandCenterX: number,
  startY: number,
  direction: 'up' | 'down',
  rowGapY: number,
  itemGapX: number,
  chainGapX: number,
  stackGapY: number,
  wires: Wire[],
  manifests: Map<string, PartManifest>,
  out: Map<string, PartInstance>,
  minLeftX: number
): { bottomY: number; minX: number; maxRightX: number } {
  let y = snapGrid(startY);
  let minX = Infinity;
  let maxRightX = minLeftX;

  for (const row of rows) {
    let x = Math.max(minLeftX, snapGrid(bandCenterX - row.width / 2));
    minX = Math.min(minX, x);
    row.chains.forEach((chain, ci) => {
      if (ci > 0) x = snapGrid(x + itemGapX);
      const meas = measureHeaderChain(chain, manifests, chainGapX, stackGapY);
      if (meas.vertical) {
        // TOP zone: partLast at top, part0 at bottom (facing MCU).
        // BOTTOM zone: part0 at top (facing MCU), partLast at bottom.
        const visualOrder = direction === 'up' ? chain.slice().reverse() : chain;
        let cy = direction === 'up' ? snapGrid(y + (row.height - meas.h)) : y;

        // First place non-axial anchor parts (e.g. LED / LDR) horizontally centered in the slot
        const placedInCol = new Map<string, PartInstance>();
        const ySlots: number[] = [];
        for (const p of visualOrder) {
          const m = manifests.get(p.type);
          ySlots.push(cy);
          if (m) cy = snapGrid(cy + getEffectiveSize(p, m).h + stackGapY);
        }

        visualOrder.forEach((p, idx) => {
          const m = manifests.get(p.type);
          if (!m || isAxialPassive(p.type)) return;
          const sz = getEffectiveSize(p, m);
          const bx = snapGrid(x + (meas.w - sz.w) / 2);
          const inst = placeAtVisualBox(p, m, bx, ySlots[idx]);
          placedInCol.set(p.id, inst);
          out.set(p.id, inst);
        });

        // Align axial passives dead-straight on X with their connected neighbor pin (multi-pass for 3-part stacks like Diode->Resistor->LED)
        for (let pass = 0; pass < visualOrder.length; pass++) {
          let changed = false;
          visualOrder.forEach((p, idx) => {
            if (placedInCol.has(p.id) || !isAxialPassive(p.type)) return;
            const m = manifests.get(p.type);
            if (!m) return;
            const sz = getEffectiveSize(p, m);
            for (const w of wires) {
              const otherId = w.from.partId === p.id ? w.to.partId : w.to.partId === p.id ? w.from.partId : null;
              const otherPinId = w.from.partId === p.id ? w.to.pinId : w.to.partId === p.id ? w.from.pinId : null;
              if (!otherId || !otherPinId) continue;
              const otherInst = placedInCol.get(otherId);
              const otherMan = otherInst ? manifests.get(otherInst.type) : undefined;
              const otherPin = otherMan?.pins.find((pn) => pn.id === otherPinId);
              if (otherInst && otherMan && otherPin) {
                const targetX = getPinWorldPosition(otherInst, otherMan, otherPin).x;
                const inst = {
                  ...p,
                  x: targetX - m.width / 2,
                  y: snapGrid(ySlots[idx] + (sz.h - m.height) / 2),
                };
                placedInCol.set(p.id, inst);
                out.set(p.id, inst);
                changed = true;
                break;
              }
            }
          });
          if (!changed) break;
        }
        visualOrder.forEach((p, idx) => {
          if (placedInCol.has(p.id)) return;
          const m = manifests.get(p.type);
          if (!m) return;
          const sz = getEffectiveSize(p, m);
          const inst = placeAtVisualBox(p, m, snapGrid(x + (meas.w - sz.w) / 2), ySlots[idx]);
          placedInCol.set(p.id, inst);
          out.set(p.id, inst);
        });

        x = snapGrid(x + meas.w);
        maxRightX = Math.max(maxRightX, x);
      } else {
        chain.forEach((part, pi) => {
          const m = manifests.get(part.type);
          if (!m) return;
          if (pi > 0) x = snapGrid(x + chainGapX);
          const { w, h } = getEffectiveSize(part, m);
          const alignedY =
            direction === 'up' ? snapGrid(y + (row.height - h)) : y;
          out.set(part.id, placeAtVisualBox(part, m, x, alignedY));
          x = snapGrid(x + w);
          maxRightX = Math.max(maxRightX, x);
        });
      }
    });
    y = snapGrid(y + row.height + rowGapY);
  }

  return {
    bottomY: rows.length > 0 ? y - rowGapY : startY,
    minX: Number.isFinite(minX) ? minX : minLeftX,
    maxRightX,
  };
}

/**
 * Arranges both component placement and jumper wire routing cleanly:
 * - Places header-connected peripherals in aligned rows facing their MCU pin header (top / bottom / right / left)
 * - Stacks inline axial passives (resistor/diode) vertically along signal paths for zero-kink alignment
 * - Sorts strictly by signal pins (ignoring shared GND/5V rails) and routes obstacle-aware orthogonal wires
 */
export function autoTidyCircuit(
  parts: PartInstance[],
  wires: Wire[],
  manifests: Map<string, PartManifest>
): { parts: PartInstance[]; wires: Wire[] } {
  if (parts.length === 0) return { parts, wires };

  const ITEM_GAP_X = 48;
  const CHAIN_GAP_X = 48;
  const STACK_GAP_Y = 48;
  const ROW_GAP_Y = 72;
  const ZONE_GAP_X = 96;
  const ZONE_GAP_Y = 72;
  const ORIGIN_X = 48;
  const ORIGIN_Y = 36;

  const mcuParts = parts.filter((p) => isMcuBoardType(p.type));
  const mcuPart = mcuParts[0] ?? null;
  const extraMcus = mcuParts.slice(1);
  const mcuManifest = mcuPart ? manifests.get(mcuPart.type) : undefined;
  const breadboards = parts.filter((p) => p.type === 'breadboard-half');
  const peripherals = parts.filter((p) => !isMcuBoardType(p.type) && p.type !== 'breadboard-half');

  const placed = new Map<string, PartInstance>();

  // Identify shared MCU power/GND rail nets so common bus wires do not glue unrelated parts into one chain
  const netlist = buildNetlist(parts, wires, manifests);
  const railNetIds = new Set<string>();
  for (const mp of mcuParts) {
    const mm = manifests.get(mp.type);
    if (!mm) continue;
    for (const pin of mm.pins) {
      if (pin.type === 'gnd' || pin.type === 'power') {
        const net = netlist.pinToNet.get(`${mp.id}:${pin.id}`);
        if (net) railNetIds.add(net);
      }
    }
  }

  type HeaderZone = 'top' | 'bottom' | 'right' | 'left';
  interface AffinityStats {
    sigSumY: number;
    sigSumX: number;
    sigCount: number;
    sigZones: Record<HeaderZone, number>;
    pwrSumY: number;
    pwrSumX: number;
    pwrCount: number;
    pwrZones: Record<HeaderZone, number>;
  }
  const makeStats = (): AffinityStats => ({
    sigSumY: 0,
    sigSumX: 0,
    sigCount: 0,
    sigZones: { top: 0, bottom: 0, right: 0, left: 0 },
    pwrSumY: 0,
    pwrSumX: 0,
    pwrCount: 0,
    pwrZones: { top: 0, bottom: 0, right: 0, left: 0 },
  });

  // Compute each peripheral's header-zone & coordinate affinity strictly from MCU signal pins (power/GND fallback)
  const pinAffinity = new Map<string, AffinityStats>();
  if (mcuPart && mcuManifest) {
    const refMcu: PartInstance = { ...mcuPart, x: 0, y: 0 };
    const mcuSize = getEffectiveSize(mcuPart, mcuManifest);
    const mcuPinMeta = new Map<string, { pt: Point; isPower: boolean; zone: HeaderZone }>();
    for (const pin of mcuManifest.pins) {
      const pt = getPinWorldPosition(refMcu, mcuManifest, pin);
      const exit = rotateExitDir(pin.exitDir, mcuPart.rotation, mcuPart.flipX, mcuPart.flipY);
      let zone: HeaderZone;
      if (exit === 'up') zone = 'top';
      else if (exit === 'down') zone = 'bottom';
      else if (exit === 'right') zone = 'right';
      else if (exit === 'left') zone = 'left';
      else if (pt.y <= mcuSize.h * 0.25) zone = 'top';
      else if (pt.y >= mcuSize.h * 0.75) zone = 'bottom';
      else if (pt.x >= mcuSize.w * 0.75) zone = 'right';
      else if (pt.x <= mcuSize.w * 0.25) zone = 'left';
      else zone = pt.y <= mcuSize.h / 2 ? 'top' : 'bottom';
      mcuPinMeta.set(pin.id, {
        pt,
        isPower: pin.type === 'power' || pin.type === 'gnd',
        zone,
      });
    }
    const addHit = (partId: string, pinId: string) => {
      const meta = mcuPinMeta.get(pinId);
      if (!meta) return;
      const cur = pinAffinity.get(partId) ?? makeStats();
      if (meta.isPower) {
        cur.pwrSumY += meta.pt.y;
        cur.pwrSumX += meta.pt.x;
        cur.pwrCount += 1;
        cur.pwrZones[meta.zone] += 1;
      } else {
        cur.sigSumY += meta.pt.y;
        cur.sigSumX += meta.pt.x;
        cur.sigCount += 1;
        cur.sigZones[meta.zone] += 1;
      }
      pinAffinity.set(partId, cur);
    };
    for (const w of wires) {
      if (w.from.partId === mcuPart.id && w.to.partId !== mcuPart.id) {
        addHit(w.to.partId, w.from.pinId);
      } else if (w.to.partId === mcuPart.id && w.from.partId !== mcuPart.id) {
        addHit(w.from.partId, w.to.pinId);
      }
    }
  }

  const chains = buildPeripheralChains(
    peripherals,
    wires,
    mcuPart?.id ?? null,
    manifests,
    railNetIds,
    netlist.pinToNet
  );

  const chainScore = (chain: PartInstance[]) => {
    const agg = makeStats();
    for (const p of chain) {
      const a = pinAffinity.get(p.id);
      if (!a) continue;
      agg.sigSumY += a.sigSumY;
      agg.sigSumX += a.sigSumX;
      agg.sigCount += a.sigCount;
      agg.pwrSumY += a.pwrSumY;
      agg.pwrSumX += a.pwrSumX;
      agg.pwrCount += a.pwrCount;
      for (const z of ['top', 'bottom', 'right', 'left'] as const) {
        agg.sigZones[z] += a.sigZones[z];
        agg.pwrZones[z] += a.pwrZones[z];
      }
    }
    const useSig = agg.sigCount > 0;
    const count = useSig ? agg.sigCount : agg.pwrCount;
    const zones = useSig ? agg.sigZones : agg.pwrZones;
    let dominantZone: HeaderZone = 'top';
    let bestHits = -1;
    for (const z of ['top', 'bottom', 'right', 'left'] as const) {
      if (zones[z] > bestHits) {
        bestHits = zones[z];
        dominantZone = z;
      }
    }
    const firstCat = CATEGORY_ORDER[manifests.get(chain[0].type)?.category ?? 'output'];
    const isPowerChain = chain.some((p) => manifests.get(p.type)?.category === 'power');
    return {
      hasAffinity: count > 0,
      avgY: count > 0 ? (useSig ? agg.sigSumY : agg.pwrSumY) / count : 0,
      avgX: count > 0 ? (useSig ? agg.sigSumX : agg.pwrSumX) / count : 0,
      zone: dominantZone,
      firstCat,
      isPowerChain,
    };
  };

  if (breadboards.length > 0) {
    // Breadboard-centric layout: Top sensors/displays -> Middle breadboard -> Bottom MCU + outputs
    const topChains: PartInstance[][] = [];
    const bottomChains: PartInstance[][] = [];

    for (const chain of chains) {
      const primaryCat = manifests.get(chain[0].type)?.category ?? 'output';
      if (TOP_ZONE_CATEGORIES.has(primaryCat)) {
        topChains.push(chain);
      } else {
        bottomChains.push(chain);
      }
    }
    topChains.sort((a, b) => chainScore(a).firstCat - chainScore(b).firstCat);
    bottomChains.sort((a, b) => chainScore(a).firstCat - chainScore(b).firstCat);

    let cursorY = ORIGIN_Y;
    if (topChains.length > 0) {
      const topRows = packChainsIntoRows(topChains, manifests, 640, ITEM_GAP_X, CHAIN_GAP_X);
      const res = placeRowsAt(topRows, ORIGIN_X, cursorY, ROW_GAP_Y, ITEM_GAP_X, CHAIN_GAP_X, manifests, placed);
      cursorY = snapGrid(res.bottomY + ZONE_GAP_Y);
    }

    // Place breadboard(s) cleanly across the middle row
    let bbX = ORIGIN_X;
    let bbMaxH = 0;
    for (const bb of breadboards) {
      const bm = manifests.get(bb.type);
      if (!bm) continue;
      const { w, h } = getEffectiveSize(bb, bm);
      placed.set(bb.id, placeAtVisualBox(bb, bm, bbX, cursorY));
      bbX = snapGrid(bbX + w + ITEM_GAP_X);
      bbMaxH = Math.max(bbMaxH, h);
    }
    cursorY = snapGrid(cursorY + bbMaxH + ZONE_GAP_Y);

    // Place MCU(s) at bottom-left, outputs/inputs to their right
    let bottomStartX = ORIGIN_X;
    for (const mp of mcuParts) {
      const mm = manifests.get(mp.type);
      if (!mm) continue;
      const { w } = getEffectiveSize(mp, mm);
      placed.set(mp.id, placeAtVisualBox(mp, mm, bottomStartX, cursorY));
      bottomStartX = snapGrid(bottomStartX + w + ZONE_GAP_X);
    }

    if (bottomChains.length > 0) {
      const bottomRows = packChainsIntoRows(bottomChains, manifests, 560, ITEM_GAP_X, CHAIN_GAP_X);
      placeRowsAt(bottomRows, bottomStartX, cursorY, ROW_GAP_Y, ITEM_GAP_X, CHAIN_GAP_X, manifests, placed);
    }
  } else if (mcuPart && mcuManifest) {
    // Universal Header-Facing Layout:
    // Top-header parts sit in an aligned horizontal row ABOVE the MCU,
    // Bottom-header parts sit in an aligned horizontal row BELOW the MCU,
    // Power supplies & left-header parts sit to the LEFT, right-header & extra MCUs sit to the RIGHT.
    const mcuSize = getEffectiveSize(mcuPart, mcuManifest);

    const topChains: PartInstance[][] = [];
    const bottomChains: PartInstance[][] = [];
    const rightChains: PartInstance[][] = [];
    const leftChains: PartInstance[][] = [];

    for (const chain of chains) {
      const sc = chainScore(chain);
      if (sc.hasAffinity) {
        if (sc.zone === 'top') topChains.push(chain);
        else if (sc.zone === 'bottom') bottomChains.push(chain);
        else if (sc.zone === 'right') rightChains.push(chain);
        else leftChains.push(chain);
      } else if (sc.isPowerChain) {
        leftChains.push(chain);
      } else {
        rightChains.push(chain);
      }
    }

    // Order top & bottom strictly left-to-right matching MCU header pins for zero-crossing fan-out
    topChains.sort((a, b) => chainScore(a).avgX - chainScore(b).avgX || chainScore(a).firstCat - chainScore(b).firstCat);
    bottomChains.sort((a, b) => chainScore(a).avgX - chainScore(b).avgX || chainScore(a).firstCat - chainScore(b).firstCat);
    rightChains.sort((a, b) => chainScore(a).avgY - chainScore(b).avgY || chainScore(a).firstCat - chainScore(b).firstCat);
    leftChains.sort((a, b) => chainScore(a).avgY - chainScore(b).avgY || chainScore(a).firstCat - chainScore(b).firstCat);

    // Auto-orient axial passives inside top/bottom vertical stacks
    const orientedTop = topChains.map((c) =>
      shouldStackVertically(c) ? orientVerticalChain(c, 'up', wires) : c
    );
    const orientedBottom = bottomChains.map((c) =>
      shouldStackVertically(c) ? orientVerticalChain(c, 'down', wires) : c
    );

    const maxHeaderRowW = 1100;
    const topRows = packHeaderChainsIntoRows(orientedTop, manifests, maxHeaderRowW, ITEM_GAP_X, CHAIN_GAP_X, STACK_GAP_Y);
    const bottomRows = packHeaderChainsIntoRows(orientedBottom, manifests, maxHeaderRowW, ITEM_GAP_X, CHAIN_GAP_X, STACK_GAP_Y);
    const leftRows = packChainsIntoRows(leftChains, manifests, 260, ITEM_GAP_X, CHAIN_GAP_X);
    const rightRows = packChainsIntoRows(rightChains, manifests, 480, ITEM_GAP_X, CHAIN_GAP_X);

    const topMaxW = topRows.reduce((m, r) => Math.max(m, r.width), 0);
    const bottomMaxW = bottomRows.reduce((m, r) => Math.max(m, r.width), 0);
    const leftMaxW = leftRows.reduce((m, r) => Math.max(m, r.width), 0);

    const centerStartX = leftRows.length > 0 ? snapGrid(ORIGIN_X + leftMaxW + ZONE_GAP_X) : ORIGIN_X;
    const bandWidth = Math.max(mcuSize.w, topMaxW, bottomMaxW);
    const bandCenterX = snapGrid(centerStartX + bandWidth / 2);

    const topCorridorY =
      topRows.length > 0 ? snapGrid(Math.max(84, 48 + Math.min(topChains.length, 14) * 14)) : 0;
    const bottomCorridorY =
      bottomRows.length > 0 ? snapGrid(Math.max(84, 48 + Math.min(bottomChains.length, 14) * 14)) : 0;

    let cursorY = ORIGIN_Y;
    let centerMaxRightX = centerStartX + mcuSize.w;

    if (topRows.length > 0) {
      const topRes = placeHeaderRows(
        topRows,
        bandCenterX,
        cursorY,
        'up',
        ROW_GAP_Y,
        ITEM_GAP_X,
        CHAIN_GAP_X,
        STACK_GAP_Y,
        wires,
        manifests,
        placed,
        centerStartX
      );
      centerMaxRightX = Math.max(centerMaxRightX, topRes.maxRightX);
      cursorY = snapGrid(topRes.bottomY + topCorridorY);
    }

    // Center MCU horizontally under the top header band (aligned with top & bottom rows)
    const mcuX = Math.max(centerStartX, snapGrid(bandCenterX - mcuSize.w / 2));
    const mcuY = cursorY;
    placed.set(mcuPart.id, placeAtVisualBox(mcuPart, mcuManifest, mcuX, mcuY));
    centerMaxRightX = Math.max(centerMaxRightX, mcuX + mcuSize.w);

    if (bottomRows.length > 0) {
      const botStartY = snapGrid(mcuY + mcuSize.h + bottomCorridorY);
      const botRes = placeHeaderRows(
        bottomRows,
        bandCenterX,
        botStartY,
        'down',
        ROW_GAP_Y,
        ITEM_GAP_X,
        CHAIN_GAP_X,
        STACK_GAP_Y,
        wires,
        manifests,
        placed,
        centerStartX
      );
      centerMaxRightX = Math.max(centerMaxRightX, botRes.maxRightX);
    }

    if (leftRows.length > 0) {
      const leftTotalH =
        leftRows.reduce((acc, r) => acc + r.height, 0) + Math.max(0, leftRows.length - 1) * ROW_GAP_Y;
      const leftY = Math.max(ORIGIN_Y, snapGrid(mcuY + (mcuSize.h - leftTotalH) / 2));
      placeRowsAt(leftRows, ORIGIN_X, leftY, ROW_GAP_Y, ITEM_GAP_X, CHAIN_GAP_X, manifests, placed);
    }

    let rightCursorX = snapGrid(centerMaxRightX + ZONE_GAP_X);
    if (rightRows.length > 0) {
      const rightTotalH =
        rightRows.reduce((acc, r) => acc + r.height, 0) + Math.max(0, rightRows.length - 1) * ROW_GAP_Y;
      const rightY = Math.max(ORIGIN_Y, snapGrid(mcuY + (mcuSize.h - rightTotalH) / 2));
      const rightRes = placeRowsAt(rightRows, rightCursorX, rightY, ROW_GAP_Y, ITEM_GAP_X, CHAIN_GAP_X, manifests, placed);
      rightCursorX = snapGrid(rightRes.maxRightX + ZONE_GAP_X);
    }

    for (const extra of extraMcus) {
      const em = manifests.get(extra.type);
      if (!em) continue;
      const sz = getEffectiveSize(extra, em);
      placed.set(extra.id, placeAtVisualBox(extra, em, rightCursorX, mcuY));
      rightCursorX = snapGrid(rightCursorX + sz.w + ZONE_GAP_X);
    }
  } else {
    // No MCU and no breadboard: tidy grid layout
    chains.sort((a, b) => chainScore(a).firstCat - chainScore(b).firstCat);
    const rows = packChainsIntoRows(chains, manifests, 640, ITEM_GAP_X, CHAIN_GAP_X);
    placeRowsAt(rows, ORIGIN_X, ORIGIN_Y, ROW_GAP_Y, ITEM_GAP_X, CHAIN_GAP_X, manifests, placed);
  }

  const nextParts = parts.map((p) => placed.get(p.id) ?? p);
  const nextWires = autoTidyWires(nextParts, wires, manifests);
  return { parts: nextParts, wires: nextWires };
}

// --- Manual Wire Reshaping Helpers (Orthogonal Corner Drag & Segment Slide) ---

/**
 * Moves an interior corner (`cornerIdx` in `1..pts.length-2`) of an orthogonal wire polyline
 * to `(nx, ny)` while rubber-banding adjacent interior corners to preserve orthogonality.
 * Returns the updated intermediate waypoints (excluding fixed start/end pins).
 */
export function moveWireCorner(pts: Point[], cornerIdx: number, nx: number, ny: number): Point[] {
  if (cornerIdx <= 0 || cornerIdx >= pts.length - 1) return pts.slice(1, -1);
  const next = pts.map((p) => ({ x: p.x, y: p.y }));
  const prevIdx = cornerIdx - 1;
  const nextIdx = cornerIdx + 1;
  const prevHoriz = Math.abs(pts[prevIdx].y - pts[cornerIdx].y) < 0.5;
  const prevVert = Math.abs(pts[prevIdx].x - pts[cornerIdx].x) < 0.5;
  const nextHoriz = Math.abs(pts[nextIdx].y - pts[cornerIdx].y) < 0.5;
  const nextVert = Math.abs(pts[nextIdx].x - pts[cornerIdx].x) < 0.5;

  next[cornerIdx] = { x: nx, y: ny };
  if (prevIdx > 0) {
    if (prevHoriz) next[prevIdx].y = ny;
    else if (prevVert) next[prevIdx].x = nx;
  }
  if (nextIdx < pts.length - 1) {
    if (nextHoriz) next[nextIdx].y = ny;
    else if (nextVert) next[nextIdx].x = nx;
  }

  // Keep pin lead-in/lead-out strictly orthogonal if corner next to a fixed pin was dragged sideways
  if (nextIdx === pts.length - 1) {
    const endPin = pts[nextIdx];
    if (nextVert && Math.abs(nx - endPin.x) > 0.5) {
      const midY = snapGrid((ny + endPin.y) / 2);
      next.splice(nextIdx, 0, { x: nx, y: midY }, { x: endPin.x, y: midY });
    } else if (nextHoriz && Math.abs(ny - endPin.y) > 0.5) {
      const midX = snapGrid((nx + endPin.x) / 2);
      next.splice(nextIdx, 0, { x: midX, y: ny }, { x: midX, y: endPin.y });
    }
  }
  if (prevIdx === 0) {
    const startPin = pts[0];
    if (prevVert && Math.abs(nx - startPin.x) > 0.5) {
      const midY = snapGrid((startPin.y + ny) / 2);
      next.splice(1, 0, { x: startPin.x, y: midY }, { x: nx, y: midY });
    } else if (prevHoriz && Math.abs(ny - startPin.y) > 0.5) {
      const midX = snapGrid((startPin.x + nx) / 2);
      next.splice(1, 0, { x: midX, y: startPin.y }, { x: midX, y: ny });
    }
  }

  return simplifyOrthogonal(next).slice(1, -1);
}

/**
 * Slides segment `pts[segIdx] -> pts[segIdx + 1]` perpendicular to its direction to `(nx, ny)`,
 * or inserts clean orthogonal bends when an endpoint is pinned to a component.
 * Returns the updated intermediate waypoints (excluding fixed start/end pins).
 */
export function moveWireSegment(pts: Point[], segIdx: number, nx: number, ny: number): Point[] {
  if (segIdx < 0 || segIdx >= pts.length - 1) return pts.slice(1, -1);
  const a = pts[segIdx];
  const b = pts[segIdx + 1];
  const isHoriz = Math.abs(a.y - b.y) < 0.5;
  const aPinned = segIdx === 0;
  const bPinned = segIdx + 1 === pts.length - 1;
  const next = pts.map((p) => ({ x: p.x, y: p.y }));

  if (!aPinned && !bPinned) {
    if (isHoriz) {
      next[segIdx].y = ny;
      next[segIdx + 1].y = ny;
    } else {
      next[segIdx].x = nx;
      next[segIdx + 1].x = nx;
    }
    return simplifyOrthogonal(next).slice(1, -1);
  }

  if (aPinned && !bPinned) {
    if (isHoriz) {
      const splitX = Math.abs(nx - a.x) >= GRID_STEP ? nx : snapGrid((a.x + b.x) / 2);
      next[segIdx + 1].y = ny;
      next.splice(segIdx + 1, 0, { x: splitX, y: a.y }, { x: splitX, y: ny });
    } else {
      const splitY = Math.abs(ny - a.y) >= GRID_STEP ? ny : snapGrid((a.y + b.y) / 2);
      next[segIdx + 1].x = nx;
      next.splice(segIdx + 1, 0, { x: a.x, y: splitY }, { x: nx, y: splitY });
    }
    return simplifyOrthogonal(next).slice(1, -1);
  }

  if (!aPinned && bPinned) {
    if (isHoriz) {
      const splitX = Math.abs(nx - b.x) >= GRID_STEP ? nx : snapGrid((a.x + b.x) / 2);
      next[segIdx].y = ny;
      next.splice(segIdx + 1, 0, { x: splitX, y: ny }, { x: splitX, y: b.y });
    } else {
      const splitY = Math.abs(ny - b.y) >= GRID_STEP ? ny : snapGrid((a.y + b.y) / 2);
      next[segIdx].x = nx;
      next.splice(segIdx + 1, 0, { x: nx, y: splitY }, { x: b.x, y: splitY });
    }
    return simplifyOrthogonal(next).slice(1, -1);
  }

  // Both endpoints are fixed pins (2-point straight wire): insert a clean orthogonal U-jog
  if (isHoriz) {
    const span = b.x - a.x;
    const x1 = snapGrid(a.x + span * 0.25);
    const x2 = snapGrid(a.x + span * 0.75);
    next.splice(1, 0, { x: x1, y: a.y }, { x: x1, y: ny }, { x: x2, y: ny }, { x: x2, y: b.y });
  } else {
    const span = b.y - a.y;
    const y1 = snapGrid(a.y + span * 0.25);
    const y2 = snapGrid(a.y + span * 0.75);
    next.splice(1, 0, { x: a.x, y: y1 }, { x: nx, y: y1 }, { x: nx, y: y2 }, { x: b.x, y: y2 });
  }
  return simplifyOrthogonal(next).slice(1, -1);
}
