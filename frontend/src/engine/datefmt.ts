const FIELD = /‹date:(\d{1,2})›/g;

type Opts = Intl.DateTimeFormatOptions;
const SPEC: Record<number, Opts> = {
  1: { month: 'numeric', day: 'numeric', year: 'numeric' },
  2: { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' },
  3: { day: 'numeric', month: 'long', year: 'numeric' },
  4: { month: 'long', day: 'numeric', year: 'numeric' },
  5: { day: '2-digit', month: 'short', year: '2-digit' },
  6: { month: 'long', year: '2-digit' },
  7: { month: 'short', year: '2-digit' },
  8: { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true },
  9: { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true },
  10: { hour: '2-digit', minute: '2-digit', hour12: false },
  11: { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false },
  12: { hour: 'numeric', minute: '2-digit', hour12: true },
  13: { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true },
};

export const DATE_FORMAT_IDS = Object.keys(SPEC).map(Number);

export function formatDate(id: number, d: Date = new Date()): string {
  const spec = SPEC[id] ?? SPEC[1];
  try { return new Intl.DateTimeFormat(undefined, spec).format(d); } catch { return d.toDateString(); }
}

export function expandDates(text: string, d: Date = new Date()): string {
  return text.includes('‹date:') ? text.replace(FIELD, (_m, n: string) => formatDate(Number(n), d)) : text;
}

export function dateFieldId(text: string): number | null {
  const m = /^‹date:(\d{1,2})›$/.exec(text);
  return m ? Number(m[1]) : null;
}
