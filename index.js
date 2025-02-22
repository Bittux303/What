const express = require('express');
const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const bodyParser = require('body-parser');
const fs = require('fs');
const qrcode = require('qrcode-terminal');

const app = express();
const PORT = 5000; // Termux server will run on this port
app.use(bodyParser.json());

let sock;
let activeTasks = {};

// WhatsApp Login Function
async function startWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth');
    sock = makeWASocket({ auth: state });
    sock.ev.on('creds.update', saveCreds);
    
    sock.ev.on('connection.update', ({ qr }) => {
        if (qr) {
            console.log("📌 Scan this QR Code in WhatsApp Web:");
            qrcode.generate(qr, { small: true });
        }
    });

    sock.ev.on('connection.update', (update) => {
        const { connection } = update;
        if (connection === 'open') {
            console.log('✅ WhatsApp Connected!');
        } else if (connection === 'close') {
            console.log('❌ Connection closed. Restarting...');
            startWhatsApp();
        }
    });
}

// Fetch Group IDs API
app.get('/get-groups', async (req, res) => {
    try {
        let groups = await sock.groupFetchAllParticipating();
        let groupList = Object.values(groups).map(group => ({ id: group.id, name: group.subject }));
        return res.json({ success: true, groups: groupList });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to fetch groups' });
    }
});

// Send Message API
app.post('/send-message', async (req, res) => {
    const { chatId, message, task_id, hater_name, speed } = req.body;
    if (!chatId || !message || !task_id || !speed) {
        return res.status(400).json({ error: 'Missing required fields (chatId, message, task_id, speed)' });
    }
    activeTasks[task_id] = true;
    try {
        let finalMessage = hater_name ? `${hater_name}: ${message}` : message;
        await sock.sendMessage(chatId, { text: finalMessage });
        setTimeout(() => {
            if (activeTasks[task_id]) {
                sock.sendMessage(chatId, { text: finalMessage });
            }
        }, speed * 1000);
        return res.json({ success: true, message: `Message sent to ${chatId}`, task_id });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to send message' });
    }
});

// Stop Task API
app.post('/stop-task', (req, res) => {
    const { task_id } = req.body;
    if (activeTasks[task_id]) {
        delete activeTasks[task_id];
        return res.json({ success: true, message: `Task ${task_id} stopped.` });
    }
    return res.status(400).json({ error: 'Task not found' });
});

// Show Active Tasks API
app.get('/active-tasks', (req, res) => {
    return res.json({ success: true, activeTasks: Object.keys(activeTasks) });
});

app.listen(PORT, async () => {
    console.log(`🚀 Server running on port ${PORT}`);
    await startWhatsApp();
});
