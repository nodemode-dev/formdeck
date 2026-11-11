import copy

from app.services.media import store as media_store
from app.services.odp import odp_bytes, read_odp

THEME = {
    "name": "Harbour",
    "colors": {"dk1": "#0B1320", "lt1": "#FDFDFB", "dk2": "#14324A", "lt2": "#E8EEF2", "accent1": "#0E7490", "accent2": "#B45309", "accent3": "#4D7C0F",
               "accent4": "#7E22CE", "accent5": "#BE123C", "accent6": "#1D4ED8", "hlink": "#0369A1", "folHlink": "#6D28D9"},
    "fonts": {"major": "Georgia", "minor": "Verdana"},
}


def round_trip(deck):
    data, _ = odp_bytes(deck, media_store())
    return read_odp(data, media_store())


def test_odp_round_trip_keeps_the_deck_theme_and_preserved_masters(client, deck_from_script):
    deck_id = deck_from_script("# Harbour plan\n## Tides and berths\n\n---\n# Berths\n- North quay\n- South quay")
    deck = copy.deepcopy(client.get(f"/api/decks/{deck_id}").json()["deck"])
    deck["theme"] = copy.deepcopy(THEME)
    deck["masters"][0].pop("theme", None)
    deck["masters"][0]["preserve"] = True
    back = round_trip(deck)
    assert back["theme"]["name"] == "Harbour"
    assert back["theme"]["colors"] == THEME["colors"]
    assert back["theme"]["fonts"] == THEME["fonts"]
    assert back["masters"][0].get("preserve") is True
    assert "theme" not in back["masters"][0]


def test_odp_round_trip_keeps_a_master_unpreserved(client, deck_from_script):
    deck_id = deck_from_script("# One slide")
    deck = copy.deepcopy(client.get(f"/api/decks/{deck_id}").json()["deck"])
    deck["masters"][0].pop("preserve", None)
    back = round_trip(deck)
    assert not back["masters"][0].get("preserve")
    assert back["theme"]["colors"] == deck["theme"]["colors"]
