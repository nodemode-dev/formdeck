import type { Deck, Layout, LevelStyle, Master, Para, ShapeElement, Slide, SlideElement, TextBody } from '../../frontend/src/engine/model';
import { putMedia } from './media';

export interface Palette { id: string; name: string; colors: Record<string, string>; fonts: { major: string; minor: string } }

export const PALETTES: Palette[] = [
  { id: 'ember', name: 'Ember', fonts: { major: 'Space Grotesk', minor: 'Inter' }, colors: { dk1: '#0E0F13', lt1: '#F5F6F8', dk2: '#1B1D24', lt2: '#B9BFCC', accent1: '#F97316', accent2: '#5B8DEF', accent3: '#34D399', accent4: '#A78BFA', accent5: '#FBBF24', accent6: '#F472B6', hlink: '#5B8DEF', folHlink: '#A78BFA' } },
  { id: 'tide', name: 'Tide', fonts: { major: 'Fraunces', minor: 'Work Sans' }, colors: { dk1: '#07161C', lt1: '#EEF7F8', dk2: '#0F2A33', lt2: '#A9C7CC', accent1: '#2DD4BF', accent2: '#38BDF8', accent3: '#A3E635', accent4: '#818CF8', accent5: '#FACC15', accent6: '#FB7185', hlink: '#38BDF8', folHlink: '#818CF8' } },
  { id: 'editorial', name: 'Editorial', fonts: { major: 'DM Serif Display', minor: 'DM Sans' }, colors: { dk1: '#F6F1E7', lt1: '#201C14', dk2: '#E8DFCC', lt2: '#5A5240', accent1: '#C2410C', accent2: '#1D4ED8', accent3: '#15803D', accent4: '#7E22CE', accent5: '#B45309', accent6: '#BE123C', hlink: '#1D4ED8', folHlink: '#7E22CE' } },
  { id: 'violet', name: 'Violet', fonts: { major: 'Sora', minor: 'Manrope' }, colors: { dk1: '#120B22', lt1: '#F3EEFF', dk2: '#221640', lt2: '#BDB0E0', accent1: '#C084FC', accent2: '#60A5FA', accent3: '#4ADE80', accent4: '#F472B6', accent5: '#FDE047', accent6: '#FB923C', hlink: '#60A5FA', folHlink: '#F472B6' } },
];

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ridge(c: CanvasRenderingContext2D, w: number, h: number, base: number, amp: number, rand: () => number, fill: string): void {
  const waves = Array.from({ length: 4 }, (_, i) => ({ f: (i + 1.3) * (0.004 + rand() * 0.004), p: rand() * 6.28, a: amp / (i + 1) }));
  c.beginPath();
  c.moveTo(0, h);
  for (let x = 0; x <= w; x += 4) {
    let y = base;
    for (const v of waves) y += Math.sin(x * v.f + v.p) * v.a;
    c.lineTo(x, y);
  }
  c.lineTo(w, h);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
}

function mountainPicture(seed: number): string {
  const w = 1200, h = 800;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d') as CanvasRenderingContext2D;
  const rand = rng(seed);
  const sky = c.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#2b1b5e'); sky.addColorStop(0.5, '#b44f8a'); sky.addColorStop(1, '#ffb95c');
  c.fillStyle = sky; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) { c.fillStyle = `rgba(255,255,255,${0.2 + rand() * 0.6})`; c.fillRect(rand() * w, rand() * h * 0.4, 2, 2); }
  const sun = c.createRadialGradient(w * 0.7, h * 0.52, 8, w * 0.7, h * 0.52, 190);
  sun.addColorStop(0, 'rgba(255,245,214,1)'); sun.addColorStop(0.25, 'rgba(255,214,150,0.55)'); sun.addColorStop(1, 'rgba(255,184,120,0)');
  c.fillStyle = sun; c.fillRect(0, 0, w, h);
  const layers = ['#6b3d8f', '#4a2a78', '#2f1d5c', '#1a1038'];
  layers.forEach((col, i) => ridge(c, w, h, h * (0.5 + i * 0.12), 70 - i * 8, rand, col));
  return cv.toDataURL('image/png');
}

function cityPicture(seed: number): string {
  const w = 1200, h = 800;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d') as CanvasRenderingContext2D;
  const rand = rng(seed);
  const sky = c.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#071a2e'); sky.addColorStop(0.65, '#164e63'); sky.addColorStop(1, '#f59e0b');
  c.fillStyle = sky; c.fillRect(0, 0, w, h);
  for (let layer = 0; layer < 3; layer++) {
    const shade = ['#0d2b3e', '#0a1f2f', '#06121d'][layer];
    let x = -20;
    while (x < w) {
      const bw = 60 + rand() * 110, bh = 140 + rand() * (260 + layer * 90);
      c.fillStyle = shade; c.fillRect(x, h - bh - layer * 10, bw, bh + layer * 10);
      if (layer > 0) {
        for (let wy = h - bh + 14; wy < h - 20; wy += 26) for (let wx = x + 10; wx < x + bw - 12; wx += 20) {
          if (rand() > 0.55) { c.fillStyle = `rgba(253,224,71,${0.35 + rand() * 0.5})`; c.fillRect(wx, wy, 8, 12); }
        }
      }
      x += bw + 4 + rand() * 12;
    }
  }
  return cv.toDataURL('image/png');
}

