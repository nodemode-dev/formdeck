import { strToU8, zipSync, type Zippable } from 'fflate';
import type {
  ChartElement, Color, Deck, Fill, ImageElement, Layout, Line, LevelStyle, Master, Para, Run, ShapeElement, Slide, SlideElement, TableElement, TextBody,
} from '../../../frontend/src/engine/model';
import { dataUrlBytes } from '../../../demo/src/media';
import { buildXlsx } from './xlsx';

const EMU = 12700;
const e = (n: number): number => Math.round(n * EMU);
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const SCHEMES = new Set(['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink', 'tx1', 'bg1', 'tx2', 'bg2']);

export interface PptxReport { slides: number; layouts: number; pictures: number; charts: number; skipped: number }

function pct(n: number): number { return Math.round(n * 100000); }

function clr(c: Color | undefined | null): string {
  if (c === undefined || c === null) return '<a:srgbClr val="000000"/>';
  if (typeof c === 'string') {
    if (SCHEMES.has(c)) return `<a:schemeClr val="${c}"/>`;
    return `<a:srgbClr val="${c.replace('#', '').slice(0, 6).toUpperCase().padEnd(6, '0')}"/>`;
  }
  const mods = [
    c.lumMod !== undefined ? `<a:lumMod val="${pct(c.lumMod)}"/>` : '', c.lumOff !== undefined ? `<a:lumOff val="${pct(c.lumOff)}"/>` : '',
    c.tint !== undefined ? `<a:tint val="${pct(c.tint)}"/>` : '', c.shade !== undefined ? `<a:shade val="${pct(c.shade)}"/>` : '',
    c.alpha !== undefined && c.alpha < 1 ? `<a:alpha val="${pct(c.alpha)}"/>` : '',
  ].join('');
  return `<a:schemeClr val="${c.scheme}">${mods}</a:schemeClr>`;
}

function fillXml(f: Fill | null | undefined): string {
  if (!f) return '';
  if (f.type === 'none') return '<a:noFill/>';
  if (f.type === 'solid') return `<a:solidFill>${clr(f.color)}</a:solidFill>`;
  if (f.type === 'gradient') {
    const stops = f.stops.map((s) => `<a:gs pos="${Math.round(s.pos * 100000)}">${clr(s.color)}</a:gs>`).join('');
    const shape = f.kind === 'radial' ? '<a:path path="circle"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path>' : `<a:lin ang="${Math.round(((f.angle ?? 0) % 360) * 60000)}" scaled="0"/>`;
    return `<a:gradFill rotWithShape="1"><a:gsLst>${stops}</a:gsLst>${shape}</a:gradFill>`;
  }
  if (f.type === 'pattern') return `<a:solidFill>${clr(f.fg)}</a:solidFill>`;
  return '';
}

function lineXml(l: Line | null | undefined): string {
  if (!l) return '';
  if (l.type === 'none') return '<a:ln><a:noFill/></a:ln>';
  const dash = l.dash && l.dash !== 'solid' ? `<a:prstDash val="${l.dash}"/>` : '';
  const head = l.head ? `<a:headEnd type="${l.head.type}"/>` : '';
  const tail = l.tail ? `<a:tailEnd type="${l.tail.type}"/>` : '';
  const cap = l.cap ? ` cap="${l.cap === 'flat' ? 'flat' : l.cap === 'round' ? 'rnd' : 'sq'}"` : '';
  return `<a:ln w="${e(l.width ?? 1)}"${cap}><a:solidFill>${clr(l.color ?? 'dk1')}</a:solidFill>${dash}${head}${tail}</a:ln>`;
}

const fontRef = (f: string): string => (f === '+mn' ? '+mn-lt' : f === '+mj' ? '+mj-lt' : f);

function rPr(r: Partial<Run> | LevelStyle, tag: string, link?: string): string {
  const x = r as Partial<Run> & LevelStyle;
  const attrs = [
    'lang="en-US"',
    x.sz ? `sz="${Math.round(x.sz * 100)}"` : '', x.b !== undefined ? `b="${x.b ? 1 : 0}"` : '', x.i !== undefined ? `i="${x.i ? 1 : 0}"` : '',
    x.u ? 'u="sng"' : '', x.s ? 'strike="sngStrike"' : '', x.caps ? `cap="${x.caps === 'all' ? 'all' : 'small'}"` : '',
    x.spc !== undefined ? `spc="${Math.round(x.spc * 100)}"` : '', x.sup ? 'baseline="30000"' : x.sub ? 'baseline="-25000"' : '', 'dirty="0"',
  ].filter(Boolean).join(' ');
  const inner = [
    x.color !== undefined ? `<a:solidFill>${clr(x.color)}</a:solidFill>` : '',
    x.hl !== undefined ? `<a:highlight>${clr(x.hl)}</a:highlight>` : '',
    x.font ? `<a:latin typeface="${esc(fontRef(x.font))}"/>` : '',
    link ? `<a:hlinkClick r:id="${link}"/>` : '',
  ].join('');
  return inner ? `<a:${tag} ${attrs}>${inner}</a:${tag}>` : `<a:${tag} ${attrs}/>`;
}

