import atexit
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Optional

import requests

BASE_DIR = Path(__file__).resolve().parent
CORE_FILE = BASE_DIR / "bot_core.py"
PAIRING_DIR = BASE_DIR / "whatsapp-pairing-api"
SERVER_ENTRY = PAIRING_DIR / "server.js"
PACKAGE_JSON = PAIRING_DIR / "package.json"
PAIRING_BRIDGE_FILE = PAIRING_DIR / "lib" / "pairingBridge.js"
COMPANION_LOG_PATH = BASE_DIR / "embedded_companion.log"
COMPANION_PORT = int((os.getenv("COMPANION_PORT") or os.getenv("PAIRING_SERVER_PORT") or "3100").strip() or "3100")
INTERNAL_BASE_URL = (os.getenv("INTERNAL_PAIRING_BASE_URL") or f"http://127.0.0.1:{COMPANION_PORT}").strip().rstrip("/")
PAIRING_API_URL = f"{INTERNAL_BASE_URL}/api/pairing"

COMPANION_PROCESS: Optional[subprocess.Popen[Any]] = None
COMPANION_LOG_HANDLE = None


def ensure_file(path: Path, label: str) -> None:
    if not path.exists():
        raise RuntimeError(f"الملف المطلوب غير موجود: {label} -> {path.name}")


def ensure_node_runtime() -> None:
    if shutil.which("node") is None:
        raise RuntimeError("Node.js غير موجود على الاستضافة، لذلك مشروع الاقتران المحلي لن يعمل.")
    if shutil.which("npm") is None:
        raise RuntimeError("npm غير موجود على الاستضافة، لذلك لا يمكن تثبيت مكتبات مشروع الاقتران المحلي.")


def ensure_pairing_dependencies() -> None:
    required_paths = [
        PAIRING_DIR / "node_modules" / "express",
        PAIRING_DIR / "node_modules" / "fs-extra",
        PAIRING_DIR / "node_modules" / "pino",
        PAIRING_DIR / "node_modules" / "mongodb",
        PAIRING_DIR / "node_modules" / "@whiskeysockets" / "baileys",
    ]
    if all(path.exists() for path in required_paths):
        return
    subprocess.check_call(
        ["npm", "install", "--omit=dev", "--no-audit", "--no-fund"],
        cwd=str(PAIRING_DIR),
    )


def wait_for_pairing_server(timeout_seconds: int = 90) -> None:
    deadline = time.time() + timeout_seconds
    last_error: Optional[Exception] = None
    while time.time() < deadline:
        process = COMPANION_PROCESS
        if process is not None and process.poll() is not None:
            raise RuntimeError("خادم الاقتران المحلي توقف مباشرة بعد التشغيل.")
        try:
            response = requests.get(f"{INTERNAL_BASE_URL}/health", timeout=3)
            if response.ok:
                return
        except Exception as exc:  # noqa: BLE001
            last_error = exc
        time.sleep(1)
    if last_error is not None:
        raise RuntimeError(f"تعذر تشغيل خادم الاقتران المحلي: {last_error}") from last_error
    raise RuntimeError("تعذر تشغيل خادم الاقتران المحلي خلال المهلة المحددة.")


def stop_pairing_server() -> None:
    global COMPANION_PROCESS, COMPANION_LOG_HANDLE
    process = COMPANION_PROCESS
    COMPANION_PROCESS = None
    if process is not None and process.poll() is None:
        try:
            process.terminate()
            process.wait(timeout=15)
        except Exception:
            try:
                process.kill()
            except Exception:
                pass
    if COMPANION_LOG_HANDLE is not None:
        try:
            COMPANION_LOG_HANDLE.close()
        except Exception:
            pass
        COMPANION_LOG_HANDLE = None


atexit.register(stop_pairing_server)


