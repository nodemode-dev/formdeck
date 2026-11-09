# Demo credits: Present

The talk "Why We Keep Going Back" uses NASA pictures only. They are the same files as in the first demo (`../../demo/CREDITS.md`), copied unchanged into `assets/media/deck.js` and `assets/media/tray.js`. The source page of each was opened and read before it was downloaded for the first demo; none shows a person, a logo or a brand. The speaker notes, titles and captions are original text.

Licence basis for NASA material: NASA's guidelines page (https://www.nasa.gov/nasa-brand-center/images-and-media/) states that NASA content "generally are not subject to copyright in the United States". The individual NASA pages carry a credit line and no licence text of their own. No NASA insignia is used or shown.

Every picture was resized (never enlarged) and re-encoded to WebP at quality 80 to 88 with Pillow, then embedded as a data URL. No picture was cropped or retouched in the files; the deck crops them on the slide with the `cover` fit and a focus point.

Inside the app, Home > Demos opens this talk with the files in `frontend/public/demos/nasa/` (the same bytes, decoded by `scripts/demo-media.py`); only the eight pictures used on slides go into the new deck.

## Pictures shipped in the packs

| In the demo | Title | Credit | Source page | Licence as stated on the page | Changes | Used on slide |
| --- | --- | --- | --- | --- | --- | --- |
| img_set | A Breathtaking Earthset from Orion (art002e021278), April 6, 2026 | NASA | http://images-assets.nasa.gov/image/art002e021278/metadata.json | No licence text; photographer field "NASA"; NASA content | 5568x3712 JPEG resized to 1400x933 WebP | 1 |
| img_rise | Earthrise, Apollo 8 (AS08-14-2383) | NASA/William Anders | https://www.nasa.gov/image-detail/moon-landing-l-7-months-10-apollo-8-earthrise-photo-as08-14-2383 | No licence text; credit line "Image Credit: NASA/William Anders"; NASA content | 3000x1971 JPEG resized to 1400x920 WebP | 3, 4 |
| img_chey | Perseverance's Selfie With 'Cheyava Falls' (PIA26344) | NASA/JPL-Caltech/MSSS | https://science.nasa.gov/photojournal/perseverances-selfie-with-cheyava-falls/ | No licence text; credit line as given; NASA content | 10502x7458 JPEG resized to 1400x994 WebP | 2 |
| img_moj | Curiosity Self-Portrait at 'Mojave' Site on Mount Sharp (PIA19142) | NASA/JPL-Caltech/MSSS | https://science.nasa.gov/photojournal/curiosity-self-portrait-at-mojave-site-on-mount-sharp/ | No licence text; credit line as given; NASA content | 9015x4617 JPEG resized to 1600x819 WebP | 5 |
| img_per | Perseverance's Selfie with Ingenuity (PIA24542) | NASA/JPL-Caltech/MSSS | https://science.nasa.gov/photojournal/perseverances-selfie-with-ingenuity/ | No licence text; credit line as given; NASA content | 12341x9076 JPEG resized to 1600x1177 WebP | 6 |
| img_edge | The Edge of the Night (PIA17199) | NASA/JPL-Caltech/Space Science Institute | https://science.nasa.gov/photojournal/the-edge-of-the-night/ | No licence text; credit line as given; NASA content | 4399x980 grayscale JPEG resized to 1600x356 WebP | 7 |
| img_smile | The Day the Earth Smiled (PIA17172) | NASA/JPL-Caltech/SSI | https://science.nasa.gov/photojournal/the-day-the-earth-smiled/ | No licence text; credit line as given; NASA content | 9000x3500 JPEG resized to 1600x622 WebP | 8 |
| img_udf | Hubble Ultra Deep Field | NASA and the European Space Agency | https://commons.wikimedia.org/wiki/File:Hubble_ultra_deep_field.jpg | "This file is in the public domain because it was created by NASA and ESA." | 3100x3100 JPEG resized to 1400x1400 WebP | 9 |
| img_cur | Looking Up at Mars Rover Curiosity in 'Buckskin' Selfie (PIA19808) | NASA/JPL-Caltech/MSSS | https://science.nasa.gov/photojournal/looking-up-at-mars-rover-curiosity-in-buckskin-selfie/ | No licence text; credit line as given; NASA content | 4841x2949 JPEG resized to 1600x975 WebP | not used (in pack) |
| img_jup | Cassini Jupiter Portrait (PIA04866) | NASA/JPL/Space Science Institute | https://science.nasa.gov/photojournal/cassini-jupiter-portrait/ | No licence text; credit line as given; NASA content | 1920x2400 JPEG resized to 800x1000 WebP | not used (in pack) |
| img_sat | The Greatest Saturn Portrait ...Yet (PIA06193) | NASA/JPL/Space Science Institute | https://science.nasa.gov/photojournal/the-greatest-saturn-portrait-yet/ | No licence text; credit line as given; NASA content | 8888x4544 JPEG resized to 1600x818 WebP | not used (in pack) |
| img_dot | Solar System Portrait, Earth as Pale Blue Dot (PIA00452) | NASA/JPL (Voyager 1) | https://photojournal.jpl.nasa.gov/catalog/PIA00452 | No licence text; NASA content | 453x614 JPEG resized to 334x453 WebP | not used (in pack) |

## Text

The dates in the backup table on slide 11 come from the pages above (the Curiosity row gives only the year). The speaker notes and captions are original.

## Code and fonts

No new dependency. The page bundles the Latin subsets of Inter, Jetbrains Mono, Fraunces and Work Sans from `@fontsource` (OFL-1.1, already listed in `NOTICE.md`) and `fflate` (MIT) through the first demo's readers.
