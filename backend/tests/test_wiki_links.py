import re

from conftest import REPO

WIKI = REPO / ".docs" / "wiki"


def test_wiki_links_name_the_nodemode_dev_repositories():
    stale = []
    for page in sorted(WIKI.glob("*.md")):
        for n, line in enumerate(page.read_text(encoding="utf-8").splitlines(), 1):
            if re.search(r"github\.com/nodemode-ai/(formdeck|formpdf)\b", line, re.I):
                stale.append(f"{page.name}:{n}")
    assert list(WIKI.glob("*.md"))
    assert not stale, stale
