import type { Deck, ImageElement, Para, ShapeElement, Slide, SlideElement, TextBody } from '../../frontend/src/engine/model';
import { PALETTES, body, buildLayouts, buildMaster, nid, numEl, ph, resetIds, txt } from './sample';

export interface Photo { id: string; name: string; alt: string; credit: string; w: number; h: number; focus: [number, number] }

export const TRAY: Photo[] = [
  { id: 'img_edge', name: 'The Edge of the Night', alt: 'Saturn casts its shadow across the bright and dark bands of its rings', credit: 'NASA/JPL-Caltech/Space Science Institute', w: 1600, h: 356, focus: [0.5, 0.5] },
  { id: 'img_moj', name: 'Curiosity at Mojave', alt: 'The Curiosity rover stands on a rocky rise on Mount Sharp under a pale sky', credit: 'NASA/JPL-Caltech/MSSS', w: 1600, h: 819, focus: [0.5, 0.4] },
  { id: 'img_chey', name: 'Perseverance and Cheyava Falls', alt: 'The Perseverance rover on rocky Martian ground beside the arrowhead-shaped rock Cheyava Falls', credit: 'NASA/JPL-Caltech/MSSS', w: 1400, h: 994, focus: [0.6, 0.45] },
];

const MEDIA: Record<string, { name: string; w: number; h: number }> = {
  img_rise: { name: 'earthrise-apollo-8.webp', w: 1400, h: 920 },
  img_set: { name: 'earthset-artemis-ii.webp', w: 1400, h: 933 },
  img_cur: { name: 'curiosity-buckskin.webp', w: 1600, h: 975 },
  img_per: { name: 'perseverance-ingenuity.webp', w: 1600, h: 1177 },
  img_jup: { name: 'jupiter-cassini.webp', w: 800, h: 1000 },
  img_sat: { name: 'saturn-cassini.webp', w: 1600, h: 818 },
  img_dot: { name: 'pale-blue-dot.webp', w: 334, h: 453 },
  img_smile: { name: 'day-the-earth-smiled.webp', w: 1600, h: 622 },
  img_udf: { name: 'hubble-ultra-deep-field.webp', w: 1400, h: 1400 },
};

const planets: Array<[string, number]> = [
  ['1995', 4], ['1996', 10], ['1997', 11], ['1998', 17], ['1999', 30], ['2000', 46], ['2001', 58], ['2002', 87], ['2003', 109], ['2004', 136], ['2005', 172], ['2006', 204], ['2007', 256],
  ['2008', 318], ['2009', 405], ['2010', 498], ['2011', 639], ['2012', 783], ['2013', 911], ['2014', 1783], ['2015', 1938], ['2016', 3442], ['2017', 3594], ['2018', 3902], ['2019', 4096],
  ['2020', 4330], ['2021', 4894], ['2022', 5261], ['2023', 5584], ['2024', 5844], ['2025', 6090], ['2026', 6464],
];

function pic(id: string, x: number, y: number, w: number, h: number, alt: string, focus: [number, number] = [0.5, 0.5], round = true): ImageElement {
  return { id: nid(), type: 'image', src: id, x, y, w, h, fit: 'cover', focus, alt, ...(round ? { mask: 'roundRect', adj: { adj: 4000 } } : {}) };
}

function scrim(x: number, y: number, w: number, h: number, angle: number, a0: number, a1: number): ShapeElement {
  return {
    id: nid(), type: 'shape', geom: 'rect', x, y, w, h, line: { type: 'none' },
    fill: { type: 'gradient', kind: 'linear', angle, stops: [{ pos: 0, color: { scheme: 'dk1', alpha: a0 } }, { pos: 1, color: { scheme: 'dk1', alpha: a1 } }] },
  };
}

function caption(x: number, y: number, w: number, h: number, paras: Para[], anchor: 't' | 'm' | 'b' = 't'): ShapeElement {
  return { id: nid(), type: 'shape', geom: 'rect', x, y, w, h, fill: { type: 'none' }, line: { type: 'none' }, text: body(paras, { anchor, inset: [0, 0, 0, 0] }) };
}

const line = (s: string, sz = 16, o: Record<string, unknown> = {}): Para => ({ runs: [{ t: s, sz, color: 'lt1', ...o }], spaceAfter: 8, lineSpacing: 1.15 });
const bullets = (items: string[], sz: number): TextBody => body(items.map((s) => ({ runs: [{ t: s, sz }] })));

