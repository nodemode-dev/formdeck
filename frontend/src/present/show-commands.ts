import type { AgentBridge } from '../automation/agent-bridge';
import type { Editor } from '../editor/editor';
import type { Slide } from '../engine/model';
import { slidePath, type Op } from '../engine/ops';
import type { LiveClient } from '../live/socket';
import type { Commands } from '../ui/commands';
import { exportDialog } from '../ui/dialogs-file';
import { toast } from '../ui/toast';
import { setUsePresenterView, usePresenterView } from './presenter-prefs';

const timed = (s: Slide): boolean => s.transition?.advanceAfter !== undefined && s.transition?.advanceAfter !== null;
const narrated = (s: Slide): boolean => s.elements.some((e) => e.type === 'media' && !!e.narration);

export function registerShowCommands(cmds: Commands, E: () => Editor | null, live: LiveClient, bridge: AgentBridge): void {
  const inSlides = (): boolean => { const ed = E(); return !!ed && ed.holderKind === 'slide'; };
  const start = (from: 'start' | 'current', extra: { record?: boolean; custom?: string; rehearse?: boolean; coach?: boolean } = {}): void => {
    const ed = E();
    if (!ed) return;
    const at = from === 'start' ? 0 : Math.max(0, ed.doc.slideIndex(ed.current));
    void import('./show').then((m) => m.startShow({ doc: ed.doc, start: at, from, presenter: false, live, ...extra, onEnd: (id) => { if (E() === ed && ed.doc.slide(id)) ed.setSlideSelection([id], id); } }));
  };
  const scope = (all: boolean): Slide[] => {
    const ed = E();
    if (!ed || ed.holderKind !== 'slide') return [];
    return all ? ed.doc.deck.slides : [ed.doc.slide(ed.current)].filter((s): s is Slide => !!s);
  };
  const clearTiming = (all: boolean): void => {
    const ed = E();
    const ops: Op[] = scope(all).filter(timed).map((s) => ({ op: 'set', path: [...slidePath(s.id), 'transition'], value: { ...(s.transition ?? { type: 'none' }), advanceAfter: null } }));
    if (ed && ops.length) { ed.doc.apply(ops, all ? 'Clear timings' : 'Clear timing'); toast(`Cleared the timing on ${ops.length} slide${ops.length === 1 ? '' : 's'}.`); }
  };
  const clearNarration = (all: boolean): void => {
    const ed = E();
    const ops: Op[] = [];
    for (const s of scope(all)) for (const e of s.elements) if (e.type === 'media' && e.narration) ops.push({ op: 'del', path: [...slidePath(s.id), 'elements'], id: e.id });
    if (ed && ops.length) { ed.doc.apply(ops, all ? 'Clear narration' : 'Clear narration on slide'); toast(`Removed ${ops.length} narration recording${ops.length === 1 ? '' : 's'}.`); }
  };
  const exporter = (fmt: string) => (): void => { const ed = E(); if (ed) void exportDialog(ed, fmt, bridge); };
  cmds.add(
    { id: 'show-setup', label: 'Set Up Show...', icon: 'settings', enabled: () => !!E(), run: () => { const ed = E(); if (ed) void import('./show-dialogs').then((m) => m.setupShowDialog(ed)); } },
    { id: 'custom-shows', label: 'Custom Shows...', icon: 'slides', enabled: () => !!E(), run: () => { const ed = E(); if (ed) void import('./show-dialogs').then((m) => m.customShowsDialog(ed, (id) => start('start', { custom: id }))); } },
    { id: 'record-start', label: 'Record From Beginning', icon: 'record', enabled: inSlides, run: () => start('start', { record: true }) },
    { id: 'record-current', label: 'Record From Current Slide', icon: 'record', enabled: inSlides, run: () => start('current', { record: true }) },
    { id: 'clear-timing-current', label: 'Clear Timing on Current Slide', enabled: () => scope(false).some(timed), run: () => clearTiming(false) },
    { id: 'clear-timing-all', label: 'Clear Timings on All Slides', enabled: () => scope(true).some(timed), run: () => clearTiming(true) },
    { id: 'clear-narration-current', label: 'Clear Narration on Current Slide', enabled: () => scope(false).some(narrated), run: () => clearNarration(false) },
    { id: 'clear-narration-all', label: 'Clear Narration on All Slides', enabled: () => scope(true).some(narrated), run: () => clearNarration(true) },
    { id: 'export-video', label: 'Export as Video', icon: 'film', enabled: () => !!E(), run: exporter('video') },
    { id: 'export-gif', label: 'Export as Animated GIF', icon: 'fileImage', enabled: () => !!E(), run: exporter('gif') },
    { id: 'export-txt', label: 'Export Outline as Text (.txt)', icon: 'fileText', enabled: () => !!E(), run: exporter('txt') },
    { id: 'export-rtf', label: 'Export Outline as Rich Text (.rtf)', icon: 'fileText', enabled: () => !!E(), run: exporter('rtf') },
    { id: 'use-presenter-view', label: 'Use Presenter View', enabled: () => true, checked: () => usePresenterView(), run: () => setUsePresenterView(!usePresenterView()) },
    { id: 'subtitle-settings', label: 'Subtitle Settings...', icon: 'captions', enabled: () => true, run: () => { void import('../ui/dialogs-captions').then((m) => m.subtitleSettingsDialog()); } },
    { id: 'rehearse-timings', label: 'Rehearse Timings', icon: 'record', enabled: inSlides, run: () => start('start', { rehearse: true }) },
    { id: 'rehearse-coach', label: 'Rehearse with Coach', icon: 'captions', enabled: inSlides, run: () => start('start', { rehearse: true, coach: true }) },
  );
}
