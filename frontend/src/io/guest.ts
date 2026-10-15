import { DeckDoc } from '../engine/doc';
import type { Op } from '../engine/ops';

export type GuestRole = 'view' | 'comment' | 'edit';
export interface Guest { role: GuestRole; deck: string }

let current: Guest | null = null;
let lastNotice = 0;

export const guest = (): Guest | null => current;

const NAME_KEY = 'formdeck_guest_name';

export function guestName(): string {
  try { return (localStorage.getItem(NAME_KEY) ?? '').trim().slice(0, 40); } catch { return ''; }
}

export function setGuestName(name: string): void {
  try { localStorage.setItem(NAME_KEY, name.trim().slice(0, 40)); } catch { void 0; }
}

const ROLE_TEXT: Record<GuestRole, string> = {
  view: 'View only: this share link cannot change the deck.',
  comment: 'Comments only: this share link can add and reply to comments.',
  edit: '',
};

export async function detectGuest(notice: (text: string) => void): Promise<Guest | null> {
  try {
    const r = await fetch('/api/share/me', { cache: 'no-store' });
    const j = r.ok ? await r.json() as { guest?: boolean; role?: GuestRole; deck?: string } : {};
    if (j.guest && j.role && j.deck) current = { role: j.role, deck: j.deck };
  } catch { current = null; }
  if (!current) return null;
  const role = current.role;
  document.documentElement.classList.add('is-guest');
  document.documentElement.dataset.guest = role;
  if (role !== 'edit') {
    DeckDoc.guard = (ops: Op[]) => (role === 'comment' && ops.every((o) => o.path[0] === 'comments') ? '' : ROLE_TEXT[role]);
    DeckDoc.refused = (text) => { const now = Date.now(); if (now - lastNotice > 4000) { lastNotice = now; notice(text); } };
  }
  return current;
}
