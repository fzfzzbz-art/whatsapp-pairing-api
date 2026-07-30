'use strict';

const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('async_hooks');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATA_ROOT = path.join(PROJECT_ROOT, 'data');
const SESSIONS_ROOT = path.join(PROJECT_ROOT, 'sessions');
const SCOPED_DATA_ROOT_NAME = 'scoped-data';
const ROOT_SCOPED_FILES = new Set([
    'settings.json',
    'phone-settings.json',
    'users.json',
]);
const fsContextStore = new AsyncLocalStorage();

let patchesInstalled = false;

function normalizePhone(phone = '') {
    return String(phone || '').replace(/\D/g, '').trim();
}

function ensureDirSync(dirPath) {
    if (!dirPath) return;
    fs.mkdirSync(dirPath, { recursive: true });
}

function getCurrentPhone() {
    return normalizePhone(fsContextStore.getStore()?.phone || '');
}

function getScopedRootForPhone(phone = '') {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return '';
    return path.join(SESSIONS_ROOT, normalizedPhone, SCOPED_DATA_ROOT_NAME);
}

function getScopedPathForPhone(phone = '', inputPath) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone || typeof inputPath !== 'string' || !inputPath.trim()) {
        return inputPath;
    }

    const absoluteInput = path.resolve(PROJECT_ROOT, inputPath);
    const scopedRoot = getScopedRootForPhone(normalizedPhone);
    if (!scopedRoot) return absoluteInput;

    const fileName = path.basename(absoluteInput);
    if (ROOT_SCOPED_FILES.has(fileName) && path.dirname(absoluteInput) === PROJECT_ROOT) {
        return path.join(scopedRoot, fileName);
    }

    if (absoluteInput === DATA_ROOT || absoluteInput.startsWith(`${DATA_ROOT}${path.sep}`)) {
        const relativeToData = path.relative(DATA_ROOT, absoluteInput);
        return path.join(scopedRoot, 'data', relativeToData);
    }

    return absoluteInput;
}

function seedScopedPathIfNeeded(originalPath, scopedPath) {
    if (!scopedPath || scopedPath === originalPath) return scopedPath;
    if (fs.existsSync(scopedPath)) return scopedPath;

    const originalAbsolute = path.resolve(PROJECT_ROOT, originalPath);
    ensureDirSync(path.dirname(scopedPath));

    try {
        if (fs.existsSync(originalAbsolute)) {
            const stat = fs.statSync(originalAbsolute);
            if (stat.isDirectory()) {
                ensureDirSync(scopedPath);
            } else {
                fs.copyFileSync(originalAbsolute, scopedPath);
            }
            return scopedPath;
        }
    } catch (_) {
        // ignore copy/seed errors and fall back to creating the parent folder only
    }

    const looksLikeDir = !path.extname(scopedPath);
    if (looksLikeDir) {
        ensureDirSync(scopedPath);
    }
    return scopedPath;
}

function resolveScopedPathMaybe(inputPath) {
    if (typeof inputPath !== 'string' || !inputPath.trim()) {
        return inputPath;
    }

    const currentPhone = getCurrentPhone();
    if (!currentPhone) {
        return inputPath;
    }

    const scopedPath = getScopedPathForPhone(currentPhone, inputPath);
    if (scopedPath === inputPath) {
        return inputPath;
    }
    return seedScopedPathIfNeeded(inputPath, scopedPath);
}

function wrapPathFirstSyncMethod(methodName) {
    const original = fs[methodName];
    if (typeof original !== 'function') return;
    fs[methodName] = function patchedFsMethod(targetPath, ...rest) {
        return original.call(fs, resolveScopedPathMaybe(targetPath), ...rest);
    };
}

function wrapPathFirstAsyncMethod(methodName) {
    const original = fs[methodName];
    if (typeof original !== 'function') return;
    fs[methodName] = function patchedFsAsyncMethod(targetPath, ...rest) {
        return original.call(fs, resolveScopedPathMaybe(targetPath), ...rest);
    };
}

function wrapPathFirstPromiseMethod(methodName) {
    if (!fs.promises || typeof fs.promises[methodName] !== 'function') return;
    const original = fs.promises[methodName].bind(fs.promises);
    fs.promises[methodName] = function patchedFsPromiseMethod(targetPath, ...rest) {
        return original(resolveScopedPathMaybe(targetPath), ...rest);
    };
}

function wrapTwoPathSyncMethod(methodName) {
    const original = fs[methodName];
    if (typeof original !== 'function') return;
    fs[methodName] = function patchedTwoPathMethod(sourcePath, destinationPath, ...rest) {
        return original.call(fs, resolveScopedPathMaybe(sourcePath), resolveScopedPathMaybe(destinationPath), ...rest);
    };
}

function wrapTwoPathAsyncMethod(methodName) {
    const original = fs[methodName];
    if (typeof original !== 'function') return;
    fs[methodName] = function patchedTwoPathAsyncMethod(sourcePath, destinationPath, ...rest) {
        return original.call(fs, resolveScopedPathMaybe(sourcePath), resolveScopedPathMaybe(destinationPath), ...rest);
    };
}

function wrapTwoPathPromiseMethod(methodName) {
    if (!fs.promises || typeof fs.promises[methodName] !== 'function') return;
    const original = fs.promises[methodName].bind(fs.promises);
    fs.promises[methodName] = function patchedTwoPathPromiseMethod(sourcePath, destinationPath, ...rest) {
        return original(resolveScopedPathMaybe(sourcePath), resolveScopedPathMaybe(destinationPath), ...rest);
    };
}

function installPhoneScopedFsPatches() {
    if (patchesInstalled) return;
    patchesInstalled = true;

    [
        'existsSync',
        'readFileSync',
        'writeFileSync',
        'appendFileSync',
        'mkdirSync',
        'readdirSync',
        'statSync',
        'lstatSync',
        'unlinkSync',
        'rmSync',
        'openSync',
        'truncateSync',
        'utimesSync',
        'accessSync',
        'createReadStream',
        'createWriteStream',
    ].forEach(wrapPathFirstSyncMethod);

    [
        'readFile',
        'writeFile',
        'appendFile',
        'mkdir',
        'readdir',
        'stat',
        'lstat',
        'unlink',
        'rm',
        'open',
        'truncate',
        'utimes',
        'access',
    ].forEach(wrapPathFirstAsyncMethod);

    [
        'readFile',
        'writeFile',
        'appendFile',
        'mkdir',
        'readdir',
        'stat',
        'lstat',
        'unlink',
        'rm',
        'open',
        'truncate',
        'utimes',
        'access',
    ].forEach(wrapPathFirstPromiseMethod);

    ['copyFileSync', 'renameSync'].forEach(wrapTwoPathSyncMethod);
    ['copyFile', 'rename'].forEach(wrapTwoPathAsyncMethod);
    ['copyFile', 'rename'].forEach(wrapTwoPathPromiseMethod);
}

function runWithPhoneSession(phone = '', task) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
        return Promise.resolve().then(task);
    }
    return fsContextStore.run({ phone: normalizedPhone }, () => Promise.resolve().then(task));
}

module.exports = {
    PROJECT_ROOT,
    DATA_ROOT,
    SESSIONS_ROOT,
    normalizePhone,
    installPhoneScopedFsPatches,
    runWithPhoneSession,
    getCurrentPhone,
    getScopedRootForPhone,
    getScopedPathForPhone,
    resolveScopedPathMaybe,
};
