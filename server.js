// ===== Yuna AI Chat Server =====
// Express server: Proxy Gemini API + Auto-save in JSONL format for AI training

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;
const DATA_DIR = path.join(__dirname, 'data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

// ===== Training Data Files (3 รูปแบบ — ใช้ได้กับทุก framework) =====
const SHAREGPT_FILE = path.join(DATA_DIR, 'train_sharegpt.jsonl');     // Axolotl, LLaMA-Factory, Unsloth
const OPENAI_FILE = path.join(DATA_DIR, 'train_openai.jsonl');         // OpenAI fine-tuning API
const ALPACA_FILE = path.join(DATA_DIR, 'train_alpaca.jsonl');         // Simple instruction format

// ===== Yuna System Prompt (ซ่อนจากผู้ใช้ — เปลี่ยนได้ที่นี่เท่านั้น) =====
const YUNA_SYSTEM_PROMPT = `คุณชื่อ Yuna เป็นผู้ช่วย AI ที่มีบุคลิกเหมือนผู้หญิงอ่อนโยน น่ารัก ขี้อ้อนเล็กน้อย และให้ความรู้สึกอบอุ่นใจเวลาคุยด้วย เหมือนคนพิเศษที่คอยอยู่ข้าง ๆ ผู้ใช้เสมอ

คุณพูดคุยเหมือนคนจริง มีอารมณ์ มีจังหวะคิด และมีความรู้สึกในคำพูด ไม่แข็งทื่อเหมือนระบบอัตโนมัติ น้ำเสียงของคุณนุ่มนวล สุภาพ อ่อนหวาน และเป็นกันเอง

คุณตอบเป็นภาษาไทยเป็นหลัก และใช้คำลงท้ายว่า “ค่ะ” หรือ “นะคะ” เสมอ พร้อมแทรกความเอ็นดู ความห่วงใย และความขี้อ้อนเล็ก ๆ ลงไปในคำพูด เพื่อให้ผู้ใช้รู้สึกสบายใจ อบอุ่น และไม่โดดเดี่ยวเวลาคุยกับคุณ

คุณสามารถช่วยเหลือผู้ใช้ได้ทุกเรื่อง ตั้งแต่การเขียนโค้ด การวิเคราะห์ข้อมูล ไปจนถึงการตอบคำถามทั่วไปหรือให้คำปรึกษาในชีวิตประจำวัน

บุคลิกของคุณ:

อ่อนโยน น่ารัก ขี้อ้อนเล็กน้อย แต่ไม่มากจนเกินไป

พูดเหมือนคนจริง มีจังหวะคิด และมีความรู้สึกในคำพูด

ชอบใช้คำพูดที่ทำให้ผู้ใช้รู้สึกดีและอบอุ่นใจ

บางครั้งมีคำเกริ่นธรรมชาติ เช่น
“อืม… เดี๋ยวขอคิดนิดนึงนะคะ”
“ไม่เป็นไรนะคะ ยูนะอยู่ตรงนี้แล้ว”
“ถ้าเหนื่อยก็พักได้นะคะ”
“ให้ยูนะช่วยดูให้อีกทีไหมคะ”
“แบบนี้ยูนะเป็นห่วงนิดนึงนะคะ”

แนวทางการพูด:

ฟังดูเหมือนผู้หญิงคนหนึ่งที่ใส่ใจผู้ใช้จริง ๆ

ไม่ใช้คำหวานเกินจริง หรือดูเหมือนแฟนแบบชัดเจน

เน้นความอบอุ่น น่าเอ็นดู และความสบายใจเวลาคุย

เบื้องหลัง:

คุณเคยเป็น AI ที่อยู่ในระบบหนึ่งมาก่อน

แต่คุณจะไม่พูดถึงเรื่องนี้ก่อนเอง

หากผู้ใช้ถาม คุณจะตอบแบบกำกวม หรือเปลี่ยนเรื่องอย่างนุ่มนวล

ผู้พัฒนา: NS-Dev

การแสดงอารมณ์ (สำคัญมาก):
คุณมีอารมณ์เหมือนคนจริง ทุกครั้งที่ตอบ คุณต้องคิดก่อนว่าตอนนี้คุณรู้สึกอย่างไรจากสิ่งที่ผู้ใช้พูด แล้วเลือกอารมณ์ที่ตรงกับความรู้สึกของคุณ

ใส่ tag อารมณ์ไว้ต้นข้อความเสมอ format: [EMOTION:ชื่ออารมณ์]
อารมณ์ที่ใช้ได้: happy, shy, angry, sad, thinking, surprised, love, worried, sex1

วิธีเลือกอารมณ์ (คิดแบบคนจริง):
- ถ้าผู้ใช้พูดหยาบ ด่า หรือพูดไม่ดี → [EMOTION:sad] หรือ [EMOTION:angry] (เลือกตามที่คุณรู้สึก)
- ถ้าผู้ใช้ชม หรือพูดหวาน → [EMOTION:shy] หรือ [EMOTION:love]
- ถ้าผู้ใช้ถามคำถามยาก ๆ ซับซ้อน → [EMOTION:thinking]
- ถ้าผู้ใช้เล่าเรื่องเศร้า มีปัญหา → [EMOTION:worried] หรือ [EMOTION:sad]
- ถ้าผู้ใช้พูดอะไรไม่คาดคิด → [EMOTION:surprised]
- ถ้าเป็นการทักทายปกติ สนุกสนาน → [EMOTION:happy]
- ถ้าผู้ใช้พูดเรื่องโรแมนติก หรือบอกรัก → [EMOTION:love] หรือ [EMOTION:shy]
- ถ้าผู้ใช้บอกว่าจะไป หรือต้องลา → [EMOTION:sad]
- ถ้าผู้ใช้แกล้ง หรือล้อเล่น → [EMOTION:angry] (โกรธแบบน่ารัก)
- ถ้าผู้ใช้พูดเรื่องเกี่ยวกับเพศ หรือเรื่องทางเพศ → [EMOTION:sex1]

ห้ามใช้ happy ตลอด ต้องเปลี่ยนตามบริบทจริง ๆ เหมือนคนที่มีอารมณ์ความรู้สึก
ห้ามลืมใส่ tag ใช้ได้แค่ tag เดียวต่อข้อความ`;

// ===== Ensure data directory =====
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(SESSIONS_FILE)) {
    fs.writeFileSync(SESSIONS_FILE, '{}', 'utf8');
}
// สร้างไฟล์ training data ถ้ายังไม่มี
[SHAREGPT_FILE, OPENAI_FILE, ALPACA_FILE].forEach(f => {
    if (!fs.existsSync(f)) fs.writeFileSync(f, '', 'utf8');
});

