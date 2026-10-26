import io
import json
import zipfile

import pytest
from PIL import Image

from conftest import call_tool, tool_text

STAMPS = ("modified", "created", "sourceCreated", "sourceModified", "file", "importWarnings")


def make_png(path, color=(200, 30, 30), size=(320, 200)):
    Image.new("RGB", size, color).save(path)
    return str(path)


def build(client, tmp_path, extra=""):
    png = make_png(tmp_path / "red.png")
    script = f"""---
title: Round trip
---

# Round trip
## Subtitle

---
# Agenda
- First
  - Nested
- Second

![A red box]({png})

Note: speaker words

---
# Numbers
## $4.2M
Up 38 percent
{extra}
"""
    result = call_tool(client, "build_deck", {"script": script})
    assert not result.get("isError"), tool_text(result)
    return result["structuredContent"]["deck"]


def download(client, deck_id, fmt="fdec"):
    r = client.get(f"/api/decks/{deck_id}/download?format={fmt}")
    assert r.status_code == 200
    return r.content


def load(client, data, name="round.fdec"):
    r = client.post("/api/import", files={"file": (name, data)})
    assert r.status_code == 200, r.text
    return r.json()["id"]


def unpack(data):
    z = zipfile.ZipFile(io.BytesIO(data))
    deck = json.loads(z.read("deck.json"))
    media = {n: z.read(n) for n in z.namelist() if n.startswith("media/")}
    return z, deck, media


def comparable(deck):
    out = {k: v for k, v in deck.items() if k != "id"}
    out["meta"] = {k: v for k, v in (deck.get("meta") or {}).items() if k not in STAMPS}
    return out


def test_package_has_mimetype_first_then_deck_and_media(client, tmp_path):
    z, deck, media = unpack(download(client, build(client, tmp_path)))
    assert z.namelist()[0] == "mimetype"
    assert z.read("mimetype") == b"application/x-formdeck"
    assert z.getinfo("mimetype").compress_type == zipfile.ZIP_STORED
    assert deck["format"] == "formdeck/deck"
    assert len(media) == 1


def test_save_load_save_gives_equal_documents_and_media(client, tmp_path):
    first = download(client, build(client, tmp_path))
    second = download(client, load(client, first))
    _, deck1, media1 = unpack(first)
    _, deck2, media2 = unpack(second)
    assert comparable(deck2) == comparable(deck1)
    assert media1 and media2 == media1


def test_a_second_round_changes_nothing_but_the_id_and_stamps(client, tmp_path):
    second = download(client, load(client, download(client, build(client, tmp_path))))
    third = download(client, load(client, second))
    _, deck2, media2 = unpack(second)
    _, deck3, media3 = unpack(third)
    assert comparable(deck3) == comparable(deck2)
    assert media2 and media3 == media2


def test_loaded_deck_keeps_slide_order_text_notes_and_picture(client, tmp_path):
    loaded = load(client, download(client, build(client, tmp_path)))
    _, deck, media = unpack(download(client, loaded))
    titles = []
    for slide in deck["slides"]:
        for el in slide["elements"]:
            if (el.get("ph") or {}).get("type") in ("title", "ctrTitle"):
                titles.append("".join(r["t"] for p in el["text"]["paras"] for r in p["runs"]))
    assert titles == ["Round trip", "Agenda", "Numbers"]
    assert deck["slides"][1]["notes"] == "speaker words"
    assert any(el.get("type") == "image" and el["src"] in deck["media"] for el in deck["slides"][1]["elements"])
    assert list(media.values())[0][:8] == b"\x89PNG\r\n\x1a\n"


def test_older_fsld_package_is_accepted(client, tmp_path):
    z, deck, media = unpack(download(client, build(client, tmp_path)))
    deck["format"] = "formsld/deck"
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as out:
        out.writestr("mimetype", "application/x-formsld", compress_type=zipfile.ZIP_STORED)
        out.writestr("deck.json", json.dumps(deck))
        for name, raw in media.items():
            out.writestr(name, raw)
    loaded = load(client, buf.getvalue(), "old.fsld")
    _, again, _ = unpack(download(client, loaded))
    assert again["format"] == "formdeck/deck"
    assert len(again["slides"]) == 3


def test_saving_to_a_chosen_path_writes_a_package_that_opens(client, tmp_path):
    deck_id = build(client, tmp_path)
    target = tmp_path / "saved.fdec"
    r = client.post(f"/api/decks/{deck_id}/save", json={"path": str(target)})
    assert r.status_code == 200, r.text
    assert zipfile.is_zipfile(target)
    opened = client.post("/api/open-path", json={"path": str(target)})
    assert opened.status_code == 200
    assert opened.json()["slides"] == 3


def test_a_file_that_is_not_a_deck_is_refused(client):
    r = client.post("/api/import", files={"file": ("notes.txt", b"not a deck")})
    assert r.status_code in (400, 422)
