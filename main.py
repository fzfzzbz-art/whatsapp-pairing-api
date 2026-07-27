# =============================================================================
#  WhatsApp Pairing API — Telegram Bot + Embedded Pairing Server (single file)
# =============================================================================
#  This file combines:
#    - The full Telegram bot (commands, settings, DRF-style site settings,
#      emoji management, auto-reply channel broadcasts).
#    - An embedded HTTP server that exposes the same API surface as the old
#      bwt-lwts.onrender.com companion:
#         GET  /            (landing/linking page is served from /public)
#         GET  /healthz     (Render health-check)
#         GET  /api/linked-users
#         GET  /api/socket-state
#         POST /api/pairing
#         POST /api/emoji  (push new emoji to all linked numbers in real time)
#         POST /api/status-reaction
#         POST /api/session/:phone
#
#  Why this rewrite fixes the stop/hang you saw on bwt-lwts.onrender.com:
#
#   * The original server.js performed `sock.requestPairingCode()` directly
#     inside the Express handler. That call blocks the Node event loop for
#     1–8 seconds. During that time, the `/healthz` endpoint cannot respond,
#     so Render's healthcheck times out and the host receives a SIGKILL.
#     Every in-memory `sock` (linked number) dies with it.
#
#   * In this rewrite the pairing call is moved into the *Python* process so
#     the Node companion can be optional.  When the Node companion is
#     available, the Python bot forwards the request to it over HTTP, and
#     forwards status updates back.  When the Node companion is NOT
#     available (Python-only hosts), the bot still keeps /healthz responsive
#     and gracefully reports pair status without ever blocking.
#
#   * All pairing requests run inside isolated `try/except` boundaries.
#     One bad number CRASH can NEVER take down the whole host.
#
#   * Emoji change inside the bot is pushed to the companion over HTTP and
#     every linked number is rewritten to use it for status reactions.
# =============================================================================

from __future__ import annotations

import asyncio
import atexit
import html
import importlib
import importlib.util
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse, parse_qs

# -----------------------------------------------------------------------------
#  Minimal "ensure dependency" so the script runs even if requirements.txt
#  was not yet processed (some free hosts skip the install phase).
# -----------------------------------------------------------------------------
def _ensure_dep(mod: str, pkg: Optional[str] = None) -> None:
    try:
        importlib.import_module(mod)
        return
    except Exception:
        pass
    subprocess.check_call(
        [sys.executable, "-m", "pip", "install", "--quiet", pkg or mod],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.STDOUT,
    )

for _mod, _pkg in (
    ("requests",   "requests>=2.31.0"),
    ("pymongo",    "pymongo[srv]>=4.6.0"),
    ("telegram",   "python-telegram-bot>=20,<23"),
):
    _ensure_dep(_mod, _pkg)

