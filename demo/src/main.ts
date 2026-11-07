import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import '../../frontend/src/styles/tokens.css';
import '../../frontend/src/styles/shell.css';
import '../../frontend/src/styles/slides.css';
import '../../frontend/src/styles/tables.css';
import '../../frontend/src/styles/text-effects.css';
import '../../frontend/src/styles/scrollbars.css';
import '../../frontend/src/styles/light-mode.css';
import './demo.css';
import { installMediaHook } from './media';

installMediaHook();
void import('./app').then((m) => m.startDemo());
