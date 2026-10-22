# formdeck parity

How much of Microsoft PowerPoint, Apple Keynote and Google Slides formdeck 0.18.0 covers, measured row by row against its own code. formdeck was called formsld through 0.7.0. Compiled 8 October 2026 from the tree at 0.2.1 and re-scored at each release since (0.2.2, 0.3.0, 0.4.0, 0.5.0, 0.6.0, 0.7.0, 0.7.1, 0.7.2, 0.8.0, 0.8.1, 0.8.2, 0.8.3, 0.8.4, 0.8.5, 0.8.6, 0.8.7, 0.8.8, 0.8.9, 0.8.10, 0.9.1, 0.9.2; no row moved from 0.7.1 to 0.8.2, five moved at 0.8.3, four at 0.8.4, two at 0.8.5 and two at 0.8.6; at 0.8.7 only the unscored Desktop app row moved, partial to full; three moved at 0.8.8, one at 0.8.9, at 0.8.10 only the unscored Phone and tablet row, none to partial, and none at 0.9.1 and 0.9.2, desktop build fixes). At 0.10.5 nine rows were added for the 0.10 work (named text and colour styles, components, your own fonts, SVG as shapes, finding a command by name, commands for agents with exact values, the terminal with Claude Code, and the interface languages, which is a Platform row and not scored); no existing row moved. At 0.11.0 two moved with opt-in sharing on the local network: real-time co-editing partial to full, share by link none to partial. At 0.11.1 presenting to a remote audience with Q&A moved none to partial, so no scored row is None any more. At 0.11.2 tagged accessible PDF export moved partial to full: slides export as live, embedded text and still pass PDF/UA-1. At 0.6.0 the PDF workbench moved out to its own app, formpdf (github.com/nodemode-ai/formpdf), so its rows and the Acrobat comparison left this file, a Keynote column was added, and every reference mark was checked again against the vendors' documentation.

## Method

- Every row is one capability a person would look for in a presentation editor, grouped by area. The product columns say whether PowerPoint, Keynote and Google Slides offer it. They come from each vendor's own documentation, not from a trace of their code: PowerPoint for Microsoft 365 on Windows, Mac and the web (Microsoft Support, read 8 October 2026), Keynote 15.4 for Mac (the Keynote User Guide for Mac) and Google Slides on the web (Google Docs Editors Help, read 8 October 2026).
- Three marks changed on that check: PowerPoint no longer offers Compare, because Compare and Merge is retired from PowerPoint for Windows from version 2502; Google Slides edits offline but its files stay in Google Drive, so it does not offer local files; and Google Slides recordings save a video of the deck with narration, so it does offer video export (still no GIF).
- Marks for the rows added at 0.10.5, read 15 October 2026: Keynote paragraph styles update every paragraph that uses them when redefined (Keynote User Guide for Mac, "Use paragraph styles"), and PowerPoint and Google Slides have no named text styles; PowerPoint (Convert to Shape, Microsoft Support "Edit SVG images in Microsoft 365") and Keynote (Keynote User Guide, break an SVG apart into shapes) break SVGs into shapes, Google Slides does not take SVG; PowerPoint's Search box looks up commands (Microsoft Support "Learn more about PowerPoint") and Google Slides has Search the menus, Alt+/ (Docs Editors Help "tool finder"), while the Keynote User Guide documents no command search, so Keynote is marked no even though the macOS Help menu searches menus; Google Slides offers Google Fonts only, with no font upload in its help, so it is marked no for your own fonts. None of the three has components or named colour styles that update every use.
- The formdeck column was decided only by finding the code that implements the row, from the interface through to rendering, export or the engine. The evidence column names the file and symbol where the trace ended. README and skill claims were not counted.
- **Full** (1 point): implemented and reachable by a person in the app. **Partial** (0.5): present but narrower than the products, or present in the model and engine but reachable only through an agent or an import. **None** (0): nothing was found in `frontend/src` or `backend/app`.
- A comparison scores only the rows that product offers. formdeck vs PowerPoint counts the PowerPoint rows, vs Keynote the Keynote rows, vs Google Slides the Slides rows. Rows none of the three offers are where formdeck leads; they are shown and count only in the all-rows total.
- The code-traced marks above overstate what works: they came from finding code, not from using the app, and a PowerPoint power user found the app unusable. The verified score under "Scores, verified in the window" is the one to trust.
- The Platform rows are shown but not scored. The script is `docs/parity.py` (`python3 docs/parity.py md` prints the tables below).

## Scores

| Area | vs PowerPoint | vs Keynote | vs Google Slides |
| --- | --- | --- | --- |
| File and templates | 8 of 8 · 100% | 8 of 8 · 100% | 8 of 8 · 100% |
| Slides and layouts | 10 of 10 · 100% | 10 of 10 · 100% | 7 of 7 · 100% |
| Masters and themes | 3 of 3 · 100% | 1 of 1 · 100% | 3 of 3 · 100% |
| Text | 13 of 13 · 100% | 13 of 13 · 100% | 9 of 9 · 100% |
| Shapes and drawing | 7 of 7 · 100% | 7 of 7 · 100% | 6 of 6 · 100% |
| Pictures and media | 9 of 9 · 100% | 9 of 9 · 100% | 8 of 8 · 100% |
| Tables | 3 of 3 · 100% | 3 of 3 · 100% | 3 of 3 · 100% |
| Charts | 5 of 5 · 100% | 3 of 3 · 100% | 5 of 5 · 100% |
| Diagrams and SmartArt | 2 of 2 · 100% | 1 of 1 · 100% | 1 of 1 · 100% |
| Arrange and align | 7 of 7 · 100% | 7 of 7 · 100% | 5 of 5 · 100% |
| Transitions | 3 of 3 · 100% | 3 of 3 · 100% | 2 of 2 · 100% |
| Animations | 4 of 4 · 100% | 3 of 3 · 100% | 3 of 3 · 100% |
| Slideshow and presenter | 9 of 9 · 100% | 7 of 7 · 100% | 9 of 9 · 100% |
| Review and comments | 2 of 2 · 100% | 2 of 2 · 100% | 2 of 2 · 100% |
| Collaboration and sharing | 3.5 of 4 · 88% | 3.5 of 4 · 88% | 2.5 of 3 · 83% |
| Accessibility | 4 of 4 · 100% | 2 of 2 · 100% | 2 of 2 · 100% |
| Import and export | 8 of 8 · 100% | 5 of 5 · 100% | 7 of 7 · 100% |
| Print | 2 of 2 · 100% | 2 of 2 · 100% | 2 of 2 · 100% |
| Automation and agents | 3.5 of 4 · 88% | 1 of 1 · 100% | 3.5 of 4 · 88% |
| Platform | not scored | not scored | not scored |
| **Overall** | **106 of 107 · 99%** | **90.5 of 91 · 99%** | **88 of 89 · 99%** |

