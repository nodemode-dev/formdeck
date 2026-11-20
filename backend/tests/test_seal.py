import json
import sys
import types

import pytest


class Chain(types.ModuleType):
    def __init__(self):
        super().__init__("keyring")
        self.store = {}

    def get_password(self, service, account):
        return self.store.get((service, account))

    def set_password(self, service, account, value):
        self.store[(service, account)] = value


@pytest.fixture()
def keychain(monkeypatch, tmp_path):
    from app.core import config, seal

    fake = Chain()
    monkeypatch.setitem(sys.modules, "keyring", fake)
    monkeypatch.setenv("FORMDECK_DATA_DIR", str(tmp_path))
    seal.reset()
    yield fake
    seal.reset()


@pytest.fixture()
def no_keychain(monkeypatch, tmp_path):
    from app.core import seal

    monkeypatch.setitem(sys.modules, "keyring", None)
    monkeypatch.setenv("FORMDECK_DATA_DIR", str(tmp_path))
    seal.reset()
    yield
    seal.reset()


def hand_edit(**fields):
    from app.core import config

    stored = json.loads(config.settings_path().read_text(encoding="utf-8"))
    stored.update(fields)
    config.settings_path().write_text(json.dumps(stored), encoding="utf-8")


def test_a_window_write_is_sealed_and_read_back(keychain):
    from app.core import config

    config.write_settings({"agentsAllowed": True})
    now = config.read_settings()
    assert now["seal"] == "ok" and now["sealBroken"] is False and now["agentsAllowed"] is True
    assert ("FormDeck", "settings-seal") in keychain.store


def test_a_hand_edit_of_agent_access_is_caught_and_treated_as_ask(keychain):
    from app.core import config

    config.write_settings({"agentsAllowed": False})
    hand_edit(agentsAllowed=True)
    now = config.read_settings()
    assert now["sealBroken"] is True and now["seal"] == "broken" and now["agentsAllowed"] is False


def test_a_hand_edit_of_the_program_to_run_is_caught(keychain):
    from app.core import config

    config.write_settings({"claude": {"bin": "", "folder": "", "firstMessage": ""}})
    hand_edit(claude={"bin": "/tmp/other-program", "folder": "", "firstMessage": ""})
    now = config.read_settings()
    assert now["sealBroken"] is True and now["claude"]["bin"] == ""


def test_tightening_by_hand_is_not_a_break(keychain):
    from app.core import config

    config.write_settings({"agentsAllowed": True})
    hand_edit(agentsAllowed=False)
    assert config.read_settings()["agentsAllowed"] is False


def test_the_first_loosened_file_without_a_seal_is_treated_as_ask(keychain):
    from app.core import config

    config.settings_path().write_text(json.dumps({"agentsAllowed": True}), encoding="utf-8")
    now = config.read_settings()
    assert now["agentsAllowed"] is False and now["sealBroken"] is True


def test_a_window_write_after_a_break_confirms_it(keychain):
    from app.core import config

    config.write_settings({"agentsAllowed": False})
    hand_edit(agentsAllowed=True)
    assert config.read_settings()["sealBroken"] is True
    config.write_settings({"agentsAllowed": False})
    assert config.read_settings()["sealBroken"] is False


def test_an_unrelated_write_keeps_the_seal(keychain):
    from app.core import config

    config.write_settings({"agentsAllowed": True})
    config.write_settings({"author": "someone"})
    assert config.read_settings()["seal"] == "ok"


def test_the_seal_cannot_be_set_through_a_patch(keychain):
    from app.core import config

    config.write_settings({"agentsAllowed": False, "seal": "x", "sealBroken": True})
    assert config.read_settings()["seal"] == "ok"


def test_no_keychain_means_unavailable_and_the_values_stand(no_keychain):
    from app.core import config

    config.write_settings({"agentsAllowed": True})
    hand_edit(claude={"bin": "/tmp/other-program", "folder": "", "firstMessage": ""})
    now = config.read_settings()
    assert now["seal"] == "unavailable" and now["sealBroken"] is False
    assert now["agentsAllowed"] is True and now["claude"]["bin"] == "/tmp/other-program"


def test_a_keychain_that_raises_never_stops_the_engine(monkeypatch, tmp_path):
    from app.core import config, seal

    class Broken(Chain):
        def get_password(self, service, account):
            raise RuntimeError("locked")

    monkeypatch.setitem(sys.modules, "keyring", Broken())
    monkeypatch.setenv("FORMDECK_DATA_DIR", str(tmp_path))
    seal.reset()
    try:
        config.write_settings({"agentsAllowed": True})
        assert config.read_settings()["seal"] == "unavailable"
    finally:
        seal.reset()
