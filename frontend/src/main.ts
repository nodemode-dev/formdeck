import { startApp } from './app';
import { initLanguage } from './i18n';
import { detectGuest } from './io/guest';
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

void initLanguage().catch(() => undefined).then(() => detectGuest((text) => toast(text)).catch(() => null)).then(() => {
  if (new URLSearchParams(location.search).get('audience') === '1') void import('./present/show').then((m) => m.bootAudience());
  else void startApp();
});
