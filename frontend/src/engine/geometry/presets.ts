import SOURCE from './ooxml-presets.json?raw';

export type FillMode = 'norm' | 'none' | 'lighten' | 'lightenLess' | 'darken' | 'darkenLess';
export interface GeomPath { d: string; fill: FillMode; stroke: boolean; evenOdd: boolean }
export interface GeomHandle {
  index: number; key: string; keys: string[]; x: number; y: number; dx: number; dy: number;
  solve: (px: number, py: number) => Record<string, number>;
}
export interface Geometry { paths: GeomPath[]; text: { x: number; y: number; w: number; h: number }; handles: GeomHandle[]; sites: Array<{ x: number; y: number }> }

type Arg = number | string;
type Pair = [string, string];
interface XYDef { t: 'xy'; rx?: string; nx?: string; xx?: string; ry?: string; ny?: string; xy?: string; p: Pair }
interface PolarDef { t: 'polar'; ra?: string; na?: string; xa?: string; rr?: string; nr?: string; xr?: string; p: Pair }
interface PathDef { c: string[][]; w?: number; h?: number; f?: FillMode; s?: 0 }
interface ShapeDef { av?: Pair[]; gd?: Pair[]; ah?: Array<XYDef | PolarDef>; cx?: string[][]; tx?: [string, string, string, string]; p: PathDef[] }
interface Guide { name: string; op: string; args: Arg[] }
interface Shape { av: Guide[]; gd: Guide[]; def: ShapeDef }
type Env = Record<string, number>;

const ANG = Math.PI / 10800000;
const FULL = 21600000;

const FLOW = (name: string): string => `Flowchart: ${name}`;
const CALLOUT = (kind: string, extra = ''): string => `Callout: ${kind}${extra}`;