Across all 120 scored rows (the union of the three products plus the rows where formdeck leads), formdeck has 118 full, 2 partial and 0 none: 119 of 120 points, 99.2%.

## Scores, verified in the window

This table counts only the rows that have been seen working in the app in a real browser window (formdeck 0.13.0 to 0.19.0), with the same Full and Partial values; every other row scores 0 until it is checked, and the Seen working column in each table below says what was observed. The evidence lives in docs/parity_window.json and in docs/parity.py WINDOW.

| Area | vs PowerPoint | vs Keynote | vs Google Slides |
| --- | --- | --- | --- |
| File and templates | 8 of 8 · 100% | 8 of 8 · 100% | 8 of 8 · 100% |
| Slides and layouts | 10 of 10 · 100% | 10 of 10 · 100% | 7 of 7 · 100% |
| Masters and themes | 3 of 3 · 100% | 1 of 1 · 100% | 3 of 3 · 100% |
| Text | 13 of 13 · 100% | 12 of 13 · 92% | 9 of 9 · 100% |
| Shapes and drawing | 7 of 7 · 100% | 7 of 7 · 100% | 6 of 6 · 100% |
| Pictures and media | 9 of 9 · 100% | 9 of 9 · 100% | 8 of 8 · 100% |
| Tables | 3 of 3 · 100% | 3 of 3 · 100% | 3 of 3 · 100% |
| Charts | 5 of 5 · 100% | 3 of 3 · 100% | 5 of 5 · 100% |
| Diagrams and SmartArt | 2 of 2 · 100% | 1 of 1 · 100% | 1 of 1 · 100% |
| Arrange and align | 7 of 7 · 100% | 7 of 7 · 100% | 5 of 5 · 100% |
| Transitions | 3 of 3 · 100% | 3 of 3 · 100% | 2 of 2 · 100% |
| Animations | 4 of 4 · 100% | 3 of 3 · 100% | 3 of 3 · 100% |
| Slideshow and presenter | 6 of 9 · 67% | 6 of 7 · 86% | 6 of 9 · 67% |
| Review and comments | 2 of 2 · 100% | 2 of 2 · 100% | 2 of 2 · 100% |
| Collaboration and sharing | 3.5 of 4 · 88% | 3.5 of 4 · 88% | 2.5 of 3 · 83% |
| Accessibility | 4 of 4 · 100% | 2 of 2 · 100% | 2 of 2 · 100% |
| Import and export | 8 of 8 · 100% | 5 of 5 · 100% | 7 of 7 · 100% |
| Print | 2 of 2 · 100% | 2 of 2 · 100% | 2 of 2 · 100% |
| Automation and agents | 3.5 of 4 · 88% | 1 of 1 · 100% | 3.5 of 4 · 88% |
| Platform | not offered | not offered | not offered |
| **Overall** | **103 of 107 · 96%** | **88.5 of 91 · 97%** | **85 of 89 · 96%** |

## Where formdeck leads

Rows formdeck implements that the product does not offer:

- **Over PowerPoint (13 rows):** named text styles, components and named colour styles that update every use, per-slide review status, comparing a deck with a saved version or another file, and eight agent rows: an MCP server over HTTP and stdio, live agent edits undone per turn, contact sheets and DOM lint so the agent sees its slides, a consent switch, shipped skills for Claude Code, Codex and Cursor, a headless `build-deck` command, every command callable with exact values, and a terminal in the window with Claude Code attached.
- **Over Keynote (29 rows):** the 13 above except named text styles, plus finding a command by name, scripting and macros, the add-in Store, a remote audience that follows the show and asks questions, embedded fonts in .pptx, charts linked to a workbook, theme colours and fonts changed deck-wide, several masters in one deck, shrink-to-fit autofit, charts and animations that stay native in .pptx, diagram layouts from a script, live captions, the Check Deck accessibility checker and reading order, OpenDocument .odp and outline export as text.
- **Over Google Slides (31 rows):** the 13 over PowerPoint, plus your own fonts, SVG as shapes, embedded fonts in .pptx, sections, outline view, reset slide, text columns, WordArt and text effects, equations, edit points and merge shapes, an icon library, object lock, the selection pane with reading order, morph, motion paths, local files that work offline and the Check Deck accessibility checker.
- **Drafting from material:** PowerPoint (Copilot), Keynote and Google Slides (Gemini) all draft decks, so this row scores against them, but formdeck does it locally from md, pdf, docx, pptx, csv, xlsx, pictures and notes in one dialog (`backend/app/services/autodraft.py draft`), with no model and no account, and hands the same intake to an outside agent. A PDF opened or dropped in formdeck lands in that dialog as material, and Insert > Slides from PDF Pages turns each page into a slide.

## Where formdeck trails most

- **Collaboration and sharing, 3.5 of 4 against PowerPoint.** Share links (view, comment or edit, off by default) work on the local network and, since 0.12.0, from anywhere through a relay that the person runs; publishing to the web is still a self-contained file rather than a hosted page, so that row stays Partial.
- **Slideshow and presenter, 9 of 9.** People with a share link follow the show and send questions to Presenter View, on the local network or through the relay; unlike PowerPoint and Google Slides, there is no relay run by formdeck itself.
- **Automation, 3.5 of 4.** Macros and agents cover scripting, and add-ins install from formdeck's catalog and, since 0.12.0, from other publishers' catalogs a person adds, all with permissions and checksums; there are no reviews or ratings.
- **Smaller limits.** Subtitles need Chrome or Edge; stock images are pictures only (no video or stickers); AI pictures need an OpenAI key or a compatible image server.

Not on the list and not offered by formdeck: Keynote Slide Clean Up, PowerPoint Designer's generated designs beyond layouts (since 0.11.6 Design Ideas suggests the master's layouts that fit the slide), PowerPoint's Summary and Section Zoom (since 0.11.4 formdeck has Slide Zoom: a slide picture that jumps to its slide in the show and returns after it; since 0.11.5 it has Rehearse with Coach, the counterpart of PowerPoint Speaker Coach, and since 0.11.6 a live camera on slides, like PowerPoint Cameo and Keynote live video), and Keynote's multipresenter and FaceTime presenting.

## Line by line

### File and templates

