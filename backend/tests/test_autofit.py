import io
import re
import zipfile

import pytest

from conftest import call_tool, tool_text

BULLETS = [f"Point {i:02d} " + "with a considerably long run of explanatory words " * 3 for i in range(30)]
BULLETS = [b.strip() for b in BULLETS]
SHORT = [f"short {i:02d}" for i in range(40)]


def paragraph_text(el):
    return ["".join(r["t"] for r in p["runs"]) for p in el["text"]["paras"]]


def body_of(slide):
    return next(el for el in slide["elements"] if el.get("slot") == "body")


@pytest.fixture(scope="module")
def long_deck(client):
    script = "# Long\n" + "\n".join(f"- {b}" for b in BULLETS) + "\n\n---\n# Dense\n" + "\n".join(f"- {b}" for b in SHORT)
    result = call_tool(client, "build_deck", {"script": script})
    assert not result.get("isError"), tool_text(result)
    return client.get("/api/decks/" + result["structuredContent"]["deck"]).json()["deck"]


def test_long_text_is_split_so_no_slide_exceeds_its_limit(long_deck):
    max_items, max_chars = 7, 640
    for slide in long_deck["slides"]:
        lines = paragraph_text(body_of(slide))
        assert len(lines) <= max_items
        assert sum(len(t) for t in lines) <= max_chars


def test_no_bullet_is_lost_or_reordered_by_the_split(long_deck):
    lines = [t for slide in long_deck["slides"] for t in paragraph_text(body_of(slide))]
    assert lines == BULLETS + SHORT


def test_continuation_slides_keep_the_title(long_deck):
    titles = ["".join(r["t"] for p in next(e for e in s["elements"] if e.get("slot") == "title")["text"]["paras"] for r in p["runs"]) for s in long_deck["slides"]]
    split = titles.index("Dense")
    assert titles[0] == "Long" and split > 1 and set(titles[1:split]) == {"Long (cont.)"}
    assert titles.count("Dense") == 1 and set(titles[split + 1:]) == {"Dense (cont.)"}


def test_text_placeholders_shrink_to_fit(long_deck):
    content = next(l for l in long_deck["layouts"] if l.get("semantic") == "content")
    modes = {(e.get("ph") or {}).get("type"): (e.get("text") or {}).get("autofit") for e in content["elements"]}
    assert modes["title"] == "shrink" and modes["body"] == "shrink"


def exported_xml(client, deck_id, scales=None):
    if scales is None:
        data = client.get(f"/api/decks/{deck_id}/download?format=pptx").content
    else:
        r = client.post(f"/api/decks/{deck_id}/export", json={"format": "pptx", "path": str(scales[1] / "scaled.pptx"), "fontScales": scales[0]})
        assert r.status_code == 200, r.text
        data = (scales[1] / "scaled.pptx").read_bytes()
    z = zipfile.ZipFile(io.BytesIO(data))
    return {n: z.read(n).decode("utf-8") for n in z.namelist() if re.match(r"ppt/slides/slide\d+\.xml$", n)}


def test_export_has_one_file_per_slide_and_no_scale_without_a_measurement(client, long_deck):
    slides = exported_xml(client, long_deck["id"])
    assert len(slides) == len(long_deck["slides"])
    assert not any("fontScale" in xml for xml in slides.values())


def test_the_windows_measured_shrink_reaches_the_exported_file(client, long_deck, tmp_path):
    slide = long_deck["slides"][0]
    body = body_of(slide)
    slides = exported_xml(client, long_deck["id"], ({slide["id"]: {body["id"]: 0.55}}, tmp_path))
    assert 'fontScale="55000"' in slides["ppt/slides/slide1.xml"]
    assert "fontScale" not in slides["ppt/slides/slide2.xml"]


def test_a_shrink_below_the_floor_is_clamped_not_dropped(client, long_deck, tmp_path):
    slide = long_deck["slides"][1]
    body = body_of(slide)
    slides = exported_xml(client, long_deck["id"], ({slide["id"]: {body["id"]: 0.001}}, tmp_path))
    scale = int(re.search(r'fontScale="(\d+)"', slides["ppt/slides/slide2.xml"]).group(1))
    assert 1000 <= scale <= 100000