const GALLERY: Array<[string, string, string]> = [
  ['lines', 'Lines', 'line=Line|straightConnector1=Line Arrow|bentConnector3=Connector: Elbow|curvedConnector3=Connector: Curved'],
  ['rectangles', 'Rectangles', [
    'rect=Rectangle', 'roundRect=Rectangle: Rounded Corners', 'snip1Rect=Rectangle: Single Corner Snipped', 'snip2SameRect=Rectangle: Top Corners Snipped',
    'snip2DiagRect=Rectangle: Diagonal Corners Snipped', 'snipRoundRect=Rectangle: Top Corners One Rounded and One Snipped', 'round1Rect=Rectangle: Single Corner Rounded',
    'round2SameRect=Rectangle: Top Corners Rounded', 'round2DiagRect=Rectangle: Diagonal Corners Rounded',
  ].join('|')],
  ['basicShapes', 'Basic Shapes', [
    'textBox=Text Box', 'ellipse=Oval', 'triangle=Isosceles Triangle', 'rtTriangle=Right Triangle', 'parallelogram=Parallelogram', 'trapezoid=Trapezoid', 'diamond=Diamond',
    'pentagon=Regular Pentagon', 'hexagon=Hexagon', 'heptagon=Heptagon', 'octagon=Octagon', 'decagon=Decagon', 'dodecagon=Dodecagon', 'pie=Partial Circle', 'chord=Chord',
    'teardrop=Teardrop', 'frame=Frame', 'halfFrame=Half Frame', 'corner=L-Shape', 'diagStripe=Diagonal Stripe', 'plus=Cross', 'plaque=Plaque', 'can=Cylinder', 'cube=Cube',
    'bevel=Bevel', 'donut=Donut', 'noSmoking=Not Allowed Symbol', 'blockArc=Block Arc', 'foldedCorner=Folded Corner', 'smileyFace=Smiley Face', 'heart=Heart',
    'lightningBolt=Lightning Bolt', 'sun=Sun', 'moon=Moon', 'cloud=Cloud', 'arc=Arc', 'bracketPair=Double Bracket', 'bracePair=Double Brace', 'leftBracket=Left Bracket',
    'rightBracket=Right Bracket', 'leftBrace=Left Brace', 'rightBrace=Right Brace',
  ].join('|')],
  ['blockArrows', 'Block Arrows', [
    'rightArrow=Arrow: Right', 'leftArrow=Arrow: Left', 'upArrow=Arrow: Up', 'downArrow=Arrow: Down', 'leftRightArrow=Arrow: Left-Right', 'upDownArrow=Arrow: Up-Down',
    'quadArrow=Arrow: Quad', 'leftRightUpArrow=Arrow: Left-Right-Up', 'bentArrow=Arrow: Bent', 'uturnArrow=Arrow: U-Turn', 'leftUpArrow=Arrow: Left-Up',
    'bentUpArrow=Arrow: Bent-Up', 'curvedRightArrow=Arrow: Curved Right', 'curvedLeftArrow=Arrow: Curved Left', 'curvedUpArrow=Arrow: Curved Up',
    'curvedDownArrow=Arrow: Curved Down', 'stripedRightArrow=Arrow: Striped Right', 'notchedRightArrow=Arrow: Notched Right', 'homePlate=Arrow: Pentagon',
    'chevron=Arrow: Chevron', 'rightArrowCallout=Callout: Right Arrow', 'downArrowCallout=Callout: Down Arrow', 'leftArrowCallout=Callout: Left Arrow',
    'upArrowCallout=Callout: Up Arrow', 'leftRightArrowCallout=Callout: Left-Right Arrow', 'quadArrowCallout=Callout: Quad Arrow', 'circularArrow=Arrow: Circular',
  ].join('|')],
  ['equationShapes', 'Equation Shapes', 'mathPlus=Plus Sign|mathMinus=Minus Sign|mathMultiply=Multiplication Sign|mathDivide=Division Sign|mathEqual=Equals|mathNotEqual=Not Equal'],
  ['flowchart', 'Flowchart', [
    `flowChartProcess=${FLOW('Process')}`, `flowChartAlternateProcess=${FLOW('Alternate Process')}`, `flowChartDecision=${FLOW('Decision')}`, `flowChartInputOutput=${FLOW('Data')}`,
    `flowChartPredefinedProcess=${FLOW('Predefined Process')}`, `flowChartInternalStorage=${FLOW('Internal Storage')}`, `flowChartDocument=${FLOW('Document')}`,
    `flowChartMultidocument=${FLOW('Multidocument')}`, `flowChartTerminator=${FLOW('Terminator')}`, `flowChartPreparation=${FLOW('Preparation')}`,
    `flowChartManualInput=${FLOW('Manual Input')}`, `flowChartManualOperation=${FLOW('Manual Operation')}`, `flowChartConnector=${FLOW('Connector')}`,
    `flowChartOffpageConnector=${FLOW('Off-page Connector')}`, `flowChartPunchedCard=${FLOW('Card')}`, `flowChartPunchedTape=${FLOW('Punched Tape')}`,
    `flowChartSummingJunction=${FLOW('Summing Junction')}`, `flowChartOr=${FLOW('Or')}`, `flowChartCollate=${FLOW('Collate')}`, `flowChartSort=${FLOW('Sort')}`,
    `flowChartExtract=${FLOW('Extract')}`, `flowChartMerge=${FLOW('Merge')}`, `flowChartOnlineStorage=${FLOW('Stored Data')}`, `flowChartDelay=${FLOW('Delay')}`,
    `flowChartMagneticTape=${FLOW('Sequential Access Storage')}`, `flowChartMagneticDisk=${FLOW('Magnetic Disk')}`, `flowChartMagneticDrum=${FLOW('Direct Access Storage')}`,
    `flowChartDisplay=${FLOW('Display')}`,
  ].join('|')],
  ['starsAndBanners', 'Stars and Banners', [
    'irregularSeal1=Explosion: 8 Points', 'irregularSeal2=Explosion: 14 Points',
    ...[4, 5, 6, 7, 8, 10, 12, 16, 24, 32].map((n) => `star${n}=Star: ${n} Points`),
    'ellipseRibbon2=Ribbon: Curved and Tilted Up', 'ellipseRibbon=Ribbon: Curved and Tilted Down', 'ribbon2=Ribbon: Tilted Up', 'ribbon=Ribbon: Tilted Down',
    'verticalScroll=Scroll: Vertical', 'horizontalScroll=Scroll: Horizontal', 'wave=Wave', 'doubleWave=Double Wave',
  ].join('|')],
  ['callouts', 'Callouts', [
    'wedgeRectCallout=Speech Bubble: Rectangle', 'wedgeRoundRectCallout=Speech Bubble: Rectangle with Corners Rounded', 'wedgeEllipseCallout=Speech Bubble: Oval',
    'cloudCallout=Thought Bubble: Cloud',
    ...([['', ''], ['accent', ' with Accent Bar'], ['', ' with No Border'], ['accentBorder', ' with Border and Accent Bar']] as const).flatMap(([pre, extra], i) => [1, 2, 3].map((n) => {
      const id = i === 0 ? `borderCallout${n}` : i === 2 ? `callout${n}` : `${pre}Callout${n}`;
      return `${id}=${CALLOUT(['Line', 'Bent Line', 'Double Bent Line'][n - 1] ?? 'Line', extra)}`;
    })),
  ].join('|')],
  ['actionButtons', 'Action Buttons', [
    'actionButtonBackPrevious=Back or Previous', 'actionButtonForwardNext=Forward or Next', 'actionButtonBeginning=Go to Beginning', 'actionButtonEnd=Go to End',
    'actionButtonHome=Go Home', 'actionButtonInformation=Get Information', 'actionButtonReturn=Go Back', 'actionButtonMovie=Video', 'actionButtonDocument=Document',
    'actionButtonSound=Sound', 'actionButtonHelp=Help', 'actionButtonBlank=Blank',
  ].map((s) => s.replace('=', '=Action Button: ')).join('|')],
  ['more', 'More Shapes', [
    'nonIsoscelesTrapezoid=Trapezoid: Non-isosceles', 'pieWedge=Pie Wedge', 'funnel=Funnel', 'gear6=Gear: 6 Teeth', 'gear9=Gear: 9 Teeth', 'chartPlus=Chart: Plus',
    'chartStar=Chart: Star', 'chartX=Chart: X', 'cornerTabs=Tabs: Corners', 'plaqueTabs=Tabs: Plaque', 'squareTabs=Tabs: Square', 'upDownArrowCallout=Callout: Up-Down Arrow',
    'leftCircularArrow=Arrow: Circular Left', 'leftRightCircularArrow=Arrow: Circular Both Ways', 'swooshArrow=Arrow: Swoosh', 'leftRightRibbon=Ribbon: Left-Right',
    'flowChartOfflineStorage=Flowchart: Offline Storage',
  ].join('|')],
];

