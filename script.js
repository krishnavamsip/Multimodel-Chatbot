const API_URL = 'http://127.0.0.1:5000/api/chat';

const MODEL_PRICING = {
    "minimaxai/minimax-m2.7": { input: 1.00, output: 1.00 },
    "qwen/qwen3.5-397b-a17b": { input: 2.50, output: 2.50 },
    "meta/llama3-8b-instruct": { input: 0.15, output: 0.15 },
    "nvidia/nemotron-3-super-120b-a12b": { input: 3.00, output: 3.00 }
};

let sessions = JSON.parse(localStorage.getItem('chatSessions')) || [];
let currentSessionId = null;

let currentAbortController = null;
let isGenerating = false;

const modelSelect = document.getElementById('model-select');
const chatMessages = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const newChatBtn = document.getElementById('new-chat-btn');
const historyList = document.getElementById('history-list');
const welcomeScreen = document.getElementById('welcome-screen');

const sessionTokensSpan = document.getElementById('session-tokens');
const inputTokensSpan = document.getElementById('input-tokens');
const outputTokensSpan = document.getElementById('output-tokens');
const sessionCostSpan = document.getElementById('session-cost');

// Tokenizer Elements
const tokenizerBtn = document.getElementById('tokenizer-btn');
const tokenizerModal = document.getElementById('tokenizer-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const visualizerBox = document.getElementById('token-visualizer-box');
const modalTokenCount = document.getElementById('modal-token-count');

marked.setOptions({
    highlight: function(code, lang) {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
    }
});

function init() {
    renderHistoryList();
    if (sessions.length > 0) {
        loadSession(sessions[0].id);
    } else {
        createNewSession();
    }
}

function createNewSession() {
    currentSessionId = Date.now().toString();
    const newSession = {
        id: currentSessionId, title: 'New chat', history: [],
        totalTokens: 0, inputTokens: 0, outputTokens: 0, totalCost: 0
    };
    sessions.unshift(newSession);
    saveSessions();
    loadSession(currentSessionId);
}

function saveSessions() {
    localStorage.setItem('chatSessions', JSON.stringify(sessions));
    renderHistoryList();
}

function getCurrentSession() { return sessions.find(s => s.id === currentSessionId); }

function deleteSession(id) {
    sessions = sessions.filter(s => s.id !== id);
    saveSessions();
    if (currentSessionId === id) {
        if (sessions.length > 0) loadSession(sessions[0].id);
        else createNewSession();
    } else {
        renderHistoryList();
    }
}

function loadSession(id) {
    currentSessionId = id;
    const session = getCurrentSession();
    chatMessages.innerHTML = '';
    
    session.totalTokens = session.totalTokens || 0;
    session.inputTokens = session.inputTokens || 0;
    session.outputTokens = session.outputTokens || 0;
    session.totalCost = session.totalCost || 0;
    
    updateTokenDisplay();

    if (session.history.length === 0) {
        welcomeScreen.style.display = 'block';
        chatMessages.appendChild(welcomeScreen);
    } else {
        welcomeScreen.style.display = 'none';
        session.history.forEach((msg, index) => {
            renderStaticMessage(msg.role, msg.content, index);
        });
    }
    renderHistoryList();
}

function renderHistoryList() {
    historyList.innerHTML = '';
    sessions.forEach(session => {
        const div = document.createElement('div');
        div.className = `history-item ${session.id === currentSessionId ? 'active' : ''}`;
        
        const titleSpan = document.createElement('div');
        titleSpan.className = 'history-title-text';
        titleSpan.textContent = session.title;
        titleSpan.onclick = () => loadSession(session.id);
        
        const delBtn = document.createElement('button');
        delBtn.className = 'delete-btn';
        delBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>`;
        delBtn.onclick = (e) => { e.stopPropagation(); deleteSession(session.id); };
        
        div.appendChild(titleSpan);
        div.appendChild(delBtn);
        historyList.appendChild(div);
    });
}

function scrollToBottom() {
    const container = document.getElementById('chat-container');
    container.scrollTop = container.scrollHeight;
}

function toggleSendButton(generating) {
    isGenerating = generating;
    if (generating) {
        sendBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`;
        sendBtn.classList.add('stop-state');
    } else {
        sendBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.4 20.4L20.85 12.92C21.66 12.57 21.66 11.43 20.85 11.08L3.4 3.6C2.74 3.31 2.01 3.8 2.01 4.51L2 9.12C2 9.62 2.37 10.05 2.87 10.11L17 12L2.87 13.88C2.37 13.95 2 14.38 2 14.88L2.01 19.49C2.01 20.2 2.74 20.69 3.4 20.4Z" fill="currentColor"/></svg>`;
        sendBtn.classList.remove('stop-state');
    }
}

function enableEdit(messageDiv, content, historyIndex) {
    const contentDiv = messageDiv.querySelector('.message-content');
    contentDiv.style.display = 'none';
    
    const editContainer = document.createElement('div');
    editContainer.className = 'edit-container';
    editContainer.innerHTML = `
        <textarea rows="3">${content}</textarea>
        <div class="edit-actions">
            <button class="btn-cancel">Cancel</button>
            <button class="btn-update">Update</button>
        </div>
    `;
    
    messageDiv.appendChild(editContainer);
    
    editContainer.querySelector('.btn-cancel').onclick = () => {
        editContainer.remove();
        contentDiv.style.display = 'block';
    };
    
    editContainer.querySelector('.btn-update').onclick = () => {
        const newText = editContainer.querySelector('textarea').value.trim();
        if (!newText) return;
        
        const session = getCurrentSession();
        session.history = session.history.slice(0, historyIndex);
        saveSessions();
        
        loadSession(session.id);
        processPrompt(newText);
    };
}

function renderStaticMessage(role, content, index) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    if (role === 'user') {
        contentDiv.textContent = content;
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';
        actionsDiv.innerHTML = `<button class="edit-btn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg> Edit</button>`;
        actionsDiv.querySelector('.edit-btn').onclick = () => enableEdit(messageDiv, content, index);
        messageDiv.appendChild(contentDiv);
        messageDiv.appendChild(actionsDiv);
    } else {
        let cleanContent = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        contentDiv.innerHTML = DOMPurify.sanitize(marked.parse(cleanContent));
        messageDiv.appendChild(contentDiv);
        formatCodeBlocks(contentDiv);
    }

    chatMessages.appendChild(messageDiv);
    scrollToBottom();
}

function handleSendClick() {
    if (isGenerating) {
        if (currentAbortController) currentAbortController.abort();
        return;
    }
    const message = userInput.value.trim();
    if (!message) return;
    
    userInput.value = '';
    userInput.style.height = 'auto';
    processPrompt(message);
}

async function processPrompt(message) {
    const session = getCurrentSession();
    welcomeScreen.style.display = 'none';

    if (session.history.length === 0) {
        session.title = message.substring(0, 30) + (message.length > 30 ? '...' : '');
        renderHistoryList();
    }

    userInput.disabled = true;
    userInput.style.opacity = '0.5';
    toggleSendButton(true);

    const newIndex = session.history.length;
    session.history.push({role: 'user', content: message});
    renderStaticMessage('user', message, newIndex);
    saveSessions();

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant';
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content streaming-cursor'; 
    
    const thinkingContainer = document.createElement('div');
    thinkingContainer.className = 'thinking-container';
    thinkingContainer.style.display = 'none';
    thinkingContainer.innerHTML = `
        <div class="thinking-header open"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg><span>Thinking Process</span></div>
        <div class="thinking-content open"></div>
    `;
    thinkingContainer.querySelector('.thinking-header').addEventListener('click', function() {
        this.classList.toggle('open');
        thinkingContainer.querySelector('.thinking-content').classList.toggle('open');
    });

    const finalAnswerDiv = document.createElement('div');
    contentDiv.appendChild(thinkingContainer);
    contentDiv.appendChild(finalAnswerDiv);
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);
    scrollToBottom();

    let fullContent = "";
    let thinkingText = "";
    let isThinking = false;

    currentAbortController = new AbortController();
    const signal = currentAbortController.signal;

    try {
        const currentModel = modelSelect.value;
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: currentModel, messages: session.history }),
            signal: signal
        });

        if (!response.ok) throw new Error(`Server error: ${response.status}`);

        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let buffer = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); 

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataStr = line.substring(6).trim();
                    if (dataStr === '[DONE]') continue;
                    
                    try {
                        const data = JSON.parse(dataStr);
                        
                        if (data.usage && data.usage.total_tokens) {
                            const prices = MODEL_PRICING[currentModel] || { input: 0, output: 0 };
                            session.totalTokens += data.usage.total_tokens;
                            session.inputTokens += data.usage.prompt_tokens;
                            session.outputTokens += data.usage.completion_tokens;
                            session.totalCost += ((data.usage.prompt_tokens / 1000000) * prices.input) + ((data.usage.completion_tokens / 1000000) * prices.output);
                            updateTokenDisplay();
                        }

                        if (data.choices && data.choices[0].delta) {
                            const delta = data.choices[0].delta;
                            
                            if (delta.reasoning_content) {
                                thinkingContainer.style.display = 'block';
                                thinkingText += delta.reasoning_content;
                                thinkingContainer.querySelector('.thinking-content').innerText = thinkingText;
                                scrollToBottom();
                            }
                            
                            if (delta.content !== undefined && delta.content !== null) {
                                let chunk = delta.content;
                                
                                if (chunk.includes('<think>')) {
                                    isThinking = true;
                                    thinkingContainer.style.display = 'block';
                                    chunk = chunk.replace('<think>', '');
                                }
                                
                                if (isThinking) {
                                    if (chunk.includes('</think>')) {
                                        isThinking = false;
                                        thinkingContainer.querySelector('.thinking-header').classList.remove('open');
                                        thinkingContainer.querySelector('.thinking-content').classList.remove('open');
                                        let split = chunk.split('</think>');
                                        thinkingText += split[0];
                                        thinkingContainer.querySelector('.thinking-content').innerText = thinkingText;
                                        fullContent += split[1];
                                        finalAnswerDiv.innerHTML = DOMPurify.sanitize(marked.parse(fullContent));
                                    } else {
                                        thinkingText += chunk;
                                        thinkingContainer.querySelector('.thinking-content').innerText = thinkingText;
                                    }
                                } else {
                                    if (thinkingText.length > 0 && thinkingContainer.querySelector('.thinking-header').classList.contains('open')) {
                                        thinkingContainer.querySelector('.thinking-header').classList.remove('open');
                                        thinkingContainer.querySelector('.thinking-content').classList.remove('open');
                                    }
                                    fullContent += chunk;
                                    finalAnswerDiv.innerHTML = DOMPurify.sanitize(marked.parse(fullContent));
                                }
                                scrollToBottom();
                            }
                        }
                    } catch (e) {
                    }
                }
            }
        }
        
        if (fullContent === "" && buffer.trim().startsWith('{')) {
            try {
                const flatData = JSON.parse(buffer);
                if (flatData.choices && flatData.choices[0].message) {
                    fullContent = flatData.choices[0].message.content;
                    finalAnswerDiv.innerHTML = DOMPurify.sanitize(marked.parse(fullContent));
                    
                    if (flatData.usage) {
                         const prices = MODEL_PRICING[currentModel] || { input: 0, output: 0 };
                         session.totalTokens += flatData.usage.total_tokens;
                         session.inputTokens += flatData.usage.prompt_tokens;
                         session.outputTokens += flatData.usage.completion_tokens;
                         session.totalCost += ((flatData.usage.prompt_tokens / 1000000) * prices.input) + ((flatData.usage.completion_tokens / 1000000) * prices.output);
                         updateTokenDisplay();
                    }
                }
            } catch(e) {}
        }

    } catch (error) {
        if (error.name === 'AbortError') {
            finalAnswerDiv.innerHTML += "<br><br><em>[Generation stopped by user]</em>";
            fullContent += "\n\n*[Generation stopped by user]*";
        } else {
            finalAnswerDiv.innerHTML = `<strong>Error:</strong> ${error.message}`;
        }
    } finally {
        contentDiv.classList.remove('streaming-cursor');
        toggleSendButton(false);
        userInput.disabled = false;
        userInput.style.opacity = '1';
        userInput.focus();
        
        let savedContent = fullContent;
        if (thinkingText.length > 0) savedContent = `<think>\n${thinkingText}\n</think>\n` + fullContent;
        if (savedContent.trim() !== '') {
            session.history.push({role: 'assistant', content: savedContent});
            saveSessions();
            formatCodeBlocks(finalAnswerDiv);
        }
    }
}

