export type SchemeName = 'dk1' | 'lt1' | 'dk2' | 'lt2' | 'accent1' | 'accent2' | 'accent3' | 'accent4' | 'accent5' | 'accent6' | 'hlink' | 'folHlink' | 'tx1' | 'bg1' | 'tx2' | 'bg2';
export const SCHEME_SLOTS: SchemeName[] = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];

export interface SchemeColor { scheme: SchemeName; lumMod?: number; lumOff?: number; alpha?: number; tint?: number; shade?: number }
export type Color = string | SchemeColor;

export interface GradientStop { pos: number; color: Color }
export type Fill =
  | { type: 'none' }
  | { type: 'solid'; color: Color }
  | { type: 'gradient'; kind: 'linear' | 'radial'; angle?: number; stops: GradientStop[] }
  | { type: 'image'; src: string; mode?: 'cover' | 'contain' | 'stretch' | 'tile'; alpha?: number }
  | { type: 'pattern'; pattern: 'dots' | 'grid' | 'diag' | 'cross' | 'hstripe' | 'vstripe'; fg: Color; bg: Color };

export interface ArrowHead { type: 'triangle' | 'stealth' | 'arrow' | 'oval' | 'diamond'; size?: 'sm' | 'med' | 'lg' }
export type Dash = 'solid' | 'dash' | 'dot' | 'dashDot' | 'longDash' | 'sysDash' | 'sysDot';
export type Line = { type: 'none' } | { type?: 'solid'; color?: Color; width?: number; dash?: Dash; cap?: 'flat' | 'round' | 'square'; join?: 'miter' | 'round' | 'bevel'; head?: ArrowHead | null; tail?: ArrowHead | null };

export interface Effects {
  shadow?: { color?: Color; blur?: number; dist?: number; angle?: number } | null;
  glow?: { color?: Color; radius?: number } | null;
  softEdge?: number | null;
  reflection?: { size?: number; alpha?: number; dist?: number } | null;
}

export interface Run {
  t: string; b?: boolean; i?: boolean; u?: boolean; s?: boolean; sz?: number; font?: string; color?: Color; hl?: Color;
  link?: Link; sup?: boolean; sub?: boolean; caps?: 'all' | 'small'; spc?: number;
}
export type Bullet = { type: 'none' } | { type: 'char'; char: string; color?: Color; font?: string; size?: number } | { type: 'auto'; scheme: string; start?: number };
export interface Para {
  runs: Run[]; align?: 'l' | 'c' | 'r' | 'j'; lvl?: number; bullet?: Bullet | null;
  spaceBefore?: number; spaceAfter?: number; lineSpacing?: number | { pt: number }; marL?: number; indent?: number;
}
export interface LevelStyle {
  sz?: number; font?: string; color?: Color; b?: boolean; i?: boolean; caps?: 'all' | 'small'; spc?: number; align?: Para['align']; bullet?: Bullet | null;
  marL?: number; indent?: number; spaceBefore?: number; spaceAfter?: number; lineSpacing?: Para['lineSpacing'];
}
export interface TextBody {
  paras: Para[]; anchor?: 't' | 'm' | 'b'; autofit?: 'none' | 'shrink' | 'grow'; inset?: [number, number, number, number];
  wrap?: boolean; cols?: number; vert?: 'horz' | 'vert' | 'vert270' | 'stacked'; lstStyle?: LevelStyle[]; prompt?: string;
}

export type Link = { url: string } | { slide: string };
export type PhType = 'title' | 'ctrTitle' | 'subTitle' | 'body' | 'obj' | 'pic' | 'chart' | 'tbl' | 'dt' | 'ftr' | 'sldNum';
export interface Placeholder { type: PhType; idx?: number }