export const PRESET_GROUPS: Array<{ id: string; label: string; items: Array<{ geom: string; label: string }> }> = GALLERY.map(([id, label, list]) => ({
  id,
  label,
  items: list.split('|').map((entry) => { const at = entry.indexOf('='); return { geom: entry.slice(0, at), label: entry.slice(at + 1) }; }),
}));

const LINES: ReadonlySet<string> = new Set([
  'line', 'lineInv', 'straightConnector1', 'bentConnector2', 'bentConnector3', 'bentConnector4', 'bentConnector5',
  'curvedConnector2', 'curvedConnector3', 'curvedConnector4', 'curvedConnector5',
]);
const ALIAS: Readonly<Record<string, string>> = { textBox: 'rect' };

let shapes: Map<string, Shape> | null = null;

function parseArg(t: string): Arg {
  const n = Number(t);
  return t !== '' && Number.isFinite(n) ? n : t;
}

function compile(list: Pair[] | undefined): Guide[] {
  return (list ?? []).map(([name, fmla]) => {
    const parts = fmla.trim().split(/\s+/);
    return { name, op: parts[0] ?? 'val', args: parts.slice(1).map(parseArg) };
  });
}

function table(): Map<string, Shape> {
  if (shapes) return shapes;
  const raw = JSON.parse(SOURCE) as Record<string, ShapeDef>;
  shapes = new Map(Object.entries(raw).map(([name, def]) => [name, { av: compile(def.av), gd: compile(def.gd), def }]));
  return shapes;
}

function shapeOf(name: string): { name: string; shape: Shape } | null {
  const t = table();
  const real = ALIAS[name] ?? name;
  const s = t.get(real);
  if (s) return { name: real, shape: s };
  const r = t.get('rect');
  return r ? { name: 'rect', shape: r } : null;
}

