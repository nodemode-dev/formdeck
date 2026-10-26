import io

import pytest
from pptx import Presentation
from pptx.util import Inches, Pt

from test_f6_fdec import make_png


def texts(deck_slide):
    found = []

    def walk(elements):
        for el in elements:
            for p in (el.get("text") or {}).get("paras", []):
                found.append("".join(r.get("t", "") for r in p.get("runs", [])))
            walk(el.get("children") or [])

    walk(deck_slide["elements"])
    return found


@pytest.fixture(scope="module")
def imported(client, tmp_path_factory):
    tmp = tmp_path_factory.mktemp("imp")
    prs = Presentation()
    first = prs.slides.add_slide(prs.slide_layouts[0])
    first.shapes.title.text = "Launch plan"
    first.placeholders[1].text = "Autumn 2026"
    second = prs.slides.add_slide(prs.slide_layouts[1])
    second.shapes.title.text = "Milestones"
    body = second.placeholders[1].text_frame
    body.text = "Design freeze"
    for line in ("Beta in October", "General release in December"):
        body.add_paragraph().text = line
    second.notes_slide.notes_text_frame.text = "mention the slip risk"
    third = prs.slides.add_slide(prs.slide_layouts[5])
    third.shapes.title.text = "The studio"
    third.shapes.add_picture(make_png(tmp / "p.png", (10, 160, 90), (400, 300)), Inches(1), Inches(2), Inches(4), Inches(3))
    box = third.shapes.add_textbox(Inches(5.5), Inches(2), Inches(3.5), Inches(1))
    box.text_frame.text = "Open since May"
    box.text_frame.paragraphs[0].runs[0].font.size = Pt(24)
    fourth = prs.slides.add_slide(prs.slide_layouts[5])
    fourth.shapes.title.text = "Questions"
    buf = io.BytesIO()
    prs.save(buf)
    r = client.post("/api/import", files={"file": ("launch.pptx", buf.getvalue())})
    assert r.status_code == 200, r.text
    deck_id = r.json()["id"]
    deck = client.get(f"/api/decks/{deck_id}").json()["deck"]
    return deck, r.json()


def test_import_keeps_the_slide_count_and_order(imported):
    deck, summary = imported
    assert summary["slides"] == 4
    titles = []
    for slide in deck["slides"]:
        first = [t for t in texts(slide) if t]
        titles.append(first[0] if first else "")
    assert titles[0] == "Launch plan" and titles[1] == "Milestones" and titles[2] == "The studio" and titles[3] == "Questions"


def test_import_keeps_slide_text(imported):
    deck, _ = imported
    assert "Autumn 2026" in texts(deck["slides"][0])
    assert {"Design freeze", "Beta in October", "General release in December"} <= set(texts(deck["slides"][1]))
    assert "Open since May" in texts(deck["slides"][2])


def test_import_keeps_notes(imported):
    deck, _ = imported
    assert deck["slides"][1]["notes"] == "mention the slip risk"


def test_import_keeps_the_picture(imported):
    deck, _ = imported
    pictures = [el for el in deck["slides"][2]["elements"] if el.get("type") == "image"]
    assert len(pictures) == 1
    assert pictures[0]["src"] in deck["media"]
    assert deck["media"][pictures[0]["src"]]["w"] == 400


def test_import_keeps_the_slide_size(imported):
    deck, _ = imported
    assert (deck["size"]["w"], deck["size"]["h"]) == (720, 540)


def test_a_broken_pptx_is_refused_not_crashed(client):
    r = client.post("/api/import", files={"file": ("broken.pptx", b"PK\x03\x04 not really a zip")})
    assert r.status_code in (400, 422)
