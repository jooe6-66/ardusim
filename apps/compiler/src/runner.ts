import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { BoardId } from '@ardusim/sim-core';
import { BOARD_SPECS } from './boards.js';

const execFileAsync = promisify(execFile);

export interface CompileResult {
  hex: string;
  cached: boolean;
  engine: 'arduino-cli';
  durationMs: number;
  logs: string;
}

export interface CompileDiagnostic {
  line?: number;
  column?: number;
  message: string;
}

export class CompileError extends Error {
  readonly logs: string;
  readonly diagnostics: CompileDiagnostic[];
  readonly statusCode: number;

  constructor(message: string, logs: string, statusCode = 400) {
    super(message);
    this.logs = logs;
    this.diagnostics = parseCompilerDiagnostics(logs);
    this.statusCode = statusCode;
  }
}

export interface CompilerServiceOptions {
  compileTimeoutMs?: number;
}

const MAX_SKETCH_BYTES = 64 * 1024;
const DEFAULT_COMPILE_TIMEOUT_MS = 30_000;
const MAX_CACHE_ENTRIES = 120;

export function parseTimeoutEnv(raw: string | undefined, fallback = DEFAULT_COMPILE_TIMEOUT_MS): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1000 ? n : fallback;
}

/** Blocks path traversal or absolute filesystem includes such as `#include "/etc/passwd"`. */
export function validateSketchSafety(sketch: string): void {
  if (typeof sketch !== 'string' || sketch.trim().length === 0) {
    throw new CompileError('Sketch is empty', 'Sketch cannot be empty', 400);
  }
  if (Buffer.byteLength(sketch, 'utf8') > MAX_SKETCH_BYTES) {
    throw new CompileError(
      `Sketch exceeds maximum size of ${MAX_SKETCH_BYTES} bytes`,
      'Sketch too large',
      413
    );
  }
  const dangerousInclude = /#\s*include\s*[<"]\s*(?:\/|\.\.)/;
  if (dangerousInclude.test(sketch)) {
    throw new CompileError(
      'Disallowed #include path (absolute or parent-relative paths are blocked)',
      'Security policy blocked #include path',
      400
    );
  }
}

export function parseCompilerDiagnostics(logs: string): CompileDiagnostic[] {
  const results: CompileDiagnostic[] = [];
  const pattern = /(?:sketch\.(?:ino|cpp)):(\d+):(?:(\d+):)?\s*(?:fatal\s+)?(?:error|warning):\s*(.+)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(logs)) !== null) {
    results.push({
      line: Number(match[1]),
      column: match[2] ? Number(match[2]) : undefined,
      message: match[3].trim(),
    });
  }
  return results;
}

function getArduinoCliBinary(): string {
  if (process.env.ARDUINO_CLI_BIN) return process.env.ARDUINO_CLI_BIN;
  const localBin = join(homedir(), '.local', 'bin', 'arduino-cli');
  if (existsSync(localBin)) return localBin;
  return 'arduino-cli';
}

export class CompilerService {
  private cache = new Map<string, { hex: string; logs: string }>();
  private cliAvailable: Promise<boolean> | null = null;
  private arduinoCliBin: string;
  private readonly compileTimeoutMs: number;

  constructor(opts: CompilerServiceOptions = {}) {
    this.arduinoCliBin = getArduinoCliBinary();
    this.compileTimeoutMs =
      opts.compileTimeoutMs ?? parseTimeoutEnv(process.env.COMPILE_TIMEOUT_MS, DEFAULT_COMPILE_TIMEOUT_MS);
  }

  async resolveEngine(): Promise<'arduino-cli'> {
    if (!this.cliAvailable) {
      this.cliAvailable = execFileAsync(this.arduinoCliBin, ['version'], { timeout: 3000 })
        .then(() => true)
        .catch(() => false);
    }

    if (!(await this.cliAvailable)) {
      throw new CompileError(
        'arduino-cli not found (install arduino-cli and arduino:avr core)',
        'Compiler toolchain missing',
        503
      );
    }
    return 'arduino-cli';
  }

  async compile(board: BoardId, sketch: string): Promise<CompileResult> {
    validateSketchSafety(sketch);

    const spec = BOARD_SPECS[board];
    const hash = createHash('sha256').update(`${board}\0${sketch}`).digest('hex');
    const cached = this.cache.get(hash);
    if (cached) {
      return {
        hex: cached.hex,
        cached: true,
        engine: 'arduino-cli',
        durationMs: 0,
        logs: cached.logs,
      };
    }

    const engine = await this.resolveEngine();
    const start = Date.now();
    const compiled = await this.compileWithArduinoCli(spec.fqbn, sketch);

    if (this.cache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(hash, compiled);

    return {
      hex: compiled.hex,
      cached: false,
      engine,
      durationMs: Date.now() - start,
      logs: compiled.logs,
    };
  }

  private async compileWithArduinoCli(fqbn: string, sketch: string): Promise<{ hex: string; logs: string }> {
    const workDir = await mkdtemp(join(tmpdir(), 'ardusim-cli-'));
    const sketchDir = join(workDir, 'sketch');
    const buildDir = join(workDir, 'build');
    try {
      await mkdir(sketchDir, { recursive: true });
      await mkdir(buildDir, { recursive: true });
      await writeFile(join(sketchDir, 'sketch.ino'), sketch, 'utf8');

      const { stdout, stderr } = await execFileAsync(
        this.arduinoCliBin,
        ['compile', '--fqbn', fqbn, '--output-dir', buildDir, sketchDir],
        { timeout: this.compileTimeoutMs, maxBuffer: 2 * 1024 * 1024 }
      );
      const hex = await readFile(join(buildDir, 'sketch.ino.hex'), 'utf8');
      return { hex, logs: `${stdout}\n${stderr}`.trim() };
    } catch (err: unknown) {
      const e = err as {
        stdout?: string;
        stderr?: string;
        message?: string;
        killed?: boolean;
        signal?: string;
        code?: string | number;
      };
      const logs = [e.stdout, e.stderr, e.message].filter(Boolean).join('\n').trim();
      if (e.killed === true || e.signal === 'SIGTERM' || e.code === 'ETIMEDOUT') {
        throw new CompileError('Compilation timed out. Please retry.', logs, 504);
      }
      throw new CompileError('Compilation failed', logs, 400);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }
}