const txt = (s: string, o: Record<string, unknown> = {}): Para => ({ runs: [{ t: s, ...o }] });
const body = (paras: Para[], extra: Partial<TextBody> = {}): TextBody => ({ paras, ...extra });

let eid = 0;
const nid = (): string => `e${++eid}`;

function ph(type: 'title' | 'ctrTitle' | 'subTitle' | 'body' | 'sldNum' | 'ftr', idx: number, text: TextBody, frame?: { x: number; y: number; w: number; h: number }): ShapeElement {
  return { id: nid(), type: 'shape', ph: { type, idx }, text, ...(frame ?? {}) };
}

const numEl = (): ShapeElement => ph('sldNum', 12, body([txt('‹#›')]));

const TITLE_STYLE: LevelStyle[] = [{ sz: 40, font: '+mj', color: 'lt1', b: true, align: 'l', lineSpacing: 1.02 }];
const BODY_STYLE: LevelStyle[] = [
  { sz: 22, font: '+mn', color: 'lt1', align: 'l', bullet: { type: 'char', char: '•', color: 'accent1' }, marL: 26, indent: -26, spaceAfter: 12, lineSpacing: 1.12 },
  { sz: 18, font: '+mn', color: 'lt2', align: 'l', bullet: { type: 'char', char: '–', color: 'accent1' }, marL: 52, indent: -22, spaceAfter: 8, lineSpacing: 1.1 },
];
const OTHER_STYLE: LevelStyle[] = [{ sz: 14, font: '+mn', color: 'lt2', align: 'l', bullet: { type: 'none' } }];

function buildMaster(): Master {
  return {
    id: 'm1', name: 'Ember', background: { type: 'solid', color: 'dk1' },
    elements: [
      { id: 'm_bar', type: 'shape', geom: 'rect', x: 56, y: 34, w: 44, h: 4, fill: { type: 'solid', color: 'accent1' }, line: { type: 'none' } },
      { id: 'm_title', type: 'shape', ph: { type: 'title', idx: 0 }, x: 56, y: 44, w: 848, h: 92, text: body([txt('')], { anchor: 'm', autofit: 'shrink' }) },
      { id: 'm_body', type: 'shape', ph: { type: 'body', idx: 1 }, x: 56, y: 156, w: 848, h: 320, text: body([txt('')], { anchor: 't', autofit: 'shrink' }) },
      { id: 'm_num', type: 'shape', ph: { type: 'sldNum', idx: 12 }, x: 844, y: 496, w: 60, h: 24, text: body([txt('‹#›')], { anchor: 'm', lstStyle: [{ sz: 12, color: 'lt2', align: 'r' }] }) },
    ],
    textStyles: { title: TITLE_STYLE, body: BODY_STYLE, other: OTHER_STYLE },
  };
}

function glow(x: number, y: number, w: number, h: number, color: string, alpha: number): ShapeElement {
  return { id: nid(), type: 'shape', geom: 'ellipse', x, y, w, h, fill: { type: 'gradient', kind: 'radial', stops: [{ pos: 0, color: { scheme: color as 'accent1', alpha } }, { pos: 1, color: { scheme: color as 'accent1', alpha: 0 } }] }, line: { type: 'none' } };
}

