import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '../../../frontend/src/styles/tokens.css';
import '../../../frontend/src/styles/shell.css';
import '../../../frontend/src/styles/slides.css';
import '../../../frontend/src/styles/tables.css';
import '../../../frontend/src/styles/text-effects.css';
import '../../../frontend/src/styles/scrollbars.css';
import '../../../frontend/src/styles/present.css';
import '../../../frontend/src/styles/media.css';
import '../../../frontend/src/styles/light-mode.css';
import '../../../demo/src/demo.css';
import './present.css';
import { installMediaHook } from '../../../demo/src/media';

Object.defineProperty(window.screen, 'isExtended', { value: false, configurable: true });

const realFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
  if (url.startsWith('/api/')) return Promise.resolve(new Response('{}', { status: url === '/api/settings' ? 200 : 503, headers: { 'content-type': 'application/json' } }));
  return realFetch(input, init);
};
installMediaHook();
void import('./app').then((m) => m.startDemo());