interface ElementBase {
  id: string; name?: string; x?: number; y?: number; w?: number; h?: number; rot?: number; flipH?: boolean; flipV?: boolean;
  ph?: Placeholder; slot?: string; hidden?: boolean; locked?: boolean; alt?: string; link?: Link; opacity?: number;
}
export type ConnKind = 'straight' | 'elbow' | 'curved';
export interface ConnEnd { id: string; site: number }
export interface Connection { kind: ConnKind; start?: ConnEnd; end?: ConnEnd }
export interface ShapeElement extends ElementBase {
  type: 'shape'; geom?: string; adj?: Record<string, number>; path?: string; pathSize?: [number, number]; conn?: Connection; fill?: Fill | null; line?: Line | null; effects?: Effects; text?: TextBody;
}
export interface ImageElement extends ElementBase {
  type: 'image'; src: string; crop?: { l: number; t: number; r: number; b: number }; fit?: 'cover' | 'contain' | 'stretch';
  focus?: [number, number]; mask?: string; adj?: Record<string, number>; line?: Line | null; effects?: Effects;
  adjust?: { brightness?: number; contrast?: number; saturation?: number; grayscale?: boolean; blur?: number };
}
export interface TableCell {
  text: TextBody; fill?: Fill | null; span?: [number, number]; merged?: boolean; anchor?: 't' | 'm' | 'b';
  borders?: Partial<Record<'l' | 't' | 'r' | 'b', Line>>;
}
export interface TableRow { h: number; cells: TableCell[] }
export interface TableStyle { id: 'none' | 'light1' | 'medium2' | 'dark1' | 'lines' | 'grid'; accent?: SchemeName; firstRow?: boolean; bandRows?: boolean; firstCol?: boolean; lastRow?: boolean; lastCol?: boolean; bandCols?: boolean }
export interface TableData { cols: number[]; rows: TableRow[]; style?: TableStyle }
export interface TableElement extends ElementBase { type: 'table'; table: TableData }

export type ChartKind = 'column' | 'bar' | 'line' | 'area' | 'pie' | 'doughnut' | 'scatter' | 'radar' | 'combo';
export interface ChartSeries { name: string; values: Array<number | null> | Array<[number, number]>; color?: Color | null; kind?: 'column' | 'line' }
export interface ChartAxis { min?: number | null; max?: number | null; format?: string; title?: string }
export interface ChartData {
  kind: ChartKind; categories: string[]; series: ChartSeries[]; title?: string; legend?: 'none' | 'top' | 'bottom' | 'left' | 'right';
  labels?: boolean; stacked?: boolean; percent?: boolean; axes?: { x?: ChartAxis; y?: ChartAxis }; gridlines?: boolean; style?: number; hole?: number;
  font?: string; textColor?: Color;
}
export interface ChartElement extends ElementBase { type: 'chart'; chart: ChartData }
export interface GroupElement extends ElementBase { type: 'group'; children: SlideElement[] }
export interface MediaElement extends ElementBase {
  type: 'media'; src: string; kind: 'video' | 'audio'; poster?: string; autoplay?: boolean; loop?: boolean; start?: number; end?: number; volume?: number;
  hideInShow?: boolean; narration?: boolean;
}
export type SlideElement = ShapeElement | ImageElement | TableElement | ChartElement | GroupElement | MediaElement;