function buildLayouts(): Layout[] {
  const titleFrame = { x: 56, y: 170, w: 620, h: 150 };
  const mk = (id: string, name: string, semantic: Layout['semantic'], elements: SlideElement[], hide = false): Layout => ({ id, master: 'm1', name, semantic, hideMasterShapes: hide, elements });
  return [
    mk('l_title', 'Title Slide', 'title', [
      glow(520, -120, 640, 640, 'accent1', 0.55), glow(-160, 300, 560, 560, 'accent2', 0.35),
      { id: nid(), type: 'shape', geom: 'rect', x: 56, y: 150, w: 44, h: 4, fill: { type: 'solid', color: 'accent1' }, line: { type: 'none' } },
      { id: nid(), type: 'shape', ph: { type: 'ctrTitle', idx: 0 }, ...titleFrame, text: body([txt('')], { anchor: 'b', lstStyle: [{ sz: 58, b: true, font: '+mj' }] }) },
      { id: nid(), type: 'shape', ph: { type: 'subTitle', idx: 1 }, x: 56, y: 334, w: 560, h: 90, text: body([txt('')], { anchor: 't', lstStyle: [{ sz: 22, color: 'lt2', bullet: { type: 'none' }, marL: 0, indent: 0 }] }) },
    ], true),
    mk('l_content', 'Title and Content', 'content', [
      { id: nid(), type: 'shape', ph: { type: 'title', idx: 0 }, text: body([txt('')]) },
      { id: nid(), type: 'shape', ph: { type: 'body', idx: 1 }, text: body([txt('')]) },
    ]),
    mk('l_two', 'Two Content', 'twoContent', [
      { id: nid(), type: 'shape', ph: { type: 'title', idx: 0 }, text: body([txt('')]) },
      { id: nid(), type: 'shape', ph: { type: 'body', idx: 1 }, x: 56, y: 156, w: 410, h: 320, text: body([txt('')]) },
      { id: nid(), type: 'shape', ph: { type: 'body', idx: 2 }, x: 494, y: 156, w: 410, h: 320, text: body([txt('')]) },
    ]),
    mk('l_titleOnly', 'Title Only', 'titleOnly', [{ id: nid(), type: 'shape', ph: { type: 'title', idx: 0 }, text: body([txt('')]) }]),
    mk('l_quote', 'Quote', 'quote', [
      glow(600, 160, 560, 560, 'accent4', 0.32),
      { id: nid(), type: 'shape', ph: { type: 'body', idx: 1 }, x: 96, y: 110, w: 768, h: 250, text: body([txt('')], { anchor: 'b', lstStyle: [{ sz: 36, font: '+mj', i: true, bullet: { type: 'none' }, marL: 0, indent: 0, lineSpacing: 1.15 }] }) },
      { id: nid(), type: 'shape', ph: { type: 'body', idx: 2 }, x: 96, y: 384, w: 768, h: 40, text: body([txt('')], { lstStyle: [{ sz: 18, color: 'accent1', bullet: { type: 'none' }, marL: 0, indent: 0 }] }) },
    ], true),
    mk('l_closing', 'Closing', 'closing', [
      glow(-200, -200, 700, 700, 'accent1', 0.4), glow(560, 220, 640, 640, 'accent3', 0.28),
      { id: nid(), type: 'shape', ph: { type: 'ctrTitle', idx: 0 }, x: 56, y: 180, w: 760, h: 130, text: body([txt('')], { anchor: 'b', lstStyle: [{ sz: 52, b: true, font: '+mj' }] }) },
      { id: nid(), type: 'shape', ph: { type: 'subTitle', idx: 1 }, x: 56, y: 328, w: 700, h: 100, text: body([txt('')], { lstStyle: [{ sz: 20, color: 'lt2', bullet: { type: 'none' }, marL: 0, indent: 0 }] }) },
    ], true),
    mk('l_blank', 'Blank', 'blank', []),
  ];
}

function statCard(x: number, big: string, label: string, color: string): ShapeElement {
  return {
    id: nid(), type: 'shape', geom: 'roundRect', adj: { adj: 8000 }, x, y: 176, w: 264, h: 250,
    fill: { type: 'solid', color: 'dk2' }, line: { color: { scheme: color as 'accent1', alpha: 0.6 }, width: 1.5 },
    text: body([txt(big, { sz: 68, b: true, font: '+mj', color }), txt(label, { sz: 18, color: 'lt2' })], { anchor: 'm', inset: [22, 14, 22, 14] }),
  };
}

