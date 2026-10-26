import io

import pytest
from PIL import Image
from pptx import Presentation

from conftest import call_tool, tool_text
from test_f6_fdec import download, make_png

TITLES = ["Quarterly review", "Where we stand", "The new studio", "Revenue", "Thank you"]


@pytest.fixture(scope="module")
def exported(client, tmp_path_factory):
    tmp = tmp_path_factory.mktemp("pptx")
    png = make_png(tmp / "photo.png", (20, 90, 200), (640, 400))
    script = f"""# {TITLES[0]}
## Board meeting

---
# {TITLES[1]}
- Pipeline is healthy
- Churn is down
- Two launches ship in Q4

---
# {TITLES[2]}
- Opened in May
- Two shifts

![The studio]({png})

---
# {TITLES[3]}
## $4.2M
Up 38 percent on last year

---
# {TITLES[4]}
## hello@example.com
Note: close with the ask
"""
    result = call_tool(client, "build_deck", {"script": script})
    assert not result.get("isError"), tool_text(result)
    data = download(client, result["structuredContent"]["deck"], "pptx")
    return Presentation(io.BytesIO(data)), data


def test_export_opens_with_the_right_slide_count(exported):
    prs, _ = exported
    assert len(prs.slides) == len(TITLES)


def test_every_slide_title_is_a_title_placeholder_with_its_text(exported):
    prs, _ = exported
    assert [s.shapes.title.text_frame.text for s in prs.slides] == TITLES


def test_slide_size_is_widescreen(exported):
    prs, _ = exported
    assert (prs.slide_width, prs.slide_height) == (960 * 12700, 540 * 12700)


def test_bullets_and_numbers_reach_the_slide_text(exported):
    prs, _ = exported
    text = [" ".join(sh.text_frame.text for sh in s.shapes if sh.has_text_frame) for s in prs.slides]
    assert "Churn is down" in text[1] and "Two launches ship in Q4" in text[1]
    assert "$4.2M" in text[3]


def test_picture_is_embedded_with_its_pixels(exported):
    prs, _ = exported
    pictures = [sh for s in prs.slides for sh in s.shapes if getattr(sh, "image", None) is not None]
    assert len(pictures) == 1
    image = Image.open(io.BytesIO(pictures[0].image.blob))
    assert image.size == (640, 400)
    assert image.convert("RGB").getpixel((10, 10)) == (20, 90, 200)


def test_speaker_notes_are_exported(exported):
    prs, _ = exported
    assert prs.slides[4].has_notes_slide
    assert prs.slides[4].notes_slide.notes_text_frame.text == "close with the ask"


def test_only_the_wanted_slides_have_pictures(exported):
    prs, _ = exported
    counts = [sum(1 for sh in s.shapes if getattr(sh, "image", None) is not None) for s in prs.slides]
    assert counts[2] == 1 and sum(counts) == 1
