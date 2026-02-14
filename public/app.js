// ===== Yuna AI Chat System (Client) =====
// Calls server /api/chat — prompt & API key อยู่ฝั่ง server ทั้งหมด

(function () {
    'use strict';

    const AI_NAME = 'Yuna';

    // ===== Emotion Image Paths =====
    // รองรับ SVG, PNG, JPG — เปลี่ยนนามสกุลได้ตามรูปที่มี
    // ถ้าต้องการเปลี่ยนรูป: แค่ replace ไฟล์ในโฟลเดอร์ public/images/emotions/
    const EMOTION_IMAGES = {
        happy: '/images/emotions/happy.png',
        shy: '/images/emotions/shy.png',
        angry: '/images/emotions/angry.png',
        sad: '/images/emotions/sad.png',
        thinking: '/images/emotions/thinking.png',
        surprised: '/images/emotions/surprised.png',
        love: '/images/emotions/love.png',
        worried: '/images/emotions/worried.png',
        sex1: '/images/emotions/sex1.png',
        sex2: '/images/emotions/sex2.png',
        sex3: '/images/emotions/sex3.png',
        sex4: '/images/emotions/sex4.png',
        sex5: '/images/emotions/sex5.png',
        sex6: '/images/emotions/sex6.png',
        sex7: '/images/emotions/sex7.png',
        sex8: '/images/emotions/sex8.png',
        sex9: '/images/emotions/sex9.png',
        sex10: '/images/emotions/sex10.png',
        sex11: '/images/emotions/sex11.png',
        sex12: '/images/emotions/sex12.png',
        sex13: '/images/emotions/sex13.png',
        sex14: '/images/emotions/sex14.png',
        sex15: '/images/emotions/sex15.png',
    };

    const EMOTION_LABELS = {
        happy: '😊 ดีใจ',
        shy: '😳 เขิน',
        angry: '😤 โกรธ',
        sad: '😢 เศร้า',
        thinking: '🤔 กำลังคิด',
        surprised: '😲 ตกใจ',
        love: '🥰 รัก',
        worried: '😟 เป็นห่วง',
        sex1: '🍆',
        sex2: '🍑',
        sex3: '💦',
        sex4: '🍌',
        sex5: '🍒',
        sex6: '🍆🍑',
        sex7: '🍆💦',
        sex8: '🍆🍌',
        sex9: '🍆🍒',
        sex10: '🍑💦',
        sex11: '🍑🍌',
        sex12: '🍑🍒',
        sex13: '💦🍌',
        sex14: '💦🍒',
        sex15: '🍌🍒',
    };

    // ===== Storage =====
    const Storage = {
        KEYS: {
            SESSIONS: 'yuna_sessions',
            ACTIVE_SESSION: 'yuna_active_session'
        },
        get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
        set(key, value) { localStorage.setItem(key, JSON.stringify(value)); },
        remove(key) { localStorage.removeItem(key); },
        getSessions() { return this.get(this.KEYS.SESSIONS) || {}; },
        saveSessions(s) { this.set(this.KEYS.SESSIONS, s); }
    };

    // ===== App State =====
    const State = { activeSessionId: null, isProcessing: false };

    // ===== DOM =====
    const $ = id => document.getElementById(id);
    const DOM = {
        sidebar: $('sidebar'),
        sessionList: $('sessionList'),
        newChatBtn: $('newChatBtn'),
        mobileToggle: $('mobileToggle'),
        welcomeScreen: $('welcomeScreen'),
        chatMessages: $('chatMessages'),
        typingIndicator: $('typingIndicator'),
        messageInput: $('messageInput'),
        sendBtn: $('sendBtn')
    };

    // ===== Session Manager =====
    const SessionManager = {
        create() {
            const sessions = Storage.getSessions();
            const id = 'session_' + Date.now();
            sessions[id] = { id, title: 'แชทใหม่', messages: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
            Storage.saveSessions(sessions);
            return id;
        },
        delete(id) {
            const sessions = Storage.getSessions();
            delete sessions[id];
            Storage.saveSessions(sessions);
            if (State.activeSessionId === id) { State.activeSessionId = null; Storage.remove(Storage.KEYS.ACTIVE_SESSION); }
        },
        get(id) { return Storage.getSessions()[id] || null; },
        addMessage(sessionId, role, content, emotion) {
            const sessions = Storage.getSessions();
            const s = sessions[sessionId];
            if (!s) return;
            const msg = { role, content, timestamp: new Date().toISOString() };
            if (emotion) msg.emotion = emotion;
            s.messages.push(msg);
            if (s.messages.filter(m => m.role === 'user').length === 1 && role === 'user') {
                s.title = content.substring(0, 40) + (content.length > 40 ? '...' : '');
            }
            s.updatedAt = new Date().toISOString();
            Storage.saveSessions(sessions);
        },
        getAll() {
            return Object.values(Storage.getSessions()).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        }
    };

    // ===== Simple Markdown Renderer =====
    function md(text) {
        let h = text
            .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
            .replace(/^[*-] (.+)$/gm, '<li>$1</li>')
            .replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
        h = h.replace(/((?:<li>.*<\/li>\s*)+)/g, '<ul>$1</ul>');
        h = h.split(/\n\n+/).map(p => {
            p = p.trim();
            if (!p) return '';
            if (p.startsWith('<pre>') || p.startsWith('<ul>') || p.startsWith('<ol>') || p.startsWith('<blockquote>')) return p;
            return `<p>${p.replace(/\n/g, '<br>')}</p>`;
        }).join('');
        return h;
    }

    // ===== Get Emotion Image HTML =====
    function emotionAvatarHTML(emotion) {
        const imgSrc = EMOTION_IMAGES[emotion] || EMOTION_IMAGES.happy;
        return `<div class="emotion-avatar" data-emotion="${emotion || 'happy'}">
            <img src="${imgSrc}" alt="${emotion}" class="emotion-img" />
        </div>`;
    }

    // ===== UI =====
    const UI = {
        esc(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; },
        time(iso) { return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }); },
        scroll() { requestAnimationFrame(() => { DOM.chatMessages.scrollTop = DOM.chatMessages.scrollHeight; }); },

        renderSessions() {
            const sessions = SessionManager.getAll();
            DOM.sessionList.innerHTML = sessions.length === 0
                ? '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:0.8rem">ยังไม่มีแชท<br>กดปุ่ม + เพื่อเริ่มต้น</div>'
                : sessions.map(s => `
                    <div class="session-item ${s.id === State.activeSessionId ? 'active' : ''}" data-id="${s.id}">
                        <span class="session-icon">💬</span>
                        <span class="session-title">${this.esc(s.title)}</span>
                        <button class="delete-session" data-id="${s.id}" title="ลบ">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                                <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                            </svg>
                        </button>
                    </div>`).join('');

            DOM.sessionList.querySelectorAll('.session-item').forEach(el => {
                el.addEventListener('click', e => { if (!e.target.closest('.delete-session')) this.switchTo(el.dataset.id); });
            });
            DOM.sessionList.querySelectorAll('.delete-session').forEach(el => {
                el.addEventListener('click', e => {
                    e.stopPropagation();
                    if (confirm('ลบแชทนี้?')) { SessionManager.delete(el.dataset.id); this.renderSessions(); if (!State.activeSessionId) this.showWelcome(); }
                });
            });
        },

        switchTo(id) {
            State.activeSessionId = id;
            Storage.set(Storage.KEYS.ACTIVE_SESSION, id);
            this.renderSessions();
            this.renderMessages();
            DOM.sidebar.classList.remove('open');
        },

        showWelcome() {
            DOM.welcomeScreen.style.display = 'flex';
            DOM.chatMessages.classList.remove('active');
            State.activeSessionId = null;
            Storage.remove(Storage.KEYS.ACTIVE_SESSION);
        },

        renderMessages() {
            const session = SessionManager.get(State.activeSessionId);
            if (!session) return this.showWelcome();
            DOM.welcomeScreen.style.display = 'none';
            DOM.chatMessages.classList.add('active');
            DOM.chatMessages.innerHTML = session.messages.map(m => this._msgHTML(m.role, m.content, m.timestamp, m.emotion)).join('');
            this.scroll();
        },

        addMsg(role, content, emotion) {
            const div = document.createElement('div');
            div.className = `message ${role === 'user' ? 'user' : 'assistant'}`;
            if (emotion) div.setAttribute('data-emotion', emotion);
            div.innerHTML = this._msgInner(role, content, new Date().toISOString(), emotion);
            DOM.chatMessages.appendChild(div);
            this.scroll();
        },

        _msgHTML(role, content, ts, emotion) {
            return `<div class="message ${role === 'user' ? 'user' : 'assistant'}"${emotion ? ` data-emotion="${emotion}"` : ''}>${this._msgInner(role, content, ts, emotion)}</div>`;
        },
        _msgInner(role, content, ts, emotion) {
            const avatar = role === 'user'
                ? '<div class="message-avatar">👤</div>'
                : emotionAvatarHTML(emotion || 'happy');
            const emotionLabel = (role === 'assistant' && emotion && EMOTION_LABELS[emotion])
                ? `<span class="emotion-badge">${EMOTION_LABELS[emotion]}</span>`
                : '';
            // รูปอารมณ์ใหญ่ในแชท
            const emotionInChat = (role === 'assistant' && emotion)
                ? `<div class="emotion-in-chat">
                    <img src="${EMOTION_IMAGES[emotion] || EMOTION_IMAGES.happy}" alt="${emotion}" class="emotion-chat-img" />
                   </div>`
                : '';
            return `
                ${avatar}
                <div class="message-content">
                    <div class="message-header">
                        <span class="message-name">${role === 'user' ? 'คุณ' : AI_NAME}</span>
                        ${emotionLabel}
                        <span class="message-time">${this.time(ts)}</span>
                    </div>
                    ${emotionInChat}
                    <div class="message-text">${role === 'assistant' ? md(content) : this.esc(content)}</div>
                </div>`;
        },

        showTyping() { DOM.typingIndicator.classList.add('active'); this.scroll(); },
        hideTyping() { DOM.typingIndicator.classList.remove('active'); }
    };

    // ===== Send Message =====
    async function sendMessage(text) {
        if (!text.trim() || State.isProcessing) return;

        if (!State.activeSessionId) {
            const id = SessionManager.create();
            State.activeSessionId = id;
            Storage.set(Storage.KEYS.ACTIVE_SESSION, id);
            DOM.welcomeScreen.style.display = 'none';
            DOM.chatMessages.classList.add('active');
            DOM.chatMessages.innerHTML = '';
        }

        State.isProcessing = true;
        DOM.sendBtn.disabled = true;
        DOM.messageInput.value = '';
        DOM.messageInput.style.height = 'auto';

        SessionManager.addMessage(State.activeSessionId, 'user', text);
        UI.addMsg('user', text);
        UI.renderSessions();
        UI.showTyping();

        try {
            const session = SessionManager.get(State.activeSessionId);

            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: session.messages.map(m => ({ role: m.role, content: m.content })),
                    sessionId: State.activeSessionId,
                    sessionTitle: session.title
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `Error: ${res.status}`);

            // Save with emotion
            SessionManager.addMessage(State.activeSessionId, 'assistant', data.reply, data.emotion);
            UI.hideTyping();
            UI.addMsg('assistant', data.reply, data.emotion);
            UI.renderSessions();
        } catch (err) {
            UI.hideTyping();
            UI.addMsg('assistant', `⚠️ เกิดข้อผิดพลาด: ${err.message}`, 'sad');
            console.error('Chat Error:', err);
        }

        State.isProcessing = false;
        DOM.sendBtn.disabled = DOM.messageInput.value.trim() === '';
    }

    // ===== Init =====
    function init() {
        const saved = Storage.get(Storage.KEYS.ACTIVE_SESSION);
        if (saved && SessionManager.get(saved)) { State.activeSessionId = saved; UI.renderMessages(); }
        UI.renderSessions();
        bindEvents();
    }

    function bindEvents() {
        DOM.newChatBtn.addEventListener('click', () => { const id = SessionManager.create(); UI.switchTo(id); });

        DOM.sendBtn.addEventListener('click', () => sendMessage(DOM.messageInput.value));
        DOM.messageInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(DOM.messageInput.value); } });
        DOM.messageInput.addEventListener('input', () => {
            DOM.messageInput.style.height = 'auto';
            DOM.messageInput.style.height = Math.min(DOM.messageInput.scrollHeight, 150) + 'px';
            DOM.sendBtn.disabled = DOM.messageInput.value.trim() === '';
        });

        document.querySelectorAll('.suggestion-card').forEach(card => {
            card.addEventListener('click', () => sendMessage(card.dataset.prompt));
        });

        DOM.mobileToggle.addEventListener('click', () => DOM.sidebar.classList.toggle('open'));
    }

    init();
})();