import requests
from pymongo import MongoClient
from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.error import Conflict, TelegramError
from telegram.ext import (
    ApplicationBuilder,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

# =============================================================================
#  Globals & paths
# =============================================================================

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger("wa-pair-bot")

BASE_DIR = Path(__file__).resolve().parent
ENV_PATH = BASE_DIR / ".env"
SETTINGS_PATH = BASE_DIR / "bot_settings.json"
USERS_PATH = BASE_DIR / "bot_users.json"
USER_EMOJI_SETTINGS_PATH = BASE_DIR / "user_emoji_settings.json"
LINKED_WHATSAPP_USERS_PATH = BASE_DIR / "linked_whatsapp_users.json"
PENDING_PAIRINGS_PATH = BASE_DIR / "pending_pairings.json"
AUTO_REPLY_LOG_PATH = BASE_DIR / "auto_reply_log.json"
PUBLIC_DIR = BASE_DIR / "public"

DEFAULT_BOT_TOKEN = "8961523589:AAE90t5BR77HdgcJnHKPeN9XMgPgeMRVnU4"
DEFAULT_ADMIN_ID = 7231690686

DEFAULT_AUTO_REPLY_CHANNEL_URL = "https://bwt-lwts.onrender.com"
DEFAULT_CONTACT_NUMBER = "967773987296"
DEFAULT_SITE_BRAND_NAME = "بوت الربط بايثون"
TARGET_SITE_BASE_URL = "https://bwt-lwts.onrender.com"

MONGODB_DB_NAME = "whatsapp_pairing_api"
MONGODB_STATE_COLLECTION = "bot_state"

# in-process state
BOT_STATS: dict[str, Any] = {
    "start_time": time.time(),
    "total_users": set(),
    "linked_users": {},
    "pairing_requests": {},
    "user_emoji_settings": {},  # user_id -> emoji
    "settings": {
        "current_emoji": "❤️",
        "status_reaction": True,
        "auto_read_status": True,
        "auto_reply_enabled": True,
        "auto_reply_message": (
            "🔗 هذا رابط القناة الخاصة بنا\n"
            f"{DEFAULT_AUTO_REPLY_CHANNEL_URL}\n\n"
            f"📞 رقم التواصل: {DEFAULT_CONTACT_NUMBER}"
        ),
        "auto_reply_channel_url": DEFAULT_AUTO_REPLY_CHANNEL_URL,
        "site_name": DEFAULT_SITE_BRAND_NAME,
        "footer": DEFAULT_SITE_BRAND_NAME,
        "packname": DEFAULT_SITE_BRAND_NAME,
        "botname": DEFAULT_SITE_BRAND_NAME,
    },
}

_LOCKS: dict[str, threading.RLock] = {}
def _lock_for(name: str) -> threading.RLock:
    if name not in _LOCKS:
        _LOCKS[name] = threading.RLock()
    return _LOCKS[name]

# =============================================================================
#  MongoDB persistence (optional, with safe local fallback)
# =============================================================================
_mongo_client = None
_mongo_db = None

def get_env(name: str, default: str = "") -> str:
    val = os.environ.get(name)
    if val is None or val == "":
        try:
            if ENV_PATH.exists():
                for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
                    if line.strip().startswith("#") or "=" not in line:
                        continue
                    k, _, v = line.partition("=")
                    if k.strip() == name:
                        return v.strip().strip('"').strip("'")
        except Exception:
            pass
        return default
    return str(val).strip()

def get_mongo_db():
    global _mongo_client, _mongo_db
    if _mongo_db is not None:
        return _mongo_db
    uri = get_env("MONGODB_URI", "")
    if not uri:
        return None
    try:
        _mongo_client = MongoClient(uri, serverSelectionTimeoutMS=4000)
        _mongo_db = _mongo_client[MONGODB_DB_NAME]
        _mongo_db.command("ping")
        logger.info("Connected to MongoDB: %s", MONGODB_DB_NAME)
        return _mongo_db
    except Exception as exc:
        logger.warning("MongoDB unavailable, falling back to local files: %s", exc)
        _mongo_db = None
        return None

def mongo_load(key: str, default):
    db = get_mongo_db()
    if db is None:
        return default
    try:
        doc = db[MONGODB_STATE_COLLECTION].find_one({"_id": key})
        if not doc:
            return default
        return doc.get("payload", default)
    except Exception:
        return default

def mongo_save(key: str, payload) -> None:
    db = get_mongo_db()
    if db is None:
        return
    try:
        db[MONGODB_STATE_COLLECTION].update_one(
            {"_id": key},
            {"$set": {"payload": payload, "updated_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )
    except Exception:
        logger.exception("Failed to write %s to MongoDB", key)

# =============================================================================
#  Local-file persistence helpers
# =============================================================================
def _atomic_write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with _lock_for(str(path)):
        tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, path)

def load_json(path: Path, default):
    if not path.exists():
        return default
    try:
        with _lock_for(str(path)):
            return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default

def save_json(path: Path, payload) -> None:
    _atomic_write_json(path, payload)
    name = path.name
    if name == "bot_settings.json":
        mongo_save("settings", payload)
    elif name == "bot_users.json":
        mongo_save("users", sorted(payload or []))
    elif name == "user_emoji_settings.json":
        mongo_save("emoji", payload)
    elif name == "linked_whatsapp_users.json":
        mongo_save("linked", payload)
    elif name == "pending_pairings.json":
        mongo_save("pending", payload)
    elif name == "auto_reply_log.json":
        mongo_save("autoreply", payload)

def load_linked_users() -> dict:
    return load_json(LINKED_WHATSAPP_USERS_PATH, {})

def save_linked_users(payload: dict) -> None:
    BOT_STATS["linked_users"] = payload
    save_json(LINKED_WHATSAPP_USERS_PATH, payload)

def load_settings() -> dict:
    return load_json(SETTINGS_PATH, BOT_STATS["settings"])

def save_settings(payload: dict) -> None:
    BOT_STATS["settings"] = payload
    save_json(SETTINGS_PATH, payload)

def load_registered_users() -> set:
    raw = load_json(USERS_PATH, [])
    if isinstance(raw, list):
        return set(int(x) for x in raw if str(x).lstrip("-").isdigit())
    if isinstance(raw, dict):
        return set(int(k) for k in raw.keys() if str(k).lstrip("-").isdigit())
    return set()

def save_registered_users(users: set) -> None:
    save_json(USERS_PATH, sorted(users))

def load_user_emoji_settings() -> dict:
    return load_json(USER_EMOJI_SETTINGS_PATH, {})

def save_user_emoji_settings(payload: dict) -> None:
    mongo_save("emoji", payload)
    BOT_STATS["user_emoji_settings"] = payload
    _atomic_write_json(USER_EMOJI_SETTINGS_PATH, payload)

def load_pending_pairings() -> dict:
    return load_json(PENDING_PAIRINGS_PATH, {})

def save_pending_pairings(payload: dict) -> None:
    BOT_STATS["pairing_requests"] = payload
    _atomic_write_json(PENDING_PAIRINGS_PATH, payload)

def load_auto_reply_log() -> list:
    return load_json(AUTO_REPLY_LOG_PATH, [])

def save_auto_reply_log(payload: list) -> None:
    _atomic_write_json(AUTO_REPLY_LOG_PATH, payload[-200:])

# hydrate from Mongo if present (cold boot)
def hydrate_state() -> None:
    db = get_mongo_db()
    if db is None:
        return
    try:
        s = mongo_load("settings", None)
        if s: BOT_STATS["settings"].update(s)
        e = mongo_load("emoji", None)
        if isinstance(e, dict): BOT_STATS["user_emoji_settings"] = e
        l = mongo_load("linked", None)
        if isinstance(l, dict): BOT_STATS["linked_users"] = l
        p = mongo_load("pending", None)
        if isinstance(p, dict): BOT_STATS["pairing_requests"] = p
        u = mongo_load("users", None)
        if isinstance(u, list): BOT_STATS["total_users"] = set(int(x) for x in u if str(x).lstrip("-").isdigit())
        logger.info("Hydrated bot state from MongoDB")
    except Exception:
        logger.exception("hydrate_state failed")

hydrate_state()

# =============================================================================
#  Pairing API client (talks to bwt-lwts.onrender.com OR local Node companion)
# =============================================================================
def get_pairing_api_url() -> str:
    return (
        get_env("PAIR_CODE_API_URL", "")
        or get_env("EXTERNAL_PAIRING_API", "")
        or f"{TARGET_SITE_BASE_URL}/api/pairing"
    )

def has_embedded_companion() -> bool:
    return get_env("DISABLE_EMBEDDED_COMPANION", "false").lower() not in ("1", "true", "yes", "on")

def companion_url() -> str:
    # internal companion runs on 3100 inside the same host if Node.js exists
    port = get_env("COMPANION_PORT", "3100")
    return f"http://127.0.0.1:{port}"

def request_pairing_code(phone_number: str, timeout: int = 25) -> tuple[bool, str, str]:
    """Returns (ok, code, error). Never raises. Always isolated."""
    phone_number = re.sub(r"\D", "", str(phone_number or ""))
    if not phone_number:
        return False, "", "رقم الهاتف مطلوب"

    payload_variants = [
        {"num": phone_number},
        {"phone": phone_number},
        {"number": phone_number},
        {"phoneNumber": phone_number},
    ]

    urls = []
    if has_embedded_companion():
        urls.append(f"{companion_url().rstrip('/')}/api/pairing")
    urls.append(get_pairing_api_url())

    last_err = ""
    for url in urls:
        for payload in payload_variants:
            try:
                r = requests.post(url, json=payload, timeout=timeout)
                if r.ok:
                    data = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
                    code = (
                        data.get("code")
                        or data.get("pairingCode")
                        or data.get("pair_code")
                        or ""
                    )
                    if code:
                        return True, str(code), ""
                    last_err = data.get("error") or "no_code"
                else:
                    last_err = f"HTTP {r.status_code}: {r.text[:160]}"
            except Exception as exc:
                last_err = f"{type(exc).__name__}: {exc}"
                continue
    return False, "", last_err or "pairing failed"

def get_default_emoji(user_id: int) -> str:
    s = BOT_STATS["user_emoji_settings"].get(str(user_id)) or {}
    if isinstance(s, dict):
        return s.get("emoji", BOT_STATS["settings"].get("current_emoji", "❤️"))
    return BOT_STATS["settings"].get("current_emoji", "❤️")

def set_user_emoji(user_id: int, emoji: str) -> None:
    s = load_user_emoji_settings()
    s[str(user_id)] = {"emoji": emoji, "updated_at": datetime.now(timezone.utc).isoformat()}
    save_user_emoji_settings(s)

def push_emoji_to_companion(emoji: str) -> None:
    """Tell the embedded companion about a global emoji change.
    Runs in a thread so it can NEVER block /healthz."""
    if not has_embedded_companion():
        return
    def _push():
        try:
            requests.post(
                f"{companion_url()}/api/emoji",
                json={"emoji": emoji},
                timeout=4,
            )
        except Exception:
            pass
    threading.Thread(target=_push, daemon=True).start()

# =============================================================================
#  Telegram bot
# =============================================================================
SECRET_TOKEN = get_env("BOT_TOKEN", DEFAULT_BOT_TOKEN)
ADMIN_ID = int(str(get_env("ADMIN_ID", str(DEFAULT_ADMIN_ID)) or DEFAULT_ADMIN_ID).strip())

def is_admin(uid: int) -> bool:
    return uid == ADMIN_ID

def is_registered(uid: int) -> bool:
    return uid in BOT_STATS["total_users"] or is_admin(uid)

def register_user(uid: int) -> None:
    if uid in BOT_STATS["total_users"]:
        return
    BOT_STATS["total_users"].add(uid)
    save_registered_users(BOT_STATS["total_users"])

def emoji_keyboard(rows: int = 6, cols: int = 6) -> InlineKeyboardMarkup:
    emojis = ["❤️","🧡","💛","💚","💙","💜","🤍","🖤","💖","💗","💓","💞","💕","💝","😻","😍","🥰","😘","🤩","😎","👍","🙏","🔥","✨","🎉","💯","😂","🤣","😇","🥺","😡","😴"]
    keyboard = []
    for i in range(0, len(emojis), cols):
        keyboard.append([InlineKeyboardButton(em, callback_data=f"emoji:{em}") for em in emojis[i:i+cols]])
    keyboard.append([InlineKeyboardButton("❌ إلغاء", callback_data="emoji:cancel")])
    return InlineKeyboardMarkup(keyboard)

def render_linked_users_text() -> str:
    linked = BOT_STATS.get("linked_users", {})
    if not linked:
        return "🔢 لا يوجد أرقام مربوطة حالياً."
    lines = ["🔢 الأرقام المربوطة الآن:"]
    for i, (phone, info) in enumerate(linked.items(), start=1):
        emoji = (info or {}).get("emoji", BOT_STATS["settings"].get("current_emoji", "❤️"))
        status = (info or {}).get("status", "online")
        lines.append(f"{i}. `{phone}` — {emoji} — {status}")
    return "\n".join(lines)

def render_start_text(uid: int) -> str:
    emoji = get_default_emoji(uid)
    settings = BOT_STATS["settings"]
    channel = settings.get("auto_reply_channel_url", DEFAULT_AUTO_REPLY_CHANNEL_URL)
    contact = settings.get("contact_number", DEFAULT_CONTACT_NUMBER)
    lines = [
        f"{emoji} أهلاً بك في {settings.get('site_name', DEFAULT_SITE_BRAND_NAME)}",
        "",
        "📌 الأوامر السريعة:",
        "• /pair 9677xxxxxxx  — ربط رقم جديد",
        "• /linked — عرض الأرقام المربوطة",
        "• /emoji — تغيير الإيموجي وتطبيقه على كل الأرقام",
        "• /status — حالة الموقع والأرقام",
        "• /settings — إعدادات الموقع (للمطور فقط)",
        "",
        f"🔗 القناة: {channel}",
        f"📞 رقم التواصل: {contact}",
    ]
    return "\n".join(lines)

async def cmd_start(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    uid = update.effective_user.id if update and update.effective_user else 0
    if uid:
        register_user(uid)
    text = render_start_text(uid)
    await update.message.reply_text(text, reply_markup=emoji_keyboard())

async def cmd_status(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    uptime = int(time.time() - BOT_STATS["start_time"])
    text = "✅ *الحالة العامة*\n"
    text += f"• uptime seconds: `{uptime}`\n"
    text += f"• linked numbers: `{len(BOT_STATS['linked_users'])}`\n"
    text += f"• pending pairings: `{len(BOT_STATS['pairing_requests'])}`\n"
    text += f"• current emoji: `{BOT_STATS['settings'].get('current_emoji','❤️')}`\n"
    text += f"• auto status-reaction: `{BOT_STATS['settings'].get('status_reaction', True)}`\n"
    try:
        r = requests.get(f"http://127.0.0.1:{get_env('PORT','8080')}/healthz", timeout=3)
        text += f"• internal health: `{r.status_code}`\n"
    except Exception:
        text += "• internal health: `n/a`\n"
    await update.message.reply_text(text, parse_mode="Markdown")

async def cmd_linked(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(render_linked_users_text())

async def cmd_emoji(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        f"اختر الإيموجي الجديد:\nالإيموجي الحالي: `{BOT_STATS['settings'].get('current_emoji','❤️')}`",
        reply_markup=emoji_keyboard(),
    )

async def cmd_pair(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    args = ctx.args or []
    if not args:
        await update.message.reply_text("📱 أرسل الرقم بعد الأمر:\n`/pair 9677xxxxxxxx`", parse_mode="Markdown")
        return
    raw = "".join(args)
    phone = re.sub(r"\D", "", raw)
    if len(phone) < 7:
        await update.message.reply_text("❌ رقم غير صالح.")
        return
    await update.message.reply_text(f"⏳ جاري طلب كود الاقتران للرقم `{phone}` ...", parse_mode="Markdown")

    ok, code, err = await asyncio.to_thread(request_pairing_code, phone)
    if not ok:
        await update.message.reply_text(
            "❌ تعذّر طلب كود الاقتران.\n"
            f"السبب التقني: `{err}`\n"
            "جرّب مرة ثانية خلال دقيقتين.",
            parse_mode="Markdown",
        )
        return
    BOT_STATS["pairing_requests"][phone] = {
        "code": code,
        "requested_at": datetime.now(timezone.utc).isoformat(),
        "user_id": update.effective_user.id if update.effective_user else 0,
    }
    save_pending_pairings(BOT_STATS["pairing_requests"])

    msg = (
        "✅ *تم توليد كود الاقتران*\n"
        f"📞 الرقم: `{phone}`\n"
        f"🔑 الكود: *{code}*\n\n"
        "📱 طريقة الربط:\n"
        "1️⃣ افتح واتساب\n"
        "2️⃣ الأجهزة المرتبطة\n"
        "3️⃣ ربط جهاز\n"
        "4️⃣ أدخل الكود فوراً (خلال 30 ثانية).\n\n"
        f"⚠️ استعمل آخر كود فقط. القناة: {BOT_STATS['settings'].get('auto_reply_channel_url', DEFAULT_AUTO_REPLY_CHANNEL_URL)}"
    )
    await update.message.reply_text(msg, parse_mode="Markdown")

async def cb_emoji_click(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    q = update.callback_query
    await q.answer()
    data = q.data or ""
    if data == "emoji:cancel":
        await q.edit_message_text("تم الإلغاء.")
        return
    if not data.startswith("emoji:"):
        return
    emoji = data.split(":", 1)[1].strip() or "❤️"
    uid = q.from_user.id
    set_user_emoji(uid, emoji)
    # propagate globally
    settings = BOT_STATS["settings"]
    settings["current_emoji"] = emoji
    save_settings(settings)
    push_emoji_to_companion(emoji)
    await q.edit_message_text(
        f"✅ تم اختيار الإيموجي: {emoji}\n"
        "سيتم تطبيقه تلقائياً على كل الأرقام المربوطة والتفاعل بالحالات."
    )

async def handle_text(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    txt = (update.message.text or "").strip()
    if any(w in txt for w in ["تغيير ايموجي", "تغيير إيموجي", "غير الايموجي", "الإيموجي"]):
        await update.message.reply_text("اختر الإيموجي الجديد:", reply_markup=emoji_keyboard())
        return
    if any(w in txt for w in ["اعدادات الموقع", "إعدادات الموقع"]):
        await update.message.reply_text("🔧 إعدادات الموقع متاحة للمطور فقط عبر /settings.")
        return

# =============================================================================
#  HTTP server (Telegram webhook + free-host healthchecks + Pairing API proxy)
# =============================================================================
class PairRequestHandler(BaseHTTPRequestHandler):
    server_version = "WhatsAppPairingAPI/1.0"

    def log_message(self, fmt: str, *args) -> None:
        try:
            logger.info("%s - %s", self.address_string(), fmt % args)
        except Exception:
            pass

    def _send_json(self, code: int, payload) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        try:
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        except Exception:
            pass

    def _send_html(self, code: int, body: str) -> None:
        data = body.encode("utf-8")
        try:
            self.send_response(code)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception:
            pass

    def _send_file(self, path: Path, ctype: str) -> None:
        if not path.exists():
            self._send_json(404, {"error": "not_found"})
            return
        try:
            data = path.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception:
            self._send_json(500, {"error": "read_failed"})

    def _safe_path(self, url_path: str) -> Path:
        if not url_path or url_path == "/":
            return PUBLIC_DIR / "index.html"
        rel = url_path.lstrip("/").split("?", 1)[0]
        target = (PUBLIC_DIR / rel).resolve()
        base = PUBLIC_DIR.resolve()
        if not str(target).startswith(str(base)):
            return PUBLIC_DIR / "index.html"
        return target

    def do_GET(self) -> None:
        try:
            url = urlparse(self.path)
            path = url.path
            if path in ("/", "/index"):
                self._send_html(200, render_landing_page())
                return
            if path in ("/healthz", "/health", "/ping", "/alive"):
                self._send_json(200, {
                    "status": "ok",
                    "service": "telegram-bot",
                    "uptime_seconds": int(time.time() - BOT_STATS["start_time"]),
                    "linked_numbers": len(BOT_STATS["linked_users"]),
                })
                return

            if path == "/api/linked-users":
                self._send_json(200, {
                    "success": True,
                    "count": len(BOT_STATS["linked_users"]),
                    "users": list(BOT_STATS["linked_users"].values()),
                })
                return

            if path == "/api/socket-state":
                self._send_json(200, {
                    "success": True,
                    "pending_pairings": BOT_STATS["pairing_requests"],
                    "settings": BOT_STATS["settings"],
                })
                return

            # serve static from /public
            target = self._safe_path(path)
            if target.suffix == ".html":
                self._send_file(target, "text/html; charset=utf-8")
            elif target.suffix == ".js":
                self._send_file(target, "application/javascript; charset=utf-8")
            elif target.suffix == ".css":
                self._send_file(target, "text/css; charset=utf-8")
            elif target.suffix in (".png", ".jpg", ".jpeg", ".gif", ".webp"):
                self._send_file(target, f"image/{target.suffix.lstrip('.').replace('jpg','jpeg')}")
            elif target.suffix == ".svg":
                self._send_file(target, "image/svg+xml")
            elif target.suffix == ".json":
                self._send_file(target, "application/json; charset=utf-8")
            else:
                self._send_file(target, "application/octet-stream")
        except Exception as exc:
            logger.exception("GET crashed but kept host alive: %s", exc)
            self._send_json(500, {"error": "internal"})

    def do_POST(self) -> None:
        try:
            url = urlparse(self.path)
            path = url.path
            length = int(self.headers.get("Content-Length", "0") or "0")
            body_raw = self.rfile.read(length) if length > 0 else b"{}"
            try:
                body = json.loads(body_raw.decode("utf-8") or "{}")
            except Exception:
                body = {}

            if path == "/api/pairing":
                phone = (
                    body.get("num") or body.get("phone") or
                    body.get("number") or body.get("phoneNumber") or ""
                )
                ok, code, err = request_pairing_code(phone)
                if ok:
                    self._send_json(200, {"success": True, "code": code, "phoneNumber": re.sub(r"\D", "", phone)})
                else:
                    self._send_json(500, {"success": False, "error": err})
                return

            if path == "/api/emoji":
                emoji = body.get("emoji") or body.get("current_emoji") or "❤️"
                settings = BOT_STATS["settings"]
                settings["current_emoji"] = emoji
                save_settings(settings)
                # broadcast to every linked number
                linked = BOT_STATS["linked_users"]
                for phone, info in list(linked.items()):
                    if isinstance(info, dict):
                        info["emoji"] = emoji
                        info["emoji_updated_at"] = datetime.now(timezone.utc).isoformat()
                save_linked_users(linked)
                push_emoji_to_companion(emoji)
                self._send_json(200, {"success": True, "emoji": emoji, "applied": len(linked)})
                return

            if path == "/api/status-reaction":
                enabled = bool(body.get("enabled", True))
                emoji = body.get("emoji") or BOT_STATS["settings"].get("current_emoji", "❤️")
                settings = BOT_STATS["settings"]
                settings["status_reaction"] = enabled
                settings["current_emoji"] = emoji
                save_settings(settings)
                self._send_json(200, {"success": True, "status_reaction": enabled, "emoji": emoji})
                return

            if path.startswith("/api/session/"):
                phone = path.replace("/api/session/", "").strip()
                linked = BOT_STATS["linked_users"]
                removed = linked.pop(phone, None)
                save_linked_users(linked)
                self._send_json(200, {"success": True, "deleted_phone": phone, "had": bool(removed)})
                return

            # Telegram webhook fallback
            if path == f"/telegram/{SECRET_TOKEN}":
                # minimal ingest; main runner uses polling
                self._send_json(200, {"ok": True})
                return

            self._send_json(404, {"error": "not_found"})
        except Exception as exc:
            logger.exception("POST crashed but kept host alive: %s", exc)
            self._send_json(500, {"error": "internal"})

    def do_DELETE(self) -> None:
        self.do_POST()


def render_landing_page() -> str:
    settings = BOT_STATS["settings"]
    channel = settings.get("auto_reply_channel_url", DEFAULT_AUTO_REPLY_CHANNEL_URL)
    contact = settings.get("contact_number", DEFAULT_CONTACT_NUMBER)
    linked = len(BOT_STATS["linked_users"])
    emoji = settings.get("current_emoji", "❤️")
    return f"""<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<title>{html.escape(settings.get("site_name", DEFAULT_SITE_BRAND_NAME))}</title>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
body{{font-family:Tahoma,Arial,sans-serif;background:#0f1115;color:#fff;margin:0;padding:24px}}
.card{{max-width:760px;margin:auto;background:#1a1d24;padding:24px;border-radius:14px;box-shadow:0 8px 24px rgba(0,0,0,.4)}}
h1{{margin-top:0;color:#4dd0e1}}
.btn{{display:inline-block;background:#4dd0e1;color:#000;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:bold}}
.row{{display:flex;gap:12px;flex-wrap:wrap;margin:8px 0}}
.stat{{background:#232733;padding:10px 14px;border-radius:8px}}
a{{color:#4dd0e1}}
</style>
</head>
<body>
<div class="card">
<h1>{emoji} {html.escape(settings.get("site_name", DEFAULT_SITE_BRAND_NAME))}</h1>
<p>موقع ربط الأرقام بـ واتساب + بوت تيليجرام لإدارة كل شيء.</p>
<div class="row">
  <div class="stat">📞 تواصل: {html.escape(contact)}</div>
  <div class="stat">🔢 أرقام مربوطة: {linked}</div>
  <div class="stat">{emoji} الإيموجي الحالي</div>
</div>
<p>📌 للربط استخدم بوت تيليجرام ثم الأمر <code>/pair 9677xxxxxxxx</code></p>
<p>🔗 القناة: <a href="{html.escape(channel)}">{html.escape(channel)}</a></p>
<a class="btn" href="/api/linked-users">عرض الأرقام المربوطة JSON</a>
<a class="btn" href="/healthz">فحص الصحة</a>
</div>
</body>
</html>
"""

# =============================================================================
#  Public assets (bundled so the file is truly standalone)
# =============================================================================
INDEX_HTML_OLD_ARABIC = """<!doctype html><html lang="ar"><head><meta charset=utf-8></head><body>سيتم استبداله من main.py</body></html>"""
PAIR_HTML = """<!doctype html><html lang="ar" dir=rtl><head><meta charset=utf-8><title>pair</title></head>
<body><h3>📱 اربط رقمك عبر بوت تيليجرام</h3>
<p>الأمر: <code>/pair 9677xxxxxxxx</code></p>
<p>أدخل الكود فور صدوره خلال 30 ثانية.</p>
</body></html>"""
SETTINGS_HTML = """<!doctype html><html lang=ar dir=rtl><head><meta charset=utf-8><title>settings</title></head>
<body><h3>⚙️ إعدادات الموقع</h3><p>متاحة للمطور داخل البوت (/settings).</p></body></html>"""
FAQ_HTML = """<!doctype html><html lang=ar dir=rtl><head><meta charset=utf-8><title>faq</title></head>
<body><h3>❓ أسئلة شائعة</h3><p>إذا واجهت توقفاً عند الربط، أعد المحاولة خلال 30 ثانية وستجد الكود الجديد.</p></body></html>"""

def write_public_assets() -> None:
    PUBLIC_DIR.mkdir(parents=True, exist_ok=True)
    p_index = PUBLIC_DIR / "index.html"
    p_pair = PUBLIC_DIR / "pair.html"
    p_set = PUBLIC_DIR / "settings.html"
    p_faq = PUBLIC_DIR / "faq.html"
    if not p_index.exists() or p_index.stat().st_size < 200:
        p_index.write_text(INDEX_HTML_OLD_ARABIC, encoding="utf-8")
    if not p_pair.exists():
        p_pair.write_text(PAIR_HTML, encoding="utf-8")
    if not p_set.exists():
        p_set.write_text(SETTINGS_HTML, encoding="utf-8")
    if not p_faq.exists():
        p_faq.write_text(FAQ_HTML, encoding="utf-8")

# =============================================================================
#  HTTP server bootstrap (non-blocking, on a worker thread)
# =============================================================================
def start_http_server() -> Optional[ThreadingHTTPServer]:
    port = int(get_env("PORT", "8080") or "8080")
    for attempt in range(0, 8):
        try:
            httpd = ThreadingHTTPServer(("0.0.0.0", port), PairRequestHandler)
            httpd.allow_reuse_address = True
            t = threading.Thread(target=httpd.serve_forever, daemon=True, name="http")
            t.start()
            logger.info("HTTP server listening on :%s (attempt %s)", port, attempt)
            return httpd
        except OSError as exc:
            logger.warning("Port %s busy: %s — trying %s", port, exc, port + 1)
            port += 1
    logger.error("Could not bind HTTP server to any port between 8080-8088")
    return None

def start_healthcheck_heartbeat() -> None:
    """Independent heartbeat that keeps the host responsive to free hosting
    healthchecks even if everything else is dead."""
    url = f"http://127.0.0.1:{int(get_env('PORT','8080') or '8080')}/healthz"
    def beat():
        while True:
            try:
                requests.get(url, timeout=2)
            except Exception:
                pass
            time.sleep(20)
    threading.Thread(target=beat, daemon=True, name="heartbeat").start()

# =============================================================================
#  Optional: spawn Node.js companion if available
# =============================================================================
def maybe_spawn_companion() -> None:
    if not has_embedded_companion():
        logger.info("Embedded companion disabled via env.")
        return
    node = shutil.which("node") or shutil.which("nodejs")
    if node is None:
        logger.info("Node.js not present — pairing will use external API only.")
        return
    main_js = BASE_DIR / "main.js"
    if not main_js.exists():
        logger.info("main.js missing — pairing will use external API only.")
        return
    env = os.environ.copy()
    env.setdefault("COMPANION_PORT", "3100")
    env.setdefault("MONGODB_URI", get_env("MONGODB_URI", ""))
    logger.info("Spawning Node.js companion from %s", main_js)
    try:
        subprocess.Popen(
            [node, str(main_js)],
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.STDOUT,
        )
    except Exception as exc:
        logger.warning("Failed to spawn companion: %s", exc)

# =============================================================================
#  Telegram bot bootstrap (polling by default — works on free hosts)
# =============================================================================
def build_application():
    if not SECRET_TOKEN:
        raise RuntimeError("BOT_TOKEN is empty. Set it via env var BOT_TOKEN.")
    app = ApplicationBuilder().token(SECRET_TOKEN).build()
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("pair", cmd_pair))
    app.add_handler(CommandHandler("linked", cmd_linked))
    app.add_handler(CommandHandler("status", cmd_status))
    app.add_handler(CommandHandler("emoji", cmd_emoji))
    app.add_handler(CallbackQueryHandler(cb_emoji_click, pattern=r"^emoji:"))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))
    return app

def main() -> int:
    logger.info("=== WhatsApp Pairing API ===")
    logger.info("Starting up — admin=%s pair-api=%s", ADMIN_ID, get_pairing_api_url())

    # public assets
    write_public_assets()

    # spawn node companion (best effort, never blocks startup)
    maybe_spawn_companion()

    # HTTP server (healthchecks + Pairing API proxy + landing)
    start_http_server()
    start_healthcheck_heartbeat()

    # Telegram bot
    try:
        app = build_application()
    except Exception as exc:
        logger.exception("Telegram application construction failed: %s", exc)
        # keep process alive for HTTP even if Telegram failed
        while True:
            time.sleep(60)

    try:
        app.run_polling(allowed_updates=Update.ALL_TYPES, drop_pending_updates=True)
    except Conflict:
        logger.warning("Another bot instance is running. Shutting down gracefully.")
    except TelegramError as exc:
        logger.error("Telegram error: %s", exc)
        time.sleep(3)
    except Exception as exc:
        logger.exception("Unhandled Telegram error: %s", exc)
        time.sleep(3)
    return 0

atexit.register(lambda: None)

if __name__ == "__main__":
    sys.exit(main())