function bulletXml(b: Para['bullet']): string {
  if (!b) return '';
  if (b.type === 'none') return '<a:buNone/>';
  if (b.type === 'char') return `${b.color ? `<a:buClr>${clr(b.color)}</a:buClr>` : ''}${b.font ? `<a:buFont typeface="${esc(b.font)}"/>` : ''}<a:buChar char="${esc(b.char)}"/>`;
  return `<a:buAutoNum type="${esc(b.scheme)}"${b.start ? ` startAt="${b.start}"` : ''}/>`;
}

function pPr(p: Partial<Para> & LevelStyle, tag: string, lvl?: number): string {
  const attrs = [
    lvl ? `lvl="${lvl}"` : '', p.marL !== undefined ? `marL="${e(p.marL)}"` : '', p.indent !== undefined ? `indent="${e(p.indent)}"` : '',
    p.align ? `algn="${p.align}"` : '',
  ].filter(Boolean).join(' ');
  const ls = p.lineSpacing === undefined ? '' : typeof p.lineSpacing === 'number' ? `<a:lnSpc><a:spcPct val="${pct(p.lineSpacing)}"/></a:lnSpc>` : `<a:lnSpc><a:spcPts val="${Math.round(p.lineSpacing.pt * 100)}"/></a:lnSpc>`;
  const sb = p.spaceBefore !== undefined ? `<a:spcBef><a:spcPts val="${Math.round(p.spaceBefore * 100)}"/></a:spcBef>` : '';
  const sa = p.spaceAfter !== undefined ? `<a:spcAft><a:spcPts val="${Math.round(p.spaceAfter * 100)}"/></a:spcAft>` : '';
  const inner = ls + sb + sa + bulletXml(p.bullet) + (tag === 'pPr' ? '' : rPr(p, 'defRPr'));
  return inner || attrs ? `<a:${tag}${attrs ? ' ' + attrs : ''}>${inner}</a:${tag}>` : '';
}

type Rels = { add(type: string, target: string, mode?: string): string };

function makeRels(): Rels & { list: Array<{ id: string; type: string; target: string; mode?: string }> } {
  const list: Array<{ id: string; type: string; target: string; mode?: string }> = [];
  return {
    list,
    add(type, target, mode) {
      const hit = list.find((x) => x.type === type && x.target === target && x.mode === mode);
      if (hit) return hit.id;
      const id = `rId${list.length + 1}`;
      list.push({ id, type, target, mode });
      return id;
    },
  };
}

const relsXml = (list: Array<{ id: string; type: string; target: string; mode?: string }>): string =>
  `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map((r) => `<Relationship Id="${r.id}" Type="${r.type.startsWith('http') ? r.type : `${REL}/${r.type}`}" Target="${esc(r.target)}"${r.mode ? ` TargetMode="${r.mode}"` : ''}/>`).join('')}</Relationships>`;

function textXml(t: TextBody | undefined, rels: Rels, tag = 'p:txBody', ph = false): string {
  if (!t) return '';
  const body = [
    `wrap="${t.wrap === false ? 'none' : 'square'}"`,
    t.inset ? `lIns="${e(t.inset[0])}" tIns="${e(t.inset[1])}" rIns="${e(t.inset[2])}" bIns="${e(t.inset[3])}"` : '',
    t.anchor ? `anchor="${t.anchor === 'm' ? 'ctr' : t.anchor}"` : '', t.cols && t.cols > 1 ? `numCol="${t.cols}"` : '',
    t.vert && t.vert !== 'horz' ? `vert="${t.vert === 'stacked' ? 'wordArtVert' : t.vert}"` : '', 'rtlCol="0"',
  ].filter(Boolean).join(' ');
  const fit = t.autofit === 'shrink' ? '<a:normAutofit/>' : t.autofit === 'grow' ? '<a:spAutoFit/>' : '<a:noAutofit/>';
  const lst = t.lstStyle?.length ? `<a:lstStyle>${t.lstStyle.map((l, i) => pPr(l, `lvl${i + 1}pPr`)).join('')}</a:lstStyle>` : '<a:lstStyle/>';
  const paras = (t.paras.length ? t.paras : [{ runs: [] } as Para]).map((p) => {
    const runs = p.runs.map((r) => {
      if (r.t === '‹#›') return `<a:fld id="{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}" type="slidenum">${rPr(r, 'rPr')}<a:t>‹#›</a:t></a:fld>`;
      let link: string | undefined;
      if (r.link && 'url' in r.link) link = rels.add('hyperlink', r.link.url, 'External');
      return `<a:r>${rPr(r, 'rPr', link)}<a:t>${esc(r.t)}</a:t></a:r>`;
    }).join('');
    return `<a:p>${pPr(p, 'pPr', p.lvl)}${runs}${runs ? '' : '<a:endParaRPr lang="en-US" dirty="0"/>'}</a:p>`;
  }).join('');
  return `<${tag}><a:bodyPr ${body}>${fit}</a:bodyPr>${ph && !t.lstStyle?.length ? '<a:lstStyle/>' : lst}${paras}</${tag}>`;
}

