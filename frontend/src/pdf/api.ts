import { api } from '../io/api';

export interface PageSize { w: number; h: number; rotate: number }
export interface OutlineItem { title: string; page: number | null; level: number }
export interface PdfInfo {
  bytes: number; encrypted: boolean; locked: boolean; pages: number; sizes: PageSize[]; outline: OutlineItem[]; fields: number;
  title?: string; author?: string; subject?: string; keywords?: string; creator?: string; producer?: string; created?: string | null; modified?: string | null;
  version?: string; id?: string; name?: string; key?: string; path?: string | null; protected?: boolean; savePath?: string;
}
export interface Opened { id: string; name: string; pages: number; info: PdfInfo; key: string; path?: string | null }
export interface Derived { id: string; pages: number; bytes: number; images?: number; before?: number; after?: number }
export interface RecentItem { key: string; id: string; name: string; pages: number; opened: number; path?: string }
export type FieldType = 'text' | 'checkbox' | 'radio' | 'choice' | 'button' | 'signature';
export interface Field { name: string; type: FieldType; page: number; x: number; y: number; w: number; h: number; value: string; readonly: boolean; required: boolean; multiline: boolean; on?: string; options?: string[]; maxLen?: number }
export interface ImageItem { page: number; id: string; w: number; h: number; mime: string; bytes: number; name: string; url: string }
export interface TableItem { page: number; header: string[]; rows: string[][] }
export interface Rect { x: number; y: number; w: number; h: number }
export type Pt = [number, number];
export type AnnotKind = 'highlight' | 'underline' | 'strikeout' | 'note' | 'freetext' | 'ink' | 'rect' | 'ellipse' | 'line' | 'arrow' | 'image';
export interface Annot {
  id: string; page: number; kind: AnnotKind; color: string; opacity?: number; width?: number; rot?: number; flatten?: boolean; fill?: string;
  rects?: Rect[]; points?: Pt[]; paths?: Pt[][]; x?: number; y?: number; w?: number; h?: number; text?: string; size?: number; image?: string; quote?: string;
}
export interface Area extends Rect { id: string; page: number }
export type OrganizePage = { src: string; page: number; rotate: number } | { blank: true; w?: number; h?: number };

const base = (id: string): string => `/api/pdf/${encodeURIComponent(id)}`;
const q = (pages?: string): string => (pages && pages.trim() ? `?pages=${encodeURIComponent(pages.trim())}` : '');

