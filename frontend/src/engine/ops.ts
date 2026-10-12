export type PathKey = string | number | { id: string };
export type Op =
  | { op: 'set'; path: PathKey[]; value?: unknown }
  | { op: 'ins'; path: PathKey[]; index?: number; value: unknown }
  | { op: 'del'; path: PathKey[]; id?: string; index?: number }
  | { op: 'move'; path: PathKey[]; id?: string; from?: number; index: number };

export class OpError extends Error {}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const clone = <T>(v: T): T => (v === undefined ? v : structuredClone(v));

function findById(list: unknown[], id: string): unknown {
  for (const x of list) if (isObj(x) && x.id === id) return x;
  for (const x of list) {
    if (isObj(x) && Array.isArray(x.children)) {
      const inner = findById(x.children, id);
      if (inner !== undefined) return inner;
    }
  }
  return undefined;
}

function step(node: unknown, key: PathKey): unknown {
  if (typeof key === 'object') {
    if (!Array.isArray(node)) throw new OpError(`id step ${key.id} on a non-list`);
    const found = findById(node, key.id);
    if (found === undefined) throw new OpError(`no item with id ${key.id}`);
    return found;
  }
  if (Array.isArray(node)) {
    if (typeof key !== 'number' || key < -node.length || key >= node.length) throw new OpError(`index ${key} out of range`);
    return node[key < 0 ? node.length + key : key];
  }
  if (isObj(node)) {
    if (!(String(key) in node)) throw new OpError(`no key ${key}`);
    return node[String(key)];
  }
  throw new OpError('cannot step into a value');
}

export function resolvePath(doc: unknown, path: PathKey[]): unknown {
  let n = doc;
  for (const k of path) n = step(n, k);
  return n;
}

function indexOf(list: unknown[], id: string | undefined, index: number | undefined): number {
  if (id !== undefined) {
    const i = list.findIndex((x) => isObj(x) && x.id === id);
    if (i < 0) throw new OpError(`no item with id ${id}`);
    return i;
  }
  if (typeof index !== 'number' || index < 0 || index >= list.length) throw new OpError(`index ${index} out of range`);
  return index;
}

export function applyOp(doc: unknown, op: Op): Op {
  const path = op.path ?? [];
  if (op.op === 'set') {
    if (!path.length) throw new OpError('set needs a path');
    const parent = resolvePath(doc, path.slice(0, -1));
    const key = path[path.length - 1];
    const has = 'value' in op;
    if (typeof key === 'object') {
      if (!Array.isArray(parent)) throw new OpError('id key on a non-list');
      if (!has) throw new OpError('cannot unset a list item, use del');
      const i = indexOf(parent, key.id, undefined);
      const old = parent[i];
      parent[i] = clone(op.value);
      return { op: 'set', path: [...path.slice(0, -1), i], value: old };
    }
    if (Array.isArray(parent)) {
      if (typeof key !== 'number' || key < 0 || key >= parent.length) throw new OpError(`index ${key} out of range`);
      const old = parent[key];
      parent[key] = clone(op.value);
      return { op: 'set', path, value: old };
    }
    if (!isObj(parent)) throw new OpError('set on a non-container');
    const k = String(key);
    const had = k in parent;
    const old = parent[k];
    if (has) parent[k] = clone(op.value);
    else delete parent[k];
    return had ? { op: 'set', path, value: old } : { op: 'set', path };
  }
  if (op.op === 'ins') {
    const list = resolvePath(doc, path);
    if (!Array.isArray(list)) throw new OpError('ins into a non-list');
    const i = op.index ?? list.length;
    if (i < 0 || i > list.length) throw new OpError(`index ${i} out of range`);
    const value = clone(op.value);
    if (isObj(value) && typeof value.id === 'string' && list.some((x) => isObj(x) && x.id === value.id)) throw new OpError(`id ${value.id} already present`);
    list.splice(i, 0, value);
    return isObj(value) && typeof value.id === 'string' ? { op: 'del', path, id: value.id } : { op: 'del', path, index: i };
  }
  if (op.op === 'del') {
    const list = resolvePath(doc, path);
    if (!Array.isArray(list)) throw new OpError('del from a non-list');
    const i = indexOf(list, op.id, op.index);
    const [removed] = list.splice(i, 1);
    return { op: 'ins', path, index: i, value: removed };
  }
  if (op.op === 'move') {
    const list = resolvePath(doc, path);
    if (!Array.isArray(list)) throw new OpError('move in a non-list');
    const i = indexOf(list, op.id, op.from);
    if (op.index < 0 || op.index >= list.length) throw new OpError(`index ${op.index} out of range`);
    const [item] = list.splice(i, 1);
    list.splice(op.index, 0, item);
    return isObj(item) && typeof item.id === 'string' ? { op: 'move', path, id: item.id, index: i } : { op: 'move', path, from: op.index, index: i };
  }
  throw new OpError('unknown op');
}