const PH_TYPE: Record<string, string> = { title: 'title', ctrTitle: 'ctrTitle', subTitle: 'subTitle', body: 'body', pic: 'pic', chart: 'chart', tbl: 'tbl', dt: 'dt', ftr: 'ftr', sldNum: 'sldNum' };

function phXml(el: SlideElement): string {
  if (!el.ph) return '';
  const type = PH_TYPE[el.ph.type];
  return `<p:ph${type ? ` type="${type}"` : ''}${el.ph.idx !== undefined ? ` idx="${el.ph.idx}"` : ''}/>`;
}

function xfrm(el: SlideElement, tag = 'a:xfrm'): string {
  if (el.x === undefined || el.y === undefined || el.w === undefined || el.h === undefined) return '';
  const attrs = `${el.rot ? ` rot="${Math.round(el.rot * 60000)}"` : ''}${el.flipH ? ' flipH="1"' : ''}${el.flipV ? ' flipV="1"' : ''}`;
  return `<${tag}${attrs}><a:off x="${e(el.x)}" y="${e(el.y)}"/><a:ext cx="${e(el.w)}" cy="${e(el.h)}"/></${tag}>`;
}

function effectsXml(fx: ShapeElement['effects']): string {
  if (!fx) return '';
  const parts: string[] = [];
  if (fx.shadow) parts.push(`<a:outerShdw blurRad="${e(fx.shadow.blur ?? 8)}" dist="${e(fx.shadow.dist ?? 3)}" dir="${Math.round((fx.shadow.angle ?? 90) * 60000)}" algn="ctr" rotWithShape="0">${clr(fx.shadow.color ?? { scheme: 'dk1', alpha: 0.3 })}</a:outerShdw>`);
  if (fx.glow) parts.push(`<a:glow rad="${e(fx.glow.radius ?? 8)}">${clr(fx.glow.color ?? 'accent1')}</a:glow>`);
  return parts.length ? `<a:effectLst>${parts.join('')}</a:effectLst>` : '';
}

const GEOM_OK = /^[a-zA-Z][a-zA-Z0-9]*$/;

interface Ctx {
  deck: Deck; media: Map<string, string>; files: Zippable; report: PptxReport;
  getMedia: (id: string) => string | undefined; charts: number; nextShape: number;
  bitmaps: Map<string, { bytes: Uint8Array; ext: string }>;
  layoutEls?: SlideElement[];
}

function framed(el: SlideElement, ctx: Ctx): SlideElement {
  if (el.x !== undefined || !el.ph) return el;
  const src = ctx.layoutEls?.find((l) => l.ph && l.ph.idx === el.ph?.idx && l.ph.type === el.ph?.type);
  return src ? { ...el, x: src.x, y: src.y, w: src.w, h: src.h } : el;
}

function sid(ctx: Ctx): number { ctx.nextShape += 1; return ctx.nextShape; }

function shapeXml(el: ShapeElement, rels: Rels, ctx: Ctx): string {
  const geom = el.geom && GEOM_OK.test(el.geom) ? el.geom : 'rect';
  const hasText = !!el.text;
  const connector = !!el.conn;
  const sp = el.fill === undefined && !el.ph ? '' : fillXml(el.fill);
  const geomXml = el.ph && el.x === undefined ? '' : `<a:prstGeom prst="${connector ? 'line' : geom}"><a:avLst>${Object.entries(el.adj ?? {}).map(([k, v]) => `<a:gd name="${esc(k)}" fmla="val ${Math.round(v)}"/>`).join('')}</a:avLst></a:prstGeom>`;
  const id = sid(ctx);
  const nv = `<p:cNvPr id="${id}" name="${esc(el.name ?? `Shape ${id}`)}"${el.alt ? ` descr="${esc(el.alt)}"` : ''}${el.hidden ? ' hidden="1"' : ''}/>`;
  if (connector) {
    return `<p:cxnSp><p:nvCxnSpPr>${nv}<p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr>${xfrm(el)}${geomXml}${lineXml(el.line)}</p:spPr></p:cxnSp>`;
  }
  const spPr = `<p:spPr>${xfrm(el)}${geomXml}${sp}${lineXml(el.line)}${effectsXml(el.effects)}</p:spPr>`;
  const txBox = !el.ph && hasText && (!el.fill || el.fill.type === 'none') ? ' txBox="1"' : '';
  return `<p:sp><p:nvSpPr>${nv}<p:cNvSpPr${txBox}/><p:nvPr>${phXml(el)}</p:nvPr></p:nvSpPr>${spPr}${textXml(el.text, rels, 'p:txBody', !!el.ph)}</p:sp>`;
}

function coverCrop(el: ImageElement, info: { w?: number; h?: number } | undefined): string {
  if (el.crop) return `<a:srcRect l="${pct(el.crop.l)}" t="${pct(el.crop.t)}" r="${pct(el.crop.r)}" b="${pct(el.crop.b)}"/>`;
  if (!info?.w || !info.h || !el.w || !el.h || el.fit === 'stretch' || el.fit === 'contain') return '';
  const ia = info.w / info.h, ea = el.w / el.h;
  const [fx, fy] = el.focus ?? [0.5, 0.5];
  if (Math.abs(ia - ea) < 0.001) return '';
  if (ia > ea) {
    const keep = ea / ia, off = (1 - keep) * fx;
    return `<a:srcRect l="${pct(off)}" r="${pct(1 - keep - off)}"/>`;
  }
  const keep = ia / ea, off = (1 - keep) * fy;
  return `<a:srcRect t="${pct(off)}" b="${pct(1 - keep - off)}"/>`;
}

