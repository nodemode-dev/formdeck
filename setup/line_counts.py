#!/usr/bin/env python3
"""./formdeck counts: product line counts per language (tests excluded) and a check that README.md states them.

  python3 setup/line_counts.py            print the figures for the README's Stack line
  python3 setup/line_counts.py --check    exit 1 if README.md's figures have drifted from the code
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GROUPS = {
    "TypeScript": (ROOT / "frontend" / "src", (".ts",)),
    "CSS": (ROOT / "frontend" / "src", (".css",)),
    "Python": (ROOT / "backend", (".py",)),
    "Rust": (ROOT / "src-tauri" / "src", (".rs",)),
}
SKIP = ("venv", "node_modules", "dist", "dist-engine", "build", "__pycache__", "tests", "target")


def count(base: Path, exts: tuple[str, ...]) -> int:
    total = 0
    for p in base.rglob("*"):
        if p.suffix in exts and p.is_file() and not any(part in SKIP for part in p.relative_to(base).parts):
            total += sum(1 for line in p.read_text(encoding="utf-8", errors="ignore").splitlines() if line.strip())
    return total


def rounded(n: int) -> str:
    return f"{round(n, -2):,}" if n >= 1000 else str(n)


def main(argv: list[str]) -> int:
    counts = {k: count(*v) for k, v in GROUPS.items()}
    line = ", ".join(f"{rounded(v)} of {k}" for k, v in counts.items() if v)
    if "--check" in argv:
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        found = re.search(r"about ([0-9,]+ of TypeScript.*?) \(product code", readme)
        ok = bool(found) and found.group(1) == line
        print("counts: README in step" if ok else f"counts: README says {found.group(1) if found else 'nothing'}; the tree has {line}")
        return 0 if ok else 1
    print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