| Capability | PowerPoint | Keynote | Slides | formdeck | Seen working | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Start a deck from a template gallery | yes | yes | yes | Full | 0.18.1: Home Templates showed 68 templates and a picked one made a deck | `frontend/src/ui/home.ts Home`, `backend/app/services/templates/catalog.py DESIGNS` (67 templates) |
| Template categories and search | yes | yes | yes | Full | 0.18.1: category chips and search filtered the templates | `frontend/src/ui/dialogs-file.ts TemplateGrid.filter` (9 categories plus Imported) |
| Import a .pptx or .potx as a template | yes | yes | yes | Full | 0.18.1: an exported .potx imported as a template with its 21 layouts | `backend/app/routers/decks.py import_bytes, save_as_template`, `TemplatePickerDialog` Import button |
| Save a deck as a template | yes | yes | yes | Full | 0.18.1: Save as Template added the deck to the template list | `backend/app/routers/decks.py save_deck_as_template`, `SaveTemplateDialog` |
| Change template keeping content | yes | yes | yes | Full | 0.18.1: Change Template to Aurora kept all five slides and their text | `backend/app/services/templates/remap.py remap`, `decks.py apply_template` |
| Autosave to a library of recent decks | yes | yes | yes | Full | 0.17.0: Recent list on Home, Pin to list and Remove from list, imported decks sort first, delete to Trash and restore | `backend/app/services/store.py` (deck.json per deck), Home Recent decks |
| Named versions with restore | yes | yes | yes | Full | 0.18.1: Restore brought back slides, theme and the template record | `decks.py /versions, /versions/{n}/restore`, `VersionsDialog` |
| Draft a deck from documents, notes, sheets and pictures | yes | yes | yes | Full | 0.18.1: Choose files with markdown, CSV, picture, PDF and Word drafted a deck | `backend/app/services/autodraft.py draft`, `routers/intake.py`, `IntakeDialog.draft` |

### Slides and layouts

| Capability | PowerPoint | Keynote | Slides | formdeck | Seen working | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Add, duplicate, delete and reorder slides | yes | yes | yes | Full | 0.18.1: New, Duplicate and Delete Slide changed the saved slide list 6 to 7 to 8 to 7; dragging a thumbnail reordered it | `frontend/src/editor/commands.ts new-slide, duplicate-slide`, `filmstrip.ts moveSlidesOps` |
| Layouts with placeholders | yes | yes | yes | Full | 0.19.0: a filled Two Content slide changed to Title Only kept both columns where they were | `backend/app/services/templates/generator.py` (21 semantic layouts), `commands.ts layoutCommands` |
| Sections | yes | yes | no | Full | 0.18.1: two Add Section calls saved two sections, the filmstrip showed headers with counts, Rename Section saved | `commands.ts add-section, rename-section`, `filmstrip.ts` section heads, `views.ts Sorter` collapse |
| Hide or skip slides | yes | yes | yes | Full | 0.18.1: Hide Slide saved hidden and the sorter flagged it; 0.18.0: the show skipped a hidden slide and H showed it | `commands.ts hide-slide`, `inspector.ts` Hidden |
| Slide size presets and custom size, scale content | yes | yes | yes | Full | 0.18.1: Standard 4:3 with Scale content changed 960 by 540 to 720 by 540 and scaled a table | `frontend/src/ui/dialogs-insert.ts SizeDlg`, `scaleOps` |
| Backgrounds: solid, gradient, picture, pattern | yes | yes | yes | Full | 0.18.1: Format Background saved gradient, pattern and picture fills and drew them | `dialogs-insert.ts BgDlg` |
| Slide sorter view | yes | yes | yes | Full | 0.18.1: grid of 7 cards, drag reorder with undo, section collapse, hidden flag | `frontend/src/editor/views.ts Sorter` |
| Outline view | yes | yes | no | Full | 0.18.1: typing in the outline saved to the body; Tab and Shift+Tab changed the level | `views.ts Outline` (edit titles and bullets, Tab to indent) |
| Speaker notes | yes | yes | yes | Full | 0.18.1: notes typed in the notes pane saved to the slide and came back on return | `app.ts` notes pane, `editor.ts` notes binding |
| Reset slide to its layout | yes | yes | no | Full | 0.18.1: Reset cleared a moved title's x, y, w and h back to the layout | `commands.ts reset-slide` |

### Masters and themes

| Capability | PowerPoint | Keynote | Slides | formdeck | Seen working | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Theme colours and fonts | yes | no | yes | Full | 0.18.1: changing accent1 in Design updated the theme and every use of it | `inspector.ts themeColor` (click a theme colour to change it deck-wide) and the Headings and Body font selects; agents use `mcp.py set_theme` |
| Edit slide masters and layouts | yes | yes | yes | Full | 0.18.1: Slide Master view listed 21 layouts; duplicate, insert and delete layout worked | View > Slide Master (`editor/master-view.ts`, `engine/holders.ts`, `ops.ts setHolderResolver`): edit master and layout elements, placeholders, level styles, backgrounds; insert, duplicate, rename, delete and drag to reorder layouts (`filmstrip.ts dragLayout`); slides update live |
| Several masters in one deck | yes | no | yes | Full | 0.18.1: Duplicate and Insert Slide Master gave three masters with their own layouts and colours | `engine/resolve.ts themedDeck` renders each slide in its master's theme; `editor/master-view.ts registerMasterCommands` inserts, duplicates, deletes and preserves masters; `services/pptx/writer.py _add_master_part` and `reader.py _load_theme` round-trip one theme part per master; MCP `masters` |

### Text

