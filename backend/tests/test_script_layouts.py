import pytest

from conftest import call_tool, tool_text
from test_f6_fdec import make_png


def slides_for(a, b):
    return {
        "title": "# Big idea\n## A subtitle",
        "section": "# Part two\n## Where we go next",
        "agenda": "<!-- layout: agenda -->\n# Agenda\n- One\n- Two\n- Three",
        "content": "# Findings\n- First\n- Second",
        "twoContent": "<!-- layout: twoContent -->\n# Options\n### Left\n- a\n- b\n### Right\n- c\n- d",
        "comparison": "# Versus\n### Old\n- slow\n### New\n- fast",
        "imageLeft": f"<!-- layout: imageLeft -->\n# Studio\n- Bright\n![s]({a})",
        "imageRight": f"# Studio\n- Bright\n![s]({a})",
        "imageFull": f"# Studio\n![s]({a})",
        "gallery": f"# Gallery\n![a]({a})\n![b]({b})",
        "bigNumber": "<!-- layout: bigNumber -->\n# Revenue\n## $4.2M\nUp 38 percent",
        "stats": "# Quarter\n- **38%** growth\n- **12** new clients\n- **4.8** rating",
        "quote": "# Voice\n> Fastest onboarding we have seen.\n-- Dana Ortiz",
        "timeline": "<!-- layout: timeline -->\n# Roadmap\n- Q4: Beta\n- Q1: Launch\n- Q2: Scale",
        "process": "<!-- layout: process -->\n# How it works\n- Plan: scope it\n- Build: ship it\n- Learn: measure",
        "team": "<!-- layout: team -->\n# Team\n- Ana Cole, Design\n- Raj Rao, Engineering",
        "chart": '# Growth\n```chart\n{"kind":"column","categories":["Q1","Q2"],"series":[{"name":"Rev","values":[2,3]}]}\n```',
        "table": "# Plans\n| Plan | Price |\n| --- | --- |\n| Basic | 5 |\n| Pro | 9 |",
        "titleOnly": "# Just a headline",
        "blank": "<!-- layout: blank -->\n# unseen",
    }


ORDER = ["title", "section", "agenda", "content", "twoContent", "comparison", "imageLeft", "imageRight", "imageFull", "gallery", "bigNumber",
         "stats", "quote", "timeline", "process", "team", "chart", "table", "titleOnly", "blank", "closing"]


@pytest.fixture(scope="module")
def semantics(client, tmp_path_factory):
    tmp = tmp_path_factory.mktemp("layouts")
    parts = slides_for(make_png(tmp / "a.png"), make_png(tmp / "b.png", (30, 30, 200)))
    parts["closing"] = "# Thank you"
    script = "\n\n---\n".join(parts[name] for name in ORDER)
    result = call_tool(client, "build_deck", {"script": script})
    assert not result.get("isError"), tool_text(result)
    deck = client.get("/api/decks/" + result["structuredContent"]["deck"]).json()["deck"]
    by_id = {l["id"]: l.get("semantic") for l in deck["layouts"]}
    return [by_id[s["layout"]] for s in deck["slides"]]


def test_the_script_covers_all_21_layouts():
    from app.services.model import SEMANTICS

    assert sorted(ORDER) == sorted(SEMANTICS) and len(ORDER) == 21


def test_one_slide_per_script_slide(semantics):
    assert len(semantics) == 21


@pytest.mark.parametrize("index,name", list(enumerate(ORDER)))
def test_slide_compiles_into_its_layout(semantics, index, name):
    assert semantics[index] == name


def parse(script):
    from app.services.compiler.spec import parse_script

    return parse_script(script)


def test_front_matter_sets_title_and_template():
    spec = parse("---\ntitle: Q3\ntemplate: aurora\n---\n\n# One\n\n---\n# Two\n")
    assert spec["title"] == "Q3" and spec["template"] == "aurora"
    assert [s["title"] for s in spec["slides"]] == ["One", "Two"]


def test_separator_inside_a_fenced_block_does_not_split_slides():
    spec = parse("# One\n```chart\n{\"kind\": \"pie\", \"categories\": [\"a\"], \"series\": [{\"name\": \"s\", \"values\": [1]}]}\n```\n\n---\n# Two")
    assert len(spec["slides"]) == 2 and spec["slides"][0]["chart"]["kind"] == "pie"


def test_nested_bullets_notes_and_picture_alt():
    spec = parse("# T\n- a\n  - b\n- c\n![Alt text](a1)\nNote: say this\nand this")
    slide = spec["slides"][0]
    assert slide["bullets"] == ["a", ["b"], "c"]
    assert slide["image"] == {"src": "a1", "alt": "Alt text"}
    assert slide["notes"] == "say this\nand this"


def test_stats_steps_people_and_quote_fields():
    stats = parse("# Q\n- **38%** growth\n- **12** clients")["slides"][0]
    assert stats["layout"] == "stats" and stats["stats"] == [{"value": "38%", "label": "growth"}, {"value": "12", "label": "clients"}]
    steps = parse("<!-- layout: timeline -->\n# R\n- Q4: Beta\n- Q1: Launch")["slides"][0]
    assert steps["steps"] == [{"title": "Q4", "text": "Beta"}, {"title": "Q1", "text": "Launch"}]
    people = parse("<!-- layout: team -->\n# T\n- Ana Cole, Design")["slides"][0]
    assert people["people"] == [{"name": "Ana Cole", "role": "Design"}]
    quote = parse("# V\n> Good.\n-- Dana")["slides"][0]
    assert quote["quote"] == "Good." and quote["by"] == "Dana"


def test_columns_and_table_fields():
    cols = parse("# V\n### Old\n- slow\n### New\n- fast")["slides"][0]
    assert cols["left"] == {"heading": "Old", "bullets": ["slow"]} and cols["right"] == {"heading": "New", "bullets": ["fast"]}
    table = parse("# P\n| Plan | Price |\n| --- | --- |\n| Basic | 5 |")["slides"][0]["table"]
    assert table == {"header": ["Plan", "Price"], "rows": [["Basic", "5"]]}


def test_unknown_layout_name_is_refused_by_add_slides(client):
    deck = call_tool(client, "build_deck", {"script": "# One\n\n---\n# Two\n- x"})["structuredContent"]["deck"]
    result = call_tool(client, "add_slides", {"deck": deck, "script": "<!-- layout: nonsense -->\n# Three"})
    assert result["isError"] and "Unknown layout" in tool_text(result)


def test_empty_script_is_refused(client):
    result = call_tool(client, "build_deck", {"script": "---\ntitle: Empty\n---\n"})
    assert result["isError"]
