# Demo credits: Build From Material

The deck "Mill Street Roastery" (a launch plan for a made-up neighbourhood coffee roaster) uses eight Pexels photographs. Every source page was opened and read before the file was downloaded: the photographer and title match the page, and the page marks the photo free under the Pexels License (https://www.pexels.com/license/). No photo shows a recognisable person, a logo or a brand. The roastery, its people and every figure in the sample scripts are invented and labelled as such inside the demo. The text of the scripts is original.

Each photo was resized (never enlarged) to the longest side listed and re-encoded to WebP at quality 80 with Pillow, then embedded as a data URL in `assets/media/photos.js`. Nothing was cropped or retouched in the files; slides crop with the cover fit.

## Photographs (`assets/media/photos.js`)

| In the demo | Title | Photographer | Source page | Licence as stated on the page | Changes |
| --- | --- | --- | --- | --- | --- |
| cherries | Close-up of a Branch of Coffee Plant with Beans | Julian Cabrera S | https://www.pexels.com/photo/close-up-of-a-branch-of-coffee-plant-with-beans-19455179/ | Free, under the Pexels License | resized to 1063x1700 WebP |
| cups | Overhead Shot of Cups with Coffee Beans | H. Hümâ Yardim | https://www.pexels.com/photo/overhead-shot-of-cups-with-coffee-beans-11552880/ | Free, Pexels License | resized to 1600x1066 WebP |
| drum | Coffee beans roasting in professional metal equipment | Maria Orlova | https://www.pexels.com/photo/coffee-beans-roasting-in-professional-metal-equipment-4940744/ | Free, Pexels License | resized to 1600x1066 WebP |
| roast | Macro Close-Up of Roasted Coffee Beans | Ahmet Yüksek | https://www.pexels.com/photo/macro-close-up-of-roasted-coffee-beans-39719509/ | Free, Pexels License | resized to 1600x1067 WebP |
| beans | Close-Up Texture of Roasted Coffee Beans | Haberdoedas Photography | https://www.pexels.com/photo/close-up-texture-of-roasted-coffee-beans-33788268/ | Free, Pexels License | resized to 1275x1700 WebP |
| cafe | Interior of stylish cafe with wooden counter and stools placed near window | Maria Orlova | https://www.pexels.com/photo/interior-of-stylish-cafe-with-wooden-counter-and-stools-placed-near-window-4913351/ | Free to use, Pexels License | resized to 1133x1700 WebP |
| cup | Minimalist Coffee Cup on Wooden Table Top View | Seljan Salimova | https://www.pexels.com/photo/minimalist-coffee-cup-on-wooden-table-top-view-28593519/ | Free to use, Pexels License | resized to 1133x1700 WebP |
| sacks | Beans on Tray | Quang Nguyen Vinh | https://www.pexels.com/photo/beans-on-tray-2131905/ | Free, Pexels License | resized to 1600x1067 WebP |

Each photo also carries its credit as media metadata, so the .fdec and deck.json exports keep it, and the sample script names the photographers in the speaker notes.

## Templates (`assets/media/templates.js`)

The 67 built-in template designs (masters and layouts) were exported by running FormDeck's own generator (`backend/app/services/templates/catalog.py`), Apache-2.0 and part of this repository. No third-party design is included.

## Fonts (`assets/media/fonts.js`)

Complete, unmodified copies of the variable font files already in `frontend/public/fonts/full/` (SIL OFL 1.1, their licences are in each family's folder and in `../../NOTICE.md`): Lora, Playfair Display, Raleway and Source Sans 3. Other families a template names use the Latin subsets of `@fontsource` packages (OFL-1.1, listed in `../../NOTICE.md`). Merriweather is not shipped in this demo, so the one template that names it shows the browser's serif.

## Code

`fflate` (MIT) is bundled through the first demo's readers and writers. No new dependency.