| Capability | PowerPoint | Keynote | Slides | formdeck | Seen working | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Character formatting: font, size, bold, italic, underline, strike, colour, highlight | yes | yes | yes | Full | 0.16.0: a font applied to selected text, selection kept after the pick, Shift+F3 changes case, Ctrl+Space clears formatting | `commands.ts bold..clear-format`, `toolbar.ts` font and size |
| Bullets, numbering and list levels | yes | yes | yes | Full | 0.18.1: Numbering and Bullets saved on all paragraphs; Increase and Decrease List Level changed levels | `commands.ts bullets, numbering, indent, outdent` |
| Paragraph alignment and vertical anchor | yes | yes | yes | Full | 0.18.1: Ctrl+R, E, J, L saved r, c, j, l; the anchor buttons saved t, m, b | `commands.ts text-align-*, anchor-*` |
| Autofit (shrink text, grow box) | yes | no | yes | Full | 0.18.1: shrink text fitted 14 extra lines; 0.19.0: Resize shape to fit text grew a box from 49 to 141 pt for seven lines | `frontend/src/render/text.ts fitText`, `inspector.ts` Autofit |
| Text columns | yes | yes | no | Full | 0.18.1: Columns 2 saved and the lines laid out in two columns | `inspector.ts` Columns 1 to 3 |
| Line and paragraph spacing controls | yes | yes | yes | Full | 0.18.1: line spacing 2.0 widened line gaps; space before 20 and after 10 saved | `inspector.ts` Text box: Line spacing, Paragraph before and after (`paraStyleOps`) |
| Character spacing, caps, superscript, subscript | yes | yes | yes | Full | 0.18.1: spacing 5 drew 5 px letter spacing; superscript and subscript on a selected word | Character spacing in `inspector.ts`; Format > Superscript, Subscript, All Caps, Small Caps and toolbar buttons (`commands.ts scriptToggle, capsToggle`) |
| Hyperlinks | yes | yes | yes | Full | 0.18.1: Ctrl+K saved a link exported as hlinkClick; 0.19.0: linked text draws underlined in the theme's link colour | Insert > Link, Mod+K (`ui/link-dialog.ts`): web address or slide, on selected text or whole objects; followed in `present/show.ts`, round-tripped in `pptx/write_text.py` |
| Find and replace | yes | yes | yes | Full | 0.18.1: 30 found, Match case narrowed it, Replace and Replace All changed the saved text | `dialogs-insert.ts FindPanel` (match case, whole word) |
| Spell check | yes | yes | yes | Full | 0.18.1: F7 flagged teh with suggestions and Change replaced it | `ui/dialogs-spelling.ts` Spelling (F7: suggestions, Change, Change All, Ignore, Add to Dictionary across slides, tables and notes) and Language (per run, Do not check spelling), `editor/spelling.ts` nspell with offline en-US, en-GB, es and fr dictionaries, run `lang` and `noProof` read and written in .pptx (`pptx/read_text.py`, `write_text.py`) |
| WordArt and text effects | yes | yes | no | Full | 0.18.1: the WordArt gallery inserted a styled text shape with its effect | `render/text-fx.ts drawTextFx, paintTfx` (text fill incl. picture, outline, shadow, glow, soft edges, reflection, all 40 transforms), `render/fx3d.ts` (bevel lighting, extrusion, contour, materials, 3-D rotation, shared by text and shapes; `raster.ts` warps rotated layers), 3-D Format and 3-D Rotation sections of `editor/text-effects.ts TextFxPanel` with Bevel and 3-D rotation galleries and 3-D WordArt styles, `services/pptx/text_fx.py read_3d, append_3d` (`a:sp3d`, `a:scene3d` on `a:bodyPr` and `p:spPr`), `editor/text-effects.ts TextFxPanel, WarpHandles`, `ui/wordart-gallery.ts WORDART_STYLES`, `services/pptx/text_fx.py read_warp, warp_element, append_run_fx`; the shape Format pane has no 3-D controls yet (set in the deck JSON or by MCP) |
| Equations | yes | yes | no | Full | 0.18.1: a LaTeX fraction and root previewed typeset and inserted as an equation | `editor/equation-editor.ts askEquation` (LaTeX and linear format, structure palette), `editor/equation-commands.ts registerEquationCommands`, `render/math.ts mathHtml`, `services/pptx/omml.py mathml_to_omml, omml_to_tex, wrap_math_shape`, `routers/mcp.py _paras` |
| Named text styles that update every use | no | yes | no | Full | not yet | Format > Save, Apply and Update Text Style (`editor/components.ts` text-style-save, text-style-apply, text-style-update; `deck.namedStyles`, shapes tagged `textStyle`) |
| Add your own fonts to the deck | yes | yes | no | Full | 0.18.1: Add Font stored a .ttf as deck media and offered the family | Add Font (`editor/font-commands.ts`, `services/media.py font_info, reject_font`): TTF, OTF, WOFF and WOFF2 kept in the deck, listed under In this deck, embedded in .pptx; restricted-licence fonts refused |

### Shapes and drawing

| Capability | PowerPoint | Keynote | Slides | formdeck | Seen working | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Preset shapes gallery | yes | yes | yes | Full | 0.18.0: picked a shape in the gallery and dragging on the slide drew it; a click gave a 1 inch shape, Shift made it even | `frontend/src/engine/geometry/presets.ts PRESET_GROUPS`, `dialogs-insert.ts ShapesPop` |
| Lines, arrows and connectors | yes | yes | yes | Full | 0.18.1: straight, elbow and curved connectors attached to shapes, rerouted on move and exported stCxn and endCxn | Straight, elbow and curved connectors glued to connection sites and rerouted in the same step (`engine/geometry/connectors.ts routeConnector`, `editor/connectors.ts glueOps`); `p:cxnSp` with `a:stCxn`, `a:endCxn` (`pptx/write_elements.py _connector`, `read_elements.py read_connector`) |
| Shape fill and outline colour | yes | yes | yes | Full | 0.18.1: standard and custom fills saved and drew the chosen colour | `commands.ts colorOps`, `frontend/src/ui/colorpop.ts pickColor` |
| Shape effects: shadow, glow, soft edge, reflection | yes | yes | yes | Full | 0.18.1: shadow, glow, soft edges and reflection saved and drew | `inspector.ts` Effects: shadow presets, glow, reflection (`slide.ts boxStyle`), soft edges for shapes and pictures; round-tripped in `pptx/write_style.py` |
| Freeform and scribble drawing | yes | yes | yes | Full | 0.18.1: a scribble drag saved a custom path; 0.18.0: gallery shapes drawn by drag | `editor/draw-tool.ts DrawTool` (freeform, scribble), `engine/geometry/path.ts fitCurve`; `pathSize` keeps outlines through resizing; `pptx/geom.py svg_to_cust_geom` |
| Edit points and merge shapes | yes | yes | no | Full | 0.18.1: dragging, adding and deleting points and Union, Combine, Fragment worked; 0.19.0: Smooth Point from Find a Command | `editor/points-edit.ts PointsEdit` (move, add, delete, smooth, straight, corner, open and close path); `editor/merge-shapes.ts mergeShapes` (Union, Combine, Fragment, Intersect, Subtract over `engine/geometry/boolean.ts mergeRegions`) |
| Smart guides and snapping | yes | yes | yes | Full | 0.14.0: smart guides with equal spacing, snap while resizing, Ctrl+drag copy of guides | `editor/stage.ts snap`: smart guides, guides and the grid; Alt-drag skips snapping |
| Reusable components that update every copy | no | no | no | Full | not yet | Save as Component, Insert Component, Update Component, Detach (`editor/components.ts`; `deck.components`, copies are groups tagged `component`) |
| Named colour styles that update every use | no | no | no | Full | not yet | Format > Save, Apply and Update Colour Style (`editor/colour-styles.ts`; `deck.namedColors`, shapes tagged `fillStyle`) |

### Pictures and media

