// ===== Yuna AI Chat System =====
// Google Gemini API | Encrypted Key Storage | Conversation History | Identity System

(function () {
    'use strict';

    // ===== Encryption Utilities =====
    const Crypto = {
        // Generate a key from password using Web Crypto API
        async deriveKey(password) {
            const enc = new TextEncoder();
            const keyMaterial = await window.crypto.subtle.importKey(
                'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
            );
            return window.crypto.subtle.deriveKey(
                { name: 'PBKDF2', salt: enc.encode('YunaAI-Salt-v1'), iterations: 100000, hash: 'SHA-256' },
                keyMaterial,
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );
        },

        async encrypt(text, password) {
            const key = await this.deriveKey(password);
            const enc = new TextEncoder();
            const iv = window.crypto.getRandomValues(new Uint8Array(12));
            const encrypted = await window.crypto.subtle.encrypt(
                { name: 'AES-GCM', iv }, key, enc.encode(text)
            );
            const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
            combined.set(iv);
            combined.set(new Uint8Array(encrypted), iv.length);
            return btoa(String.fromCharCode(...combined));
        },

        async decrypt(encryptedBase64, password) {
            try {
                const key = await this.deriveKey(password);
                const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
                const iv = combined.slice(0, 12);
                const data = combined.slice(12);
                const decrypted = await window.crypto.subtle.decrypt(
                    { name: 'AES-GCM', iv }, key, data
                );
                return new TextDecoder().decode(decrypted);
            } catch {
                return null;
            }
        },

        // Hash password for verification
        async hashPassword(password) {
            const enc = new TextEncoder();
            const hash = await window.crypto.subtle.digest('SHA-256', enc.encode(password + 'YunaAI-Hash'));
            return btoa(String.fromCharCode(...new Uint8Array(hash)));
        }
    };

    // ===== Storage Manager =====
    const Storage = {
        KEYS: {
            SESSIONS: 'yuna_sessions',
            ACTIVE_SESSION: 'yuna_active_session',
            IDENTITY: 'yuna_identity',
            API_KEY_ENC: 'yuna_api_key_enc',
            ADMIN_HASH: 'yuna_admin_hash',
            SETUP_DONE: 'yuna_setup_done'
        },

        get(key) {
            try {
                return JSON.parse(localStorage.getItem(key));
            } catch {
                return null;
            }
        },

        set(key, value) {
            localStorage.setItem(key, JSON.stringify(value));
        },

        remove(key) {
            localStorage.removeItem(key);
        },

        getSessions() {
            return this.get(this.KEYS.SESSIONS) || {};
        },

        saveSessions(sessions) {
            this.set(this.KEYS.SESSIONS, sessions);
        },

        getIdentity() {
            return this.get(this.KEYS.IDENTITY) || {
                name: 'Yuna',
                systemPrompt: 'คุณชื่อ Yuna เป็นผู้ช่วย AI ที่เป็นมิตร ฉลาด และช่วยเหลือผู้ใช้อย่างเต็มที่ คุณตอบเป็นภาษาไทยเป็นหลัก พูดจาสุภาพ น่ารัก ใช้คำลงท้ายว่า "ค่ะ" หรือ "นะคะ" คุณมีความรู้กว้างขวางและสามารถช่วยได้ทุกเรื่อง ตั้งแต่การเขียนโค้ด การวิเคราะห์ข้อมูล ไปจนถึงการให้คำปรึกษาทั่วไป'
            };
        },

        saveIdentity(identity) {
            this.set(this.KEYS.IDENTITY, identity);
        }
    };

    // ===== Gemini API =====
    const GeminiAPI = {
        apiKey: null,
        model: 'gemini-2.0-flash',

        async call(messages, systemPrompt) {
            if (!this.apiKey) throw new Error('API Key ยังไม่ได้ตั้งค่า');

            const contents = messages.map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
            }));

            const body = {
                contents,
                systemInstruction: {
                    parts: [{ text: systemPrompt }]
                },
                generationConfig: {
                    temperature: 0.8,
                    topP: 0.95,
                    topK: 40,
                    maxOutputTokens: 8192
                }
            };

            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                }
            );

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.error?.message || `API Error: ${res.status}`);
            }

            const data = await res.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) throw new Error('ไม่ได้รับการตอบกลับจาก AI');
            return text;
        }
    };

    // ===== App State =====
    const State = {
        activeSessionId: null,
        adminPassword: null, // kept in memory only during session
        isProcessing: false
    };

    // ===== DOM Elements =====
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
        sendBtn: $('sendBtn'),
        exportBtn: $('exportBtn'),
        settingsBtn: $('settingsBtn'),
        // Settings modal
        settingsModal: $('settingsModal'),
        closeSettings: $('closeSettings'),
        apiKeyInput: $('apiKeyInput'),
        toggleApiKey: $('toggleApiKey'),
        saveApiKey: $('saveApiKey'),
        apiStatus: $('apiStatus'),
        aiNameInput: $('aiNameInput'),
        systemPromptInput: $('systemPromptInput'),
        saveIdentity: $('saveIdentity'),
        exportAllBtn: $('exportAllBtn'),
        clearAllBtn: $('clearAllBtn'),
        dataStats: $('dataStats'),
        // Admin auth modal
        adminAuthModal: $('adminAuthModal'),
        closeAdminAuth: $('closeAdminAuth'),
        adminPasswordInput: $('adminPasswordInput'),
        adminLoginBtn: $('adminLoginBtn'),
        adminAuthStatus: $('adminAuthStatus'),
        // Setup modal
        setupModal: $('setupModal'),
        setupPassword: $('setupPassword'),
        setupPasswordConfirm: $('setupPasswordConfirm'),
        setupApiKey: $('setupApiKey'),
        setupCompleteBtn: $('setupCompleteBtn'),
        setupStatus: $('setupStatus')
    };

    // ===== Session Manager =====
    const SessionManager = {
        createSession() {
            const sessions = Storage.getSessions();
            const id = 'session_' + Date.now();
            sessions[id] = {
                id,
                title: 'แชทใหม่',
                messages: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            Storage.saveSessions(sessions);
            return id;
        },

        deleteSession(id) {
            const sessions = Storage.getSessions();
            delete sessions[id];
            Storage.saveSessions(sessions);
            if (State.activeSessionId === id) {
                State.activeSessionId = null;
                Storage.remove(Storage.KEYS.ACTIVE_SESSION);
            }
        },

        getSession(id) {
            return Storage.getSessions()[id] || null;
        },

        addMessage(sessionId, role, content) {
            const sessions = Storage.getSessions();
            const session = sessions[sessionId];
            if (!session) return;
            session.messages.push({
                role,
                content,
                timestamp: new Date().toISOString()
            });
            // Auto-title from first user message
            if (session.messages.filter(m => m.role === 'user').length === 1 && role === 'user') {
                session.title = content.substring(0, 40) + (content.length > 40 ? '...' : '');
            }
            session.updatedAt = new Date().toISOString();
            Storage.saveSessions(sessions);
        },

        getAllSessions() {
            const sessions = Storage.getSessions();
            return Object.values(sessions).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        },

        exportAll() {
            const sessions = Storage.getSessions();
            const identity = Storage.getIdentity();
            const exportData = {
                exportedAt: new Date().toISOString(),
                aiIdentity: identity,
                totalSessions: Object.keys(sessions).length,
                totalMessages: Object.values(sessions).reduce((sum, s) => sum + s.messages.length, 0),
                sessions: Object.values(sessions).map(s => ({
                    id: s.id,
                    title: s.title,
                    createdAt: s.createdAt,
                    updatedAt: s.updatedAt,
                    messages: s.messages.map(m => ({
                        role: m.role,
                        content: m.content,
                        timestamp: m.timestamp
                    }))
                })),
                // Training format (prompt-completion pairs)
                trainingData: Object.values(sessions).flatMap(s => {
                    const pairs = [];
                    for (let i = 0; i < s.messages.length - 1; i++) {
                        if (s.messages[i].role === 'user' && s.messages[i + 1].role === 'assistant') {
                            pairs.push({
                                instruction: identity.systemPrompt,
                                input: s.messages[i].content,
                                output: s.messages[i + 1].content
                            });
                        }
                    }
                    return pairs;
                })
            };
            return exportData;
        }
    };

    // ===== Markdown Renderer (simple) =====
    function renderMarkdown(text) {
        let html = text
            // Code blocks
            .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
            // Inline code
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            // Bold
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            // Italic
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            // Blockquote
            .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
            // Unordered list
            .replace(/^[*-] (.+)$/gm, '<li>$1</li>')
            // Ordered list
            .replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

        // Wrap consecutive <li> in <ul>
        html = html.replace(/((?:<li>.*<\/li>\s*)+)/g, '<ul>$1</ul>');

        // Paragraphs - split by double newline
        html = html.split(/\n\n+/).map(p => {
            p = p.trim();
            if (!p) return '';
            if (p.startsWith('<pre>') || p.startsWith('<ul>') || p.startsWith('<ol>') || p.startsWith('<blockquote>')) return p;
            return `<p>${p.replace(/\n/g, '<br>')}</p>`;
        }).join('');

        return html;
    }

    // ===== UI Renderer =====
    const UI = {
        renderSessions() {
            const sessions = SessionManager.getAllSessions();
            DOM.sessionList.innerHTML = sessions.length === 0
                ? '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:0.8rem">ยังไม่มีแชท<br>กดปุ่ม + เพื่อเริ่มต้น</div>'
                : sessions.map(s => `
                    <div class="session-item ${s.id === State.activeSessionId ? 'active' : ''}" data-id="${s.id}">
                        <span class="session-icon">💬</span>
                        <span class="session-title">${this.escapeHtml(s.title)}</span>
                        <button class="delete-session" data-id="${s.id}" title="ลบ">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                                <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                            </svg>
                        </button>
                    </div>
                `).join('');

            // Bind click events
            DOM.sessionList.querySelectorAll('.session-item').forEach(el => {
                el.addEventListener('click', (e) => {
                    if (e.target.closest('.delete-session')) return;
                    this.switchSession(el.dataset.id);
                });
            });
            DOM.sessionList.querySelectorAll('.delete-session').forEach(el => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (confirm('ลบแชทนี้?')) {
                        SessionManager.deleteSession(el.dataset.id);
                        this.renderSessions();
                        if (!State.activeSessionId) {
                            this.showWelcome();
                        }
                    }
                });
            });
        },

        switchSession(id) {
            State.activeSessionId = id;
            Storage.set(Storage.KEYS.ACTIVE_SESSION, id);
            this.renderSessions();
            this.renderMessages();
            // Close mobile sidebar
            DOM.sidebar.classList.remove('open');
        },

        showWelcome() {
            DOM.welcomeScreen.style.display = 'flex';
            DOM.chatMessages.classList.remove('active');
            State.activeSessionId = null;
            Storage.remove(Storage.KEYS.ACTIVE_SESSION);
        },

        renderMessages() {
            const session = SessionManager.getSession(State.activeSessionId);
            if (!session) return this.showWelcome();

            DOM.welcomeScreen.style.display = 'none';
            DOM.chatMessages.classList.add('active');
            const identity = Storage.getIdentity();

            DOM.chatMessages.innerHTML = session.messages.map(m => `
                <div class="message ${m.role === 'user' ? 'user' : 'assistant'}">
                    <div class="message-avatar">
                        ${m.role === 'user' ? '👤' : identity.name.charAt(0).toUpperCase()}
                    </div>
                    <div class="message-content">
                        <div class="message-header">
                            <span class="message-name">${m.role === 'user' ? 'คุณ' : this.escapeHtml(identity.name)}</span>
                            <span class="message-time">${this.formatTime(m.timestamp)}</span>
                        </div>
                        <div class="message-text">${m.role === 'assistant' ? renderMarkdown(m.content) : this.escapeHtml(m.content)}</div>
                    </div>
                </div>
            `).join('');

            this.scrollToBottom();
        },

        addMessageToUI(role, content) {
            const identity = Storage.getIdentity();
            const div = document.createElement('div');
            div.className = `message ${role === 'user' ? 'user' : 'assistant'}`;
            div.innerHTML = `
                <div class="message-avatar">
                    ${role === 'user' ? '👤' : identity.name.charAt(0).toUpperCase()}
                </div>
                <div class="message-content">
                    <div class="message-header">
                        <span class="message-name">${role === 'user' ? 'คุณ' : this.escapeHtml(identity.name)}</span>
                        <span class="message-time">${this.formatTime(new Date().toISOString())}</span>
                    </div>
                    <div class="message-text">${role === 'assistant' ? renderMarkdown(content) : this.escapeHtml(content)}</div>
                </div>
            `;
            DOM.chatMessages.appendChild(div);
            this.scrollToBottom();
        },

        showTyping() {
            DOM.typingIndicator.classList.add('active');
            this.scrollToBottom();
        },

        hideTyping() {
            DOM.typingIndicator.classList.remove('active');
        },

        scrollToBottom() {
            requestAnimationFrame(() => {
                DOM.chatMessages.scrollTop = DOM.chatMessages.scrollHeight;
            });
        },

        formatTime(iso) {
            const d = new Date(iso);
            return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
        },

        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        },

        showStatus(el, message, type) {
            el.textContent = message;
            el.className = `api-status ${type}`;
            el.style.display = 'block';
            if (type === 'success') {
                setTimeout(() => { el.style.display = 'none'; }, 3000);
            }
        },

        updateDataStats() {
            const sessions = SessionManager.getAllSessions();
            const totalMessages = sessions.reduce((sum, s) => sum + s.messages.length, 0);
            const userMessages = sessions.reduce((sum, s) => sum + s.messages.filter(m => m.role === 'user').length, 0);
            const aiMessages = sessions.reduce((sum, s) => sum + s.messages.filter(m => m.role === 'assistant').length, 0);
            DOM.dataStats.innerHTML = `
                📁 จำนวน Session: <strong>${sessions.length}</strong><br>
                💬 ข้อความทั้งหมด: <strong>${totalMessages}</strong><br>
                👤 จากผู้ใช้: <strong>${userMessages}</strong> | 🤖 จาก AI: <strong>${aiMessages}</strong><br>
                📦 ขนาดข้อมูล: <strong>${(new Blob([JSON.stringify(Storage.getSessions())]).size / 1024).toFixed(1)} KB</strong>
            `;
        }
    };

    // ===== Send Message =====
    async function sendMessage(text) {
        if (!text.trim() || State.isProcessing) return;
        if (!GeminiAPI.apiKey) {
            alert('กรุณาตั้งค่า API Key ก่อน');
            return;
        }

        // Create new session if needed
        if (!State.activeSessionId) {
            const id = SessionManager.createSession();
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

        // Add user message
        SessionManager.addMessage(State.activeSessionId, 'user', text);
        UI.addMessageToUI('user', text);
        UI.renderSessions();

        // Show typing
        UI.showTyping();

        try {
            const session = SessionManager.getSession(State.activeSessionId);
            const identity = Storage.getIdentity();

            // Build conversation history for API
            const apiMessages = session.messages.map(m => ({
                role: m.role,
                content: m.content
            }));

            const reply = await GeminiAPI.call(apiMessages, identity.systemPrompt);

            // Add AI response
            SessionManager.addMessage(State.activeSessionId, 'assistant', reply);
            UI.hideTyping();
            UI.addMessageToUI('assistant', reply);
            UI.renderSessions();
        } catch (err) {
            UI.hideTyping();
            UI.addMessageToUI('assistant', `⚠️ เกิดข้อผิดพลาด: ${err.message}`);
            console.error('Gemini API Error:', err);
        }

        State.isProcessing = false;
        DOM.sendBtn.disabled = DOM.messageInput.value.trim() === '';
    }

    // ===== Export =====
    function downloadJSON(data, filename) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }

    // ===== Init & Event Binding =====
    async function init() {
        const setupDone = Storage.get(Storage.KEYS.SETUP_DONE);

        if (!setupDone) {
            // First-time setup
            DOM.setupModal.classList.add('active');
        } else {
            // Normal boot — load identity into settings UI
            const identity = Storage.getIdentity();
            DOM.aiNameInput.value = identity.name;
            DOM.systemPromptInput.value = identity.systemPrompt;

            // Update welcome screen name
            const nameEl = document.querySelector('.welcome-title .gradient-text');
            if (nameEl) nameEl.textContent = identity.name;
            const typingText = document.querySelector('.typing-text');
            if (typingText) typingText.textContent = `${identity.name} กำลังพิมพ์...`;
        }

        // Restore active session
        const savedSession = Storage.get(Storage.KEYS.ACTIVE_SESSION);
        if (savedSession && SessionManager.getSession(savedSession)) {
            State.activeSessionId = savedSession;
            UI.renderMessages();
        }

        UI.renderSessions();
        bindEvents();
    }

    function bindEvents() {
        // New chat
        DOM.newChatBtn.addEventListener('click', () => {
            const id = SessionManager.createSession();
            UI.switchSession(id);
        });

        // Send message
        DOM.sendBtn.addEventListener('click', () => sendMessage(DOM.messageInput.value));
        DOM.messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage(DOM.messageInput.value);
            }
        });

        // Auto-resize textarea
        DOM.messageInput.addEventListener('input', () => {
            DOM.messageInput.style.height = 'auto';
            DOM.messageInput.style.height = Math.min(DOM.messageInput.scrollHeight, 150) + 'px';
            DOM.sendBtn.disabled = DOM.messageInput.value.trim() === '';
        });

        // Suggestion cards
        document.querySelectorAll('.suggestion-card').forEach(card => {
            card.addEventListener('click', () => {
                sendMessage(card.dataset.prompt);
            });
        });

        // Mobile sidebar
        DOM.mobileToggle.addEventListener('click', () => {
            DOM.sidebar.classList.toggle('open');
        });

        // Settings button → admin auth
        DOM.settingsBtn.addEventListener('click', () => {
            if (State.adminPassword) {
                // Already authenticated this session
                openSettings();
            } else {
                DOM.adminAuthModal.classList.add('active');
                DOM.adminPasswordInput.value = '';
                DOM.adminPasswordInput.focus();
            }
        });

        // Admin login
        DOM.adminLoginBtn.addEventListener('click', async () => {
            const pw = DOM.adminPasswordInput.value;
            if (!pw) return;
            const storedHash = localStorage.getItem(Storage.KEYS.ADMIN_HASH);
            const inputHash = await Crypto.hashPassword(pw);
            if (inputHash === storedHash) {
                State.adminPassword = pw;
                DOM.adminAuthModal.classList.remove('active');
                DOM.adminAuthStatus.style.display = 'none';
                // Decrypt API key
                const encKey = localStorage.getItem(Storage.KEYS.API_KEY_ENC);
                if (encKey) {
                    const decrypted = await Crypto.decrypt(encKey, pw);
                    if (decrypted) {
                        GeminiAPI.apiKey = decrypted;
                        DOM.apiKeyInput.value = decrypted;
                    }
                }
                openSettings();
            } else {
                UI.showStatus(DOM.adminAuthStatus, '❌ รหัสผ่านไม่ถูกต้อง', 'error');
            }
        });

        DOM.adminPasswordInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') DOM.adminLoginBtn.click();
        });

        DOM.closeAdminAuth.addEventListener('click', () => {
            DOM.adminAuthModal.classList.remove('active');
        });

        // Close settings
        DOM.closeSettings.addEventListener('click', () => {
            DOM.settingsModal.classList.remove('active');
        });

        // Toggle API key visibility
        DOM.toggleApiKey.addEventListener('click', () => {
            DOM.apiKeyInput.type = DOM.apiKeyInput.type === 'password' ? 'text' : 'password';
        });

        // Save API key
        DOM.saveApiKey.addEventListener('click', async () => {
            const key = DOM.apiKeyInput.value.trim();
            if (!key) return UI.showStatus(DOM.apiStatus, '❌ กรุณาใส่ API Key', 'error');
            if (!State.adminPassword) return UI.showStatus(DOM.apiStatus, '❌ ไม่ได้ยืนยันตัวตน', 'error');

            try {
                const encrypted = await Crypto.encrypt(key, State.adminPassword);
                localStorage.setItem(Storage.KEYS.API_KEY_ENC, encrypted);
                GeminiAPI.apiKey = key;
                UI.showStatus(DOM.apiStatus, '✅ บันทึก API Key สำเร็จ (เข้ารหัสแล้ว)', 'success');
            } catch (err) {
                UI.showStatus(DOM.apiStatus, '❌ เกิดข้อผิดพลาด: ' + err.message, 'error');
            }
        });

        // Save identity
        DOM.saveIdentity.addEventListener('click', () => {
            const name = DOM.aiNameInput.value.trim() || 'Yuna';
            const systemPrompt = DOM.systemPromptInput.value.trim();
            Storage.saveIdentity({ name, systemPrompt });

            // Update UI
            const nameEl = document.querySelector('.welcome-title .gradient-text');
            if (nameEl) nameEl.textContent = name;
            const typingText = document.querySelector('.typing-text');
            if (typingText) typingText.textContent = `${name} กำลังพิมพ์...`;
            DOM.messageInput.placeholder = `พิมพ์ข้อความถึง ${name}...`;

            // Re-render messages to show new name
            if (State.activeSessionId) UI.renderMessages();

            alert('✅ บันทึกตัวตนสำเร็จ!');
        });

        // Export
        const doExport = () => {
            const data = SessionManager.exportAll();
            if (data.totalMessages === 0) return alert('ยังไม่มีข้อมูลสำหรับ export');
            const filename = `yuna_training_data_${new Date().toISOString().slice(0, 10)}.json`;
            downloadJSON(data, filename);
        };
        DOM.exportBtn.addEventListener('click', doExport);
        DOM.exportAllBtn.addEventListener('click', doExport);

        // Clear all data
        DOM.clearAllBtn.addEventListener('click', () => {
            if (confirm('⚠️ ลบข้อมูลสนทนาทั้งหมด? (API Key และการตั้งค่าจะยังอยู่)')) {
                Storage.saveSessions({});
                State.activeSessionId = null;
                Storage.remove(Storage.KEYS.ACTIVE_SESSION);
                UI.renderSessions();
                UI.showWelcome();
                UI.updateDataStats();
                alert('✅ ลบข้อมูลสนทนาทั้งหมดแล้ว');
            }
        });

        // Setup complete
        DOM.setupCompleteBtn.addEventListener('click', async () => {
            const pw = DOM.setupPassword.value;
            const pwConfirm = DOM.setupPasswordConfirm.value;
            const apiKey = DOM.setupApiKey.value.trim();

            if (!pw || pw.length < 6) {
                return UI.showStatus(DOM.setupStatus, '❌ รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', 'error');
            }
            if (pw !== pwConfirm) {
                return UI.showStatus(DOM.setupStatus, '❌ รหัสผ่านไม่ตรงกัน', 'error');
            }
            if (!apiKey) {
                return UI.showStatus(DOM.setupStatus, '❌ กรุณาใส่ API Key', 'error');
            }

            try {
                // Hash & store admin password
                const hash = await Crypto.hashPassword(pw);
                localStorage.setItem(Storage.KEYS.ADMIN_HASH, hash);

                // Encrypt & store API key
                const encrypted = await Crypto.encrypt(apiKey, pw);
                localStorage.setItem(Storage.KEYS.API_KEY_ENC, encrypted);

                // Set defaults
                Storage.saveIdentity(Storage.getIdentity());
                Storage.set(Storage.KEYS.SETUP_DONE, true);

                // Set state
                State.adminPassword = pw;
                GeminiAPI.apiKey = apiKey;

                // Update UI
                const identity = Storage.getIdentity();
                DOM.aiNameInput.value = identity.name;
                DOM.systemPromptInput.value = identity.systemPrompt;

                DOM.setupModal.classList.remove('active');
                UI.showStatus(DOM.setupStatus, '', '');
            } catch (err) {
                UI.showStatus(DOM.setupStatus, '❌ เกิดข้อผิดพลาด: ' + err.message, 'error');
            }
        });

        // Close modals on overlay click
        [DOM.settingsModal, DOM.adminAuthModal].forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.remove('active');
            });
        });

        // Auto-load API key if admin is already authenticated (page reload within same session won't have password)
        // API key needs admin auth each browser session for security
    }

    function openSettings() {
        DOM.settingsModal.classList.add('active');
        UI.updateDataStats();
    }

    // Boot
    init();
})();