export function applyAll(doc: unknown, ops: Op[]): Op[] {
  const inv: Op[] = [];
  try {
    for (const op of ops) inv.push(applyOp(doc, op));
  } catch (e) {
    for (let i = inv.length - 1; i >= 0; i--) applyOp(doc, inv[i]);
    throw e;
  }
  return inv.reverse();
}

export interface Touched {
  slides: Set<string>; order: boolean; layouts: boolean; masters: boolean; theme: boolean; meta: boolean; comments: boolean; sections: boolean; media: boolean; size: boolean; title: boolean; all: boolean;
  elements: Map<string, Set<string>>;
}

export function touched(ops: Op[]): Touched {
  const t: Touched = { slides: new Set(), order: false, layouts: false, masters: false, theme: false, meta: false, comments: false, sections: false, media: false, size: false, title: false, all: false, elements: new Map() };
  for (const op of ops) {
    const p = op.path ?? [];
    const head = p[0];
    if (head === 'slides') {
      if (p.length === 1) {
        t.order = true;
        const v = (op as { value?: unknown }).value;
        if (isObj(v) && typeof v.id === 'string') t.slides.add(v.id);
        if (op.op === 'del' && op.id) t.slides.add(op.id);
        if (op.op === 'set') t.all = true;
      } else if (typeof p[1] === 'object') {
        const sid = (p[1] as { id: string }).id;
        t.slides.add(sid);
        if (p[2] === 'elements' && p.length >= 4 && typeof p[3] === 'object') {
          const set = t.elements.get(sid) ?? new Set<string>();
          set.add((p[3] as { id: string }).id);
          t.elements.set(sid, set);
        } else if (p[2] === 'elements') {
          const set = t.elements.get(sid) ?? new Set<string>();
          set.add('*');
          t.elements.set(sid, set);
        }
      } else t.all = true;
    } else if (head === 'layouts') t.layouts = true;
    else if (head === 'masters') t.masters = true;
    else if (head === 'theme') t.theme = true;
    else if (head === 'meta') t.meta = true;
    else if (head === 'comments') t.comments = true;
    else if (head === 'sections') t.sections = true;
    else if (head === 'macros') t.meta = true;
    else if (head === 'media') t.media = true;
    else if (head === 'size') t.size = true;
    else if (head === 'title') t.title = true;
    else t.all = true;
  }
  return t;
}

export type HolderList = 'slides' | 'layouts' | 'masters';
let holderList: ((id: string) => HolderList) | null = null;
export function setHolderResolver(fn: ((id: string) => HolderList) | null): void { holderList = fn; }
export const slidePath = (sid: string): PathKey[] => [holderList?.(sid) ?? 'slides', { id: sid }];
export const elPath = (sid: string, eid: string): PathKey[] => [...slidePath(sid), 'elements', { id: eid }];