| Capability | PowerPoint | Keynote | Slides | formdeck | Seen working | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Insert pictures by file, drop or paste | yes | yes | yes | Full | 0.18.1: Insert Pictures, paste and drop each inserted a picture at its size | `editor/editor.ts pickImage, insertFiles`, `app.ts` paste and drop |
| Crop and crop to shape | yes | yes | yes | Full | 0.15.0: crop to aspect ratio 1:1 on a picture | `inspector.ts` Crop (left, right, top, bottom), Fit (fill, fit, stretch) and Shape mask (square, round, circle); no drag crop handles |
| Picture adjustments | yes | yes | yes | Full | 0.18.1: brightness, contrast, saturation and blur sliders saved and drew | `inspector.ts` Brightness, Contrast, Saturation, Blur, Grayscale and Reset picture |
| Generate or edit pictures with AI | yes | yes | yes | Full | 0.19.0: against a fake OpenAI-compatible server, Generate with AI posted an image request and inserted the returned picture | Insert > Generate with AI and Picture Format > Edit with AI (`ui/dialogs-ai-image.ts`, `services/ai_images.py`): variants, shape, style, masked edits and Remove background through an OpenAI-compatible images API with the user's key or a local server, one undo step; checked against a stand-in server, no real model called |
| Stock pictures and icons library | yes | yes | yes | Full | 0.18.1: the icons library searched and inserted | `ui/dialogs-icons.ts IconsDlg` offline library of 5,817 icons; Insert > Stock Images (`ui/dialogs-stock.ts`, `services/stock.py`): Openverse photos and illustrations with licence, shape and kind filters, credit kept in alt text, notes and media; checked against replayed responses, the live API not called from here; no stock video or stickers |
| Video and audio with start, end, loop and autoplay | yes | yes | yes | Full | 0.16.0: video autoplay, full screen and volume in the show, Alt+P, Alt+Up and Alt+U keys | `editor/media-panel.ts MediaPanel`, `ui/dialogs-media.ts MediaDlg` (trim, frame stepping, poster frame, bookmarks), `present/media-play.ts preparePlayback` (fades, volume, mute, rewind, hide, full screen), `show.ts stepsFor` (click sequence), `pptx/write_media.py media_settings` and `read_media.py` (p14:trim, p14:fade, p14:bmkLst, vol, mute, repeatCount, fill, fullScrn) |
| Animated GIFs | yes | yes | yes | Full | 0.18.1: a 6-frame GIF inserted with its frames kept | rendered as images; `pptx/write_context.py NATIVE_IMAGE_MIMES` keeps GIF bytes |
| SVG pictures broken apart into editable shapes | yes | yes | no | Full | 0.18.1: SVG as Shapes turned a rect, circle and polygon into three editable shapes | Insert > SVG as Shapes and Convert to Shapes (`editor/svg-import.ts`): paths, rectangles, circles, ellipses, lines and polygons become a group of shapes with fill and outline; unsupported parts are counted and skipped |
| Alt text | yes | yes | yes | Full | 0.18.1: the Alt Text dialog saved a description; 0.19.0: a file-name alt text is flagged by Check Deck | `dialogs-insert.ts AltDlg`, `inspector.ts` Alt text |

### Tables

| Capability | PowerPoint | Keynote | Slides | formdeck | Seen working | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Insert a table with a style | yes | yes | yes | Full | 0.18.1: Insert Table with a style, header and banded rows inserted a 4 by 3 table | `dialogs-insert.ts TableDlg` (size grid, six styles, header row, banded rows) |
| Type in table cells | yes | yes | yes | Full | 0.18.1: typing with Tab across cells saved every cell; long text grew the row | `editor/stage.ts beginCell, stepCell, commitCell`: double-click, Enter or F2, Tab between cells; rows grow to fit and shrink back (`table-edit.ts fitFrameOps`, `h` is a minimum) |
| Merge cells, add and remove rows and columns | yes | yes | yes | Full | 0.18.1: insert and delete rows and columns and Merge Cells saved; deleting every row deletes the table as in PowerPoint | `editor/table-edit.ts registerTableCommands` (rows, columns, merge, split, distribute, styles), border drag (`editor/table-drag.ts TableDrag`), cell range fill, borders, alignment and margins (`editor/table-panel.ts TablePanel`), round-tripped in `pptx/read_table.py, write_table.py` |

### Charts

| Capability | PowerPoint | Keynote | Slides | formdeck | Seen working | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Native charts: column, bar, line, area, pie, doughnut, scatter, radar, combo | yes | yes | yes | Full | 0.18.1: all nine kinds previewed and inserted as native charts | `frontend/src/render/chart.ts chartSvg`, `dialogs-insert.ts ChartDlg` |
| Edit chart data in a grid, paste from a spreadsheet | yes | yes | yes | Full | 0.18.1: editing a cell, adding a row and a series, and pasting tab-separated data updated the chart | `ChartDlg` grid with row and series tools, paste |
| Chart options: title, legend, labels, gridlines, stacking, number format | yes | yes | yes | Full | 0.18.1: title, legend off, data labels and stacking saved and drew | `ChartDlg` side panel |
| Charts linked to a live workbook | yes | no | yes | Full | 0.18.1: a chart linked to a CSV updated after the CSV changed | `ui/dialogs-insert.ts ChartDlg.linkWorkbook` links a chart to a .xlsx, .xlsm, .csv or .tsv file (sheet and range), `editor/chart-links.ts watchLinks` updates it when the file is saved, Format > Chart > Refresh Data and Break Link, `routers/workbooks.py`, `services/workbook.py`; .pptx keeps the link as an external `c:externalData` relationship (`pptx/write_chart.py _link_workbook`, `read_chart.py _linked_workbook`) |
| Charts stay native charts in .pptx | yes | no | yes | Full | 0.18.1: eight kinds exported natively with data; 0.19.0: a combo chart exports bars and a line | `backend/app/services/pptx/write_chart.py`, `read_chart.py` |

### Diagrams and SmartArt

| Capability | PowerPoint | Keynote | Slides | formdeck | Seen working | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Diagram layouts (process, timeline, cycle, hierarchy) | yes | no | yes | Full | 0.18.1: the SmartArt gallery inserted Basic Process as an editable group | `frontend/src/editor/diagram.ts` (12 layouts in 8 categories, colour schemes, styles), `editor/diagram-sync.ts` (regeneration by id, typing writes back to items), `ui/dialogs-diagram.ts` (gallery, text pane, change layout, reset, convert to shapes), `pptx/read_diagram.py` (SmartArt data model to `diagram`), script layouts still drawn by `backend/app/services/compiler/compile.py` |
| Icons and 3D models | yes | yes | no | Full | 0.18.1: icon search and insert added an editable icon shape | `ui/dialogs-icons.ts IconsDlg` inserts 5,817 Tabler icons as editable custGeom freeforms; Insert > 3D Models (`ui/dialogs-model3d.ts`) places .glb or .gltf models drawn live with three.js (`render/model3d.ts`), orbited with the centre handle, 14 view presets, Pan & Zoom and Reset (`editor/model3d-handle.ts`, `model3d-commands.ts`), a poster for thumbnails and exports, and `am3d:model3d` with a fallback picture in .pptx (`services/pptx/write_model3d.py`, `read_model3d.py`) |

