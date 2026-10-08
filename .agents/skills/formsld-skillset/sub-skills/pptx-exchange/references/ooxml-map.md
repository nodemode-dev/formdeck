# Deck model to OOXML

## Contents

- Parts
- Theme, masters, layouts
- Placeholders and semantics
- Elements
- Text
- Tables and charts
- Media
- Slides: notes, transitions, sections, review
- Known gaps

## Parts

```text
ppt/presentation.xml        slide size (sldSz in EMU), slide list, sections extension
ppt/theme/theme1.xml        theme colours (clrScheme) and fonts (majorFont, minorFont)
ppt/slideMasters/           master: background, decorations, placeholders, txStyles (title, body, other)
ppt/slideLayouts/           layouts: type, name, placeholders, decorations
ppt/slides/                 slides: spTree, transition, notes relationship
ppt/charts/, embeddings/    native charts with their workbook
ppt/media/                  pictures, video, audio
docProps/core.xml           title, author, created, modified
```

## Theme, masters, layouts

The twelve scheme slots map one to one to `clrScheme` (dk1, lt1, dk2, lt2, accent1 to accent6, hlink, folHlink). `+mj` and `+mn` map to the major and minor theme fonts. Master `txStyles` levels map to `textStyles.title`, `.body`, `.other`. Only the first master's theme is kept on import.

## Placeholders and semantics

`ph` type and idx are read and written as-is (`title`, `ctrTitle`, `subTitle`, `body`, `obj`, `pic`, `chart`, `tbl`, `dt`, `ftr`, `sldNum`). On import, `assign_semantics` gives each layout a semantic from its `type` attribute (title, obj, secHead, twoObj, twoTxTwoObj, titleOnly, blank, picTx, tbl, chart...), then strong name rules (agenda, quote, big number or statistic, stats or metrics, closing, picture left, right or full, gallery, chart, table, team, timeline, process, comparison), then weak names and structure; each semantic once. `assign_slots` names body placeholders by position (body, body2, heading, heading2, caption...). On export, `LAYOUT_TYPES` picks the OOXML type per semantic and the layout `name` is written as-is.

## Elements

| formsld | OOXML |
| --- | --- |
| shape with `geom` preset and `adj` | `p:sp` with `a:prstGeom` and `a:avLst` (`geom.py` maps names) |
| shape with `path` (custom) | `a:custGeom` |
| line | `p:cxnSp` or a line preset with head and tail ends |
| image with crop, fit, mask | `p:pic` with `a:srcRect`, fill mode, and a mask geometry |
| group | `p:grpSp` with child offsets (`Transform` on import) |
| table | `p:graphicFrame` with `a:tbl` |
| chart | `p:graphicFrame` with a chart part (`c:chartSpace`) and embedded workbook |
| media | `p:pic` with a video or audio relationship and its poster |
| SmartArt (import only) | read from the diagram drawing part as a group of shapes |

Fills, lines and effects go through `read_style.py` and `write_style.py`; scheme colours with `lumMod`, `lumOff`, `tint`, `shade`, `alpha` through `colors.py`.

## Text

Paragraph level, alignment, bullets (char, autonumber schemes, none), spacing, margins and indents map to `a:pPr`; runs to `a:rPr` (b, i, u, strike, sz in hundredths of a point, latin font, solid fill, highlight, hyperlinks, baseline for sup and sub, caps, spc). Body properties map anchor, insets, wrap, columns and vertical text; `autofit` maps to `a:normAutofit` (shrink, with `fontScale` from imported or given font scales), `a:spAutoFit` (grow) or none.

## Tables and charts

Tables write column widths, row heights, cell text, fills, borders, spans (`gridSpan`, `rowSpan`, `hMerge`, `vMerge`) and the style id with first row and banding flags. Charts write native column, bar, line, area, pie, doughnut, scatter, radar and combo charts with series, categories, colours, legend, labels, stacking and axes; `read_chart.py` reads them back into `ChartData`.

## Media

Pictures and media are copied from the content-addressed media store into `ppt/media`. Linked (external) media and legacy media import as their poster pictures with a warning; animated GIFs export as GIFs.

## Slides: notes, transitions, sections, review

Speaker notes use the notes slide. Transitions map to `p:transition` (fade, push, wipe, split, cover, uncover, zoom and the rest; morph through `mc:AlternateContent` with a fade fallback). Sections use the PowerPoint sections extension. Review status and comments are formsld-only and are not written to pptx.

## Known gaps

- Animations: not imported (warning) and not exported.
- Embedded fonts: not imported (warning) and not written.
- Multiple masters: the theme comes from the first.
- Built-in stats layout named "Statistics" re-imports without the stats semantic (the strong name rule matches it to bigNumber first).
- WordArt warps are approximated with a font size; ink is skipped; OLE objects import as preview pictures.
