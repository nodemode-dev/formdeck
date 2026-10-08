import type { Comment, Deck } from '../engine/model';
import { api } from '../io/api';
import { el, escapeHtml, patchList, setClass, setText } from '../ui/dom';
import { icon } from '../ui/icons';

const agents = new Set<string>();
let me = '';
let loading: Promise<void> | null = null;

export function loadMe(): Promise<void> {
  loading ??= api.settings().then((s) => { if (typeof s.author === 'string') me = s.author.trim(); }).catch(() => { loading = null; });
  return loading;
}

export const myName = (): string => me || 'You';
export const isAgentName = (name: string): boolean => agents.has(name);
export function addAgents(names: unknown): void {
  if (Array.isArray(names)) for (const n of names) if (typeof n === 'string' && n.trim()) agents.add(n.trim());
}

export function people(deck: Deck | null | undefined): string[] {
  const out: string[] = [];
  const add = (n?: string): void => { const t = (n ?? '').trim(); if (t && t !== 'You' && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t); };
  add(me);
  for (const c of deck?.comments ?? []) {
    add(c.author);
    for (const r of c.replies ?? []) add(r.author);
    for (const m of c.mentions ?? []) add(m);
    add(c.assignee);
  }
  for (const a of agents) add(a);
  return out;
}

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function mentionRe(names: string[]): RegExp | null {
  const list = [...new Set(names)].filter(Boolean).sort((a, b) => b.length - a.length);
  return list.length ? new RegExp(`(^|[^\\w@])@(${list.map(esc).join('|')})(?![\\w])`, 'gi') : null;
}

export function findMentions(text: string, names: string[]): string[] {
  const re = mentionRe(names);
  if (!re) return [];
  const out: string[] = [];
  for (const m of text.matchAll(re)) {
    const hit = names.find((n) => n.toLowerCase() === m[2].toLowerCase()) ?? m[2];
    if (!out.includes(hit)) out.push(hit);
  }
  return out;
}

export function mentionsMe(c: Comment, name = myName()): boolean {
  const low = name.toLowerCase();
  return [...(c.mentions ?? []), ...(c.replies ?? []).flatMap((r) => r.mentions ?? [])].some((m) => m.toLowerCase() === low);
}

export function renderMentions(node: Element | null, text: string, names: string[] = []): void {
  if (!node) return;
  const sig = `${text}\u0000${names.join('\u0001')}`;
  const host = node as HTMLElement;
  if (host.dataset.sig === sig) return;
  host.dataset.sig = sig;
  const re = mentionRe(names);
  if (!re) { setText(host, text); return; }
  let html = '', at = 0;
  for (const m of text.matchAll(re)) {
    const start = (m.index ?? 0) + m[1].length;
    html += escapeHtml(text.slice(at, start)) + `<span class="fs-mention">@${escapeHtml(m[2])}</span>`;
    at = start + 1 + m[2].length;
  }
  host.innerHTML = html + escapeHtml(text.slice(at));
}

type Field = HTMLInputElement | HTMLTextAreaElement;

class MentionPop {
  readonly pop = el('<div class="fs-dd-pop fs-mention-pop" role="listbox" hidden><div class="fs-dd-list"></div></div>');
  private readonly list = this.pop.firstElementChild as HTMLElement;
  private field: Field | null = null;
  private names: string[] = [];
  private pick = 0;
  private start = -1;

  constructor() {
    (document.getElementById('overlay-root') ?? document.body).appendChild(this.pop);
    this.pop.addEventListener('pointerdown', (e) => e.preventDefault());
    this.pop.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-name]');
      if (b) this.insert(b.dataset.name as string);
    });
  }

  get open(): boolean { return !this.pop.hidden; }

  update(field: Field, all: string[]): void {
    const caret = field.selectionStart ?? field.value.length;
    const before = field.value.slice(0, caret);
    const at = before.lastIndexOf('@');
    const query = at >= 0 ? before.slice(at + 1) : '';
    if (at < 0 || (at > 0 && /[\w@]/.test(before[at - 1])) || query.length > 40 || /\n/.test(query)) { this.hide(); return; }
    const q = query.toLowerCase();
    const names = all.filter((n) => { const l = n.toLowerCase(); return l.startsWith(q) || l.split(/\s+/).some((w) => w.startsWith(q)); }).slice(0, 8);
    if (!names.length || (names.length === 1 && names[0].toLowerCase() === q)) { this.hide(); return; }
    this.field = field;
    this.start = at;
    if (names.join('\u0001') !== this.names.join('\u0001')) this.pick = 0;
    this.names = names;
    patchList(this.list, names, {
      key: (n) => n,
      create: (n) => {
        const b = el(`<button class="fs-dd-item fs-mention-item" type="button" role="option"><span class="fs-mention-avatar">${agents.has(n) ? icon('agent', 12) : escapeHtml(n.slice(0, 1).toUpperCase())}</span><span class="fs-mention-name"></span><span class="fs-mention-tag">${agents.has(n) ? 'Agent' : ''}</span></button>`);
        b.dataset.name = n;
        setText(b.querySelector('.fs-mention-name'), n);
        return b;
      },
      update: () => undefined,
    });
    this.mark();
    const r = field.getBoundingClientRect();
    const w = Math.max(200, Math.min(280, r.width));
    const h = 8 + names.length * 30 + 8;
    const below = r.bottom + 4 + h < window.innerHeight;
    const left = `${Math.round(Math.min(r.left, window.innerWidth - w - 8))}px`, top = `${Math.round(below ? r.bottom + 4 : r.top - 4 - h)}px`;
    if (this.pop.style.left !== left) this.pop.style.left = left;
    if (this.pop.style.top !== top) this.pop.style.top = top;
    this.pop.style.width = `${w}px`;
    this.pop.hidden = false;
  }

  private mark(): void {
    Array.from(this.list.children).forEach((b, i) => setClass(b as HTMLElement, 'is-picked', i === this.pick));
  }

  key(e: KeyboardEvent): boolean {
    if (!this.open) return false;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      this.pick = (this.pick + (e.key === 'ArrowDown' ? 1 : -1) + this.names.length) % this.names.length;
      this.mark();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      this.insert(this.names[this.pick]);
    } else if (e.key === 'Escape') {
      this.hide();
    } else return false;
    e.preventDefault();
    e.stopImmediatePropagation();
    return true;
  }

  private insert(name: string | undefined): void {
    const f = this.field;
    if (!f || !name || this.start < 0) { this.hide(); return; }
    const caret = f.selectionStart ?? f.value.length;
    const text = `@${name} `;
    f.value = f.value.slice(0, this.start) + text + f.value.slice(caret);
    const pos = this.start + text.length;
    f.setSelectionRange(pos, pos);
    this.hide();
    f.focus();
    f.dispatchEvent(new Event('input', { bubbles: true }));
  }

  hide(): void {
    if (!this.pop.hidden) this.pop.hidden = true;
    this.start = -1;
  }
}

let pop: MentionPop | null = null;

export function attachMentions(field: Field, names: () => string[]): void {
  field.addEventListener('keydown', (e: Event) => { pop?.key(e as KeyboardEvent); }, { capture: true });
  const sync = (): void => { pop ??= new MentionPop(); pop.update(field, names()); };
  field.addEventListener('input', sync);
  field.addEventListener('click', () => { if (pop?.open) sync(); });
  field.addEventListener('blur', () => pop?.hide());
}