function buildSlides(imgA: string, imgB: string): Slide[] {
  const t = (s: string) => body([txt(s)]);
  const bullets = (items: Array<string | [string, number]>): TextBody => body(items.map((i) => (typeof i === 'string' ? txt(i) : { ...txt(i[0]), lvl: i[1] })));
  return [
    {
      id: 's1', layout: 'l_title', notes: 'Welcome. Everything on screen is the real FormDeck renderer drawing a deck.json built in code.',
      elements: [
        ph('ctrTitle', 0, t('Quarter in Review')),
        ph('subTitle', 1, t('A FormDeck sample deck, drawn live in your browser')),
        { id: nid(), type: 'image', src: imgA, x: 640, y: 64, w: 264, h: 412, fit: 'cover', mask: 'roundRect', adj: { adj: 6000 }, alt: 'Procedural mountain landscape at dusk', line: { color: { scheme: 'accent1', alpha: 0.8 }, width: 2 } },
      ],
    },
    {
      id: 's2', layout: 'l_content', notes: 'Four headlines. Each one gets its own slide or a chart later.',
      elements: [
        ph('title', 0, t('Four things happened this quarter')),
        ph('body', 1, bullets(['Onboarding time fell by more than a third', ['New guided templates, no blank page', 1], ['Agents draft the first version from notes', 1], 'Revenue grew in every region', 'The support queue stayed under two days', 'Two new offices opened on schedule'])),
        numEl(),
      ],
    },
    {
      id: 's3', layout: 'l_titleOnly', notes: 'Native chart: the data lives in the deck, so it stays editable.',
      elements: [
        ph('title', 0, t('Revenue grew in every region')),
        { id: nid(), type: 'chart', x: 56, y: 150, w: 848, h: 336, chart: { kind: 'column', categories: ['Q1', 'Q2', 'Q3', 'Q4'], series: [{ name: 'Americas', values: [42, 51, 58, 71] }, { name: 'Europe', values: [31, 36, 44, 49] }, { name: 'Asia', values: [18, 27, 33, 46] }], legend: 'top', labels: false, gridlines: true } },
        numEl(),
      ],
    },
    {
      id: 's4', layout: 'l_titleOnly', notes: 'Three numbers that matter. Shapes with text, nothing pasted in as a picture.',
      elements: [
        ph('title', 0, t('Three numbers to remember')),
        statCard(56, '38%', 'faster to a first draft', 'accent1'), statCard(348, '3.1x', 'more decks shared', 'accent2'), statCard(640, '98', 'net promoter score', 'accent3'),
        numEl(),
      ],
    },
    {
      id: 's5', layout: 'l_two', notes: 'A bulleted column beside a native table.',
      elements: [
        ph('title', 0, t('What went well, and what is next')),
        ph('body', 1, bullets(['Faster reviews', 'Cleaner hand-offs', 'Fewer late changes', ['Lock the master early', 1]])),
        {
          id: nid(), type: 'table', x: 494, y: 164, w: 410, h: 190,
          table: {
            cols: [150, 130, 130], style: { id: 'dark1', accent: 'accent1', firstRow: true, bandRows: true },
            rows: [['Area', 'Owner', 'Due'], ['Templates', 'Mara', 'Nov 14'], ['Exports', 'Joss', 'Nov 28'], ['Sharing', 'Ines', 'Dec 05']].map((r, i) => ({
              h: 46, cells: r.map((c) => ({ text: body([txt(c, { sz: 15, b: i === 0 })], { anchor: 'm' }) })),
            })),
          },
        },
        numEl(),
      ],
    },
    {
      id: 's6', layout: 'l_content', notes: 'Picture on the right, with a rounded mask and an accent outline.',
      elements: [
        ph('title', 0, t('The new city office is open')),
        { id: nid(), type: 'shape', ph: { type: 'body', idx: 1 }, x: 56, y: 156, w: 440, h: 320, text: bullets(['Forty desks and two studios', 'Walkable from the main station', ['Opening week: tours every day', 1], 'Standing room for the whole team']) },
        { id: nid(), type: 'image', src: imgB, x: 536, y: 156, w: 368, h: 320, fit: 'cover', mask: 'roundRect', adj: { adj: 5000 }, alt: 'Procedural city skyline at dusk', line: { color: 'accent1', width: 2 } },
        numEl(),
      ],
    },
    {
      id: 's7', layout: 'l_quote', notes: 'Quote layout with a soft glow behind it.',
      elements: [
        ph('body', 1, t('A deck should read like the story you would tell with no slides at all.')),
        ph('body', 2, t('The review notes, Q3')),
      ],
    },
    {
      id: 's8', layout: 'l_closing', notes: 'Your turn: open your own deck from the toolbar or drop a file onto the window.',
      elements: [
        ph('ctrTitle', 0, t('Now open your own deck')),
        ph('subTitle', 1, t('Drop a .pptx, .fdec or deck.json file onto this window. Nothing leaves your computer.')),
      ],
    },
  ];
}

export function buildSampleDeck(paletteId = 'ember'): Deck {
  eid = 0;
  const imgA = 'img_5a1d0001', imgB = 'img_5a1d0002';
  putMedia(imgA, mountainPicture(7));
  putMedia(imgB, cityPicture(11));
  const pal = PALETTES.find((p) => p.id === paletteId) ?? PALETTES[0];
  const now = new Date().toISOString();
  return {
    format: 'formdeck/deck', formatVersion: 1, id: 'd_demo0001', title: 'Quarter in Review', size: { w: 960, h: 540 },
    theme: { name: pal.name, colors: { ...pal.colors }, fonts: { ...pal.fonts } },
    masters: [buildMaster()], layouts: buildLayouts(), slides: buildSlides(imgA, imgB), sections: [], comments: [],
    media: {
      [imgA]: { name: 'mountains.png', mime: 'image/png', w: 1200, h: 800 },
      [imgB]: { name: 'city.png', mime: 'image/png', w: 1200, h: 800 },
    },
    meta: { created: now, modified: now, author: '', template: 'ember', app: 'formdeck demo' },
  };
}
