const store = new Map<string, string>();

export function putMedia(id: string, url: string): void { store.set(id, url); }
export function getMedia(id: string): string | undefined { return store.get(id); }
export function clearMedia(): void { store.clear(); }
export function mediaIds(): string[] { return [...store.keys()]; }

export function installMediaHook(): void {
  (globalThis as unknown as { __fdMediaUrl: (id: string) => string }).__fdMediaUrl = (id) => store.get(id) ?? '';
}

export function dataUrlBytes(url: string): { mime: string; bytes: Uint8Array } {
  const comma = url.indexOf(',');
  const head = url.slice(5, comma);
  const mime = head.split(';')[0] || 'application/octet-stream';
  const raw = url.slice(comma + 1);
  if (!head.includes(';base64')) return { mime, bytes: new TextEncoder().encode(decodeURIComponent(raw)) };
  const bin = atob(raw);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { mime, bytes };
}

export function bytesToDataUrl(mime: string, bytes: Uint8Array): string {
  let bin = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) bin += String.fromCharCode(...bytes.subarray(i, i + step));
  return `data:${mime};base64,${btoa(bin)}`;
}