function formatCodeBlocks(container) {
    const preElements = container.querySelectorAll('pre');
    preElements.forEach(pre => {
        if (pre.parentElement.classList.contains('code-container')) return; 
        const codeElement = pre.querySelector('code');
        if (!codeElement) return;

        const langClass = codeElement.className.match(/language-(\w+)/);
        const language = langClass ? langClass[1] : 'text';

        const wrapper = document.createElement('div');
        wrapper.className = 'code-container';
        const header = document.createElement('div');
        header.className = 'code-header';
        
        header.innerHTML = `<span>${language}</span><button class="copy-btn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg><span>Copy code</span></button>`;
        pre.parentNode.insertBefore(wrapper, pre);
        wrapper.appendChild(header);
        wrapper.appendChild(pre);

        const copyBtn = header.querySelector('.copy-btn');
        copyBtn.addEventListener('click', () => {
            navigator.clipboard.writeText(codeElement.innerText).then(() => {
                const textSpan = copyBtn.querySelector('span');
                textSpan.textContent = 'Copied!';
                setTimeout(() => textSpan.textContent = 'Copy code', 2000);
            });
        });
    });
}

function updateTokenDisplay() {
    const session = getCurrentSession();
    if (!session) return;
    sessionTokensSpan.textContent = session.totalTokens.toLocaleString();
    inputTokensSpan.textContent = session.inputTokens.toLocaleString();
    outputTokensSpan.textContent = session.outputTokens.toLocaleString();
    sessionCostSpan.textContent = '$' + session.totalCost.toFixed(5);
}

