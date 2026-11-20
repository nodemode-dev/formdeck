import json
import logging
import os
import sys
from pathlib import Path

if sys.stdin is None:
    sys.stdin = open(os.devnull, encoding="utf-8")
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w", encoding="utf-8")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w", encoding="utf-8")

MODULES = ("PIL", "fastapi", "uvicorn", "pptx", "pypdfium2", "pdfplumber", "docx", "openpyxl", "reportlab", "pypdf", "fontTools", "brotli")


def resource_dir() -> str:
    return getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))


def selfcheck() -> int:
    info = {"python": sys.version.split()[0]}
    missing = False
    for name in MODULES:
        try:
            module = __import__(name)
            info[name.lower()] = str(getattr(module, "__version__", "ok"))
        except Exception as exc:
            info[name.lower()] = f"missing: {exc}"
            missing = True
    from app import __version__

    info["formdeck"] = __version__
    info["dist_bundled"] = os.path.isdir(os.path.join(resource_dir(), "frontend_dist"))
    print(json.dumps(info))
    return 1 if missing else 0


def watch_shell(data) -> None:
    from app.core import runtime, startup

    shell = startup.shell_pid()
    if shell <= 1:
        return

    def leave() -> None:
        logging.getLogger("formdeck").info("the app that started this engine is gone (process %s), stopping", shell)
        runtime.release(data)
        os._exit(0)

    startup.watch(shell, leave)


def serve() -> int:
    bundled = os.path.join(resource_dir(), "frontend_dist")
    if os.path.isdir(bundled):
        os.environ.setdefault("FORMDECK_DIST", bundled)
    os.environ.setdefault("FORMDECK_DESKTOP", "1")
    from app.core import config, runtime, startup

    try:
        data = config.data_dir()
        logs = runtime.start_logging(data).parent
    except OSError as err:
        print(f"formdeck cannot use its data folder: {err}", file=sys.stderr)
        return 5
    startup.keep_errors(logs)
    log = logging.getLogger("formdeck")
    if startup.alone():
        beside = startup.app_beside(Path(sys.executable))
        if beside is not None and startup.open_app(beside):
            log.info("started without its app, so it opened %s and stopped", beside)
            return 0
        log.error("started without its app, and no app program was found near %s", sys.executable)
        print("formdeck-engine is a part of FormDeck and serves nothing on its own. Open FormDeck instead.", file=sys.stderr)
        return 4
    try:
        runtime.claim(data)
    except runtime.AlreadyRunning as err:
        log.error("%s", err)
        print(err, file=sys.stderr)
        return 2
    watch_shell(data)
    import uvicorn

    from app.core import window_key
    from app.main import app as fastapi_app

    port = int(os.environ.get("FORMDECK_PORT") or os.environ.get("FORMSLD_PORT") or 0)
    if port == 0:
        import socket
        prefer = int(os.environ.get("FORMDECK_PORT_PREFER") or 0)
        for want in ([prefer] if prefer else []) + [0]:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
                try:
                    probe.bind(("127.0.0.1", want))
                except OSError:
                    continue
                port = probe.getsockname()[1]
                break
    os.environ["FORMDECK_PORT"] = str(port)
    if window_key.stdout_mode():
        print(window_key.LINE + window_key.KEY, flush=True)
    settings = uvicorn.Config(fastapi_app, host="127.0.0.1", port=port, log_level="info")
    runtime.start_logging(data)
    server = uvicorn.Server(settings)

    def leave(_signum, _frame) -> None:
        runtime.release(data)
        os._exit(0)

    import signal

    signal.signal(signal.SIGTERM, leave)
    try:
        server.run()
    finally:
        runtime.release(data)
    return 0 if server.started else 3


def main() -> int:
    if "--selfcheck" in sys.argv:
        return selfcheck()
    try:
        return serve()
    except Exception:
        logging.getLogger("formdeck").exception("the engine stopped on an error")
        raise


if __name__ == "__main__":
    import multiprocessing
    multiprocessing.freeze_support()
    sys.exit(main())
