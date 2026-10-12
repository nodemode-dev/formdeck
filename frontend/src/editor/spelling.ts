import type nspellType from 'nspell';
import { elPath, slidePath, type Op, type PathKey } from '../engine/ops';
import type { Deck, Para, Run, SlideElement, TextBody } from '../engine/model';
import { api } from '../io/api';
import type { Editor } from './editor';

type Speller = ReturnType<typeof nspellType>;
export type DictId = 'en' | 'en-gb' | 'es' | 'fr';
export interface Language { tag: string; label: string }

export const DEFAULT_LANGUAGE = 'en-US';

export const LANGUAGES: Language[] = [
  { tag: 'en-US', label: 'English (United States)' },
  { tag: 'en-GB', label: 'English (United Kingdom)' },
  { tag: 'en-AU', label: 'English (Australia)' },
  { tag: 'en-CA', label: 'English (Canada)' },
  { tag: 'es-ES', label: 'Spanish (Spain)' },
  { tag: 'es-MX', label: 'Spanish (Mexico)' },
  { tag: 'fr-FR', label: 'French (France)' },
  { tag: 'fr-CA', label: 'French (Canada)' },
  { tag: 'de-DE', label: 'German (Germany)' },
  { tag: 'de-AT', label: 'German (Austria)' },
  { tag: 'de-CH', label: 'German (Switzerland)' },
];

const FILES: Record<DictId, [string, string]> = {
  'en': [new URL('../../node_modules/dictionary-en/index.aff', import.meta.url).href, new URL('../../node_modules/dictionary-en/index.dic', import.meta.url).href],
  'en-gb': [new URL('../../node_modules/dictionary-en-gb/index.aff', import.meta.url).href, new URL('../../node_modules/dictionary-en-gb/index.dic', import.meta.url).href],
  'es': [new URL('../../node_modules/dictionary-es/index.aff', import.meta.url).href, new URL('../../node_modules/dictionary-es/index.dic', import.meta.url).href],
  'fr': [new URL('../../node_modules/dictionary-fr/index.aff', import.meta.url).href, new URL('../../node_modules/dictionary-fr/index.dic', import.meta.url).href],
};

export function dictFor(tag: string): DictId | null {
  const t = tag.toLowerCase();
  if (t === 'en' || t.startsWith('en-')) return /^en-(gb|au|nz|za|ie|in)\b/.test(t) ? 'en-gb' : 'en';
  if (t === 'es' || t.startsWith('es-')) return 'es';
  if (t === 'fr' || t.startsWith('fr-')) return 'fr';
  return null;
}

export function languageLabel(tag: string): string {
  return LANGUAGES.find((l) => l.tag.toLowerCase() === tag.toLowerCase())?.label ?? tag;
}

const spellers = new Map<DictId, Promise<Speller>>();
const custom = new Set<string>();
let customList: string[] = [];
let defaultLang = DEFAULT_LANGUAGE;
let settingsLoaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

async function fetchText(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`dictionary ${r.status}`);
  return r.text();
}

export function speller(id: DictId): Promise<Speller> {
  let p = spellers.get(id);
  if (!p) {
    const [aff, dic] = FILES[id];
    p = Promise.all([import('nspell'), fetchText(aff), fetchText(dic)]).then(([mod, a, d]) => mod.default(a, d));
    p.catch(() => spellers.delete(id));
    spellers.set(id, p);
  }
  return p;
}

export function loadProofing(): Promise<void> {
  settingsLoaded ??= api.settings().then((s) => {
    const words = Array.isArray(s.dictionary) ? s.dictionary.filter((w): w is string => typeof w === 'string' && !!w.trim()) : [];
    customList = words;
    custom.clear();
    for (const w of words) custom.add(w.toLowerCase());
    if (typeof s.proofingLanguage === 'string' && s.proofingLanguage) defaultLang = s.proofingLanguage;
  }).catch(() => undefined);
  return settingsLoaded;
}

export const defaultLanguage = (): string => defaultLang;
export const customWords = (): string[] => [...customList];
export function onProofingChange(fn: () => void): () => void { listeners.add(fn); return () => { listeners.delete(fn); }; }

export async function setDefaultLanguage(tag: string): Promise<void> {
  await loadProofing();
  defaultLang = tag;
  listeners.forEach((f) => f());
  await api.setSettings({ proofingLanguage: tag });
}

export async function addToDictionary(word: string): Promise<void> {
  await loadProofing();
  const w = word.trim();
  if (!w || custom.has(w.toLowerCase())) return;
  custom.add(w.toLowerCase());
  customList = [...customList, w];
  listeners.forEach((f) => f());
  await api.setSettings({ dictionary: customList });
}

