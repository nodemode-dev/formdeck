export interface PdfPage { jpeg: Uint8Array; px: [number, number]; pt: [number, number]; text: string[] }

const enc = new TextEncoder();

const esc = (s: string): string => s.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, '?');

export function buildPdf(title: string, pages: PdfPage[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (b: Uint8Array | string): void => {
    const u = typeof b === 'string' ? enc.encode(b) : b;
    chunks.push(u);
    length += u.length;
  };
  const begin = (n: number): void => { offsets[n] = length; push(`${n} 0 obj\n`); };
  const total = 2 + pages.length * 4;
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  begin(1);
  push(`<< /Type /Catalog /Pages 2 0 R /ViewerPreferences << /DisplayDocTitle true >> >>\nendobj\n`);
  begin(2);
  push(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${3 + i * 4} 0 R`).join(' ')}] >>\nendobj\n`);
  pages.forEach((pg, i) => {
    const base = 3 + i * 4;
    const [w, h] = pg.pt;
    begin(base);
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w.toFixed(2)} ${h.toFixed(2)}] /Resources << /XObject << /Im0 ${base + 1} 0 R >> /Font << /F1 ${base + 3} 0 R >> >> /Contents ${base + 2} 0 R >>\nendobj\n`);
    begin(base + 1);
    push(`<< /Type /XObject /Subtype /Image /Width ${pg.px[0]} /Height ${pg.px[1]} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.jpeg.length} >>\nstream\n`);
    push(pg.jpeg);
    push('\nendstream\nendobj\n');
    const lines = pg.text.slice(0, 60).map((t, k) => `BT 3 Tr /F1 10 Tf 12 ${(h - 12 - k * 11).toFixed(1)} Td (${esc(t)}) Tj ET`).join('\n');
    const content = `q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} 0 0 cm /Im0 Do Q\n${lines}\n`;
    begin(base + 2);
    push(`<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`);
    begin(base + 3);
    push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n');
  });
  const infoN = total + 1;
  begin(infoN);
  push(`<< /Title (${esc(title)}) /Producer (FormDeck demo) >>\nendobj\n`);
  const xref = length;
  push(`xref\n0 ${infoN + 1}\n0000000000 65535 f \n`);
  for (let n = 1; n <= infoN; n++) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${infoN + 1} /Root 1 0 R /Info ${infoN} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(length);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}