### Arrange and align

| Capability | PowerPoint | Keynote | Slides | formdeck | Seen working | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Order: bring forward, send backward, to front, to back | yes | yes | yes | Full | 0.18.1: the four order commands produced the expected stacking | `commands.ts bring-front..send-back`, `actions.ts zOrderOps` |
| Align and distribute | yes | yes | yes | Full | 0.18.1: each align and distribute command set the expected coordinates for three shapes | `actions.ts alignOps, distributeOps` |
| Group and ungroup | yes | yes | yes | Full | 0.18.1: Group and Ctrl+G made a group of two; Ungroup restored them | `actions.ts groupOps, ungroupOps` |
| Rotate and flip | yes | yes | yes | Full | 0.18.1: Rotate 90 and both flips saved and drew; the rotate handle turned the shape | rotate handle and Rotation field (`stage.ts`, `inspector.ts`); `commands.ts flip-h, flip-v, rotate-90` in the Arrange menu |
| Lock objects | yes | yes | no | Full | 0.18.1: a locked shape did not move when dragged | `commands.ts lock` |
| Selection pane | yes | yes | no | Full | 0.18.1: rename, hide and reorder in the selection pane saved | `editor/selection-pane.ts SelectionPane` (rename, hide, lock, drag to reorder, Show all, Hide all, groups) |
| Rulers and gridlines | yes | yes | yes | Full | 0.14.0: gridlines and guides with spacing presets, centre guides and guide colours | `editor/rulers.ts StageAids, gridGuidesDialog`: rulers, gridlines, guides dragged from the rulers; guides in `deck.guides`, round-tripped by `pptx/guides.py` |

### Transitions

| Capability | PowerPoint | Keynote | Slides | formdeck | Seen working | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Slide transitions (fade, push, wipe, split, cover, uncover, zoom, reveal, flip, cube) | yes | yes | yes | Full | 0.18.1: each transition saved and animated in the running show | `frontend/src/present/effects.ts transitionPlan`, `inspector.ts` Transition, `pptx/write_slide.py insert_transition` |
| Morph | yes | yes | no | Full | 0.18.1: an element named Box moved and resized between two slides during a morph transition | `present/effects.ts morph`, starting from where a motion path left an element (`present/steps.ts displaced`) |
| Duration, apply to all, advance after a time | yes | yes | yes | Full | 0.18.1: duration saved, Apply To All copied it, advance after a time advanced the show | `inspector.ts` Duration and Apply to all; `Transition.advanceAfter` from rehearsal |

### Animations

| Capability | PowerPoint | Keynote | Slides | formdeck | Seen working | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Entrance, emphasis and exit effects in the show | yes | yes | yes | Full | 0.18.1: entrance, emphasis and exit effects played in order in the show | `present/show.ts buildSteps`, `effects.ts effectFx` play `slide.animations`; added in the Animate tab or by agents (`mcp.py animate`) |
| Animation pane, order and triggers | yes | yes | yes | Full | 0.18.1: the pane listed effects and Move Earlier and Later reordered them | `editor/animation-pane.ts AnimationPane`: add, reorder, edit start, duration, delay, direction, by paragraph; preview on the stage |
| Motion paths | yes | yes | no | Full | 0.18.1: a line path moved the shape 200 pt in the show and survived a .pptx round trip | Animate tab Motion paths: line, arc, turn, circle and drawn custom paths (`animation-pane.ts beginDraw`), played by `effects.ts pathFx`, round-tripped as `p:animMotion` (`write_anim.py ppt_motion`) |
| Animations kept in .pptx | yes | no | yes | Full | 0.18.1: the exported .pptx carried entrance, emphasis, exit and motion path timing | `pptx/write_anim.py insert_timing`, `read_anim.py read_timing`: main sequence with PowerPoint preset ids both ways; motion paths dropped with a warning |

### Slideshow and presenter

| Capability | PowerPoint | Keynote | Slides | formdeck | Seen working | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Full-screen show, keyboard navigation, go to slide by number | yes | yes | yes | Full | 0.13.0: Esc ends the slide show, End Show button, media keys; 0.15.0: + and - zoom | `present/show.ts KEYS, onKey` |
| Presenter view: notes, next slide, timer, audience window | yes | yes | yes | Full | not yet | `show.ts` presenter mode, `BroadcastChannel`, Tauri `open_presenter` |
| Pen, eraser and laser pointer | yes | yes | yes | Full | 0.17.0 and 0.18.1: Ctrl+P drew ink, Ctrl+E erased, E erased all, Ctrl+M hid ink | `show.ts` modes pen, eraser, laser |
| Black or white screen, all-slides grid | yes | yes | yes | Full | 0.18.1: B and W blanked the screen and G opened the slide grid | `show.ts setBlank, toggleGrid` |
| Rehearse timings and automatic advance | yes | yes | yes | Full | 0.18.1: Rehearse Timings recorded per-slide times and kept them | `show.ts toggleRehearse, keepTimings, toggleAuto` |
| Record the show with narration | yes | yes | yes | Full | 0.18.1: recording with a microphone saved narration per slide | `present/recorder.ts Recorder` (per-slide narration, timings, retake), `pptx/write_media.py write_audio`, `write_anim.py _media_entries` (autoplay audio) |
| Live captions and subtitles | yes | no | yes | Full | not yet | `present/captions.ts Captions` (Web Speech, Chrome and Edge only), `show.ts toggleCaptions` synced to the audience window; Subtitle Settings (`ui/dialogs-captions.ts`): spoken and subtitle language, four positions, size, always on; translation per phrase by Chrome's on-device Translator or the chat model (`present/caption-translate.ts`, `routers/captions.py`), checked with stubbed speech, translator and model |
| Loop until Esc and custom shows | yes | yes | yes | Full | 0.18.1: Loop saved and the show looped back to slide 1; a custom show played its slides | `present/show-dialogs.ts SetupShowDialog, CustomShowsDialog`, `show.ts playlist`, `pptx/show_props.py write_show, read_show` |
| Present to a remote audience with Q&A | yes | no | yes | Full | not yet | people with a share link follow the show live and ask questions that appear in Presenter View (`present/show.ts followShow, mountAsk, addQuestion`, `routers/live.py` show and question); on the local network, or from anywhere through a relay you run (`relay/formdeck_relay.py`, `services/relay.py`) |

### Review and comments