// --- TOKENIZER VISUALIZATION LOGIC ---

// Heuristic approximation of BPE Tokenization
function approximateTokens(text) {
    // 1. Split by words, keeping whitespace attached to the start of words
    const regex = / ?[A-Za-z]+| ?[0-9]+| ?[^A-Za-z0-9\s]+|\s+(?!\S)|\s+/g;
    const matches = text.match(regex) || [];
    let tokens = [];
    
    matches.forEach(match => {
        // 2. Break long words into smaller chunks to simulate subword tokens
        if (match.length > 5 && !/\s+/.test(match)) {
            for (let i = 0; i < match.length; i += 4) {
                tokens.push(match.substring(i, i + 4));
            }
        } else {
            tokens.push(match);
        }
    });
    return tokens;
}

function openTokenizerModal() {
    const session = getCurrentSession();
    if (!session || session.history.length === 0) {
        visualizerBox.innerHTML = "<em>No prompts found in current session. Type a message first!</em>";
        modalTokenCount.textContent = "0";
        tokenizerModal.style.display = 'flex';
        return;
    }

    // Find the last user message
    const userMessages = session.history.filter(msg => msg.role === 'user');
    const lastPrompt = userMessages[userMessages.length - 1].content;

    // Apply token approximation
    const tokens = approximateTokens(lastPrompt);
    
    visualizerBox.innerHTML = '';
    tokens.forEach((token, index) => {
        const span = document.createElement('span');
        span.textContent = token;
        // Cycle through the 5 CSS colors
        span.className = `token-chunk token-color-${index % 5}`;
        visualizerBox.appendChild(span);
    });

    modalTokenCount.textContent = tokens.length.toLocaleString();
    tokenizerModal.style.display = 'flex';
}

// Modal Event Listeners
tokenizerBtn.addEventListener('click', openTokenizerModal);
closeModalBtn.addEventListener('click', () => tokenizerModal.style.display = 'none');
window.addEventListener('click', (e) => {
    if (e.target === tokenizerModal) tokenizerModal.style.display = 'none';
});

userInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight < 200 ? this.scrollHeight : 200) + 'px';
});

document.addEventListener('DOMContentLoaded', () => {
    init();
    userInput.focus();

    sendBtn.addEventListener('click', handleSendClick);
    newChatBtn.addEventListener('click', createNewSession);
    
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!isGenerating) handleSendClick();
        }
    });
});