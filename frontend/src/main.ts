import { startApp } from './app';
import { initLanguage } from './i18n';
import { detectGuest, guest, guestName, setGuestName, shareRefused } from './io/guest';
import { promptName } from './ui/dialogs';
import { toast } from './ui/toast';

const LEGACY_PREFIX = 'formsld.';
try {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(LEGACY_PREFIX)) continue;
    const next = `formdeck.${key.slice(LEGACY_PREFIX.length)}`;
    const value = localStorage.getItem(key);
    if (localStorage.getItem(next) === null && value !== null) localStorage.setItem(next, value);
    localStorage.removeItem(key);
  }
} catch { void 0; }

async function nameGuest(): Promise<void> {
  if (!guest() || guestName()) return;
  const name = await promptName('Your name, as others will see it', '', 'Join');
  setGuestName(name?.trim() || 'Guest');
}

void initLanguage().catch(() => undefined).then(() => detectGuest((text) => toast(text)).catch(() => null)).then(() => nameGuest().catch(() => undefined)).then(() => {
  if (shareRefused()) {
    const note = document.createElement('p');
    note.className = 'fd-share-refused';
    note.textContent = 'This share link is not valid any more, or sharing was turned off. Ask the person who shared the deck for a new link.';
    document.body.appendChild(note);
    return;
  }
  if (new URLSearchParams(location.search).get('audience') === '1') void import('./present/show').then((m) => m.bootAudience());
  else void startApp();
});
