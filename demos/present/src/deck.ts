import type { Animation, Deck, ImageElement, Para, ShapeElement, Slide, SlideElement, TextBody, Transition } from '../../../frontend/src/engine/model';
import { PALETTES, body, buildLayouts, buildMaster, nid, numEl, ph, resetIds, txt } from '../../../demo/src/sample';

const MEDIA: Record<string, { name: string; w: number; h: number }> = {
  img_rise: { name: 'earthrise-apollo-8.webp', w: 1400, h: 920 },
  img_set: { name: 'earthset-artemis-ii.webp', w: 1400, h: 933 },
  img_per: { name: 'perseverance-ingenuity.webp', w: 1600, h: 1177 },
  img_sat: { name: 'saturn-cassini.webp', w: 1600, h: 818 },
  img_smile: { name: 'day-the-earth-smiled.webp', w: 1600, h: 622 },
  img_udf: { name: 'hubble-ultra-deep-field.webp', w: 1400, h: 1400 },
  img_edge: { name: 'edge-of-the-night.webp', w: 1600, h: 356 },
  img_moj: { name: 'curiosity-mojave.webp', w: 1600, h: 819 },
  img_chey: { name: 'perseverance-cheyava-falls.webp', w: 1400, h: 994 },
};

type Dir = 'l' | 'r' | 'u' | 'd';

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
const t = (s: string): TextBody => body([txt(s)]);
const bullets = (items: string[], sz: number): TextBody => body(items.map((s) => ({ runs: [{ t: s, sz }] })));

function bodyBox(x: number, y: number, w: number, h: number, items: string[], sz: number): ShapeElement {
  return { id: nid(), type: 'shape', ph: { type: 'body', idx: 1 }, x, y, w, h, text: bullets(items, sz) };
}

let aseq = 0;
function anim(target: string, effect: string, o: Partial<Animation> = {}): Animation {
  return { id: `a${++aseq}`, target, effect, class: 'entr', trigger: 'onClick', ...o };
}

const tr = (type: Transition['type'], duration: number, advanceAfter: number, dir?: Dir): Transition => ({ type, duration, advanceAfter, advanceOnClick: true, ...(dir ? { dir } : {}) });