function card(x: number, n: string, label: string, hint: string, id: string, alt: string, focus: [number, number]): SlideElement[] {
  return [
    pic(id, x, 150, 200, 230, alt, focus),
    caption(x, 392, 200, 90, [{ runs: [{ t: n, sz: 14, b: true, color: 'accent1' }], spaceAfter: 2 }, { runs: [{ t: label, sz: 22, b: true, font: '+mj', color: 'lt1' }], spaceAfter: 4 }, { runs: [{ t: hint, sz: 14, color: 'lt2' }] }]),
  ];
}

function stat(x: number, big: string, label: string, color: string): ShapeElement {
  return {
    id: nid(), type: 'shape', geom: 'roundRect', adj: { adj: 8000 }, x, y: 176, w: 264, h: 250,
    fill: { type: 'solid', color: 'dk2' }, line: { color: { scheme: color as 'accent1', alpha: 0.6 }, width: 1.5 },
    text: body([txt(big, { sz: 68, b: true, font: '+mj', color }), txt(label, { sz: 16, color: 'lt2' })], { anchor: 'm', inset: [22, 14, 22, 14] }),
  };
}

function slides(): Slide[] {
  const t = (s: string) => body([txt(s)]);
  const cell = (c: string, head: boolean) => ({ text: body([txt(c, { sz: 15, b: head })], { anchor: 'm' as const }) });
  const rows = [
    ['Picture', 'Spacecraft', 'Taken'],
    ['Earthrise', 'Apollo 8', 'Dec 24, 1968'],
    ['Jupiter portrait', 'Cassini', 'Dec 29, 2000'],
    ['Saturn portrait', 'Cassini', 'Oct 6, 2004'],
    ['The Day the Earth Smiled', 'Cassini', 'Jul 19, 2013'],
    ['Curiosity at Buckskin', 'Curiosity rover', 'Aug 5, 2015'],
    ['Perseverance with Ingenuity', 'Perseverance rover', 'Apr 6, 2021'],
    ['Earthset', 'Artemis II, Orion', 'Apr 6, 2026'],
  ];
  return [
    {
      id: 's1', layout: 'l_title', notes: 'Every picture in this deck is a NASA image. The deck is the real FormDeck renderer drawing a deck.json, so each title, caption and chart stays editable.',
      elements: [
        pic('img_rise', 0, 0, 960, 540, 'Earth rising over the grey lunar horizon, seen from Apollo 8', [0.6, 0.4], false),
        scrim(0, 0, 960, 540, 0, 0.92, 0),
        ph('ctrTitle', 0, t('Worlds Beyond')),
        ph('subTitle', 1, t('A tour of NASA pictures, from Earthrise to Mars and the edge of the sky')),
      ],
    },
    {
      id: 's2', layout: 'l_titleOnly', notes: 'Four stops. Each card is a picture element with a rounded mask; change the layout or the palette and they stay put.',
      elements: [
        ph('title', 0, t('Four stops from here')),
        ...card(56, '1', 'The Moon', 'Earth from lunar orbit', 'img_set', 'Earth setting behind the grey horizon of the Moon', [0.42, 0.5]),
        ...card(268, '2', 'Mars', 'Rovers take selfies', 'img_cur', 'The Curiosity rover on a rocky rise on Mars', [0.55, 0.4]),
        ...card(480, '3', 'The giants', 'Jupiter and Saturn', 'img_jup', 'Jupiter with its banded clouds and the Great Red Spot', [0.5, 0.5]),
        ...card(692, '4', 'Deep sky', 'Galaxies by the thousand', 'img_udf', 'Faint galaxies of many shapes scattered across the Hubble Ultra Deep Field', [0.5, 0.5]),
        numEl(),
      ],
    },
    {
      id: 's3', layout: 'l_titleOnly', notes: 'Apollo 8 saw Earth rise over the lunar horizon on Christmas Eve, 1968 (photo credit William Anders). On April 6, 2026 the Artemis II crew photographed Earthset from behind the Moon during a flyby of about seven hours.',
      elements: [
        ph('title', 0, t('Earthrise, then Earthset')),
        { id: nid(), type: 'shape', ph: { type: 'body', idx: 1 }, x: 56, y: 156, w: 290, h: 320, text: bullets(['Apollo 8 watched Earth rise, 1968', 'Artemis II watched it set, 2026', '58 years, one Moon'], 22) },
        pic('img_rise', 376, 156, 250, 300, 'Earth rising above the lunar horizon, photographed by Apollo 8', [0.56, 0.3]),
        pic('img_set', 654, 156, 250, 300, 'Earth setting behind the lunar horizon, photographed by the Artemis II crew', [0.42, 0.5]),
        caption(376, 466, 250, 20, [{ runs: [{ t: 'Apollo 8, 1968. NASA/William Anders', sz: 12, color: 'lt2' }] }]),
        caption(654, 466, 250, 20, [{ runs: [{ t: 'Artemis II, 2026. NASA', sz: 12, color: 'lt2' }] }]),
        numEl(),
      ],
    },
    {
      id: 's4', layout: 'l_titleOnly', notes: 'Curiosity combined several MAHLI images into this self-portrait at the Buckskin drilling site on lower Mount Sharp. The component images were taken on August 5, 2015.',
      elements: [
        ph('title', 0, t('A rover takes its own portrait')),
        pic('img_cur', 56, 156, 560, 341, 'The Curiosity rover beside its drill hole at Buckskin on lower Mount Sharp, with the Martian horizon behind', [0.5, 0.5]),
        { id: nid(), type: 'shape', ph: { type: 'body', idx: 1 }, x: 644, y: 156, w: 260, h: 340, text: bullets(['Curiosity at the Buckskin drill site', 'Lower Mount Sharp, Mars', 'Stitched from MAHLI camera frames', 'Taken August 5, 2015'], 18) },
        numEl(),
      ],
    },
    {
      id: 's5', layout: 'l_titleOnly', notes: 'Perseverance took this portrait on April 6, 2021 with the WATSON camera on its arm. Ingenuity is the small helicopter about 3.9 meters away, on the ground to the left of the rover.',
      elements: [
        pic('img_per', 0, 0, 960, 540, 'The Perseverance rover on Mars with the Ingenuity helicopter on the ground beside it', [0.82, 0.5], false),
        scrim(0, 0, 960, 540, 0, 0.85, 0),
        ph('title', 0, t('Two robots, one frame')),
        caption(56, 340, 330, 130, [line('Perseverance and the Ingenuity helicopter, about 3.9 meters apart.', 18), line('Taken April 6, 2021 with the WATSON camera on the rover arm.', 16, { color: 'lt2' })], 'b'),
        numEl(),
      ],
    },
    {
      id: 's6', layout: 'l_titleOnly', notes: 'Cassini flew past Jupiter in late 2000 and spent years at Saturn. The Saturn picture is a mosaic of 126 images taken over two hours on October 6, 2004.',
      elements: [
        ph('title', 0, t('The giants, up close')),
        pic('img_jup', 56, 156, 272, 340, 'Jupiter with its banded clouds and the Great Red Spot, in true color', [0.5, 0.5]),
        pic('img_sat', 352, 156, 552, 222, 'Saturn and its rings against black space', [0.5, 0.5]),
        caption(352, 392, 552, 104, [line('Jupiter: a true-color mosaic from Cassini at closest approach, December 29, 2000.', 15), line('Saturn: 126 Cassini images taken over two hours on October 6, 2004, joined into one portrait.', 15, { color: 'lt2' })]),
        numEl(),
      ],
    },
    {
      id: 's7', layout: 'l_titleOnly', notes: 'Voyager 1 pointed back at home from more than 4 billion miles away; Earth is less than a single pixel. In 2013 Cassini, in Saturn\'s shadow, caught Earth as a dot beyond the rings.',
      elements: [
        ph('title', 0, t('Earth is a dot of light')),
        pic('img_dot', 56, 156, 232, 340, 'A narrow ray of scattered light with Earth as a single faint dot inside it', [0.5, 0.5]),
        pic('img_smile', 316, 156, 588, 229, 'Saturn eclipsing the Sun, its rings glowing, with Earth a small dot in the distance', [0.5, 0.5]),
        caption(316, 398, 588, 98, [line('Voyager 1: from more than 4 billion miles, Earth was a crescent only 0.12 pixel in size.', 15), line('Cassini, July 19, 2013: seen from Saturn\'s shadow, beyond the rings.', 15, { color: 'lt2' })]),
        numEl(),
      ],
    },
    {
      id: 's8', layout: 'l_titleOnly', notes: 'Hubble gathered light for this view between September 2003 and January 2004. Nearly every speck is a galaxy.',
      elements: [
        ph('title', 0, t('Every speck is a galaxy')),
        pic('img_udf', 56, 156, 340, 340, 'The Hubble Ultra Deep Field: faint galaxies of many shapes and colors on black', [0.5, 0.5]),
        { id: nid(), type: 'shape', ph: { type: 'body', idx: 1 }, x: 428, y: 156, w: 476, h: 340, text: bullets(['The Hubble Ultra Deep Field: one tiny patch of sky', 'Light gathered from September 2003 to January 2004', 'Nearly every speck is a whole galaxy'], 22) },
        numEl(),
      ],
    },
    {
      id: 's9', layout: 'l_titleOnly', notes: 'Native chart, so the data stays editable. Counts are confirmed planets by discovery year from the NASA Exoplanet Archive, added up as a running total. The jump in 2014 and 2016 comes from large batches of Kepler candidates confirmed at once.',
      elements: [
        ph('title', 0, t('More than 6,000 planets around other stars')),
        { id: nid(), type: 'chart', x: 56, y: 150, w: 848, h: 310, chart: { kind: 'area', categories: planets.map((p) => p[0]), series: [{ name: 'Confirmed planets, running total', values: planets.map((p) => p[1]) }], legend: 'none', labels: false, gridlines: true } },
        caption(56, 468, 848, 22, [{ runs: [{ t: 'Running total of confirmed planets by discovery year. Source: NASA Exoplanet Archive, queried November 7, 2026.', sz: 12, color: 'lt2' }] }]),
        numEl(),
      ],
    },
    {
      id: 's10', layout: 'l_titleOnly', notes: 'A native table: every cell is editable text. These are the dates and spacecraft behind the pictures in this deck.',
      elements: [
        ph('title', 0, t('Where each picture was taken')),
        {
          id: nid(), type: 'table', x: 56, y: 152, w: 848, h: 336,
          table: { cols: [380, 250, 218], style: { id: 'lines', accent: 'accent1', firstRow: true, bandRows: false }, rows: rows.map((r, i) => ({ h: 42, cells: r.map((c) => cell(c, i === 0)) })) },
        },
        numEl(),
      ],
    },
    {
      id: 's11', layout: 'l_titleOnly', notes: 'Three numbers taken from the captions of the pictures: the mosaic of 126 frames, the selfie of 62 frames, and the distance of Voyager 1 when it looked back.',
      elements: [
        ph('title', 0, t('Three numbers behind the pictures')),
        stat(56, '126', 'Cassini images joined into one Saturn portrait', 'accent1'),
        stat(348, '62', 'images stitched into one Perseverance selfie', 'accent2'),
        stat(640, '4B+', 'miles from Earth when Voyager 1 looked back', 'accent3'),
        numEl(),
      ],
    },
    {
      id: 's12', layout: 'l_closing', notes: 'Your turn: open your own deck from the toolbar or drop a file onto the window. All pictures here are NASA images; the credits are in demo/CREDITS.md.',
      elements: [
        ph('ctrTitle', 0, t('Now open your own deck')),
        ph('subTitle', 1, t('Drop a .pptx, .fdec or deck.json file onto this window. Nothing leaves your computer.')),
      ],
    },
  ];
}

