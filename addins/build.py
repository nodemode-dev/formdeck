import hashlib
import json
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ZIPS = HERE / "zips"
STAMP = (2026, 1, 1, 0, 0, 0)


def package(folder: Path) -> tuple[str, bytes]:
    manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
    name = f"{manifest['id']}-{manifest['version']}.zip"
    out = ZIPS / name
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for path in sorted(p for p in folder.rglob("*") if p.is_file()):
            info = zipfile.ZipInfo(path.relative_to(folder).as_posix(), STAMP)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            zf.writestr(info, path.read_bytes())
    return name, out.read_bytes()


def main() -> int:
    ZIPS.mkdir(exist_ok=True)
    built = {}
    for folder in sorted(p for p in HERE.iterdir() if p.is_dir() and (p / "manifest.json").is_file()):
        name, data = package(folder)
        built[name] = hashlib.sha256(data).hexdigest()
    if "--check" in sys.argv:
        index = json.loads((HERE / "index.json").read_text(encoding="utf-8"))
        bad = 0
        for entry in index["addins"]:
            want = built.get(Path(entry["download"]).name)
            if want != entry["sha256"]:
                print(f"MISMATCH {entry['id']}: index {entry['sha256']} built {want}")
                bad += 1
        print("index.json matches the built packages" if not bad else f"{bad} mismatched")
        return 1 if bad else 0
    for name, digest in built.items():
        print(f"{digest}  zips/{name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