function slides(): Slide[] {
  const rows = [
    ['Picture', 'Spacecraft', 'Taken'],
    ['Earthrise', 'Apollo 8', 'Dec 24, 1968'],
    ['Saturn from the shadow', 'Cassini', 'Jul 19, 2013'],
    ['Curiosity at Mojave', 'Curiosity rover', '2015'],
    ['Perseverance with Ingenuity', 'Perseverance rover', 'Apr 6, 2021'],
    ['Earthset', 'Artemis II, Orion', 'Apr 6, 2026'],
  ];
  const cell = (c: string, head: boolean) => ({ text: body([txt(c, { sz: 15, b: head })], { anchor: 'm' as const }) });

  const s2body = bodyBox(56, 156, 520, 320, ['Why return to a place we have already been?', 'What can a robot see that a satellite cannot?', 'What do we bring home besides pictures?'], 24);
  const s3cap = caption(56, 392, 560, 90, [line('We went to study the Moon.', 26, { font: '+mj', b: true }), line('We discovered Earth.', 26, { font: '+mj', b: true, color: 'accent1' })], 'b');
  const s3credit = caption(56, 488, 560, 20, [{ runs: [{ t: 'Apollo 8, December 24, 1968. NASA/William Anders', sz: 12, color: 'lt2' }] }]);
  const s4a = pic('img_rise', 56, 156, 410, 300, 'Earth rising above the grey lunar horizon, photographed by Apollo 8', [0.56, 0.32]);
  const s4b = pic('img_set', 494, 156, 410, 300, 'Earth setting behind the lunar horizon, photographed by the Artemis II crew', [0.42, 0.5]);
  const s4ca = caption(56, 466, 410, 22, [{ runs: [{ t: 'Earthrise. Apollo 8, 1968', sz: 14, color: 'lt2' }] }]);
  const s4cb = caption(494, 466, 410, 22, [{ runs: [{ t: 'Earthset. Artemis II, 2026', sz: 14, color: 'lt2' }] }]);
  const s5body = bodyBox(612, 156, 292, 320, ['Drills into rock and photographs the layers', 'Every layer is a page of Mars history', 'The selfie is stitched from many arm camera frames'], 19);
  const s6cap = caption(56, 330, 360, 140, [line('Perseverance and the Ingenuity helicopter, a few meters apart.', 20), line('Taken April 6, 2021, on the arm camera of the rover.', 16, { color: 'lt2' })], 'b');
  const s7body = bodyBox(56, 366, 848, 120, ['Cassini spent years around Saturn and joined 126 images into one portrait', 'Orbiters watch a whole world change, day after day', 'A rover sees a rock; an orbiter sees the weather above it'], 18);
  const s8body = bodyBox(56, 290, 520, 190, ['Cassini looked back from Saturn\'s shadow', 'Earth is the small dot in this picture', 'Everyone you know is on it'], 22);
  const s9body = bodyBox(56, 300, 500, 180, ['One tiny patch of sky, seen by Hubble', 'Light gathered over months', 'Nearly every speck is a galaxy'], 22);

  return [
    {
      id: 's1', layout: 'l_title', transition: tr('fade', 1.2, 20),
      notes: 'Open slowly and let the room settle. Say: the Moon is a place we have already been to, and we are about to go back. Pause. Ask who has seen the Artemis II Earthset picture. Take one answer, then move on. About 20 seconds.',
      elements: [
        pic('img_set', 0, 0, 960, 540, 'Earth setting behind the grey horizon of the Moon, seen from the Artemis II capsule', [0.42, 0.5], false),
        scrim(0, 0, 960, 540, 0, 0.92, 0),
        ph('ctrTitle', 0, t('Why We Keep Going Back')),
        ph('subTitle', 1, t('Six minutes on the Moon, Mars and what we bring home')),
      ],
    },
    {
      id: 's2', layout: 'l_titleOnly', transition: tr('push', 0.7, 35, 'l'),
      notes: 'Click once per question and read each one aloud. Do not answer yet. Tell the room the pictures will answer the first two, and that the third one is the real reason for the talk. Look up between questions.',
      animations: [anim(s2body.id, 'floatIn', { byParagraph: true, duration: 0.6 })],
      elements: [
        ph('title', 0, t('Three questions for six minutes')),
        s2body,
        pic('img_chey', 612, 156, 292, 320, 'The Perseverance rover on rocky Martian ground beside an arrowhead-shaped rock', [0.62, 0.45]),
        numEl(),
      ],
    },
    {
      id: 's3', layout: 'l_titleOnly', transition: tr('zoom', 0.8, 40),
      notes: 'Tell the Apollo 8 story in two sentences. Christmas Eve, 1968: the crew turned the spacecraft and saw Earth come up over the lunar horizon. William Anders took this frame. Click once for the line about what they found. Then stay quiet for three seconds.',
      animations: [anim(s3cap.id, 'wipe', { dir: 'd', duration: 0.9 })],
      elements: [
        pic('img_rise', 0, 0, 960, 540, 'Earth rising over the grey lunar horizon, seen from Apollo 8', [0.6, 0.4], false),
        scrim(0, 0, 960, 540, 90, 0.85, 0),
        ph('title', 0, t('1968: the first Earthrise')),
        s3cap,
        s3credit,
      ],
    },
    {
      id: 's4', layout: 'l_titleOnly', transition: tr('split', 0.9, 35, 'l'),
      notes: 'Left is 1968. Click to bring in 2026. Same Moon, same Earth, 58 years apart, and this time the Artemis II crew took the picture from behind the Moon. Ask the room what has changed in the picture. Nothing has, and that is the point.',
      animations: [anim(s4b.id, 'fade', { duration: 0.8 }), anim(s4cb.id, 'fade', { trigger: 'withPrevious', duration: 0.8 })],
      elements: [
        ph('title', 0, t('Fifty-eight years apart')),
        s4a, s4b, s4ca, s4cb,
        numEl(),
      ],
    },
    {
      id: 's5', layout: 'l_titleOnly', transition: tr('cover', 0.6, 45, 'r'),
      notes: 'Robots go where we cannot yet. Curiosity climbs Mount Sharp and reads the rock layers like pages. Three clicks, one point each. The selfie is a mosaic of many frames taken by the camera on the rover arm.',
      animations: [anim(s5body.id, 'wipe', { dir: 'l', byParagraph: true, duration: 0.6 })],
      elements: [
        ph('title', 0, t('A robot geologist on Mount Sharp')),
        pic('img_moj', 56, 156, 530, 320, 'The Curiosity rover on a rocky rise on Mount Sharp under a pale Martian sky', [0.5, 0.42]),
        s5body,
        numEl(),
      ],
    },
    {
      id: 's6', layout: 'l_titleOnly', transition: tr('reveal', 1, 30, 'l'),
      notes: 'Two robots in one frame. Ingenuity, the small helicopter, was carried by Perseverance and flew for the first time later that month. Click for the caption. This is the moment to say that going back is how we find out what is possible.',
      animations: [anim(s6cap.id, 'floatIn', { duration: 0.7 })],
      elements: [
        pic('img_per', 0, 0, 960, 540, 'The Perseverance rover on Mars with the Ingenuity helicopter on the ground beside it', [0.82, 0.5], false),
        scrim(0, 0, 960, 540, 0, 0.85, 0),
        ph('title', 0, t('Two robots, one frame')),
        s6cap,
        numEl(),
      ],
    },
    {
      id: 's7', layout: 'l_titleOnly', transition: tr('push', 0.8, 35, 'u'),
      notes: 'The long view. An orbiter does not see one rock, it sees the weather. Cassini spent years at Saturn and this banner shows the planet\'s shadow across its rings. Click three times, one line each, and keep the middle line for last.',
      animations: [anim(s7body.id, 'fade', { byParagraph: true, duration: 0.6 })],
      elements: [
        ph('title', 0, t('Orbiters give us the long view')),
        pic('img_edge', 56, 150, 848, 200, 'Saturn casts its shadow across the bright and dark bands of its rings', [0.5, 0.5]),
        s7body,
        numEl(),
      ],
    },
    {
      id: 's8', layout: 'l_titleOnly', transition: tr('fade', 2, 40),
      notes: 'Slow down for this one. In July 2013 Cassini turned to look back from Saturn\'s shadow, and Earth is in this picture as a small dot beyond the rings. Click through the three lines. Pause after the last one. Count to four before you move on.',
      animations: [anim(s8body.id, 'wipe', { dir: 'l', byParagraph: true, duration: 0.7 })],
      elements: [
        pic('img_smile', 0, 0, 960, 540, 'Saturn eclipsing the Sun, its rings glowing, with Earth a small dot in the distance', [0.5, 0.5], false),
        scrim(0, 150, 960, 390, 90, 0, 0.9),
        ph('title', 0, t('Earth is in this picture')),
        s8body,
        numEl(),
      ],
    },
    {
      id: 's9', layout: 'l_titleOnly', transition: tr('cube', 1, 30, 'd'),
      notes: 'Zoom out as far as we can. One tiny patch of sky, and nearly every speck is a whole galaxy. Three clicks. Then bring it back to the question: what do we bring home from all this looking?',
      animations: [anim(s9body.id, 'zoom', { byParagraph: true, duration: 0.6 })],
      elements: [
        pic('img_udf', 0, 0, 960, 540, 'The Hubble Ultra Deep Field: faint galaxies of many shapes and colors on black', [0.5, 0.5], false),
        scrim(0, 0, 960, 540, 0, 0.92, 0.1),
        ph('title', 0, t('Every speck is a galaxy')),
        s9body,
        numEl(),
      ],
    },
    {
      id: 's10', layout: 'l_closing', transition: tr('fade', 1.2, 25),
      notes: 'Answer the third question: we bring home a view of ourselves. Thank the room. Invite questions. If someone asks where a picture came from, press H to jump to the hidden backup slide with the table of sources.',
      elements: [
        ph('ctrTitle', 0, t('What we bring home is a view of ourselves')),
        ph('subTitle', 1, t('Thank you. Questions?')),
      ],
    },
    {
      id: 's11', layout: 'l_titleOnly', hidden: true, transition: tr('none', 0, 0),
      notes: 'Hidden backup slide. It is skipped in the show and in the PDF. Press H in the show to jump here when someone asks where a picture came from.',
      elements: [
        ph('title', 0, t('Backup: where each picture was taken')),
        {
          id: nid(), type: 'table', x: 56, y: 152, w: 848, h: 252,
          table: { cols: [380, 250, 218], style: { id: 'lines', accent: 'accent1', firstRow: true, bandRows: false }, rows: rows.map((r, i) => ({ h: 42, cells: r.map((c) => cell(c, i === 0)) })) },
        },
        caption(56, 428, 848, 40, [{ runs: [{ t: 'All pictures are NASA images. Credits are listed in demos/present/CREDITS.md.', sz: 13, color: 'lt2' }] }]),
        numEl(),
      ],
    },
  ];
}

export function buildTalk(): Deck {
  resetIds();
  aseq = 0;
  const pal = PALETTES.find((p) => p.id === 'tide') ?? PALETTES[0];
  const now = new Date().toISOString();
  const media: Deck['media'] = {};
  for (const [id, m] of Object.entries(MEDIA)) media[id] = { name: m.name, mime: 'image/webp', w: m.w, h: m.h };
  return {
    format: 'formdeck/deck', formatVersion: 1, id: 'd_present01', title: 'Why We Keep Going Back', size: { w: 960, h: 540 },
    theme: { name: pal.name, colors: { ...pal.colors }, fonts: { ...pal.fonts } },
    masters: [buildMaster()], layouts: buildLayouts(), slides: slides(), sections: [], comments: [], media,
    show: { useTimings: false, loop: false },
    meta: { created: now, modified: now, author: '', template: 'tide', app: 'formdeck demo' },
  };
}

export const flatEls = (list: SlideElement[]): SlideElement[] => list.flatMap((e) => (e.type === 'group' ? flatEls(e.children) : [e]));