function mediaPath(ctx: Ctx, src: string): string | null {
  const hit = ctx.media.get(src);
  if (hit) return hit;
  const url = ctx.getMedia(src);
  if (!url) return null;
  const b = ctx.bitmaps.get(src);
  if (b) {
    const path = `ppt/media/image${ctx.media.size + 1}.${b.ext}`;
    ctx.files[path] = [b.bytes, { level: 0 }];
    ctx.media.set(src, path);
    return path;
  }
  const { mime, bytes } = dataUrlBytes(url);
  const ext = mime === 'image/jpeg' ? 'jpeg' : mime === 'image/png' ? 'png' : mime === 'image/gif' ? 'gif' : mime === 'image/svg+xml' ? 'svg' : 'bin';
  const path = `ppt/media/image${ctx.media.size + 1}.${ext}`;
  ctx.files[path] = [bytes, { level: 0 }];
  ctx.media.set(src, path);
  return path;
}

function picXml(el: ImageElement, rels: Rels, ctx: Ctx, relBase: string): string {
  const path = mediaPath(ctx, el.src);
  if (!path) { ctx.report.skipped += 1; return ''; }
  const rid = rels.add('image', `${relBase}${path.replace('ppt/', '')}`);
  const id = sid(ctx);
  ctx.report.pictures += 1;
  const prst = el.mask && GEOM_OK.test(el.mask) ? el.mask : 'rect';
  return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${esc(el.name ?? `Picture ${id}`)}" descr="${esc(el.alt ?? '')}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr>${phXml(el)}</p:nvPr></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/>${coverCrop(el, ctx.deck.media[el.src])}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(el)}<a:prstGeom prst="${prst}"><a:avLst/></a:prstGeom>${lineXml(el.line)}</p:spPr></p:pic>`;
}

function tableXml(el: TableElement, rels: Rels, ctx: Ctx): string {
  const t = el.table;
  const accent = t.style?.accent ?? 'accent1';
  const cell = (c: TableElement['table']['rows'][number]['cells'][number], ri: number, ci: number): string => {
    const header = !!t.style?.firstRow && ri === 0;
    const band = !!t.style?.bandRows && !header && ri % 2 === 1;
    const fill = c.fill ?? (t.style && t.style.id !== 'none' ? (header ? { type: 'solid', color: accent } as Fill : band ? { type: 'solid', color: { scheme: accent, lumMod: 0.2, lumOff: 0.8 } } as Fill : null) : null);
    const body = structuredClone(c.text);
    if (header && fill && !c.fill) for (const p of body.paras) for (const r of p.runs) r.color ??= 'lt1';
    const attrs = `${c.span && c.span[1] > 1 ? ` gridSpan="${c.span[1]}"` : ''}${c.span && c.span[0] > 1 ? ` rowSpan="${c.span[0]}"` : ''}${c.merged ? ' hMerge="1"' : ''}`;
    const borders = (['l', 'r', 't', 'b'] as const).map((k) => (c.borders?.[k] ? lineXml(c.borders[k]).replace('<a:ln', `<a:ln${k.toUpperCase()}`).replace('</a:ln>', `</a:ln${k.toUpperCase()}>`) : '')).join('');
    const tx = textXml(body, rels, 'a:txBody');
    return `<a:tc${attrs}>${tx}<a:tcPr anchor="${c.anchor === 'm' ? 'ctr' : c.anchor ?? 'ctr'}" marL="${e(6)}" marR="${e(6)}" marT="${e(3)}" marB="${e(3)}">${borders}${fillXml(fill) || '<a:noFill/>'}</a:tcPr></a:tc>`;
  };
  const rows = t.rows.map((r, ri) => `<a:tr h="${e(r.h)}">${r.cells.map((c, ci) => cell(c, ri, ci)).join('')}</a:tr>`).join('');
  const id = sid(ctx);
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="${esc(el.name ?? `Table ${id}`)}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr>${phXml(el)}</p:nvPr></p:nvGraphicFramePr>${xfrm(framed(el, ctx), 'p:xfrm')}<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr${t.style?.firstRow ? ' firstRow="1"' : ''}${t.style?.bandRows ? ' bandRow="1"' : ''}/><a:tblGrid>${t.cols.map((w) => `<a:gridCol w="${e(w)}"/>`).join('')}</a:tblGrid>${rows}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
}

const CT = {
  chart: 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml',
};

function chartXml(c: ChartElement['chart']): string {
  const n = c.categories.length;
  const catRef = (): string => `<c:cat><c:strRef><c:f>Sheet1!$A$2:$A$${n + 1}</c:f><c:strCache><c:ptCount val="${n}"/>${c.categories.map((x, i) => `<c:pt idx="${i}"><c:v>${esc(x)}</c:v></c:pt>`).join('')}</c:strCache></c:strRef></c:cat>`;
  const col = (i: number): string => String.fromCharCode(66 + i);
  const pie = c.kind === 'pie' || c.kind === 'doughnut';
  const ser = (s: ChartElement['chart']['series'][number], i: number): string => {
    const color = s.color ?? (`accent${(i % 6) + 1}` as Color);
    const vals = (s.values as Array<number | null>);
    const sp = c.kind === 'line' ? `<c:spPr><a:ln w="${e(2.5)}" cap="rnd"><a:solidFill>${clr(color)}</a:solidFill><a:round/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="6"/></c:marker>` : `<c:spPr><a:solidFill>${clr(color)}</a:solidFill></c:spPr>${c.kind === 'column' || c.kind === 'bar' ? '<c:invertIfNegative val="0"/>' : ''}`;
    const dpt = pie ? c.categories.map((_, k) => `<c:dPt><c:idx val="${k}"/><c:bubble3D val="0"/><c:spPr><a:solidFill>${clr(`accent${(k % 6) + 1}`)}</a:solidFill></c:spPr></c:dPt>`).join('') : '';
    const dl = c.labels ? `<c:dLbls><c:spPr><a:noFill/></c:spPr><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>` : '';
    return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:strRef><c:f>Sheet1!$${col(i)}$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${esc(s.name)}</c:v></c:pt></c:strCache></c:strRef></c:tx>${sp}${dpt}${dl}${catRef()}<c:val><c:numRef><c:f>Sheet1!$${col(i)}$2:$${col(i)}$${n + 1}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${n}"/>${vals.map((v, k) => (v === null || v === undefined ? '' : `<c:pt idx="${k}"><c:v>${v}</c:v></c:pt>`)).join('')}</c:numCache></c:numRef></c:val>${c.kind === 'line' ? '<c:smooth val="0"/>' : ''}</c:ser>`;
  };
  const sers = c.series.map(ser).join('');
  const grouping = c.kind === 'line' || c.kind === 'area' ? (c.stacked ? 'stacked' : 'standard') : c.stacked ? (c.percent ? 'percentStacked' : 'stacked') : 'clustered';
  const ax = '<c:axId val="111111111"/><c:axId val="222222222"/>';
  let plot: string;
  if (pie) plot = c.kind === 'pie' ? `<c:pieChart><c:varyColors val="1"/>${sers}<c:firstSliceAng val="0"/></c:pieChart>` : `<c:doughnutChart><c:varyColors val="1"/>${sers}<c:firstSliceAng val="0"/><c:holeSize val="${Math.round((c.hole ?? 0.55) * 100)}"/></c:doughnutChart>`;
  else if (c.kind === 'line') plot = `<c:lineChart><c:grouping val="${grouping}"/><c:varyColors val="0"/>${sers}<c:marker val="1"/>${ax}</c:lineChart>`;
  else if (c.kind === 'area') plot = `<c:areaChart><c:grouping val="${grouping}"/><c:varyColors val="0"/>${sers}${ax}</c:areaChart>`;
  else plot = `<c:barChart><c:barDir val="${c.kind === 'bar' ? 'bar' : 'col'}"/><c:grouping val="${grouping}"/><c:varyColors val="0"/>${sers}<c:gapWidth val="80"/>${c.stacked ? '<c:overlap val="100"/>' : ''}${ax}</c:barChart>`;
  const txt = `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200"><a:solidFill>${clr(c.textColor ?? 'dk1')}</a:solidFill>${c.font ? `<a:latin typeface="${esc(fontRef(c.font))}"/>` : ''}</a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>`;
  const horizontal = c.kind === 'bar';
  const axes = pie ? '' : `<c:catAx><c:axId val="111111111"/><c:scaling><c:orientation val="${horizontal ? 'maxMin' : 'minMax'}"/></c:scaling><c:delete val="0"/><c:axPos val="${horizontal ? 'l' : 'b'}"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="222222222"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx><c:valAx><c:axId val="222222222"/><c:scaling><c:orientation val="minMax"/>${c.axes?.y?.max != null ? `<c:max val="${c.axes.y.max}"/>` : ''}${c.axes?.y?.min != null ? `<c:min val="${c.axes.y.min}"/>` : ''}</c:scaling><c:delete val="0"/><c:axPos val="${horizontal ? 'b' : 'l'}"/>${c.gridlines === false ? '' : '<c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:schemeClr val="dk1"><a:alpha val="15000"/></a:schemeClr></a:solidFill></a:ln></c:spPr></c:majorGridlines>'}<c:numFmt formatCode="${esc(c.axes?.y?.format ?? 'General')}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="111111111"/><c:crosses val="${horizontal ? 'max' : 'autoZero'}"/><c:crossBetween val="between"/></c:valAx>`;
  const legend = c.legend && c.legend !== 'none' ? `<c:legend><c:legendPos val="${c.legend === 'top' ? 't' : c.legend === 'left' ? 'l' : c.legend === 'right' ? 'r' : 'b'}"/><c:overlay val="0"/></c:legend>` : '';
  const title = c.title ? `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1400" b="1"/><a:t>${esc(c.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>` : '<c:autoTitleDeleted val="1"/>';
  return `${HEAD}<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${REL}"><c:roundedCorners val="0"/><c:chart>${title}<c:plotArea><c:layout/>${plot}${axes}</c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${txt}<c:externalData r:id="rId1"><c:autoUpdate val="0"/></c:externalData></c:chartSpace>`;
}

