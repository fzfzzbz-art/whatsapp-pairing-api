'use strict';

const { MongoClient } = require('mongodb');
const { initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');

// يفضَّل وضع MONGODB_URI كمتغير بيئة بدلًا من النص الثابت
// كلمة المرور معروضة في المحادثة → غيّرها فورًا من Atlas
const MONGODB_URI = String(
    process.env.MONGODB_URI ||
    process.env.MONGO_URL ||
    'mongodb+srv://faresomarr:faresaltmimi95@cluster.mongodb.net/?retryWrites=true&w=majority'
).trim();

const MONGODB_DB_NAME = String(process.env.MONGODB_DB_NAME || 'faresbot').trim() || 'faresbot';
const COLLECTION_NAME = String(process.env.MONGODB_AUTH_COLLECTION || 'wa_auth_state').trim() || 'wa_auth_state';

let clientPromise = null;
let pendingFlushResolves = [];

function getCollection() {
  if (!clientPromise) {
    const client = new MongoClient(MONGODB_URI, {
      appName: 'KnightBot-MD AuthState',
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 30000,
      maxPoolSize: 20,
      retryWrites: true,
      retryReads: true,
    });
    clientPromise = client
      .connect()
      .then(async (c) => {
        const db = c.db(MONGODB_DB_NAME);
        const coll = db.collection(COLLECTION_NAME);
        await Promise.allSettled([
          coll.createIndex({ phone: 1 }),
          coll.createIndex({ updatedAt: -1 }),
        ]);
        // استيقظ أي كتابة كانت معلّقة في انتظار الاتصال
        if (pendingFlushResolves.length) {
          const r = pendingFlushResolves.splice(0);
          r.forEach((fn) => { try { fn(); } catch (_) {} });
        }
        return coll;
      })
      .catch(() => { clientPromise = null; throw new Error('mongo-connect-failed'); });
  }
  return clientPromise;
}

function deepClone(v) { return JSON.parse(JSON.stringify(v)); }

async function useMongoAuthState(phone) {
  const id = String(phone || '').trim();
  if (!id) throw new Error('useMongoAuthState: رقم الهاتف مطلوب');

  const collection = await getCollection();
  const doc = await collection.findOne({ _id: id }).catch(() => null);

  let creds = null;
  if (doc && doc.creds) {
    try { creds = JSON.parse(JSON.stringify(doc.creds), BufferJSON.reviver); }
    catch (_) { creds = initAuthCreds(); }
  }
  if (!creds) creds = initAuthCreds();

  const keysData = (doc && doc.keys && typeof doc.keys === 'object') ? doc.keys : {};
  const dirty = { creds: false, keys: false };
  let isFlushing = false;

  const safeWrite = async () => {
    if (isFlushing) return;
    isFlushing = true;
    try {
      const credsPayload = dirty.creds ? JSON.parse(JSON.stringify(creds, BufferJSON.replacer)) : undefined;
      const keysPayload  = dirty.keys  ? deepClone(keysData) : undefined;
      if (!credsPayload && !keysPayload) return;

      const $set = { phone: id, updatedAt: new Date().toISOString() };
      if (credsPayload) $set.creds = credsPayload;
      if (keysPayload)  $set.keys  = keysPayload;

      await collection.updateOne(
        { _id: id },
        { $set, $setOnInsert: { createdAt: new Date().toISOString() } },
        { upsert: true }
      );
      dirty.creds = false;
      dirty.keys = false;
    } finally {
      isFlushing = false;
    }
  };

  // حفظ فوري مع إعادة المحاولة بحد أقصى 5 ثوانٍ
  const flush = async (ms = 5000) => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      try {
        await safeWrite();
        return true;
      } catch (_) {
        try { await getCollection(); } catch (_) {}
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    return false;
  };

  const state = {
    creds,
    keys: {
      get: async (type, ids) => {
        const out = {};
        const bucket = keysData[type] || {};
        for (const i of ids || []) {
          const v = bucket[String(i)];
          if (v != null) out[String(i)] = v;
        }
        return out;
      },
      set: async (data) => {
        if (!data || typeof data !== 'object') return;
        for (const type of Object.keys(data)) {
          keysData[type] = keysData[type] || {};
          for (const idKey of Object.keys(data[type] || {})) {
            const value = data[type][idKey];
            if (value === null || value === undefined) delete keysData[type][idKey];
            else keysData[type][idKey] = value;
          }
        }
        dirty.keys = true;
        // حفظ عاجل (بحد أقصى 5 ثوانٍ) - ضمان عدم فقدان الجلسة
        void flush(5000);
      },
    },
  };

  return {
    state,
    saveCreds: async () => { dirty.creds = true; return flush(5000); },
    flushNow: () => flush(8000),
  };
}

async function listStoredAuthPhones() {
  try {
    const collection = await getCollection();
    const docs = await collection
      .find({}, { projection: { phone: 1, updatedAt: 1, creds: 1 } })
      .sort({ updatedAt: -1 })
      .toArray();
    return docs
      .map((d) => ({
        phone: String(d._id || d.phone || ''),
        updatedAt: d.updatedAt || null,
        registered: Boolean(d && d.creds && d.creds.registered === true),
      }))
      .filter((x) => x.phone);
  } catch (_) { return []; }
}

async function deleteStoredAuth(phone) {
  try {
    const collection = await getCollection();
    const id = String(phone || '').trim();
    if (!id) return false;
    const r = await collection.deleteOne({ _id: id });
    return r.deletedCount > 0;
  } catch (_) { return false; }
}

module.exports = {
  useMongoAuthState,
  listStoredAuthPhones,
  deleteStoredAuth,
};