function builtins(w: number, h: number): Env {
  const ss = Math.min(w, h);
  const e: Env = Object.create(null) as Env;
  e.w = w; e.h = h; e.l = 0; e.t = 0; e.r = w; e.b = h; e.hc = w / 2; e.vc = h / 2; e.ss = ss; e.ls = Math.max(w, h);
  for (const d of [2, 3, 4, 5, 6, 8, 10, 12, 32]) { e['wd' + d] = w / d; e['hd' + d] = h / d; }
  for (const d of [2, 4, 6, 8, 16, 32]) e['ssd' + d] = ss / d;
  e.cd2 = 10800000; e.cd4 = 5400000; e.cd8 = 2700000; e['3cd4'] = 16200000; e['3cd8'] = 8100000; e['5cd8'] = 13500000; e['7cd8'] = 18900000;
  return e;
}

const look = (e: Env, a: Arg | undefined): number => (typeof a === 'number' ? a : a === undefined ? 0 : (e[a] ?? (Number(a) || 0)));

function calc(op: string, x: number, y: number, z: number): number {
  switch (op) {
    case 'val': return x;
    case '*/': return z === 0 ? 0 : (x * y) / z;
    case '+-': return x + y - z;
    case '+/': return z === 0 ? 0 : (x + y) / z;
    case '?:': return x > 0 ? y : z;
    case 'abs': return Math.abs(x);
    case 'at2': return Math.atan2(y, x) / ANG;
    case 'cat2': return x * Math.cos(Math.atan2(z, y));
    case 'sat2': return x * Math.sin(Math.atan2(z, y));
    case 'cos': return x * Math.cos(y * ANG);
    case 'sin': return x * Math.sin(y * ANG);
    case 'tan': return x * Math.tan(y * ANG);
    case 'max': return Math.max(x, y);
    case 'min': return Math.min(x, y);
    case 'mod': return Math.sqrt(x * x + y * y + z * z);
    case 'pin': return y < x ? x : y > z ? z : y;
    case 'sqrt': return Math.sqrt(Math.max(0, x));
    default: return 0;
  }
}

function run(e: Env, g: Guide): number {
  const v = calc(g.op, look(e, g.args[0]), look(e, g.args[1]), look(e, g.args[2]));
  return Number.isFinite(v) ? v : 0;
}

