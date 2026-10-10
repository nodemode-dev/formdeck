# Import and Export

## PowerPoint and Google Slides

- **Open** .pptx, .potx, .ppsx and .pptm (`backend/app/services/pptx/reader.py`). Masters, layouts, theme, placeholders, text, shapes, pictures, tables, native charts, video and audio, sections, transitions, notes and links come in. A toast lists what could not be kept: animations, ink, embedded fonts, linked media; SmartArt arrives as grouped shapes and a second master's theme is dropped.
- **Save** .pptx and .potx (`writer.py`): editable slides with native charts and tables, sections, transitions and notes. Fonts are not embedded.
- **Google Slides**: download your presentation as .pptx and open it in formsld; upload an exported .pptx to Drive and choose Open with Google Slides to go back. The Google Slides 16:9 size (720 by 405 points) is a preset.

## Slides from PDF pages

Insert > Slides from PDF Pages adds one slide per page of a PDF at the end of the deck: the page as a picture fitted to the slide, its text in the speaker notes, all in one undo step (`backend/app/services/pdf_pages.py`, `frontend/src/editor/editor.ts insertPdfPages`). A PDF opened or dropped anywhere else goes to Start from your material and becomes editable slides. Editing PDFs themselves is [formpdf](https://github.com/nodemode-ai/formpdf)'s job.

## PDF and pictures

The window renders each slide to a canvas (`frontend/src/render/raster.ts`) and the engine composes the file (`backend/app/routers/exports.py`): a PDF page per slide with the slide image full bleed, an invisible searchable text layer and an outline of slide titles; or PNG or JPEG at 1x, 2x or 3x, several slides in a .zip. Choose all, current, selected or a custom range.

## The .fsld package

One zip with `deck.json` and every media file, for formsld on any computer and for agents. The layout is in [FORMAT.md](https://github.com/nodemode-ai/formsld/blob/main/docs/FORMAT.md#the-fsld-package).

## Print

Full page slides, notes pages, outline, or handouts with 2, 3 (with lines), 4, 6 or 9 slides per page; A4 or Letter; colour or grayscale; hidden slides; frames.

## From the command line and agents

`./formsld build-deck ... --out deck.pptx` (or `.fsld`, `.potx`) writes a file without the window. Agents use `export_deck` (pptx, potx, fsld, pdf, png) and `open_file`.
