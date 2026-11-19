from app.routers.live import guest_refusal
from app.services.store import STORE


def refusal(deck, ops):
    return guest_refusal({"deck": deck, "role": "comment"}, "step", deck, {"ops": ops})


ADD = {"op": "ins", "path": ["comments"], "index": 0, "value": {"id": "c1", "text": "hi", "slide": "s1"}}
START = {"op": "set", "path": ["comments"], "value": []}


def test_a_comment_guest_can_start_the_list_add_reply_and_resolve(deck_from_script):
    deck = deck_from_script("# One\n\n---\n# Two\n- x")
    STORE.session(deck).deck.pop("comments", None)
    assert refusal(deck, [START, ADD]) == ""
    assert refusal(deck, [ADD]) == ""
    reply = {"id": "r1", "text": "ok"}
    assert refusal(deck, [{"op": "ins", "path": ["comments", {"id": "c1"}, "replies"], "index": 0, "value": reply}]) == ""
    assert refusal(deck, [{"op": "set", "path": ["comments", {"id": "c1"}, "replies"], "value": [reply]}]) == ""
    assert refusal(deck, [{"op": "set", "path": ["comments", {"id": "c1"}, "resolved"], "value": True}]) == ""


def test_a_comment_guest_cannot_wipe_delete_or_rewrite_comments(deck_from_script):
    deck = deck_from_script("# One\n\n---\n# Two\n- x")
    STORE.session(deck).deck["comments"] = [{"id": "c1", "text": "hi", "slide": "s1"}]
    assert refusal(deck, [START])
    assert refusal(deck, [{"op": "del", "path": ["comments"], "id": "c1"}])
    assert refusal(deck, [{"op": "set", "path": ["comments", {"id": "c1"}, "text"], "value": "changed"}])
    assert refusal(deck, [ADD, {"op": "set", "path": ["slides"], "value": []}])
