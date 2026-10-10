import type { MediaElement } from '../engine/model';
import { elPath } from '../engine/ops';
import type { Command, Commands } from '../ui/commands';
import { dirtyOp } from './actions';
import type { Editor } from './editor';

export function registerMediaCommands(cmds: Commands, E: () => Editor | null): void {
  const clip = (kind?: 'video'): MediaElement | undefined => {
    const ed = E();
    if (!ed || ed.holderKind !== 'slide') return undefined;
    const sel = ed.selected();
    const m = sel.length === 1 && sel[0].type === 'media' ? sel[0] : undefined;
    return m && (!kind || m.kind === kind) ? m : undefined;
  };
  const list: Command[] = [
    { id: 'insert-icons', label: 'Icons...', icon: 'iconLib', enabled: () => !!E(), run: () => { const ed = E(); if (ed) void import('../ui/dialogs-icons').then((m) => m.iconsDialog(ed)); } },
    { id: 'media-trim', label: () => (clip()?.kind === 'audio' ? 'Trim Audio...' : 'Trim Video...'), icon: 'trim', enabled: () => !!clip(), run: () => { const ed = E(); if (ed) void import('../ui/dialogs-media').then((m) => m.trimDialog(ed)); } },
    { id: 'media-poster-frame', label: 'Poster Frame from Video...', icon: 'film', enabled: () => !!clip('video'), run: () => { const ed = E(); if (ed) void import('../ui/dialogs-media').then((m) => m.posterFrameDialog(ed)); } },
    { id: 'media-poster-picture', label: 'Poster Frame from Picture...', icon: 'image', enabled: () => !!clip('video'), run: () => { const ed = E(); if (ed) void import('../ui/dialogs-media').then((m) => m.posterPicture(ed)); } },
    {
      id: 'media-poster-reset', label: 'Reset Poster Frame', enabled: () => !!clip('video')?.poster,
      run: () => { const ed = E(); const s = ed?.slide; const m = clip('video'); if (ed && s && m?.poster) ed.apply([{ op: 'set', path: [...elPath(s.id, m.id), 'poster'] }, ...dirtyOp(s)], 'Reset poster frame'); },
    },
  ];
  cmds.add(...list);
}

export const MEDIA_MENU = { label: 'Video and Audio', items: ['media-trim', 'media-poster-frame', 'media-poster-picture', 'media-poster-reset'] };
