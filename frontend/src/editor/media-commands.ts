import type { MediaElement } from '../engine/model';
import { elPath, type Op } from '../engine/ops';
import type { Command, Commands } from '../ui/commands';
import { dirtyOp } from './actions';
import type { Editor } from './editor';
import { startMode, VOLUMES, volumeLevel } from './media-panel';
import { setEditorMediaControls } from '../render/slide';

export function registerMediaCommands(cmds: Commands, E: () => Editor | null): void {
  const clip = (kind?: 'video'): MediaElement | undefined => {
    const ed = E();
    if (!ed || ed.holderKind !== 'slide') return undefined;
    const sel = ed.selected();
    const m = sel.length === 1 && sel[0].type === 'media' ? sel[0] : undefined;
    return m && (!kind || m.kind === kind) ? m : undefined;
  };
  const aiPicture = () => {
    const ed = E();
    if (!ed || ed.holderKind !== 'slide') return undefined;
    const sel = ed.selected();
    return sel.length === 1 && sel[0].type === 'image' && !sel[0].model ? sel[0] : undefined;
  };
  const list: Command[] = [
    { id: 'insert-stock', label: 'Stock Images...', icon: 'stockImage', enabled: () => !!E(), run: () => { const ed = E(); if (ed) void import('../ui/dialogs-stock').then((m) => m.stockDialog(ed)); } },
    { id: 'insert-ai-image', label: 'Generate with AI...', icon: 'ai', enabled: () => !!E()?.slide, run: () => { const ed = E(); if (ed) void import('../ui/dialogs-ai-image').then((m) => m.generateImageDialog(ed)); } },
    { id: 'edit-image-ai', label: 'Edit with AI...', icon: 'ai', enabled: () => !!aiPicture(), run: () => { const ed = E(); if (ed) void import('../ui/dialogs-ai-image').then((m) => m.editImageDialog(ed)); } },
    { id: 'insert-icons', label: 'Icons...', icon: 'iconLib', enabled: () => !!E(), run: () => { const ed = E(); if (ed) void import('../ui/dialogs-icons').then((m) => m.iconsDialog(ed)); } },
    { id: 'media-trim', label: () => (clip()?.kind === 'audio' ? 'Trim Audio...' : 'Trim Video...'), icon: 'trim', enabled: () => !!clip(), run: () => { const ed = E(); if (ed) void import('../ui/dialogs-media').then((m) => m.trimDialog(ed)); } },
    { id: 'media-poster-frame', label: 'Poster Frame from Video...', icon: 'film', enabled: () => !!clip('video'), run: () => { const ed = E(); if (ed) void import('../ui/dialogs-media').then((m) => m.posterFrameDialog(ed)); } },
    { id: 'media-poster-picture', label: 'Poster Frame from Picture...', icon: 'image', enabled: () => !!clip('video'), run: () => { const ed = E(); if (ed) void import('../ui/dialogs-media').then((m) => m.posterPicture(ed)); } },
    {
      id: 'media-poster-reset', label: 'Reset Poster Frame', enabled: () => !!clip('video')?.poster,
      run: () => { const ed = E(); const s = ed?.slide; const m = clip('video'); if (ed && s && m?.poster) ed.apply([{ op: 'set', path: [...elPath(s.id, m.id), 'poster'] }, ...dirtyOp(s)], 'Reset poster frame'); },
    },
  ];
  const clips = (): MediaElement[] => {
    const ed = E();
    if (!ed || ed.holderKind !== 'slide') return [];
    const sel = ed.selected();
    return sel.length && sel.every((e) => e.type === 'media') ? (sel as MediaElement[]) : [];
  };
  const setClips = (fields: Partial<Record<keyof MediaElement, unknown>>, label: string, only?: (m: MediaElement) => boolean): void => {
    const ed = E();
    const s = ed?.slide;
    if (!ed || !s) return;
    const ops: Op[] = [];
    for (const m of clips()) {
      if (only && !only(m)) continue;
      for (const [k, v] of Object.entries(fields)) {
        if ((m as unknown as Record<string, unknown>)[k] === v) continue;
        ops.push({ op: 'set', path: [...elPath(s.id, m.id), k], value: v });
      }
    }
    if (ops.length) ed.apply([...ops, ...dirtyOp(s)], label);
  };
  const start = (id: string, label: string, mode: 'sequence' | 'auto' | 'click'): Command => ({
    id, label, enabled: () => clips().length > 0, checked: () => { const c = clips(); return c.length > 0 && c.every((m) => startMode(m) === mode); },
    run: () => setClips({ autoplay: mode === 'auto' ? true : undefined, sequence: mode === 'sequence' ? true : undefined }, 'Start'),
  });
  const level = (id: string, label: string, key: string): Command => ({
    id, label, enabled: () => clips().length > 0, checked: () => { const c = clips(); return c.length > 0 && c.every((m) => volumeLevel(m) === key); },
    run: () => {
      if (key === 'mute') setClips({ muted: true }, 'Mute');
      else setClips({ muted: undefined, volume: VOLUMES.find((x) => x[0] === key)?.[2] ?? 1 }, 'Volume');
    },
  });
  const flag = (id: string, label: string, field: 'fullScreen' | 'hideInShow' | 'loop' | 'rewind', ic: string): Command => {
    const only = field === 'fullScreen' ? (m: MediaElement): boolean => m.kind === 'video' : undefined;
    const pool = (): MediaElement[] => clips().filter((m) => !only || only(m));
    return {
      id, label, icon: ic, enabled: () => pool().length > 0, checked: () => { const c = pool(); return c.length > 0 && c.every((m) => !!m[field]); },
      run: () => { const on = !pool().every((m) => !!m[field]); setClips({ [field]: on ? true : undefined }, label, only); },
    };
  };
  cmds.add(
    ...list,
    start('media-start-sequence', 'In Click Sequence', 'sequence'),
    start('media-start-auto', 'Automatically', 'auto'),
    start('media-start-click', 'When Clicked On', 'click'),
    level('media-volume-low', 'Low', 'low'),
    level('media-volume-medium', 'Medium', 'medium'),
    level('media-volume-high', 'High', 'high'),
    level('media-volume-mute', 'Mute', 'mute'),
    flag('media-fullscreen', 'Play Full Screen', 'fullScreen', 'maximize'),
    flag('media-hide', 'Hide While Not Playing', 'hideInShow', 'eyeOff'),
    flag('media-loop', 'Loop until Stopped', 'loop', 'refresh'),
    flag('media-rewind', 'Rewind after Playing', 'rewind', 'undo'),
    {
      id: 'media-controls-editor', label: 'Player in Editor', icon: 'film', checked: () => editorControls,
      run: () => {
        editorControls = !editorControls;
        setEditorMediaControls(editorControls);
        try { localStorage.setItem(EDITOR_CONTROLS_KEY, editorControls ? '1' : '0'); } catch { void 0; }
        for (const v of Array.from(document.querySelectorAll<HTMLVideoElement>('.fd-slide.is-edit video.fd-video'))) v.controls = editorControls;
        const ed = E();
        if (ed && editorControls) {
          const keep = ed.selection.filter((id) => { const el = ed.element(id); return !(el?.type === 'media' && el.kind === 'video'); });
          if (keep.length !== ed.selection.length) ed.select(keep);
        }
      },
    },
    {
      id: 'media-controls-show', label: 'Player in Slide Show', icon: 'present', enabled: () => !!E(), checked: () => !!E()?.doc.deck.show?.mediaControls,
      run: () => {
        const ed = E();
        if (!ed) return;
        const on = !ed.doc.deck.show?.mediaControls;
        ed.apply([ed.doc.deck.show ? { op: 'set', path: ['show', 'mediaControls'], ...(on ? { value: true } : {}) } : { op: 'set', path: ['show'], value: { mediaControls: true } }], on ? 'Show the video player in the slide show' : 'Hide the video player in the slide show');
      },
    },
  );
}

const EDITOR_CONTROLS_KEY = 'formdeck.editorMediaControls';
let editorControls = ((): boolean => { try { return localStorage.getItem(EDITOR_CONTROLS_KEY) === '1'; } catch { return false; } })();
setEditorMediaControls(editorControls);

export const MEDIA_START_MENU = ['media-start-sequence', 'media-start-auto', 'media-start-click'];
export const MEDIA_VOLUME_MENU = ['media-volume-low', 'media-volume-medium', 'media-volume-high', 'media-volume-mute'];

export const MEDIA_MENU = { label: 'Video and Audio', items: ['media-trim', 'media-poster-frame', 'media-poster-picture', 'media-poster-reset'] };
