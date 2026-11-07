import type { Para, Run } from '../../../frontend/src/engine/model';

const INLINE = /(\*\*(?<b>.+?)\*\*|__(?<b2>.+?)__|\*(?<i>[^*]+?)\*|_(?<i2>[^_]+?)_|`(?<c>[^`]+)`|\[(?<lt>[^\]]+)\]\((?<lu>[^)\s]+)\)|~~(?<s>.+?)~~)/g;
const LIST_MARK = /^\s*([-*+]|\d+[.)])\s+/;

export type Item = string | Item[] | { text?: string; title?: string; children?: Item[] };

export function runs(text: string, base: Partial<Run> = {}): Run[] {
  const out: Run[] = [];
  const s = String(text ?? '');
  let pos = 0;
  for (const m of s.matchAll(INLINE)) {
    const at = m.index ?? 0;
    const g = m.groups ?? {};
    if (at > pos) out.push({ ...base, t: s.slice(pos, at) });
    if (g.b || g.b2) out.push({ ...base, t: g.b || g.b2, b: true });
    else if (g.i || g.i2) out.push({ ...base, t: g.i || g.i2, i: true });
    else if (g.c) out.push({ ...base, t: g.c, font: 'JetBrains Mono' });
    else if (g.lt) out.push({ ...base, t: g.lt, link: { url: g.lu }, u: true, color: 'hlink' });
    else if (g.s) out.push({ ...base, t: g.s, s: true });
    pos = at + m[0].length;
  }
  if (pos < s.length || !out.length) out.push({ ...base, t: s.slice(pos) });
  return out.filter((r) => r.t !== '' || out.length === 1);
}

export function para(text: string, extra: Partial<Para> = {}): Para {
  const p: Para = { runs: runs(text) };
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== null) (p as unknown as Record<string, unknown>)[k] = v;
  return p;
}

function indentOf(line: string): number {
  const lead = /^[ \t]*/.exec(line)?.[0].length ?? 0;
  return Math.floor(lead / 2);
}

const stripMarker = (line: string): string => line.replace(LIST_MARK, '');

export function bulletParas(items: Item | Item[] | undefined, indents?: number[], level = 0): Para[] {
  const out: Para[] = [];
  const list: Item[] = typeof items === 'string' ? [items] : (items as Item[]) ?? [];
  list.forEach((item, n) => {
    if (Array.isArray(item)) {
      out.push(...bulletParas(item, undefined, level + 1));
      return;
    }
    if (item && typeof item === 'object') {
      out.push(para(String(item.text || item.title || ''), { lvl: level || undefined }));
      if (item.children) out.push(...bulletParas(item.children, undefined, level + 1));
      return;
    }
    const lvl = Math.min(8, (indents ? indents[n] : 0) + level);
    out.push(para(String(item), { lvl: lvl || undefined }));
  });
  return out;
}

export function plainParas(text: string): Para[] {
  const blocks = String(text ?? '').trim().split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  const out: Para[] = [];
  for (const b of blocks) {
    const lines = b.split('\n');
    if (lines.every((ln) => LIST_MARK.test(ln))) out.push(...bulletParas(lines.map(stripMarker), lines.map(indentOf)));
    else out.push(para(lines.map((ln) => ln.trim()).join(' '), { bullet: { type: 'none' } }));
  }
  return out;
}

export function single(text: string): Para[] {
  const lines = String(text ?? '').split('\n');
  const rs: Run[] = [];
  lines.forEach((ln, i) => {
    if (i) rs.push({ t: '\n' });
    rs.push(...runs(ln));
  });
  return [{ runs: rs.length ? rs : [{ t: '' }] }];
}

export const charCount = (paras: Para[]): number => paras.reduce((n, p) => n + p.runs.reduce((m, r) => m + (r.t?.length ?? 0), 0), 0);