| Capability | PowerPoint | Keynote | Slides | formdeck | Seen working | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Comments: add, list, resolve | yes | yes | yes | Full | 0.18.1: add, reply, resolve and the All filter worked in the Review tab | `inspector.ts` Review tab: add, reply, resolve, reopen, @mentions, assignees, filter (`editor/mentions.ts attachMentions`); `dialogs-insert.ts addComment`; agents through `mcp.py comments` (mentions, assignee, filter mine) |
| Review status per slide (draft, review, changes, approved) | no | no | no | Full | not yet | `commands.ts reviewStatus`, `inspector.ts` Review tab, `mcp.py review` |
| Compare two versions | no | no | no | Full | not yet | decks against a saved version or a .pptx/.fdec file (older .fsld too) with per-slide differences, word-level text changes and undoable accept or ignore (`editor/compare.ts compareDecks, acceptAll`, `ui/review-dialogs.ts CompareDialog`, `routers/decks.py version_deck, compare_file`) |
| Activity: who changed what | yes | yes | yes | Full | 0.18.1: the Activity dialog listed 13 changes by who, what and slide | every step logged per deck with who, origin, label and slides (`store.py Store._log, activity`, `Decks/[id]/activity.jsonl`, `GET /api/decks/{id}/activity`); Review > Activity grouped by day with a person filter (`ui/review-dialogs.ts ActivityDialog`); agents read it in `mcp.py t_get_context` |

### Collaboration and sharing

| Capability | PowerPoint | Keynote | Slides | formdeck | Seen working | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Real-time co-editing | yes | yes | yes | Full | 0.18.1: an edit in one window appeared in a second window on the same deck | windows, agents and other computers on the network edit one deck live with presence (`editor.ts setPeer`, `routers/live.py`, `routers/share.py ShareGate`); across the internet only through a network the computers share |
| Share by link with permissions | yes | yes | yes | Full | 0.19.0: on the sharing port, view links could only read, comment links only comment, edit links edit | File > Share Deck (`ui/dialogs-share.ts`, `services/share.py`): links that can view, comment or edit one deck, removable, enforced by the engine (`routers/live.py guest_refusal`); off by default, on the local network or from anywhere through a self-run relay (`relay/formdeck_relay.py`, `services/relay.py`) |
| Works offline, files stay local | yes | yes | no | Full | 0.18.1: Home and the editor made no request to any host but this computer | local engine, library in `core/config.py data_dir` |
| Publish to the web or embed | yes | yes | yes | Partial | 0.18.1: Publish as Web Page made one .html that played the slides from a file | `ui/dialogs-publish.ts` File > Export > Publish as Web Page writes one self-contained .html player (keyboard, click, full screen, auto-advance, slide text for screen readers) and gives iframe embed code; no hosted link, since live publishing on the network is not built yet |

### Accessibility

| Capability | PowerPoint | Keynote | Slides | formdeck | Seen working | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Accessibility checker | yes | no | no | Full | 0.18.1: Check Deck scored the deck and flagged contrast, low-resolution pictures and duplicates | `backend/app/services/lint.py` checks alt text, contrast, tiny text and overflow measured in the window; Review > Check Deck (`frontend/src/ui/check-dialog.ts`, `decks.py check`) and agents (`lint_deck`) |
| Reading order | yes | no | no | Full | 0.18.1: the selection pane's reading order listed the elements and their alt text state | `editor/selection-pane.ts` Reading order view (missing alt text flagged, drag reorders the shape tree); exported PDFs follow it as their structure order (`render/pdf-struct.ts`, `services/pdf_tags.py`) |
| Screen reader labels in the app | yes | yes | yes | Full | 0.18.1: a scan of about 2600 controls found none without an accessible name | ARIA roles and labels on dialogs, lists, menus and the show (`show.ts` aria-roledescription); axe-core 4.10 WCAG 2.1 A and AA audit at 0.8.3 of Home and the editor in all 15 UI themes, every menu, Spelling, the Agent tab and the show: no violations in the app's own interface |
| Tagged accessible PDF export | yes | yes | yes | Full | 0.18.1: the PDF was tagged with language, headings, lists and a title outline | `services/pdf_tags.py`, `routers/exports.py _pdf`: Tagged PDF with a structure tree (headings, paragraphs, nested lists, tables with header cells, figures with alt, artifacts), Lang, title and XMP; PDF/UA-1 compliant in veraPDF 1.28.2 (`./formdeck pdf-check`), slides exported as live, embedded text (`render/raster.ts` words, `services/pdf_fonts.py LiveFonts`); text with effects, rotation or a font that cannot be embedded stays a picture on that page with an embedded invisible text layer, so every language is still searchable |

### Import and export

| Capability | PowerPoint | Keynote | Slides | formdeck | Seen working | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Open .pptx, .potx, .ppsx, .pptm | yes | yes | yes | Full | 0.17.0: a 73-slide .pptx with 54 media items opened as its own deck from Home, text edited and saved | `backend/app/services/pptx/reader.py read_pptx` (warnings for what is dropped) |
| Save .pptx and .potx | yes | yes | yes | Full | 0.18.1: both opened in LibreOffice with the right text and re-imported intact | `backend/app/services/pptx/writer.py write_pptx` |
| PDF export with searchable text and a slide outline | yes | yes | yes | Full | 0.18.1: live text and an outline entry per slide | `frontend/src/automation/agent-bridge.ts exportRaster`, `routers/exports.py compose` |
| Slides as PNG or JPEG | yes | yes | yes | Full | 0.18.1: a zip of five 1280 by 720 PNGs and of five JPEGs, entries Slide1 to Slide5 in a folder named after the deck | `frontend/src/render/raster.ts rasterSlide`, `ExportDialog` |
| Export video or animated GIF | yes | yes | yes | Full | 0.18.1: a GIF of the five slides and a 25 s video; 0.19.0: video is MP4 only with H.264, WebM otherwise | `present/video-export.ts renderFrames, recordVideo` (MP4 or WebM with narration, builds as steps, fades), `routers/exports.py gif_bytes` |
| OpenDocument .odp | yes | no | yes | Full | 0.18.1: the .odp opened in LibreOffice with five correct pages and re-imported | `services/odp/writer.py OdpWriter` (ODF 1.3, schema-valid) and `odp/reader.py OdpReader`, `routers/decks.py export_bytes, import_bytes`, `ui/dialogs-file.ts EXPORTS.odp`, `src-tauri/tauri.conf.json fileAssociations` |
| Embed fonts in .pptx | yes | no | no | Full | 0.18.1: the .pptx carried four embedded font parts | `ui/dialogs-file.ts` Export Fonts (Only characters used, All characters), `services/pptx/embed_fonts.py`, `eot.py`, `font_sources.py` write uncompressed EOT `fntdata` parts; import reads plain, XOR-obfuscated and MicroType Express compressed fonts (`services/pptx/mtx.py`), checked on 12 fonts from PowerPoint and Google Slides files against an independent decoder; CFF fonts are not embedded on export and no copy of PowerPoint confirmed it opens the exported files |
| Export the outline as text | yes | no | yes | Full | 0.18.1: the .txt and .rtf outlines held titles and indented bullets | File > Export > Outline as .txt or .rtf with levels and notes (`routers/exports.py outline_bytes`), MCP `export_deck` txt and rtf |