function chartFrame(el: ChartElement, rels: Rels, ctx: Ctx): string {
  ctx.charts += 1;
  ctx.report.charts += 1;
  const n = ctx.charts;
  ctx.files[`ppt/charts/chart${n}.xml`] = strToU8(chartXml({ ...el.chart, textColor: el.chart.textColor ?? ctx.deck.masters[0]?.textStyles.other[0]?.color ?? ctx.deck.masters[0]?.textStyles.body[0]?.color }));
  ctx.files[`ppt/charts/_rels/chart${n}.xml.rels`] = strToU8(relsXml([{ id: 'rId1', type: 'package', target: `../embeddings/Microsoft_Excel_Sheet${n}.xlsx` }]));
  ctx.files[`ppt/embeddings/Microsoft_Excel_Sheet${n}.xlsx`] = [buildXlsx(el.chart.categories, el.chart.series.map((s) => ({ name: s.name, values: s.values as Array<number | null> }))), { level: 0 }];
  const rid = rels.add('chart', `../charts/chart${n}.xml`);
  const id = sid(ctx);
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="${esc(el.name ?? `Chart ${id}`)}"/><p:cNvGraphicFramePr/><p:nvPr>${phXml(el)}</p:nvPr></p:nvGraphicFramePr>${xfrm(framed(el, ctx), 'p:xfrm')}<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="${rid}"/></a:graphicData></a:graphic></p:graphicFrame>`;
}

function elementXml(el: SlideElement, rels: Rels, ctx: Ctx, relBase: string): string {
  switch (el.type) {
    case 'shape': return shapeXml(el, rels, ctx);
    case 'image': return picXml(el, rels, ctx, relBase);
    case 'table': return tableXml(el, rels, ctx);
    case 'chart': return chartFrame(el, rels, ctx);
    case 'group': return el.children.map((c) => elementXml(c, rels, ctx, relBase)).join('');
    default: ctx.report.skipped += 1; return '';
  }
}

function bgXml(f: Fill | null | undefined): string {
  if (!f || f.type === 'image') return '';
  return `<p:bg><p:bgPr>${fillXml(f) || '<a:noFill/>'}<a:effectLst/></p:bgPr></p:bg>`;
}

function treeXml(els: SlideElement[], rels: Rels, ctx: Ctx, relBase: string): string {
  ctx.nextShape = 1;
  const body = els.map((x) => elementXml(x, rels, ctx, relBase)).join('');
  return `<p:cSld%NAME%>%BG%<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${body}</p:spTree></p:cSld>`;
}

function styleList(list: LevelStyle[], tag: string): string {
  return `<p:${tag}>${list.map((l, i) => pPr(l, `lvl${i + 1}pPr`) || `<a:lvl${i + 1}pPr/>`).join('')}</p:${tag}>`;
}

function themeXml(theme: Deck['theme'], name: string): string {
  const c = (k: string, d: string): string => `<a:srgbClr val="${(theme.colors[k] ?? d).replace('#', '').slice(0, 6).toUpperCase()}"/>`;
  const slot = (k: string, d: string): string => `<a:${k}>${c(k, d)}</a:${k}>`;
  const colors = [slot('dk1', '#000000'), slot('lt1', '#FFFFFF'), slot('dk2', '#222222'), slot('lt2', '#EEEEEE'), slot('accent1', '#F97316'), slot('accent2', '#DB2777'), slot('accent3', '#7C3AED'), slot('accent4', '#0EA5E9'), slot('accent5', '#10B981'), slot('accent6', '#EAB308'), slot('hlink', '#0563C1'), slot('folHlink', '#954F72')].join('');
  const ln = '<a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>';
  return `${HEAD}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="${esc(name)}"><a:themeElements><a:clrScheme name="${esc(theme.name)}">${colors}</a:clrScheme><a:fontScheme name="${esc(theme.name)}"><a:majorFont><a:latin typeface="${esc(theme.fonts.major)}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="${esc(theme.fonts.minor)}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Plain"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst>${ln}${ln}${ln}</a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`;
}