async function form<T>(url: string, fd: FormData): Promise<T> {
  const res = await fetch(url, { method: 'POST', body: fd });
  if (!res.ok) {
    let detail = res.statusText;
    try { const body = await res.json() as { detail?: string }; if (body.detail) detail = body.detail; } catch { detail = `${res.status} ${res.statusText}`; }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const pdfApi = {
  open(file: File | Blob, name: string): Promise<Opened> {
    const fd = new FormData();
    fd.append('file', file, name);
    return form<Opened>('/api/pdf/open', fd);
  },
  openPath: (path: string) => api.post<Opened>('/api/pdf/open-path', { path }),
  info: (id: string) => api.get<PdfInfo>(`${base(id)}/info`),
  recent: () => api.get<{ items: RecentItem[] }>('/api/pdf/recent'),
  forget: (key: string) => api.post<{ ok: boolean }>('/api/pdf/recent/forget', { key }),
  fileUrl: (id: string, download = false) => `${base(id)}/file${download ? '?download=1' : ''}`,
  renderUrl: (id: string, page: number, scale: number) => `${base(id)}/render/${page}?scale=${scale.toFixed(3)}`,
  zipUrl: (id: string, scale: number, pages?: string) => `${base(id)}/pages.zip?scale=${scale}${pages && pages.trim() ? `&pages=${encodeURIComponent(pages.trim())}` : ''}`,
  xlsxUrl: (id: string, pages?: string) => `${base(id)}/tables.xlsx${q(pages)}`,
  text: (id: string, pages?: string) => api.get<{ pages: Array<{ page: number; text: string }> }>(`${base(id)}/text${q(pages)}`),
  images: (id: string, pages?: string) => api.get<{ images: ImageItem[] }>(`${base(id)}/images${q(pages)}`),
  tables: (id: string, pages?: string) => api.get<{ tables: TableItem[] }>(`${base(id)}/tables${q(pages)}`),
  fields: (id: string) => api.get<{ fields: Field[] }>(`${base(id)}/fields`),
  fill: (id: string, values: Record<string, string>, flatten: boolean) => api.post<Derived>(`${base(id)}/fields`, { values, flatten }),
  annotate: (id: string, annotations: Annot[], flatten = false) => api.post<Derived>(`${base(id)}/annotate`, { annotations, flatten }),
  organize: (id: string, pages: OrganizePage[]) => api.post<Derived>(`${base(id)}/organize`, { pages }),
  merge: (ids: string[]) => api.post<Derived>('/api/pdf/merge', { ids }),
  split: (id: string, ranges: string[]) => api.post<{ ids: string[]; parts: Array<{ id: string; range: string; name: string; pages: number }> }>(`${base(id)}/split`, { ranges }),
  protect: (id: string, body: { password: string; owner?: string; permissions: Record<string, boolean> }) => api.post<Derived>(`${base(id)}/protect`, body),
  unlock: (id: string, password: string) => api.post<Derived>(`${base(id)}/unlock`, { password }),
  redact: (id: string, areas: Area[]) => api.post<Derived>(`${base(id)}/redact`, { areas }),
  metadata: (id: string, body: { title?: string; author?: string; subject?: string; keywords?: string; strip?: boolean }) => api.post<Derived>(`${base(id)}/metadata`, body),
  compress: (id: string, quality: number) => api.post<Derived>(`${base(id)}/compress`, { quality }),
  pageNumbers: (id: string, body: { position: string; start: number; format: string; size?: number }) => api.post<Derived>(`${base(id)}/page-numbers`, body),
  watermark: (id: string, body: { text: string; opacity: number; angle: number; size: number; color: string }) => api.post<Derived>(`${base(id)}/watermark`, body),
  toDeck: (id: string, body: { mode: 'pages'; template?: string; title?: string }) => api.post<{ id: string; title: string; slides: number }>(`${base(id)}/to-deck`, body),
  imagesDeck: (media: string[], title: string) => api.post<{ id: string; title: string; slides: number }>('/api/pdf/images-deck', { media, title }),
  save: (id: string, path: string) => api.post<{ path: string; bytes: number }>(`${base(id)}/save`, { path }),
  write(blob: Blob, name: string, path = ''): Promise<{ path: string; bytes: number }> {
    const fd = new FormData();
    fd.append('file', blob, name);
    fd.append('name', name);
    fd.append('path', path);
    return form('/api/pdf/write', fd);
  },
  async intakeDraft(file: Blob, name: string, template: string | undefined, title: string | undefined): Promise<{ id: string; title: string; slides: number }> {
    const fd = new FormData();
    fd.append('files', file, name);
    const intake = await form<{ intake: string }>('/api/intake', fd);
    return api.post<{ id: string; title: string; slides: number }>(`/api/intake/${encodeURIComponent(intake.intake)}/draft`, { template, title });
  },
};

export const isTauri = (): boolean => '__TAURI_INTERNALS__' in window;

export async function deliver(data: Blob | string, name: string): Promise<string | null> {
  const blob = typeof data === 'string' ? await fetch(data).then(async (r) => {
    if (!r.ok) { let detail = `${r.status} ${r.statusText}`; try { detail = ((await r.json()) as { detail?: string }).detail ?? detail; } catch { return Promise.reject(new Error(detail)); } throw new Error(detail); }
    return r.blob();
  }) : data;
  if (isTauri()) return (await pdfApi.write(blob, name)).path;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  return null;
}
