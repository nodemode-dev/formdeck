from conftest import call_tool, tool_text


def elements(client, deck_id):
    return client.get(f"/api/decks/{deck_id}").json()["deck"]["slides"][0]["elements"]


def test_add_with_an_unknown_key_is_refused_and_changes_nothing(client, deck_from_script):
    deck_id = deck_from_script("# Frames")
    before = elements(client, deck_id)
    result = call_tool(client, "edit_elements", {"deck": deck_id, "slide": 1, "changes": [
        {"op": "add", "element": {"type": "shape", "frame": {"x": 10, "y": 20, "w": 30, "h": 40}}}]})
    assert result.get("isError")
    assert "frame" in tool_text(result)
    assert elements(client, deck_id) == before


def test_update_with_an_unknown_key_is_refused(client, deck_from_script):
    deck_id = deck_from_script("# Frames")
    title = elements(client, deck_id)[0]["id"]
    result = call_tool(client, "edit_elements", {"deck": deck_id, "slide": 1, "changes": [{"op": "update", "id": title, "set": {"x": 12, "colour": "#FF0000"}}]})
    assert result.get("isError")
    assert "colour" in tool_text(result)
    assert elements(client, deck_id)[0].get("x") != 12


def test_known_keys_still_apply_and_null_removes_a_stray_key(client, deck_from_script):
    deck_id = deck_from_script("# Frames")
    result = call_tool(client, "edit_elements", {"deck": deck_id, "slide": 1, "changes": [
        {"op": "add", "element": {"type": "shape", "x": 10, "y": 20, "w": 30, "h": 40, "geom": "ellipse", "alt": "dot", "opacity": 0.5}}]})
    assert not result.get("isError"), tool_text(result)
    added = elements(client, deck_id)[-1]
    assert (added["x"], added["y"], added["w"], added["h"], added["geom"]) == (10, 20, 30, 40, "ellipse")
    slide = client.get(f"/api/decks/{deck_id}").json()["deck"]["slides"][0]["id"]
    result = call_tool(client, "apply_ops", {"deck": deck_id, "ops": [{"op": "set", "path": ["slides", {"id": slide}, "elements", {"id": added["id"]}, "frame"], "value": {"x": 1}}]})
    assert not result.get("isError"), tool_text(result)
    assert elements(client, deck_id)[-1]["frame"] == {"x": 1}
    result = call_tool(client, "edit_elements", {"deck": deck_id, "slide": 1, "changes": [{"op": "update", "id": added["id"], "set": {"frame": None}}]})
    assert not result.get("isError"), tool_text(result)
    assert "frame" not in elements(client, deck_id)[-1]
