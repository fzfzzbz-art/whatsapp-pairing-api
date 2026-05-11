require('dotenv').config();
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    fetchLatestBaileysVersion, 
    Browsers, 
    DisconnectReason,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const express = require('express');
const path = require('path');
const pino = require('pino');
const cors = require('cors');
const QRCode = require('qrcode');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs-extra');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const TELEGRAM_TOKEN = '8631941557:AAHJ_97NplwcLMkee0-Zrf2FY5XqmI6E_0I';
const tBot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

let sock;
let lastQr = null;

async function startFaresBot(num = null, chatId = null) {
    const sessionPath = './session';
    if (!fs.existsSync(sessionPath)) fs.mkdirSync(sessionPath);

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })),
        },
        logger: pino({ level: 'silent' }),
        browser: Browsers.macOS('Desktop'), // تم التعديل لزيادة استقرار الجلسة
        printQRInTerminal: false,
        syncFullHistory: false,
        markOnlineOnConnect: true // البقاء متصلاً دائماً
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) lastQr = await QRCode.toDataURL(qr);

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(`إغلاق الاتصال (كود: ${statusCode}). إعادة المحاولة: ${shouldReconnect}`);
            
            if (shouldReconnect) {
                // إعادة تشغيل البوت تلقائياً للبقاء نشطاً
                setTimeout(() => startFaresBot(), 5000);
            }
        }
        
        if (connection === 'open') {
            console.log('✅ السيرفر متصل والجلسة نشطة الآن');
            if (chatId) tBot.sendMessage(chatId, "✅ تم ربط الرقم بنجاح! ميزة مشاهدة الحالات والتفاعل التلقائي مفعلة الآن.");
        }
    });

    // ⚡ ميزة مشاهدة الحالات والتفاعل التلقائي ⚡
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message || mek.key.fromMe) return;

            // التحقق مما إذا كان المنشور عبارة عن "حالة" (Status)
            if (mek.key.remoteJid === 'status@broadcast') {
                const sender = mek.key.participant || mek.key.remoteJid;
                
                // 1. مشاهدة الحالة تلقائياً (ق
