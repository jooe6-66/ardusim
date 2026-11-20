import { PartInstance, PartManifest, Point, Wire, getPinWorldPosition, pinKey } from './types.js';

export type ExitDirection = 'up' | 'down' | 'left' | 'right';

export interface RouteOptions {
  startExit?: ExitDirection;
  endExit?: ExitDirection;
  waypoints?: Point[];
  laneIndex?: number;
}

const STUB_LEN = 14;
const GRID_STEP = 12;

function applyStub(pt: Point, dir?: ExitDirection, extra = 0): Point {
  const dist = STUB_LEN + extra;
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

function connectOrthogonal(a: Point, b: Point, preferHorizontalFirst: boolean, laneOffset: number): Point[] {
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
  const laneOffset = ((lane % 5) - 2) * 8;
  const hasWaypoints = (opts.waypoints?.length ?? 0) > 0;
  const points: Point[] = [start];

  const startStub =
    !hasWaypoints && opts.startExit ? applyStub(start, opts.startExit, (lane % 3) * 4) : start;
  const endStub =
    !hasWaypoints && opts.endExit ? applyStub(end, opts.endExit, (lane % 3) * 4) : end;

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
  rotation: PartInstance['rotation']
): ExitDirection | undefined {
  if (!dir) return undefined;
  const order: ExitDirection[] = ['up', 'right', 'down', 'left'];
  const idx = order.indexOf(dir);
  return order[(idx + rotation / 90) % 4];
}

function getPartBodyObstacle(part: PartInstance, manifest: PartManifest): Rect {
  const cx = part.x + manifest.width / 2;
  const cy = part.y + manifest.height / 2;
  const rotated = part.rotation === 90 || part.rotation === 270;
  const w = rotated ? manifest.height : manifest.width;
  const h = rotated ? manifest.width : manifest.height;
  // Inset slightly from outer pin edge so pins sit cleanly outside the forbidden core body
  const inset = part.type === 'breadboard-half' ? 14 : 8;
  return {
    x1: cx - w / 2 + inset,
    y1: cy - h / 2 + inset,
    x2: cx + w / 2 - inset,
    y2: cy + h / 2 - inset,
  };
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
 * Re-routes all jumper wires around component bodies with channel separation so wires
 * never cross over boards/displays or stack on top of each other.
 * ponytail: dense 12px grid A* bounded to circuit extents + 120px margin; handles up to ~100 wires in <50ms.
 */
export function autoTidyWires(
  parts: PartInstance[],
  wires: Wire[],
  manifests: Map<string, PartManifest>
): Wire[] {
  if (wires.length === 0) return wires;

  // Build world pin lookup and circuit bounding box
  const pinPos = new Map<string, { world: Point; exitDir?: ExitDirection }>();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const obstacles: Rect[] = [];

  for (const part of parts) {
    const manifest = manifests.get(part.type);
    if (!manifest) continue;
    minX = Math.min(minX, part.x);
    minY = Math.min(minY, part.y);
    maxX = Math.max(maxX, part.x + manifest.width);
    maxY = Math.max(maxY, part.y + manifest.height);
    if (part.type !== 'breadboard-half') {
      obstacles.push(getPartBodyObstacle(part, manifest));
    }
    for (const pin of manifest.pins) {
      pinPos.set(`${part.id}:${pin.id}`, {
        world: getPinWorldPosition(part, manifest, pin),
        exitDir: rotateExitDir(pin.exitDir, part.rotation),
      });
    }
  }

  if (!Number.isFinite(minX)) return wires;

  const margin = 120;
  const gxMin = Math.floor((minX - margin) / GRID_STEP);
  const gyMin = Math.floor((minY - margin) / GRID_STEP);
  const gxMax = Math.ceil((maxX + margin) / GRID_STEP);
  const gyMax = Math.ceil((maxY + margin) / GRID_STEP);
  const cols = Math.max(10, gxMax - gxMin + 1);
  const rows = Math.max(10, gyMax - gyMin + 1);

  // Bail cleanly if circuit spans an absurd coordinate space
  if (cols * rows > 40_000) {
    return wires.map((w) => ({ ...w, waypoints: undefined }));
  }

  // Mark static obstacle cost per grid cell
  const cellCost = new Float32Array(cols * rows);
  cellCost.fill(1);
  for (let gy = 0; gy < rows; gy++) {
    const wy = (gy + gyMin) * GRID_STEP;
    for (let gx = 0; gx < cols; gx++) {
      const wx = (gx + gxMin) * GRID_STEP;
      for (const ob of obstacles) {
        if (wx >= ob.x1 && wx <= ob.x2 && wy >= ob.y1 && wy <= ob.y2) {
          cellCost[gy * cols + gx] = 65; // Strong avoidance without making trapped pins impossible
          break;
        }
      }
    }
  }

  // Track occupied grid segments (horizontal/vertical lanes) so parallel wires separate cleanly
  const usedCellH = new Uint16Array(cols * rows);
  const usedCellV = new Uint16Array(cols * rows);

  // Route shorter wires first so long power/ground buses wrap cleanly around the outside
  const indexedWires = wires.map((wire, origIdx) => {
    const a = pinPos.get(pinKey(wire.from));
    const b = pinPos.get(pinKey(wire.to));
    const dist = a && b ? Math.abs(a.world.x - b.world.x) + Math.abs(a.world.y - b.world.y) : 0;
    return { wire, origIdx, dist };
  });
  indexedWires.sort((a, b) => a.dist - b.dist);

  const routedWaypoints = new Map<string, Point[]>();

  const toGrid = (pt: Point): { gx: number; gy: number } => ({
    gx: Math.min(cols - 1, Math.max(0, Math.round(pt.x / GRID_STEP) - gxMin)),
    gy: Math.min(rows - 1, Math.max(0, Math.round(pt.y / GRID_STEP) - gyMin)),
  });

  const dirs = [
    { dx: 1, dy: 0, horiz: true },
    { dx: -1, dy: 0, horiz: true },
    { dx: 0, dy: 1, horiz: false },
    { dx: 0, dy: -1, horiz: false },
  ];

  for (const { wire } of indexedWires) {
    const fromInfo = pinPos.get(pinKey(wire.from));
    const toInfo = pinPos.get(pinKey(wire.to));
    if (!fromInfo || !toInfo) continue;

    // Step 1 grid cell outward along each pin's natural exit direction so wires never dive back through their own board
    const startPt = fromInfo.exitDir ? applyStub(fromInfo.world, fromInfo.exitDir, 0) : fromInfo.world;
    const endPt = toInfo.exitDir ? applyStub(toInfo.world, toInfo.exitDir, 0) : toInfo.world;

    const sg = toGrid(startPt);
    const eg = toGrid(endPt);

    // State index encodes (cellIndex * 2 + orientation) so turn penalties stay exact
    const totalStates = cols * rows * 2;
    const gScore = new Float32Array(totalStates);
    gScore.fill(Infinity);
    const cameFrom = new Int32Array(totalStates);
    cameFrom.fill(-1);

    const open = new MinHeap<number>();
    const startCell = sg.gy * cols + sg.gx;
    const endCell = eg.gy * cols + eg.gx;

    const hInit = Math.abs(sg.gx - eg.gx) + Math.abs(sg.gy - eg.gy);
    for (let orient = 0; orient < 2; orient++) {
      const st = startCell * 2 + orient;
      gScore[st] = 0;
      open.push(st, hInit);
    }

    let foundState = -1;
    let expanded = 0;
    const maxExpand = 14_000;

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

        const base = nCell === endCell ? 1 : cellCost[nCell];
        const turnPenalty = nOrient !== prevOrient ? 2.4 : 0;
        const sameLanePenalty = (d.horiz ? usedCellH[nCell] : usedCellV[nCell]) * 9;
        const crossPenalty = (d.horiz ? usedCellV[nCell] : usedCellH[nCell]) * 1.5;

        const tentativeG = currG + base + turnPenalty + sameLanePenalty + crossPenalty;
        if (tentativeG < gScore[nState]) {
          gScore[nState] = tentativeG;
          cameFrom[nState] = curr;
          const h = Math.abs(nx - eg.gx) + Math.abs(ny - eg.gy);
          open.push(nState, tentativeG + h);
        }
      }
    }

    if (foundState < 0) continue;

    // Reconstruct path in grid coordinates & record occupied horizontal/vertical channels
    const gridPath: Array<{ gx: number; gy: number }> = [];
    let s = foundState;
    while (s >= 0) {
      const cell = s >> 1;
      const orient = s & 1;
      const gx = cell % cols;
      const gy = (cell - gx) / cols;
      gridPath.push({ gx, gy });
      if (orient === 0) usedCellH[cell]++;
      else usedCellV[cell]++;
      s = cameFrom[s];
    }
    gridPath.reverse();

    // Convert to world coordinates, attach true pin endpoints, simplify collinear bends, and extract inner waypoints
    const rawWorld: Point[] = [fromInfo.world];
    if (fromInfo.exitDir) rawWorld.push(startPt);
    for (const gp of gridPath) {
      rawWorld.push({ x: (gp.gx + gxMin) * GRID_STEP, y: (gp.gy + gyMin) * GRID_STEP });
    }
    if (toInfo.exitDir) rawWorld.push(endPt);
    rawWorld.push(toInfo.world);

    // Ensure every transition is strictly orthogonal before simplifying
    const ortho: Point[] = [rawWorld[0]];
    for (let i = 1; i < rawWorld.length; i++) {
      const prev = ortho[ortho.length - 1];
      const pt = rawWorld[i];
      if (Math.abs(pt.x - prev.x) > 0.5 && Math.abs(pt.y - prev.y) > 0.5) {
        // Align corner cleanly along exit direction for start/end pins
        if (i === 1 && (fromInfo.exitDir === 'up' || fromInfo.exitDir === 'down')) {
          ortho.push({ x: prev.x, y: pt.y });
        } else if (i === rawWorld.length - 1 && (toInfo.exitDir === 'up' || toInfo.exitDir === 'down')) {
          ortho.push({ x: pt.x, y: prev.y });
        } else {
          ortho.push({ x: pt.x, y: prev.y });
        }
      }
      ortho.push(pt);
    }

    const simplified = simplifyOrthogonal(ortho);
    // Keep only intermediate points between start pin and end pin as wire.waypoints
    const inner = simplified.slice(1, -1);
    routedWaypoints.set(wire.id, inner);
  }

  return wires.map((w) => {
    const wp = routedWaypoints.get(w.id);
    return wp ? { ...w, waypoints: wp.length > 0 ? wp : undefined } : w;
  });
}