def start_pairing_server() -> None:
    global COMPANION_PROCESS, COMPANION_LOG_HANDLE
    ensure_file(CORE_FILE, "bot_core.py")
    ensure_file(SERVER_ENTRY, "whatsapp-pairing-api/server.js")
    ensure_file(PACKAGE_JSON, "whatsapp-pairing-api/package.json")
    ensure_file(PAIRING_BRIDGE_FILE, "whatsapp-pairing-api/lib/pairingBridge.js")
    ensure_node_runtime()
    ensure_pairing_dependencies()

    if COMPANION_PROCESS is not None and COMPANION_PROCESS.poll() is None:
        return

    env = os.environ.copy()
    env["PAIRING_SERVER_PORT"] = str(COMPANION_PORT)
    env["COMPANION_PORT"] = str(COMPANION_PORT)
    env.setdefault("LOG_LEVEL", env.get("LOG_LEVEL", "silent"))
    env.setdefault("BOT_TOKEN", env.get("BOT_TOKEN") or env.get("TELEGRAM_BOT_TOKEN") or "")
    env.setdefault("TELEGRAM_BOT_TOKEN", env.get("TELEGRAM_BOT_TOKEN") or env.get("BOT_TOKEN") or "")

    COMPANION_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    COMPANION_LOG_HANDLE = open(COMPANION_LOG_PATH, "ab")
    COMPANION_PROCESS = subprocess.Popen(
        ["node", "server.js"],
        cwd=str(PAIRING_DIR),
        env=env,
        stdout=COMPANION_LOG_HANDLE,
        stderr=subprocess.STDOUT,
    )
    wait_for_pairing_server()


def load_core_module():
    spec = importlib.util.spec_from_file_location("bot_core", CORE_FILE)
    if spec is None or spec.loader is None:
        raise RuntimeError("تعذر تحميل bot_core.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules["bot_core"] = module
    spec.loader.exec_module(module)
    return module


def normalize_phone_number(raw: Any) -> str:
    return "".join(ch for ch in str(raw or "") if ch.isdigit()).strip()


def patch_core_module(module: Any) -> None:
    internal_api_url = PAIRING_API_URL.rstrip("/")
    module.INTERNAL_PAIRING_BASE_URL = INTERNAL_BASE_URL
    module.TARGET_PAIRING_API_URL = internal_api_url
    module.PAIRING_RUNTIME_DISABLED_REASON = ""

    if hasattr(module, "SETTINGS") and isinstance(module.SETTINGS, dict):
        module.SETTINGS["pair_code_api_url"] = internal_api_url
        try:
            if hasattr(module, "save_settings"):
                module.save_settings()
        except Exception:
            pass

    def _resolve_pair_code_api_url() -> str:
        return internal_api_url

    def _delete_pairing_session_sync(number: str) -> dict[str, Any]:
        normalized = normalize_phone_number(number)
        if not normalized:
            return {"success": False, "error": "invalid phone"}
        response = requests.delete(f"{INTERNAL_BASE_URL}/api/session/{normalized}", timeout=25)
        if "application/json" in response.headers.get("content-type", ""):
            return response.json()
        return {"success": response.ok, "status_code": response.status_code}

    def _fetch_pairing_status_sync(number: str) -> dict[str, Any]:
        normalized = normalize_phone_number(number)
        if not normalized:
            return {}
        response = requests.get(
            f"{INTERNAL_BASE_URL}/api/session-status",
            params={"phone": normalized, "num": normalized, "number": normalized},
            timeout=25,
        )
        response.raise_for_status()
        if "application/json" in response.headers.get("content-type", ""):
            payload = response.json()
        else:
            payload = json.loads(response.text or "{}")
        return payload if isinstance(payload, dict) else {}

    def _start_embedded_companion_process() -> bool:
        return True

    def _stop_embedded_companion_process() -> None:
        return None

    module.resolve_pair_code_api_url = _resolve_pair_code_api_url
    module.delete_pairing_session_sync = _delete_pairing_session_sync
    module.fetch_pairing_status_sync = _fetch_pairing_status_sync
    module.start_embedded_companion_process = _start_embedded_companion_process
    module.stop_embedded_companion_process = _stop_embedded_companion_process
    module.ensure_embedded_companion_files = lambda *args, **kwargs: {}


def main() -> None:
    start_pairing_server()
    module = load_core_module()
    patch_core_module(module)
    module.main()


if __name__ == "__main__":
    main()