const LAYOUT_TYPE: Record<string, string> = { title: 'title', section: 'secHead', twoContent: 'twoObj', comparison: 'twoTxtTwoObj', titleOnly: 'titleOnly', blank: 'blank', content: 'obj', imageFull: 'picTx', quote: 'cust' };

function raster(ctx: Ctx, ids: string[]): Promise<void[]> {
  return Promise.all(ids.map(async (id) => {
    const url = ctx.getMedia(id);
    if (!url || !url.startsWith('data:image/webp')) return;
    const { bytes, mime } = dataUrlBytes(url);
    const bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type: mime }));
    const cv = document.createElement('canvas');
    cv.width = bmp.width; cv.height = bmp.height;
    const g = cv.getContext('2d');
    if (!g) return;
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(bmp, 0, 0);
    const blob: Blob = await new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', 0.9));
    ctx.bitmaps.set(id, { bytes: new Uint8Array(await blob.arrayBuffer()), ext: 'jpeg' });
  }));
}

function usedMedia(deck: Deck): string[] {
  const out = new Set<string>();
  const walk = (els: SlideElement[]): void => { for (const x of els) { if (x.type === 'image') out.add(x.src); else if (x.type === 'group') walk(x.children); } };
  deck.slides.forEach((s) => walk(s.elements));
  deck.layouts.forEach((l) => walk(l.elements));
  deck.masters.forEach((m) => walk(m.elements));
  return [...out];
}

