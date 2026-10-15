import type { Deck } from '../engine/model';

export interface DeckSummary { id: string; title: string; slides: number; size: { w: number; h: number }; template?: string; modified?: string; review?: Record<string, number>; warnings?: string[]; thumb?: boolean }
export interface PdfPages { name: string; pages: number; truncated: boolean; slides: Array<{ page: number; w: number; h: number; text: string; media: { id: string; name: string; mime: string; w?: number; h?: number; bytes: number } }> }
export interface ActivityEntry { id: string; at: string; who: string; origin: string; label: string; slides: string[] }
export interface TemplateSummary { id: string; name: string; category: string; tags: string[]; description: string; source: string; colors: Record<string, string>; fonts: { major: string; minor: string }; dark?: boolean; motif?: string; layouts: number }

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    const body = await res.json().catch(() => ({})) as { detail?: string };
    if (body.detail) detail = body.detail;
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

const post = <T>(url: string, body: unknown = {}): Promise<T> => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => json<T>(r));
const get = <T>(url: string): Promise<T> => fetch(url).then((r) => json<T>(r));

export interface TermInfo { id: string; title: string; cwd?: string; kind?: string; alive?: boolean }
export interface ClaudeStatus { installed: boolean; path: string | null; version: string | null; folder: string; terminal: TermInfo | null; binNote: string; firstMessage: string }

export interface WorkbookTable { sheets: string[]; sheet: string; categories: string[]; series: Array<{ name: string; values: Array<number | null> }>; mtime: number; path: string }