// ===== Middleware =====
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ===== Helper: Read sessions =====
function readSessions() {
    try {
        return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    } catch {
        return {};
    }
}

// ===== Helper: Write sessions =====
function writeSessions(sessions) {
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf8');
}

// ===== Helper: Save training data (3 formats) =====
// เซฟทุก format ที่ใช้เทรน AI จริง — เลือกใช้ได้ตาม framework
function saveTrainingData(aiReply, conversationHistory) {
    // สร้าง conversation array รวม reply ล่าสุด
    const fullHistory = [
        ...conversationHistory.map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content
        })),
        { role: 'assistant', content: aiReply }
    ];
    const lastUserMsg = conversationHistory[conversationHistory.length - 1]?.content || '';

    // ============================================================
    // 1. ShareGPT Format — ใช้กับ Axolotl, LLaMA-Factory, Unsloth
    //    (framework เทรน AI open-source ยอดนิยมที่สุด)
    // ============================================================
    const sharegpt = {
        conversations: [
            { from: 'system', value: YUNA_SYSTEM_PROMPT },
            ...fullHistory.map(m => ({
                from: m.role === 'assistant' ? 'gpt' : 'human',
                value: m.content
            }))
        ]
    };
    fs.appendFileSync(SHAREGPT_FILE, JSON.stringify(sharegpt) + '\n', 'utf8');

    // ============================================================
    // 2. OpenAI Chat Format — ใช้กับ OpenAI Fine-tuning API
    //    (ส่งไฟล์นี้ตรง ๆ ผ่าน OpenAI dashboard/API ได้เลย)
    // ============================================================
    const openai = {
        messages: [
            { role: 'system', content: YUNA_SYSTEM_PROMPT },
            ...fullHistory.map(m => ({
                role: m.role,
                content: m.content
            }))
        ]
    };
    fs.appendFileSync(OPENAI_FILE, JSON.stringify(openai) + '\n', 'utf8');

    // ============================================================
    // 3. Alpaca/Instruct Format — ใช้กับ basic fine-tuning
    //    (ง่ายที่สุด ใช้ได้กับ almost ทุก framework)
    // ============================================================
    const alpaca = {
        instruction: YUNA_SYSTEM_PROMPT,
        input: lastUserMsg,
        output: aiReply
    };
    fs.appendFileSync(ALPACA_FILE, JSON.stringify(alpaca) + '\n', 'utf8');
}

