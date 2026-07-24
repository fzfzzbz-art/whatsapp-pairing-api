require('dotenv').config();

const { initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');
const { getMongoCollection } = require('./lib/mongoClient');

const COLLECTION_NAME = String(process.env.MONGODB_AUTH_COLLECTION || 'baileys_auth_states').trim() || 'baileys_auth_states';

function serializeForMongo(value) {
  return JSON.parse(JSON.stringify(value, BufferJSON.replacer));
}

function deserializeFromMongo(value, fallback = null) {
  if (typeof value === 'undefined') return fallback;
  return JSON.parse(JSON.stringify(value), BufferJSON.reviver);
}

async function getCollection() {
  const collection = await getMongoCollection(COLLECTION_NAME);
  await collection.createIndex({ updatedAt: -1 });
  return collection;
}

async function useMongoAuthState(id) {
  const sessionId = String(id || '').trim();
  if (!sessionId) {
    throw new Error('session id is required');
  }

  const collection = await getCollection();
  const initialDoc = await collection.findOne({ _id: sessionId });
  const state = {
    creds: deserializeFromMongo(initialDoc?.creds, initAuthCreds()),
    keys: {
      get: async (type, ids) => {
        const doc = await collection.findOne(
          { _id: sessionId },
          { projection: { [`keys.${type}`]: 1 } }
        );
        const bucket = doc?.keys?.[type] || {};
        const output = {};

        for (const keyId of ids || []) {
          if (Object.prototype.hasOwnProperty.call(bucket, keyId)) {
            output[keyId] = deserializeFromMongo(bucket[keyId]);
          }
        }

        return output;
      },
      set: async (data) => {
        const $set = {
          updatedAt: new Date(),
        };
        const $unset = {};

        for (const [type, entries] of Object.entries(data || {})) {
          for (const [keyId, value] of Object.entries(entries || {})) {
            const fieldPath = `keys.${type}.${keyId}`;
            if (value == null) {
              $unset[fieldPath] = '';
            } else {
              $set[fieldPath] = serializeForMongo(value);
            }
          }
        }

        const update = {
          ...(Object.keys($set).length ? { $set } : {}),
          ...(Object.keys($unset).length ? { $unset } : {}),
          $setOnInsert: {
            createdAt: new Date(),
            creds: serializeForMongo(state.creds),
          },
        };

        await collection.updateOne({ _id: sessionId }, update, { upsert: true });
      },
    },
  };

  const saveCreds = async () => {
    await collection.updateOne(
      { _id: sessionId },
      {
        $set: {
          creds: serializeForMongo(state.creds),
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );
  };

  return { state, saveCreds };
}

module.exports = { useMongoAuthState };