export const api = {
  health: () => get<{ ok: boolean; version: string }>('/api/health'),
  capabilities: () => get<Record<string, unknown>>('/api/capabilities'),
  terminals: () => get<{ terminals: TermInfo[] }>('/api/terminal'),
  openTerminal: (body: { cols: number; rows: number; title?: string }) => post<TermInfo>('/api/terminal', body),
  restartTerminal: (id: string) => post<TermInfo>(`/api/terminal/${encodeURIComponent(id)}/restart`),
  closeTerminal: (id: string) => fetch(`/api/terminal/${encodeURIComponent(id)}`, { method: 'DELETE' }).then((r) => json<{ ok: boolean }>(r)),
  claudeStatus: () => get<ClaudeStatus>('/api/agent/claude/status'),
  openClaude: (body: { prompt?: string; cols: number; rows: number; fresh?: boolean; resume?: string }) => post<TermInfo>('/api/agent/claude/open', body),
  mirrorCommands: (body: { size: number; missing: string[]; commands: unknown[] }) => post<{ ok: boolean; size: number }>('/api/commands/catalogue', body),
  settings: () => get<Record<string, unknown>>('/api/settings'),
  setSettings: (patch: Record<string, unknown>) => post<Record<string, unknown>>('/api/settings', patch),
  library: () => get<{ decks: DeckSummary[] }>('/api/decks'),
  create: (body: { title?: string; template?: string; size?: string | { w: number; h: number }; firstSlide?: boolean }) => post<DeckSummary>('/api/decks', body),
  deck: (id: string) => get<{ deck: Deck; rev: number }>(`/api/decks/${id}`),
  remove: (id: string) => fetch(`/api/decks/${id}`, { method: 'DELETE' }).then((r) => json<{ ok: boolean }>(r)),
  duplicate: (id: string) => post<DeckSummary>(`/api/decks/${id}/duplicate`),
  templates: () => get<{ categories: string[]; templates: TemplateSummary[]; default: string }>('/api/templates'),
  template: (id: string, w = 960, h = 540) => get<Deck>(`/api/templates/${encodeURIComponent(id)}?w=${w}&h=${h}`),
  applyTemplate: (deckId: string, template: string, client: string) => post<{ rev: number }>(`/api/decks/${deckId}/apply-template`, { template, client }),
  build: (body: { markdown?: string; spec?: unknown; template?: string; intake?: string; title?: string; size?: string }) => post<DeckSummary>('/api/build', body),
  export: (deckId: string, format: string, path?: string, fontScales?: unknown, embedFonts?: string) => post<{ path: string; bytes: number; warnings?: string[] }>(`/api/decks/${deckId}/export`, { format, path, fontScales, embedFonts }),
  save: (deckId: string, body: { path?: string; format?: string; fontScales?: unknown } = {}) => post<{ saved: string; bytes?: number }>(`/api/decks/${deckId}/save`, body),
  saveTemplate: (deckId: string, name: string) => post<{ template: string }>(`/api/decks/${deckId}/save-template`, { name }),
  versions: (deckId: string) => get<{ versions: Array<{ n: number; name: string; at: string; slides: number }> }>(`/api/decks/${deckId}/versions`),
  saveVersion: (deckId: string, name: string) => post<{ n: number }>(`/api/decks/${deckId}/versions`, { name }),
  restoreVersion: (deckId: string, n: number) => post<{ rev: number }>(`/api/decks/${deckId}/versions/${n}/restore`),
  version: (deckId: string, n: number) => get<{ info: { n: number; name: string; at: string }; deck: Deck }>(`/api/decks/${deckId}/versions/${n}`),
  activity: (deckId: string, who = '', limit = 300) => get<{ entries: ActivityEntry[]; people: string[]; total: number }>(`/api/decks/${deckId}/activity?limit=${limit}${who ? `&who=${encodeURIComponent(who)}` : ''}`),
  async compareFile(file: File): Promise<{ deck: Deck; name: string }> {
    const fd = new FormData();
    fd.append('file', file, file.name);
    return json<{ deck: Deck; name: string }>(await fetch('/api/compare-file', { method: 'POST', body: fd }));
  },
  workbookRead: (path: string, sheet?: string, range?: string) => post<WorkbookTable>('/api/workbooks/read', { path, sheet, range }),
  workbookStat: (paths: string[]) => post<{ mtimes: Record<string, number | null> }>('/api/workbooks/stat', { paths }),
  openPath: (path: string, asTemplate = false) => post<DeckSummary & { template?: string }>('/api/open-path', { path, asTemplate }),
  async upload(files: File[]): Promise<Array<{ id: string; name: string; mime: string; w?: number; h?: number; bytes: number; frames?: number; duration?: number }>> {
    const fd = new FormData();
    for (const f of files) fd.append('files', f, f.name);
    const res = await fetch('/api/media', { method: 'POST', body: fd });
    return (await json<{ media: Array<{ id: string; name: string; mime: string; w?: number; h?: number; bytes: number; frames?: number; duration?: number }> }>(res)).media;
  },
  async pdfPages(file: File): Promise<PdfPages> {
    const fd = new FormData();
    fd.append('file', file, file.name);
    return json<PdfPages>(await fetch('/api/media/pdf-pages', { method: 'POST', body: fd }));
  },
  async importFile(file: File, asTemplate = false): Promise<DeckSummary & { template?: string }> {
    const fd = new FormData();
    fd.append('file', file, file.name);
    const res = await fetch(`/api/import${asTemplate ? '?asTemplate=true' : ''}`, { method: 'POST', body: fd });
    return json<DeckSummary & { template?: string }>(res);
  },
  async putThumb(deckId: string, blob: Blob): Promise<void> {
    await fetch(`/api/decks/${deckId}/thumb`, { method: 'PUT', body: blob });
  },
  mediaUrl: (id: string) => `/api/media/${id}`,
  downloadUrl: (deckId: string, format: string, embedFonts?: string) => `/api/decks/${deckId}/download?format=${format}${embedFonts ? `&embedFonts=${embedFonts}` : ''}`,
  templateDownloadUrl: (id: string, format = 'pptx') => `/api/templates/${encodeURIComponent(id)}/download?format=${format}`,
  post,
  get,
};
