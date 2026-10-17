# PowerPoint parity: verified behaviour

The behaviour FormDeck copies from desktop PowerPoint (Microsoft 365, Windows unless a line says Mac). Every row was read on the source page named beside it on 2026-10-17, and a second independent source was found unless the row says single source. A power user tested FormDeck 0.12.2 against exactly these behaviours and found it unusable, so treat this file as the spec, not as inspiration. When a row and the code disagree, the code is the bug. When you need a behaviour not listed here, look it up on support.microsoft.com and add the row with its source before building it; never build from memory.

Sources are abbreviated: MS-KB = Microsoft, "Use keyboard shortcuts to create PowerPoint presentations"; MS-SHOW = Microsoft, "Use keyboard shortcuts to deliver PowerPoint presentations"; MS-GRID = Microsoft, "Work with gridlines and use snap-to-grid in PowerPoint"; MS-SEL = Microsoft, "Select a shape or other object"; IDZ = Indezine (Geetesh Bajaj, PowerPoint MVP).

## Selection

| Behaviour | Source |
| --- | --- |
| A box with text has two states: object selected (solid border, 8 sizing handles and a rotation handle) and text editing (dashed border, caret, handles still shown). | TeachUcomp "Add Text to Slides"; IDZ "Selecting and Changing Text" |
| Clicking a box's border, or inside it away from the text, selects the object. Clicking on text places the caret. | IDZ; MS "Move a text box, WordArt, or shape" |
| Shift+click on a text shape always selects the shape, never the text. | The PowerPoint Blog (TLC Creative), single source |
| Esc while editing returns to object selected. Enter with an object selected goes into its text. | MS-KB |
| Esc with an object selected deselects. | TutKit, single weak source |
| Shift or Ctrl+click adds or removes an object from the selection. | MS-SEL; IDZ |
| A marquee starts on an empty slide area or off the slide and selects only objects fully inside it. | Simon Sez IT; Slaw; MS calls it drawing a marquee |
| Clicking an empty slide area deselects. | IDZ; Simon Sez IT |
| Tab and Shift+Tab cycle through objects, including ones behind others. | MS-KB; MS-SEL |
| Ctrl+A selects every object on the slide; in the thumbnail pane it selects all slides. | MS-KB |
| A group: first click selects the group, a click on a child then selects the child. | MS-SEL; GCFGlobal says double-click |
| Selection Pane: Alt+F10, top of list = front, eye hides, double-click or F2 renames, drag reorders. | MS "Use the Selection pane" |
| Ctrl while dragging a handle resizes from the centre; Shift keeps proportions; Alt while dragging skips snapping; Shift while rotating snaps to 15 degrees. | MS "Change the size of a picture"; MS-GRID; MS "Rotate or flip" |
| Ctrl+arrow nudges by one screen pixel; Shift+arrow resizes; Alt+Left or Right rotates 15 degrees. | MS "Move a text box"; MS-KB |
| Ctrl+drag copies an object. | Office Watch |
| Ctrl+] is Bring Forward and Ctrl+[ Send Backward on desktop (font size only in PowerPoint for the web). | MS-KB |

## Gridlines, guides, smart guides

| Behaviour | Source |
| --- | --- |
| Gridlines are fixed one-inch squares; only the dot spacing changes. Default spacing 1/12 in. | MS-GRID; The Software Pro |
| Spacing presets 1/24, 1/16, 1/12, 1/10, 1/8, 1/6, 1/5, 1/4, 1/3, 1/2, 1, 2 in, or typed. | IDZ screenshots, single source |
| Grid and Guides dialog: snap objects to grid, spacing, display grid, display drawing guides, display smart guides, Set as Default. | MS-GRID; IDZ |
| Shift+F9 gridlines, Alt+F9 guides, Alt+Shift+F9 ruler. | MS-KB; The Software Pro |
| Drawing guides: one vertical and one horizontal crossing at the slide centre; distance from centre shown beside the pointer while dragging; never shown in Slide Show or print. | MS-GRID; IDZ |
| Ctrl+drag a guide copies it; right-click adds a vertical or horizontal guide; drag off the slide to delete; Delete does nothing on a guide. | IDZ; The Software Pro |
| Right-click a guide > Color recolours it. | MS-GRID; The PowerPoint Blog |
| Master and layout guides show on slides in their own colour, cannot be selected there, and still snap. | IDZ; The PowerPoint Blog (colours conflict) |
| Smart guides: dashed lines for edge and centre alignment, arrows for equal spacing, also while resizing to match another object. | MS "Guides for arranging things"; IDZ |
| Snap to grid on by default: sources conflict (on per The Software Pro and Office Watch, off per IDZ). | conflict |

## Fonts and sizes

| Behaviour | Source |
| --- | --- |
| Font list: Theme Fonts (Headings, Body) first, then All Fonts installed on the system. | IDZ "Font Types and Sizes" |
| A missing font keeps its name in the box; the system substitutes at render. | PPTFAQ (Steve Rindsberg); IDZ |
| Size box takes 1 to 3600 in multiples of 0.1; the file format allows up to 4000. | MS "Change the font size"; ECMA-376 ST_TextFontSize |
| Increase and Decrease Font Size: Ctrl+Shift+> and Ctrl+Shift+<. | MS-KB |
| While editing, font and size apply to the selected text; with the box selected, to all its text. | O'Reilly "Office 2007 Bible"; Nashville State CC |
| Shrink text on overflow scales the shown size (normAutofit fontScale); the stored size stays. | Open XML SDK NormalAutoFit.FontScale; python-pptx |
| Replace Fonts: Home > Editing > Replace > Replace Fonts. | MS "Change the fonts in a presentation"; IDZ |
| Embed fonts: File > Options > Save > Embed fonts in the file, characters used or all characters. | MS "Benefits of embedding custom fonts"; IDZ |

## Pictures

| Behaviour | Source |
| --- | --- |
| Format > Size has Lock aspect ratio, Relative to original picture size, Scale, Reset. | MS "Format Object: Size" |
| Shift while dragging a corner keeps proportions. Pictures carry noChangeAspect in real files; whether corner drag locks by default is unverified. | MS resize page; python-pptx |
| Crop: black handles, Ctrl crops opposite sides equally, Crop to Shape, Aspect Ratio, Fill, Fit. | MS "Crop a picture"; IDZ |

## Video and slide show

| Behaviour | Source |
| --- | --- |
| Playback tab Start: In Click Sequence (default), Automatically, When Clicked On. | MS "Set the play options for a video" |
| Volume Low, Medium, High, Mute; Play Full Screen, Hide While Not Playing, Loop until Stopped, Rewind after Playing. | MS play options; IDZ; Dummies |
| In a show: Alt+P play or pause, Alt+Q stop, Alt+Up and Alt+Down volume, Alt+U mute, Alt+Shift+PageDown and PageUp seek 3 seconds. | MS-SHOW; IDZ |
| F5 from the start, Shift+F5 current slide, Alt+F5 Presenter View even on one screen. | MS-SHOW; IDZ |
| Esc ends the show (Mac also Hyphen and Cmd+Period); Esc also leaves zoom. | MS-SHOW; MS "Magnify a slide" |
| Presenter View toolbar: Show Taskbar, Display Settings, End Slide Show; timer with pause and reset. | MS "Presenter view"; UW-Stevens Point IT |
| Fullscreen video in the file is fullScrn on p:video; Hide While Not Playing maps to showWhenStopped (inferred). Loop and Rewind storage is unverified: read a PowerPoint-saved file. | Open XML SDK Video and CommonMediaNode |

## Files, panes, review

| Behaviour | Source |
| --- | --- |
| Save uses the system Save dialog; default folder set in File > Options > Save, Documents by default. | MS "Customize the save experience"; UCLA KB |
| Image export asks All Slides or Just This One, writes Slide1.png and up into a folder named after the deck, 96 dpi by default. | MS "Save a slide as an image"; Cornell IT; MS Learn export resolution |
| Delete a file from File > Open > right-click > Delete file; Remove from list only forgets it. | MS deleting presentations; MS recent files |
| Task panes dock right, resize from the inner edge, float, and remember size and position. Ctrl+F1 collapses the ribbon. | MS "Manage pane layout"; IDZ; MS-KB |
| Co-authoring needs the file on OneDrive or SharePoint; comments thread, resolve and @mention. | MS co-authoring; MS modern comments |
| Review > Compare is retired from Windows version 2502. | MS "Track changes in your presentation" |

## Where FormDeck deliberately differs

Record a deliberate difference here with the reason, so the next session does not "fix" it back. As of 0.14.0: the marquee keeps a touch rule as a preference beside PowerPoint's enclose default; review status is FormDeck's agent handoff, not a PowerPoint feature, and shows only when the deck is shared or outside agents are allowed; guide colours are kept in FormDeck files only, since PowerPoint's guide extension has no colour; Lock aspect ratio keeps the current frame ratio, not the picture's original pixel ratio.