export async function buildPptx(deck: Deck, getMedia: (id: string) => string | undefined): Promise<{ bytes: Uint8Array; report: PptxReport }> {
  const ctx: Ctx = { deck, media: new Map(), files: {}, report: { slides: 0, layouts: 0, pictures: 0, charts: 0, skipped: 0 }, getMedia, charts: 0, nextShape: 1, bitmaps: new Map() };
  await raster(ctx, usedMedia(deck));
  const over: string[] = [];
  const ct = (part: string, type: string): void => { over.push(`<Override PartName="/${part}" ContentType="${type}"/>`); };
  const OX = 'application/vnd.openxmlformats-officedocument.presentationml';
  const put = (path: string, xml: string): void => { ctx.files[path] = strToU8(xml); };

  const layoutIndex = new Map<string, number>();
  deck.layouts.forEach((l, i) => layoutIndex.set(l.id, i + 1));
  const masterIndex = new Map<string, number>();
  deck.masters.forEach((m, i) => masterIndex.set(m.id, i + 1));

  deck.masters.forEach((m: Master, mi) => {
    const rels = makeRels();
    const mine = deck.layouts.filter((l) => l.master === m.id);
    const ids = mine.map((l) => rels.add('slideLayout', `../slideLayouts/slideLayout${layoutIndex.get(l.id)}.xml`));
    rels.add('theme', `../theme/theme${mi + 1}.xml`);
    const tree = treeXml(m.elements.filter((x) => !x.hidden), rels, ctx, '../');
    const bg = bgXml(m.background) || '<p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>';
    const xml = `${HEAD}<p:sldMaster ${NS}>${tree.replace('%NAME%', '').replace('%BG%', bg)}<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst>${mine.map((l, k) => `<p:sldLayoutId id="${2147483649 + mi * 100 + k}" r:id="${ids[k]}"/>`).join('')}</p:sldLayoutIdLst><p:txStyles>${styleList(m.textStyles.title, 'titleStyle')}${styleList(m.textStyles.body, 'bodyStyle')}${styleList(m.textStyles.other, 'otherStyle')}</p:txStyles></p:sldMaster>`;
    put(`ppt/slideMasters/slideMaster${mi + 1}.xml`, xml);
    put(`ppt/slideMasters/_rels/slideMaster${mi + 1}.xml.rels`, relsXml(rels.list));
    put(`ppt/theme/theme${mi + 1}.xml`, themeXml(m.theme ?? deck.theme, m.name));
    ct(`ppt/slideMasters/slideMaster${mi + 1}.xml`, `${OX}.slideMaster+xml`);
    ct(`ppt/theme/theme${mi + 1}.xml`, 'application/vnd.openxmlformats-officedocument.theme+xml');
  });

  deck.layouts.forEach((l: Layout, li) => {
    const rels = makeRels();
    rels.add('slideMaster', `../slideMasters/slideMaster${masterIndex.get(l.master) ?? 1}.xml`);
    const tree = treeXml(l.elements.filter((x) => !x.hidden), rels, ctx, '../');
    const type = l.semantic ? LAYOUT_TYPE[l.semantic] : undefined;
    const xml = `${HEAD}<p:sldLayout ${NS}${type && type !== 'cust' ? ` type="${type}"` : ''} preserve="1"${l.hideMasterShapes ? ' showMasterSp="0"' : ''}>${tree.replace('%NAME%', ` name="${esc(l.name)}"`).replace('%BG%', bgXml(l.background))}<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;
    put(`ppt/slideLayouts/slideLayout${li + 1}.xml`, xml);
    put(`ppt/slideLayouts/_rels/slideLayout${li + 1}.xml.rels`, relsXml(rels.list));
    ct(`ppt/slideLayouts/slideLayout${li + 1}.xml`, `${OX}.slideLayout+xml`);
    ctx.report.layouts += 1;
  });

  const notesTheme = deck.masters.length + 1;
  put(`ppt/theme/theme${notesTheme}.xml`, themeXml(deck.theme, 'Notes'));
  ct(`ppt/theme/theme${notesTheme}.xml`, 'application/vnd.openxmlformats-officedocument.theme+xml');
  put('ppt/notesMasters/notesMaster1.xml', `${HEAD}<p:notesMaster ${NS}><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes Placeholder"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="4400550"/><a:ext cx="5486400" cy="3600450"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:notesMaster>`);
  put('ppt/notesMasters/_rels/notesMaster1.xml.rels', relsXml([{ id: 'rId1', type: 'theme', target: `../theme/theme${notesTheme}.xml` }]));
  ct('ppt/notesMasters/notesMaster1.xml', `${OX}.notesMaster+xml`);

  deck.slides.forEach((s: Slide, si) => {
    const rels = makeRels();
    rels.add('slideLayout', `../slideLayouts/slideLayout${layoutIndex.get(s.layout) ?? 1}.xml`);
    ctx.layoutEls = deck.layouts.find((l) => l.id === s.layout)?.elements;
    const tree = treeXml(s.elements.filter((x) => !x.hidden), rels, ctx, '../');
    const xml = `${HEAD}<p:sld ${NS}${s.hidden ? ' show="0"' : ''}>${tree.replace('%NAME%', s.name ? ` name="${esc(s.name)}"` : '').replace('%BG%', bgXml(s.background))}<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
    if (s.notes) {
      const nrels = [{ id: 'rId1', type: 'notesMaster', target: '../notesMasters/notesMaster1.xml' }, { id: 'rId2', type: 'slide', target: `../slides/slide${si + 1}.xml` }];
      const paras = s.notes.split('\n').map((line) => `<a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${esc(line)}</a:t></a:r></a:p>`).join('');
      put(`ppt/notesSlides/notesSlide${si + 1}.xml`, `${HEAD}<p:notes ${NS}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${paras}</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`);
      put(`ppt/notesSlides/_rels/notesSlide${si + 1}.xml.rels`, relsXml(nrels));
      ct(`ppt/notesSlides/notesSlide${si + 1}.xml`, `${OX}.notesSlide+xml`);
      rels.add('notesSlide', `../notesSlides/notesSlide${si + 1}.xml`);
    }
    put(`ppt/slides/slide${si + 1}.xml`, xml);
    put(`ppt/slides/_rels/slide${si + 1}.xml.rels`, relsXml(rels.list));
    ct(`ppt/slides/slide${si + 1}.xml`, `${OX}.slide+xml`);
    ctx.report.slides += 1;
  });

  for (let n = 1; n <= ctx.charts; n += 1) ct(`ppt/charts/chart${n}.xml`, CT.chart);

  const prels = makeRels();
  const mids = deck.masters.map((_, i) => prels.add('slideMaster', `slideMasters/slideMaster${i + 1}.xml`));
  const nm = prels.add('notesMaster', 'notesMasters/notesMaster1.xml');
  const sids = deck.slides.map((_, i) => prels.add('slide', `slides/slide${i + 1}.xml`));
  prels.add('theme', 'theme/theme1.xml');
  put('ppt/presentation.xml', `${HEAD}<p:presentation ${NS} saveSubsetFonts="1"><p:sldMasterIdLst>${mids.map((id, i) => `<p:sldMasterId id="${2147483648 + i * 100}" r:id="${id}"/>`).join('')}</p:sldMasterIdLst><p:notesMasterIdLst><p:notesMasterId r:id="${nm}"/></p:notesMasterIdLst><p:sldIdLst>${sids.map((id, i) => `<p:sldId id="${256 + i}" r:id="${id}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${e(deck.size.w)}" cy="${e(deck.size.h)}"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle><a:defPPr><a:defRPr lang="en-US"/></a:defPPr></p:defaultTextStyle></p:presentation>`);
  put('ppt/_rels/presentation.xml.rels', relsXml(prels.list));
  ct('ppt/presentation.xml', `${OX}.presentation.main+xml`);

  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  put('docProps/core.xml', `${HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(deck.title)}</dc:title><dc:creator>FormDeck demo</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
  put('docProps/app.xml', `${HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>FormDeck</Application><Slides>${deck.slides.length}</Slides></Properties>`);
  ct('docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml');
  ct('docProps/app.xml', 'application/vnd.openxmlformats-officedocument.extended-properties+xml');
  put('_rels/.rels', relsXml([
    { id: 'rId1', type: 'officeDocument', target: 'ppt/presentation.xml' },
    { id: 'rId2', type: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', target: 'docProps/core.xml' },
    { id: 'rId3', type: 'extended-properties', target: 'docProps/app.xml' },
  ]));
  const exts = new Set(Object.keys(ctx.files).map((k) => k.split('.').pop() ?? ''));
  const defaults = [['rels', 'application/vnd.openxmlformats-package.relationships+xml'], ['xml', 'application/xml'], ['jpeg', 'image/jpeg'], ['png', 'image/png'], ['gif', 'image/gif'], ['svg', 'image/svg+xml'], ['xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']]
    .filter(([x]) => x === 'rels' || x === 'xml' || exts.has(x)).map(([x, t]) => `<Default Extension="${x}" ContentType="${t}"/>`).join('');
  const types = `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${defaults}${over.join('')}</Types>`;
  const out: Zippable = { '[Content_Types].xml': strToU8(types), ...ctx.files };
  return { bytes: zipSync(out, { level: 6 }), report: ctx.report };
}