### Print

| Capability | PowerPoint | Keynote | Slides | formdeck | Seen working | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Print slides, notes pages, outline and handouts (2, 3, 4, 6, 9) | yes | yes | yes | Full | 0.18.1: the print pages for slides, notes, outline and each handout layout came out right | `frontend/src/ui/dialogs-file.ts PrintDialog, renderPrint` |
| Grayscale, frame slides, include hidden slides, paper size | yes | yes | yes | Full | 0.18.1: grayscale, frame and hidden slides applied to the print pages | `PrintDialog` options |

### Automation and agents

| Capability | PowerPoint | Keynote | Slides | formdeck | Seen working | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Built-in AI assistant | yes | yes | yes | Full | 0.19.0: against a fake OpenAI-compatible server, the chat sent 28 tools, a set_text call retitled slide 1 and the panel showed Done | `ui/chat-panel.ts` chat in the Agent tab that edits the deck with the MCP tools as undoable agent turns, through the person's connected agent (`chat_inbox`, `chat_reply`), an Anthropic or OpenAI-compatible key, or a local Ollama model (`services/chat/`) |
| MCP server for outside agents (HTTP and stdio) | no | no | no | Full | not yet | `backend/app/routers/mcp.py TOOLS` (24 tools), `setup/mcp_stdio.py` |
| Agent edits land live in the open window, undone per turn | no | no | no | Full | not yet | `services/store.py step(turn)`, `commands.ts undo-agent` |
| Agent sees and measures its own slides | no | no | no | Full | not yet | `agent-bridge.ts` render_slides, measure; `services/lint.py` |
| Agent consent and on/off switch | no | no | no | Full | not yet | `agent-bridge.ts` consent, Preferences and Agent tab |
| Skills shipped for Claude Code, Codex and Cursor | no | no | no | Full | not yet | `.claude/skills/formdeck-harness`, `setup/agents.py install` |
| Headless build from files on the command line | no | no | no | Full | not yet | `setup/cli.py` (`./formdeck build-deck`) |
| Scripting and macros | yes | no | yes | Full | 0.18.1: a macro upper-casing titles ran as one undoable step | View > Macros (Alt+F8) and the Macro Editor (Alt+F11) in `ui/dialogs-macros.ts`: JavaScript macros saved in the deck, run in a locked-down Worker with a deck API and a 10 s limit, each run one undoable step, a trust prompt for macros from elsewhere (`editor/macros.ts`, `macro-worker.ts`); raw ops also through `mcp.py apply_ops`; VBA in .pptm is listed, not run |
| Add-in marketplace | yes | no | yes | Partial | 0.18.1: Get Add-ins listed add-ins and asked for permissions before installing | Home > Add-ins and the Add-ins tab (`ui/dialogs-addins.ts`, `editor/addins.ts`, `services/addins.py`): a Store from a catalog index with permissions shown before install, sha256-checked downloads, My Add-ins, upload, commands on the ribbon and task panes, run in the macro sandbox with declared permissions only; formdeck's catalog plus catalogs from other publishers that a person adds (`services/addins.py third_party_urls`); no reviews or ratings |
| Find and run any command by name | yes | no | yes | Full | 0.18.1: every command used in the pass ran from Find a Command; 0.19.0: text formatting from it applies to the selected text | Find a Command, Shift+Ctrl or Cmd+P (`ui/command-palette.ts`), over the catalogue of every ribbon, menu and shortcut command (`automation/catalogue.ts`) |
| Every command callable by agents and scripts, with exact values | no | no | no | Full | not yet | MCP list_commands and run_command, `/api/commands`, `./formdeck cli` (`routers/commands.py`, `automation/catalogue.ts checkParams`, `editor/param-commands.ts`) |
| Terminal in the window with Claude Code attached | no | no | no | Full | not yet | the dock, Ctrl or Cmd+` (`ui/terminal-dock.ts`, `services/terminal.py`, `services/claude_code.py`): shell and Claude Code tabs with formdeck's tools; the chat hands its conversation to a tab and takes one back (`routers/chat.py adopt`) |

### Platform (shown, not scored)

| Capability | PowerPoint | Keynote | Slides | formdeck | Seen working | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Desktop app | yes | yes | no | Full | not yet | Tauri 2 app in `src-tauri/` with the engine as a frozen sidecar: .deb, .rpm and .AppImage built, installed and run on Linux (Home, a new deck, typing, video playback, saving); .dmg and .app for Apple silicon and Intel, .msi and NSIS for Windows, arm64 Linux and a Flatpak (`src-tauri/flatpak/`) built by formcompiler from a `compile_v*` branch, those not run here; signing optional; no FreeBSD build |
| Runs in a browser | yes | yes | yes | Partial | not yet | Vite app on 5197 against a local engine; no hosted service |
| Phone and tablet | yes | yes | yes | Partial | not yet | touch editing (tap, double-tap to type, drag, 44 px handle targets, pinch zoom, long-press menu) and layouts for tablets and phones (`ui/responsive.ts`, `ui/touch.ts`, `styles/responsive.css`), a phone viewer with swipe, notes and Present, swipe in the show; checked in device emulation, not on real devices; a phone or tablet cannot reach the engine yet, which listens only on the computer it runs on, and there is no mobile app |
| Interface in many languages | yes | yes | yes | Full | not yet | English and 25 more (`i18n/index.ts`, Preferences > Appearance > Language), plural forms by the language's rules; machine-translated, not yet reviewed by native speakers |

## How to re-score

1. Keep the row list. Add a row only for a capability one of the three products ships, put it in the right area and mark the three product columns from the vendor's documentation; remove none, so scores stay comparable between releases. The one exception so far is 0.6.0, which dropped the PDF areas when the workbench moved to formpdf.
2. For each row whose code changed, trace it again: find the command in `frontend/src/editor/commands.ts` or the dialog in `frontend/src/ui`, follow it to the op builder in `frontend/src/editor/actions.ts`, the renderer in `frontend/src/render` or the show in `frontend/src/present`, and for exchange rows the engine in `backend/app/services`. Write the file and symbol where the trace ended into the Evidence column. If a person cannot reach it in the app, it is Partial at most; if nothing implements it, None.
3. Count: Full 1, Partial 0.5, None 0. For each product, sum formdeck's points over the rows that product offers, outside Platform, and divide by that row count, per area and overall. Rows no product offers count in no comparison and are listed under Where formdeck leads.
4. Update the Scores table, the counts under it and the version and date at the top. `docs/parity.py` holds the rows as data: edit a row there, run `python3 docs/parity.py md` to print the area tables and the Scores table, and `python3 docs/parity.py` for the counts as JSON, then carry the changes into this file.