export async function removeFromDictionary(word: string): Promise<void> {
  await loadProofing();
  const lower = word.toLowerCase();
  custom.delete(lower);
  customList = customList.filter((w) => w.toLowerCase() !== lower);
  listeners.forEach((f) => f());
  await api.setSettings({ dictionary: customList });
}

const MASK = /[^\s@]+@[^\s@]+\.[^\s@]+|(?:https?:\/\/|www\.)\S+/g;
const WORD = /[\p{L}\p{M}]+(?:['’ʼ-][\p{L}\p{M}]+)*/gu;

export interface Token { word: string; start: number; end: number }

export function tokenize(text: string): Token[] {
  const masked = text.replace(MASK, (m) => ' '.repeat(m.length));
  const out: Token[] = [];
  for (const m of masked.matchAll(WORD)) {
    const start = m.index ?? 0;
    const word = m[0];
    const end = start + word.length;
    if (word.length < 2) continue;
    if (/[0-9_]/.test(masked[start - 1] ?? '') || /[0-9_]/.test(masked[end] ?? '')) continue;
    if (word === word.toUpperCase() && word !== word.toLowerCase()) continue;
    if (/\p{Ll}\p{Lu}/u.test(word)) continue;
    out.push({ word, start, end });
  }
  return out;
}

const norm = (w: string): string => w.replace(/[’ʼ]/g, "'");

export function isCorrect(sp: Speller, word: string): boolean {
  const w = norm(word);
  if (custom.has(w.toLowerCase())) return true;
  if (sp.correct(w)) return true;
  if (w.includes('-')) return w.split('-').every((part) => part.length < 2 || custom.has(part.toLowerCase()) || sp.correct(part));
  return false;
}

export async function suggestions(word: string, tag: string): Promise<string[]> {
  const id = dictFor(tag);
  if (!id) return [];
  const sp = await speller(id);
  const w = norm(word).toLowerCase();
  const swapped = (s: string): boolean => {
    const x = s.toLowerCase();
    if (x.length !== w.length) return false;
    const d = [...w].map((c, i) => (c === x[i] ? -1 : i)).filter((i) => i >= 0);
    return d.length === 2 && d[1] === d[0] + 1 && w[d[0]] === x[d[1]] && w[d[1]] === x[d[0]];
  };
  const list = sp.suggest(norm(word));
  return [...list.filter(swapped), ...list.filter((s) => !swapped(s))].slice(0, 8);
}

export interface Hit {
  key: string; slide: string; el: string; kind: 'shape' | 'cell' | 'notes'; row: number; col: number;
  para: number; start: number; end: number; word: string; lang: string; text: string;
}

interface Span { run: number; from: number; to: number; lang: string; skip: boolean }

function flatten(p: Para, def: string): { text: string; spans: Span[] } {
  let text = '';
  const spans: Span[] = [];
  p.runs.forEach((r, i) => {
    const from = text.length;
    if (r.math) text += ' ';
    else text += r.t;
    spans.push({ run: i, from, to: text.length, lang: r.lang || def, skip: !!r.math || r.t === '\n' || !!r.noProof });
  });
  return { text, spans };
}

interface Unit { slide: string; el: string; kind: Hit['kind']; row: number; col: number; paras: Para[] }

function bodyUnits(sid: string, eid: string, kind: Hit['kind'], row: number, col: number, body: TextBody | undefined, out: Unit[]): void {
  if (body?.paras.length) out.push({ slide: sid, el: eid, kind, row, col, paras: body.paras });
}

function elementUnits(sid: string, e: SlideElement, out: Unit[]): void {
  if (e.type === 'shape') bodyUnits(sid, e.id, 'shape', 0, 0, e.text, out);
  else if (e.type === 'table') e.table.rows.forEach((row, r) => row.cells.forEach((c, k) => { if (!c.merged) bodyUnits(sid, e.id, 'cell', r, k, c.text, out); }));
  else if (e.type === 'group') e.children.forEach((c) => elementUnits(sid, c, out));
}

export async function scan(deck: Deck, fromSlide: string, ignoreAll: Set<string>, ignoreOnce: Set<string>): Promise<Hit[]> {
  await loadProofing();
  const def = defaultLang;
  const n = deck.slides.length;
  const first = Math.max(0, deck.slides.findIndex((s) => s.id === fromSlide));
  const units: Unit[] = [];
  for (let k = 0; k < n; k++) {
    const s = deck.slides[(first + k) % n];
    s.elements.forEach((e) => elementUnits(s.id, e, units));
    if (s.notes) {
      units.push({ slide: s.id, el: '', kind: 'notes', row: 0, col: 0, paras: s.notes.split('\n').map((t) => ({ runs: [{ t }] })) });
    }
  }
  const need = new Set<DictId>();
  const flats = units.map((u) => u.paras.map((p) => flatten(p, def)));
  for (const f of flats) for (const p of f) for (const sp of p.spans) { if (!sp.skip) { const id = dictFor(sp.lang); if (id) need.add(id); } }
  const loaded = new Map<DictId, Speller>();
  await Promise.all([...need].map(async (id) => { try { loaded.set(id, await speller(id)); } catch { return; } }));
  const hits: Hit[] = [];
  units.forEach((u, ui) => {
    flats[ui].forEach((fp, pi) => {
      for (const t of tokenize(fp.text)) {
        const sp = fp.spans.find((s) => t.start >= s.from && t.start < s.to);
        if (!sp || sp.skip) continue;
        const id = dictFor(sp.lang);
        const dict = id ? loaded.get(id) : undefined;
        if (!dict || isCorrect(dict, t.word)) continue;
        if (ignoreAll.has(t.word.toLowerCase())) continue;
        const key = `${u.slide}|${u.el}|${u.kind}|${u.row}|${u.col}|${pi}|${t.start}|${t.word}`;
        if (ignoreOnce.has(key)) continue;
        hits.push({ key, slide: u.slide, el: u.el, kind: u.kind, row: u.row, col: u.col, para: pi, start: t.start, end: t.end, word: t.word, lang: sp.lang, text: fp.text });
      }
    });
  });
  return hits;
}

export function matchCase(original: string, replacement: string): string {
  if (original.length > 1 && original === original.toUpperCase() && original !== original.toLowerCase()) return replacement.toUpperCase();
  const f = original[0];
  if (f && f === f.toUpperCase() && f !== f.toLowerCase() && replacement[0] === replacement[0]?.toLowerCase()) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}

export function replaceInPara(p: Para, start: number, end: number, repl: string): Para {
  const runs: Run[] = p.runs.map((r) => ({ ...r }));
  let pos = 0;
  let placed = false;
  for (const r of runs) {
    const len = r.math ? 1 : r.t.length;
    const a = Math.max(start, pos);
    const b = Math.min(end, pos + len);
    if (!r.math && a < b) {
      r.t = r.t.slice(0, a - pos) + (placed ? '' : repl) + r.t.slice(b - pos);
      placed = true;
    }
    pos += len;
  }
  const kept = runs.filter((r) => r.math || r.t !== '');
  return { ...p, runs: kept.length ? kept : [{ ...runs[0], t: '' }] };
}

export function applyChange(ed: Editor, hits: Hit[], pick: (h: Hit) => string, label: string): boolean {
  const groups = new Map<string, Hit[]>();
  for (const h of hits) {
    const k = `${h.slide}|${h.el}|${h.kind}|${h.row}|${h.col}`;
    const g = groups.get(k);
    if (g) g.push(h); else groups.set(k, [h]);
  }
  const ops: Op[] = [];
  for (const g of groups.values()) {
    const h0 = g[0];
    const ordered = [...g].sort((a, b) => b.para - a.para || b.start - a.start);
    if (h0.kind === 'notes') {
      const slide = ed.doc.slide(h0.slide);
      if (!slide?.notes) continue;
      const lines = slide.notes.split('\n').map((t): Para => ({ runs: [{ t }] }));
      for (const h of ordered) lines[h.para] = replaceInPara(lines[h.para], h.start, h.end, pick(h));
      ops.push({ op: 'set', path: [...slidePath(h0.slide), 'notes'], value: lines.map((l) => l.runs.map((r) => r.t).join('')).join('\n') });
      continue;
    }
    const el = ed.doc.element(h0.slide, h0.el);
    let paras: Para[] | undefined;
    let path: PathKey[] = elPath(h0.slide, h0.el);
    if (el?.type === 'shape') { paras = el.text?.paras; path = [...path, 'text', 'paras']; }
    else if (el?.type === 'table') { paras = el.table.rows[h0.row]?.cells[h0.col]?.text.paras; path = [...path, 'table', 'rows', h0.row, 'cells', h0.col, 'text', 'paras']; }
    if (!paras) continue;
    const next = paras.map((p) => p);
    for (const h of ordered) {
      if (!next[h.para]) continue;
      next[h.para] = replaceInPara(next[h.para], h.start, h.end, pick(h));
    }
    ops.push({ op: 'set', path, value: next });
  }
  return ops.length ? ed.apply(ops, label) : false;
}
