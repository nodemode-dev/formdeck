import type { Op, PathKey } from '../engine/ops';

export const MAX_MACRO_OPS = 20000;
const KINDS = new Set(['set', 'ins', 'del', 'move']);
const LOCKED_ROOTS = new Set(['macros', 'id', 'format', 'formatVersion']);

const plain = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function pathError(path: unknown): string | null {
  if (!Array.isArray(path)) return 'path must be an array';
  for (const k of path) {
    const ok = typeof k === 'string' || (typeof k === 'number' && Number.isInteger(k)) || (plain(k) && typeof k.id === 'string' && Object.keys(k).length === 1);
    if (!ok) return 'path steps must be a string, an integer or { id }';
  }
  return null;
}

export function opError(op: unknown): string | null {
  if (!plain(op)) return 'an op must be an object';
  if (typeof op.op !== 'string' || !KINDS.has(op.op)) return 'op must be one of set, ins, del, move';
  const bad = pathError(op.path);
  if (bad) return bad;
  const path = op.path as PathKey[];
  if (typeof path[0] === 'string' && LOCKED_ROOTS.has(path[0])) return `macros may not change ${path[0]}`;
  if ((op.op === 'set' || op.op === 'ins') && path.length === 0) return 'path may not be empty';
  if (op.op === 'ins' && !('value' in op)) return 'ins needs a value';
  if (op.op === 'move' && typeof op.index !== 'number') return 'move needs an index';
  return null;
}

export function validateOps(raw: unknown): Op[] {
  if (!Array.isArray(raw)) throw new Error('ops must be an array');
  if (raw.length > MAX_MACRO_OPS) throw new Error(`a macro may queue at most ${MAX_MACRO_OPS} ops`);
  raw.forEach((op, i) => {
    const bad = opError(op);
    if (bad) throw new Error(`invalid op at index ${i}: ${bad}`);
  });
  return raw as Op[];
}