export type TransitionType = 'none' | 'fade' | 'push' | 'wipe' | 'split' | 'cover' | 'uncover' | 'zoom' | 'reveal' | 'flip' | 'cube' | 'morph';
export interface Transition { type: TransitionType; duration?: number; dir?: 'l' | 'r' | 'u' | 'd'; advanceOnClick?: boolean; advanceAfter?: number | null }
export interface Animation {
  id: string; target: string; effect: string; class: 'entr' | 'emph' | 'exit' | 'path'; trigger: 'onClick' | 'withPrevious' | 'afterPrevious';
  duration?: number; delay?: number; byParagraph?: boolean; dir?: 'l' | 'r' | 'u' | 'd'; path?: string; rotate?: boolean; reverse?: boolean;
}
export type ReviewStatus = 'draft' | 'review' | 'changes' | 'approved';
export interface Slide {
  id: string; layout: string; elements: SlideElement[]; notes?: string; background?: Fill | null; hidden?: boolean; hideMasterShapes?: boolean;
  transition?: Transition | null; animations?: Animation[]; review?: { status: ReviewStatus; by?: string; at?: string } | null;
  spec?: Record<string, unknown> | null; name?: string;
}
export const SEMANTIC_LAYOUTS = ['title', 'section', 'agenda', 'content', 'twoContent', 'comparison', 'imageLeft', 'imageRight', 'imageFull', 'gallery', 'bigNumber', 'stats', 'quote', 'timeline', 'process', 'team', 'chart', 'table', 'titleOnly', 'closing', 'blank'] as const;
export type SemanticLayout = typeof SEMANTIC_LAYOUTS[number];
export interface Layout { id: string; master: string; name: string; semantic?: SemanticLayout | null; background?: Fill | null; hideMasterShapes?: boolean; elements: SlideElement[] }
export interface Master { id: string; name: string; background?: Fill | null; elements: SlideElement[]; textStyles: { title: LevelStyle[]; body: LevelStyle[]; other: LevelStyle[] } }
export interface Theme { name: string; colors: Record<string, string>; fonts: { major: string; minor: string } }
export interface Section { id: string; name: string; start: string; collapsed?: boolean }
export interface CommentReply { author: string; kind: 'user' | 'agent'; text: string; at: string; mentions?: string[] }
export interface Comment { id: string; slide: string; element?: string; author: string; kind: 'user' | 'agent'; text: string; at: string; resolved?: boolean; replies?: CommentReply[]; mentions?: string[]; assignee?: string }
export interface MediaInfo { name: string; mime: string; w?: number; h?: number; bytes?: number; frames?: number; duration?: number }
export interface CustomShow { id: string; name: string; slides: string[] }
export interface ShowSettings {
  kiosk?: boolean; loop?: boolean; range?: { from: number; to: number } | null; customShow?: string | null;
  useTimings?: boolean; noAnimation?: boolean; noNarration?: boolean; pen?: string;
}
export interface DeckMeta { created?: string; modified?: string; author?: string; template?: string; app?: string; [k: string]: unknown }
export interface Guide { id: string; axis: 'x' | 'y'; pos: number }

export interface Deck {
  format: 'formsld/deck'; formatVersion: 1; id: string; title: string; size: { w: number; h: number }; theme: Theme;
  masters: Master[]; layouts: Layout[]; slides: Slide[]; sections?: Section[]; comments?: Comment[]; media: Record<string, MediaInfo>; meta: DeckMeta;
  show?: ShowSettings | null; customShows?: CustomShow[]; guides?: Guide[];
  template?: { id: string; name: string; category?: string; tags?: string[]; source?: string; license?: string; description?: string } | null;
}

export const SLIDE_SIZES: Record<string, { w: number; h: number; label: string }> = {
  '16:9': { w: 960, h: 540, label: 'Widescreen 16:9' },
  'gslides': { w: 720, h: 405, label: 'Google Slides 16:9' },
  '4:3': { w: 720, h: 540, label: 'Standard 4:3' },
  '16:10': { w: 960, h: 600, label: '16:10' },
  'a4': { w: 842, h: 595, label: 'A4 landscape' },
  'a4p': { w: 595, h: 842, label: 'A4 portrait' },
  'letter': { w: 792, h: 612, label: 'Letter landscape' },
  'square': { w: 720, h: 720, label: 'Square 1:1' },
  'story': { w: 540, h: 960, label: 'Story 9:16' },
};

export const isShape = (e: SlideElement): e is ShapeElement => e.type === 'shape';
export const isImage = (e: SlideElement): e is ImageElement => e.type === 'image';
export const isGroup = (e: SlideElement): e is GroupElement => e.type === 'group';