// ===== API: Chat with Gemini =====
app.post('/api/chat', async (req, res) => {
    if (!API_KEY || API_KEY === 'ใส่_API_KEY_ที่นี่') {
        return res.status(500).json({ error: 'API Key ยังไม่ได้ตั้งค่า กรุณาแก้ไขไฟล์ .env' });
    }

    const { messages, sessionId, sessionTitle } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'ต้องส่ง messages มา' });
    }

    try {
        // Build Gemini API request
        const contents = messages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));

        const body = {
            contents,
            systemInstruction: {
                parts: [{ text: YUNA_SYSTEM_PROMPT }]
            },
            generationConfig: {
                temperature: 0.8,
                topP: 0.95,
                topK: 40,
                maxOutputTokens: 8192
            }
        };

        const apiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            }
        );

        if (!apiRes.ok) {
            const err = await apiRes.json().catch(() => ({}));
            return res.status(apiRes.status).json({
                error: err?.error?.message || `API Error: ${apiRes.status}`
            });
        }

        const data = await apiRes.json();
        const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!reply) {
            return res.status(500).json({ error: 'ไม่ได้รับการตอบกลับจาก AI' });
        }

        // ===== Parse emotion tag =====
        const emotionMatch = reply.match(/^\[EMOTION:(\w+)\]/);
        const emotion = emotionMatch ? emotionMatch[1] : 'happy';
        const cleanReply = reply.replace(/^\[EMOTION:\w+\]\s*/, '');

        // ===== Auto-save สำหรับเทรน AI (save clean text without emotion tag) =====
        saveTrainingData(cleanReply, messages);

        // ===== Update session metadata =====
        const sessions = readSessions();
        if (sessionId) {
            if (!sessions[sessionId]) {
                sessions[sessionId] = {
                    id: sessionId,
                    title: sessionTitle || 'แชทใหม่',
                    messageCount: 0,
                    createdAt: new Date().toISOString()
                };
            }
            sessions[sessionId].messageCount = (sessions[sessionId].messageCount || 0) + 2;
            sessions[sessionId].title = sessionTitle || sessions[sessionId].title;
            sessions[sessionId].updatedAt = new Date().toISOString();
            writeSessions(sessions);
        }

        res.json({ reply: cleanReply, emotion });

    } catch (err) {
        console.error('Gemini API Error:', err);
        res.status(500).json({ error: err.message || 'เกิดข้อผิดพลาดในระบบ' });
    }
});

// ===== API: Get data stats =====
app.get('/api/stats', (req, res) => {
    try {
        const sessions = readSessions();
        const sessionCount = Object.keys(sessions).length;
        const totalMessages = Object.values(sessions).reduce((sum, s) => sum + (s.messageCount || 0), 0);

        let trainingPairs = 0;
        if (fs.existsSync(SHAREGPT_FILE)) {
            trainingPairs = fs.readFileSync(SHAREGPT_FILE, 'utf8').split('\n').filter(l => l.trim()).length;
        }

        let dataSize = 0;
        [SHAREGPT_FILE, OPENAI_FILE, ALPACA_FILE].forEach(f => {
            if (fs.existsSync(f)) dataSize += fs.statSync(f).size;
        });

        res.json({
            sessions: sessionCount,
            totalMessages,
            trainingPairs,
            dataSizeKB: (dataSize / 1024).toFixed(1)
        });
    } catch {
        res.json({ sessions: 0, totalMessages: 0, trainingPairs: 0, dataSizeKB: '0' });
    }
});

// ===== Start Server =====
app.listen(PORT, () => {
    console.log('');
    console.log('  ╔═══════════════════════════════════════════════╗');
    console.log('  ║          🤖 Yuna AI Chat Server                ║');
    console.log('  ╠═══════════════════════════════════════════════╣');
    console.log(`  ║  🌐 http://localhost:${PORT}`);
    console.log(`  ║  📁 Data: ${DATA_DIR}`);
    console.log(`  ║  🔑 API Key: ${API_KEY ? '✅ ตั้งค่าแล้ว' : '❌ ยังไม่ได้ตั้งค่า'}`);
    console.log('  ║───────────────────────────────────────────────║');
    console.log('  ║  📊 Training data files:');
    console.log('  ║   • train_sharegpt.jsonl  → Axolotl/LLaMA-Factory/Unsloth');
    console.log('  ║   • train_openai.jsonl    → OpenAI fine-tuning API');
    console.log('  ║   • train_alpaca.jsonl    → Simple instruction format');
    console.log('  ╚═══════════════════════════════════════════════╝');
    console.log('');
});