function given(adj: Record<string, number> | undefined, name: string, single: boolean): number | undefined {
  if (!adj) return undefined;
  let v = adj[name];
  if (v === undefined && single && name === 'adj') v = adj.adj1;
  if (v === undefined && name === 'adj1') v = adj.adj;
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function guides(s: Shape, w: number, h: number, adj: Record<string, number> | undefined): Env {
  const e = builtins(w, h);
  const single = s.av.length === 1;
  for (const g of s.av) e[g.name] = given(adj, g.name, single) ?? run(e, g);
  for (const g of s.gd) e[g.name] = run(e, g);
  return e;
}

function num(v: number): string {
  if (!Number.isFinite(v)) return '0';
  const r = Math.round(v * 1000) / 1000;
  return r === 0 ? '0' : String(r);
}

function toParam(theta: number, wr: number, hr: number): number {
  const t = Math.atan2(wr * Math.sin(theta), hr * Math.cos(theta));
  let d = t - theta;
  d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI;
  return theta + d;
}

function tracePath(p: PathDef, e: Env, w: number, h: number): string {
  const sx = p.w ? w / p.w : 1, sy = p.h ? h / p.h : 1;
  const X = (v: number): string => num(v * sx), Y = (v: number): string => num(v * sy);
  let out = '';
  let cx = 0, cy = 0, startX = 0, startY = 0;
  for (const c of p.c) {
    const a = c.slice(1).map((t) => look(e, parseArg(t)));
    switch (c[0]) {
      case 'M':
        cx = a[0] ?? 0; cy = a[1] ?? 0; startX = cx; startY = cy;
        out += `M${X(cx)} ${Y(cy)}`;
        break;
      case 'L':
        cx = a[0] ?? 0; cy = a[1] ?? 0;
        out += `L${X(cx)} ${Y(cy)}`;
        break;
      case 'Q':
        out += `Q${X(a[0] ?? 0)} ${Y(a[1] ?? 0)} ${X(a[2] ?? 0)} ${Y(a[3] ?? 0)}`;
        cx = a[2] ?? 0; cy = a[3] ?? 0;
        break;
      case 'C':
        out += `C${X(a[0] ?? 0)} ${Y(a[1] ?? 0)} ${X(a[2] ?? 0)} ${Y(a[3] ?? 0)} ${X(a[4] ?? 0)} ${Y(a[5] ?? 0)}`;
        cx = a[4] ?? 0; cy = a[5] ?? 0;
        break;
      case 'A': {
        const wr = a[0] ?? 0, hr = a[1] ?? 0, st = (a[2] ?? 0) * ANG, sw = (a[3] ?? 0) * ANG;
        if (sw === 0 || (wr === 0 && hr === 0)) break;
        const t1 = toParam(st, wr, hr), t2 = toParam(st + sw, wr, hr);
        const ox = cx - wr * Math.cos(t1), oy = cy - hr * Math.sin(t1);
        const n = Math.max(1, Math.ceil(Math.abs(t2 - t1) / (Math.PI / 2) - 1e-9));
        const step = (t2 - t1) / n, k = (4 / 3) * Math.tan(step / 4);
        let t = t1;
        for (let i = 0; i < n; i++) {
          const u = t + step;
          const x0 = ox + wr * Math.cos(t), y0 = oy + hr * Math.sin(t);
          const x3 = ox + wr * Math.cos(u), y3 = oy + hr * Math.sin(u);
          const x1 = x0 - k * wr * Math.sin(t), y1 = y0 + k * hr * Math.cos(t);
          const x2 = x3 + k * wr * Math.sin(u), y2 = y3 - k * hr * Math.cos(u);
          out += `C${X(x1)} ${Y(y1)} ${X(x2)} ${Y(y2)} ${X(x3)} ${Y(y3)}`;
          t = u;
        }
        cx = ox + wr * Math.cos(t2); cy = oy + hr * Math.sin(t2);
        break;
      }
      case 'Z':
        out += 'Z';
        cx = startX; cy = startY;
        break;
    }
  }
  return out;
}

function argmin(f: (v: number) => number, lo: number, hi: number, cur: number): number {
  if (hi < lo) [lo, hi] = [hi, lo];
  const fit = (v: number): number => Math.min(hi, Math.max(lo, v));
  let best = fit(cur), bf = f(best);
  const span = hi - lo;
  const tryAt = (v: number): void => { const c = fit(v); const fc = f(c); if (fc < bf) { bf = fc; best = c; } };
  if (span <= 4e7) for (let i = 0; i <= 64; i++) tryAt(lo + (span * i) / 64);
  else for (const s of [10, 100, 1e3, 1e4, 3e4, 1e5, 3e5, 1e6, 3e6, 1e7]) { tryAt(best + s); tryAt(best - s); }
  for (let it = 0; it < 6; it++) {
    const d = Math.max(1, Math.abs(best) * 1e-4, span <= 4e7 ? span * 1e-5 : 1);
    const fp = f(fit(best + d)), fm = f(fit(best - d));
    const g = (fp - fm) / (2 * d), c2 = (fp - 2 * bf + fm) / (d * d);
    if (!(c2 > 0) || !Number.isFinite(g)) break;
    const before = bf;
    tryAt(best - g / c2);
    if (before - bf < 1e-9) break;
  }
  let a = fit(best - Math.max(1, span <= 4e7 ? span / 64 : Math.abs(best) * 0.05 + 100)), b = fit(best + Math.max(1, span <= 4e7 ? span / 64 : Math.abs(best) * 0.05 + 100));
  const gr = (Math.sqrt(5) - 1) / 2;
  for (let it = 0; it < 40 && b - a > 0.5; it++) {
    const c = b - gr * (b - a), d = a + gr * (b - a);
    if (f(c) < f(d)) b = d; else a = c;
  }
  tryAt((a + b) / 2);
  return best;
}

const LIMIT_FIX: Readonly<Record<string, number>> = { ssd2: 50000 };

function handlesOf(s: Shape, w: number, h: number, e: Env, adj: Record<string, number> | undefined): GeomHandle[] {
  const list = s.def.ah ?? [];
  const own = new Set([...s.av, ...s.gd].map((g) => g.name));
  const limit = (t: string): number => (!own.has(t) && LIMIT_FIX[t] !== undefined ? LIMIT_FIX[t] : look(e, parseArg(t)));
  return list.map((d, index): GeomHandle => {
    const refs: Array<{ key: string; lo: number; hi: number }> = [];
    if (d.t === 'xy') {
      if (d.rx) refs.push({ key: d.rx, lo: limit(d.nx ?? '0'), hi: limit(d.xx ?? '0') });
      if (d.ry) refs.push({ key: d.ry, lo: limit(d.ny ?? '0'), hi: limit(d.xy ?? '0') });
    } else {
      if (d.ra) refs.push({ key: d.ra, lo: limit(d.na ?? '0'), hi: limit(d.xa ?? String(FULL)) });
      if (d.rr) refs.push({ key: d.rr, lo: limit(d.nr ?? '0'), hi: limit(d.xr ?? '0') });
    }
    const x = look(e, parseArg(d.p[0])), y = look(e, parseArg(d.p[1]));
    const base: Record<string, number> = { ...(adj ?? {}) };
    for (const r of refs) base[r.key] = e[r.key] ?? 0;
    const at = (vals: Record<string, number>): [number, number] => {
      const g = guides(s, w, h, vals);
      return [look(g, parseArg(d.p[0])), look(g, parseArg(d.p[1]))];
    };
    const first = refs[0] ?? { key: 'adj', lo: 0, hi: 0 };
    const v0 = base[first.key] ?? 0;
    const dv = Math.max(1, Math.abs(first.hi - first.lo) * 1e-3, Math.min(1000, Math.abs(v0) * 1e-3 + 1));
    const [px1, py1] = refs.length ? at({ ...base, [first.key]: v0 + dv }) : [x, y];
    const [px0, py0] = refs.length ? at({ ...base, [first.key]: v0 - dv }) : [x, y];
    const ddx = (px1 - px0) / (2 * dv), ddy = (py1 - py0) / (2 * dv);
    const solve = (px: number, py: number): Record<string, number> => {
      const vals = { ...base };
      const cost = (key: string) => (v: number): number => { const [hx, hy] = at({ ...vals, [key]: v }); return (hx - px) ** 2 + (hy - py) ** 2; };
      for (let round = 0; round < (refs.length > 1 ? 3 : 1); round++) for (const r of refs) vals[r.key] = argmin(cost(r.key), r.lo, r.hi, vals[r.key] ?? 0);
      const out: Record<string, number> = {};
      for (const r of refs) out[r.key] = Math.round(vals[r.key] ?? 0);
      return out;
    };
    return { index, key: first.key, keys: refs.map((r) => r.key), x, y, dx: ddx, dy: ddy, solve };
  });
}

export function presetGeometry(name: string, w: number, h: number, adj?: Record<string, number>): Geometry {
  const W = Number.isFinite(w) ? Math.max(w, 0) : 0;
  const H = Number.isFinite(h) ? Math.max(h, 0) : 0;
  const found = shapeOf(name);
  if (!found) return { paths: [], text: { x: 0, y: 0, w: W, h: H }, handles: [], sites: [] };
  const known = found.name === (ALIAS[name] ?? name);
  const a = known ? adj : undefined;
  const s = found.shape;
  const e = guides(s, W, H, a);
  const traced: GeomPath[] = s.def.p.map((p) => ({ d: tracePath(p, e, W, H), fill: p.f ?? 'norm', stroke: p.s !== 0, evenOdd: p.c.filter((c) => c[0] === 'M').length > 1 }));
  const paths = [...traced.filter((p) => p.fill !== 'none'), ...traced.filter((p) => p.fill === 'none')];
  const tx = s.def.tx;
  const text = tx
    ? { x: look(e, parseArg(tx[0])), y: look(e, parseArg(tx[1])), w: look(e, parseArg(tx[2])) - look(e, parseArg(tx[0])), h: look(e, parseArg(tx[3])) - look(e, parseArg(tx[1])) }
    : { x: 0, y: 0, w: W, h: H };
  const sites = (s.def.cx ?? []).map((c) => ({ x: look(e, parseArg(c[1] ?? '0')), y: look(e, parseArg(c[2] ?? '0')) }));
  return { paths, text, handles: handlesOf(s, W, H, e, a), sites };
}

export function handleAdjust(h: GeomHandle, px: number, py: number): Record<string, number> {
  return h.solve(px, py);
}

export function handleValue(h: GeomHandle, px: number, py: number): number {
  return handleAdjust(h, px, py)[h.key] ?? 0;
}

export function isLineGeom(name: string): boolean {
  return LINES.has(name);
}

export function addPresets(raw: string): void {
  const t = table();
  for (const [name, def] of Object.entries(JSON.parse(raw) as Record<string, ShapeDef>)) if (!t.has(name)) t.set(name, { av: compile(def.av), gd: compile(def.gd), def });
}
