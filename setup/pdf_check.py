#!/usr/bin/env python3
"""./formdeck pdf-check FILE.pdf [--flavour ua1|ua2|2b|...]: validates a PDF with veraPDF, the PDF Association's validator.

FormDeck does not ship veraPDF. Install it from https://verapdf.org (it needs Java), or set VERAPDF to its launcher.
The default flavour is ua1 (PDF/UA-1), the level FormDeck's PDF export declares."""
import os
import re
import shutil
import subprocess
import sys


def launcher() -> str | None:
    env = os.environ.get("VERAPDF", "").strip()
    if env and (os.path.isfile(env) or shutil.which(env)):
        return env
    for name in ("verapdf", "verapdf.bat"):
        hit = shutil.which(name)
        if hit:
            return hit
    for path in (os.path.expanduser("~/verapdf/verapdf"), "/opt/verapdf/verapdf", "C:\\Program Files\\veraPDF\\verapdf.bat"):
        if os.path.isfile(path):
            return path
    return None


def main(argv: list[str]) -> int:
    flavour = "ua1"
    if "--flavour" in argv:
        i = argv.index("--flavour")
        flavour = argv[i + 1] if i + 1 < len(argv) else ""
        argv = argv[:i] + argv[i + 2:]
    if len(argv) != 1 or not flavour or not os.path.isfile(argv[0]):
        print(__doc__, file=sys.stderr)
        return 2
    exe = launcher()
    if exe is None:
        print("veraPDF was not found. Install it from https://verapdf.org (it needs Java) or set VERAPDF to its launcher, then run this again.", file=sys.stderr)
        return 3
    try:
        out = subprocess.run([exe, "--flavour", flavour, "--format", "mrr", argv[0]], capture_output=True, text=True, timeout=600).stdout
    except (OSError, subprocess.SubprocessError) as exc:
        print(f"veraPDF could not run: {exc}", file=sys.stderr)
        return 3
    head = re.search(r'<validationReport[^>]*profileName="([^"]*)"[^>]*isCompliant="(true|false)"', out)
    det = re.search(r'<details passedRules="(\d+)" failedRules="(\d+)" passedChecks="(\d+)" failedChecks="(\d+)"', out)
    if not head or not det:
        print(out[-2000:] or "veraPDF gave no report.", file=sys.stderr)
        return 3
    ok = head.group(2) == "true"
    print(f"{'PASS' if ok else 'FAIL'} {head.group(1)}: {det.group(1)} rules passed, {det.group(2)} failed; {det.group(3)} checks passed, {det.group(4)} failed")
    for rule in re.finditer(r'<rule specification="([^"]*)" clause="([^"]*)"[^>]*status="failed" failedChecks="(\d+)"[^>]*>\s*<description>([^<]*)', out):
        print(f"  {rule.group(1)} {rule.group(2)} ({rule.group(3)}): {rule.group(4).strip()}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