export function buildWorldsDeck(paletteId = 'ember'): Deck {
  resetIds();
  const pal = PALETTES.find((p) => p.id === paletteId) ?? PALETTES[0];
  const now = new Date().toISOString();
  const media: Deck['media'] = {};
  for (const [id, m] of Object.entries(MEDIA)) media[id] = { name: m.name, mime: 'image/webp', w: m.w, h: m.h };
  return {
    format: 'formdeck/deck', formatVersion: 1, id: 'd_worlds01', title: 'Worlds Beyond', size: { w: 960, h: 540 },
    theme: { name: pal.name, colors: { ...pal.colors }, fonts: { ...pal.fonts } },
    masters: [buildMaster()], layouts: buildLayouts(), slides: slides(), sections: [], comments: [], media,
    meta: { created: now, modified: now, author: '', template: 'ember', app: 'formdeck demo' },
  };
}

export function photoSlide(photo: Photo, after: number): { slide: Slide; ops: Array<{ op: 'set' | 'ins'; path: Array<string | number>; value: unknown; index?: number }> } {
  const sid = `p${Date.now().toString(36)}`;
  const slide: Slide = {
    id: sid, layout: 'l_titleOnly', notes: `${photo.name}. Credit: ${photo.credit}.`,
    elements: [
      { id: `${sid}a`, type: 'image', src: photo.id, x: 0, y: 0, w: 960, h: 540, fit: 'cover', focus: photo.focus, alt: photo.alt },
      { id: `${sid}b`, type: 'shape', geom: 'rect', x: 0, y: 0, w: 960, h: 200, line: { type: 'none' }, fill: { type: 'gradient', kind: 'linear', angle: 90, stops: [{ pos: 0, color: { scheme: 'dk1', alpha: 0.85 } }, { pos: 1, color: { scheme: 'dk1', alpha: 0 } }] } },
      { id: `${sid}c`, type: 'shape', ph: { type: 'title', idx: 0 }, text: { paras: [{ runs: [{ t: photo.name }] }] } },
    ],
  };
  return {
    slide,
    ops: [
      { op: 'set', path: ['media', photo.id], value: { name: `${photo.id}.webp`, mime: 'image/webp', w: photo.w, h: photo.h } },
      { op: 'ins', path: ['slides'], index: after + 1, value: slide },
    ],
  };
}
