const { MongoClient } = require('mongodb');

async function getMongoAuthState(uri, phone) {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db('whatsapp_bot'); // اسم قاعدة البيانات
    const collection = db.collection('sessions');

    const saveCreds = async (creds) => {
        await collection.updateOne(
            { _id: phone },
            { $set: { creds } },
            { upsert: true }
        );
    };

    const getCreds = async () => {
        const doc = await collection.findOne({ _id: phone });
        return doc ? doc.creds : null;
    };

    return { state: { creds: await getCreds() || {}, keys: {} }, saveCreds };
}

module.exports = { getMongoAuthState };
