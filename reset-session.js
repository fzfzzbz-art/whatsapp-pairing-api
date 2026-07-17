const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();
const sessionsRoot = path.join(projectRoot, 'sessions');
const sessionStoreFile = path.join(projectRoot, 'data', 'session-store.json');

const KEEP_FILES = new Set([
  'session-meta.json',
  'phone-settings-profile.json',
  'phone-settings-credentials.json',
  'phone-settings-meta.json'
]);

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function normalizePhone(value = '') {
  return String(value || '').replace(/\D/g, '').trim();
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function resetSessionDir(sessionDir) {
  ensureDir(sessionDir);
  let removed = 0;
  for (const entry of fs.readdirSync(sessionDir, { withFileTypes: true })) {
    if (KEEP_FILES.has(entry.name)) continue;
    const target = path.join(sessionDir, entry.name);
    fs.rmSync(target, { recursive: true, force: true });
    removed += 1;
  }

  const metaFile = path.join(sessionDir, 'session-meta.json');
  const meta = readJson(metaFile, {});
  meta.registered = false;
  meta.updatedAt = new Date().toISOString();
  writeJson(metaFile, meta);
  return removed;
}

function main() {
  ensureDir(sessionsRoot);
  const requestedPhone = normalizePhone(process.env.PHONE || process.argv[2] || '');
  const targets = requestedPhone
    ? [path.join(sessionsRoot, requestedPhone)]
    : fs.readdirSync(sessionsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(sessionsRoot, entry.name));

  const db = readJson(sessionStoreFile, { sessions: {} });
  let removedTotal = 0;

  for (const sessionDir of targets) {
    const phone = normalizePhone(path.basename(sessionDir));
    removedTotal += resetSessionDir(sessionDir);
    if (phone) {
      const current = db.sessions[phone] || {};
      db.sessions[phone] = {
        ...current,
        phone,
        sessionId: phone,
        registered: false,
        updatedAt: new Date().toISOString(),
        fileCount: fs.readdirSync(sessionDir).filter((file) => file.endsWith('.json')).length,
        lastConnectedAt: current.lastConnectedAt || null
      };
    }
  }

  writeJson(sessionStoreFile, db);
  console.log(`session reset complete: removed ${removedTotal} auth file(s)`);
}

main();
