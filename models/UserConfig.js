const mongoose = require('mongoose');

const userConfigSchema = new mongoose.Schema({
    jid: { type: String, required: true, unique: true },
    emoji: { type: String, default: '💤' }
});

module.exports = mongoose.model('UserConfig', userConfigSchema);
