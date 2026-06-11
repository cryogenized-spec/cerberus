import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, Mic, MicOff, Settings, Plus, Trash2, Edit2, Zap, Key, MessageSquare, Menu, X, User 
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Provider, Message, Chat, ApiKeys, Settings as AppSettings } from './types';

const DEFAULT_SETTINGS: AppSettings = {
  temperature: 0.8,
  maxTokens: 2048,
  topP: 0.95,
  systemPrompt: "You are Cerberus, a helpful, witty, and direct AI assistant. Be concise unless asked otherwise. Never refuse safe requests."
};

const PROVIDERS: { id: Provider; name: string; model: string; color: string }[] = [
  { id: 'gemini', name: 'Gemini', model: 'gemini-3.5-flash', color: '#4285F4' },
  { id: 'openai', name: 'OpenAI', model: 'gpt-4o-mini', color: '#10A37F' },
  { id: 'xai', name: 'xAI (Grok)', model: 'grok-4.3', color: '#000000' },
];

function App() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false); // Mobile drawer
  const [currentProvider, setCurrentProvider] = useState<Provider>('gemini');
  const [apiKeys, setApiKeys] = useState<ApiKeys>({ gemini: '', openai: '', xai: '' });
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [apiLog, setApiLog] = useState<string[]>([]);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [characterAvatar, setCharacterAvatar] = useState<string | null>(null); // Base64 avatar

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentChat = chats.find(c => c.id === currentChatId);

  // Load from localStorage
  useEffect(() => {
    const savedChats = localStorage.getItem('cerberus_chats');
    if (savedChats) setChats(JSON.parse(savedChats));

    const savedKeys = localStorage.getItem('cerberus_api_keys');
    if (savedKeys) setApiKeys(JSON.parse(savedKeys));

    const savedSettings = localStorage.getItem('cerberus_settings');
    if (savedSettings) setSettings(JSON.parse(savedSettings));

    const savedProvider = localStorage.getItem('cerberus_provider') as Provider;
    if (savedProvider) setCurrentProvider(savedProvider);

    const savedAvatar = localStorage.getItem('cerberus_avatar');
    if (savedAvatar) setCharacterAvatar(savedAvatar);

    if (!savedChats || JSON.parse(savedChats).length === 0) {
      createNewChat();
    }
  }, []);

  // Save to localStorage
  useEffect(() => { localStorage.setItem('cerberus_chats', JSON.stringify(chats)); }, [chats]);
  useEffect(() => { localStorage.setItem('cerberus_api_keys', JSON.stringify(apiKeys)); }, [apiKeys]);
  useEffect(() => { localStorage.setItem('cerberus_settings', JSON.stringify(settings)); }, [settings]);
  useEffect(() => { localStorage.setItem('cerberus_provider', currentProvider); }, [currentProvider]);
  useEffect(() => { 
    if (characterAvatar) localStorage.setItem('cerberus_avatar', characterAvatar); 
    else localStorage.removeItem('cerberus_avatar');
  }, [characterAvatar]);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentChat?.messages, isLoading]);

  // Voice setup (same as before)
  useEffect(() => {
    if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
      const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognitionAPI();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(prev => (prev ? prev + ' ' : '') + transcript);
        setIsListening(false);
      };
      recognitionRef.current.onerror = () => { setIsListening(false); addToLog('Voice error'); };
      recognitionRef.current.onend = () => setIsListening(false);
    }
  }, []);

  const createNewChat = () => {
    const newChat: Chat = { id: Date.now().toString(36), title: 'New Conversation', messages: [], createdAt: Date.now(), updatedAt: Date.now() };
    setChats(prev => [newChat, ...prev]);
    setCurrentChatId(newChat.id);
    setInput('');
    setShowDrawer(false);
  };

  const deleteChat = (id: string) => {
    if (chats.length === 1) { createNewChat(); setChats(prev => prev.filter(c => c.id !== id)); return; }
    const remaining = chats.filter(c => c.id !== id);
    setChats(remaining);
    if (currentChatId === id) setCurrentChatId(remaining[0].id);
  };

  const updateChatTitle = (id: string, newTitle: string) => {
    setChats(prev => prev.map(chat => chat.id === id ? { ...chat, title: newTitle || 'Untitled' } : chat));
    setEditingChatId(null); setEditTitle('');
  };

  const addMessage = (role: 'user' | 'assistant', content: string) => {
    if (!currentChatId) return;
    const newMessage: Message = { id: Date.now().toString(36), role, content, timestamp: Date.now() };
    setChats(prev => prev.map(chat => {
      if (chat.id === currentChatId) {
        const updated = [...chat.messages, newMessage];
        let newTitle = chat.title;
        if (chat.messages.length === 0 && role === 'user') newTitle = content.slice(0, 40) + (content.length > 40 ? '...' : '');
        return { ...chat, messages: updated, title: newTitle, updatedAt: Date.now() };
      }
      return chat;
    }));
  };

  const addToLog = (message: string) => {
    const ts = new Date().toLocaleTimeString();
    setApiLog(prev => [`[${ts}] ${message}`, ...prev].slice(0, 50));
  };

  const sendMessage = async () => {
    if (!input.trim() || !currentChatId || isLoading) return;
    const userMessage = input.trim();
    setInput('');
    addMessage('user', userMessage);
    setIsLoading(true);

    const key = apiKeys[currentProvider];
    if (!key) {
      addMessage('assistant', `Add your ${PROVIDERS.find(p => p.id === currentProvider)?.name} key in Settings.`);
      setIsLoading(false); setShowSettings(true); return;
    }

    try {
      const msgs = currentChat?.messages || [];
      const full = [{ role: 'system', content: settings.systemPrompt }, ...msgs.map(m => ({role: m.role, content: m.content})), { role: 'user', content: userMessage }];
      let text = '';

      if (currentProvider === 'gemini') {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${PROVIDERS[0].model}:generateContent?key=${key}`;
        const body = { contents: [{ parts: [{ text: full.map(m => `${m.role}: ${m.content}`).join('\n\n') }] }], generationConfig: { temperature: settings.temperature, maxOutputTokens: settings.maxTokens, topP: settings.topP }, safetySettings: [ {category:"HARM_CATEGORY_HARASSMENT",threshold:"BLOCK_NONE"}, {category:"HARM_CATEGORY_HATE_SPEECH",threshold:"BLOCK_NONE"}, {category:"HARM_CATEGORY_SEXUALLY_EXPLICIT",threshold:"BLOCK_NONE"}, {category:"HARM_CATEGORY_DANGEROUS_CONTENT",threshold:"BLOCK_NONE"} ] };
        addToLog(`Gemini → temp:${settings.temperature}`);
        const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response.';
      } else {
        const isX = currentProvider === 'xai';
        const base = isX ? 'https://api.x.ai/v1' : 'https://api.openai.com/v1';
        const model = PROVIDERS.find(p => p.id === currentProvider)?.model || 'gpt-4o-mini';
        const body = { model, messages: full, temperature: settings.temperature, max_tokens: settings.maxTokens, top_p: settings.topP };
        addToLog(`${isX ? 'xAI' : 'OpenAI'} → ${model}`);
        const res = await fetch(`${base}/chat/completions`, { method:'POST', headers:{'Content-Type':'application/json', 'Authorization':`Bearer ${key}`}, body:JSON.stringify(body) });
        const data = await res.json();
        if (data.error) throw new Error(data.error.message);
        text = data.choices?.[0]?.message?.content || 'No response.';
      }
      addMessage('assistant', text);
      addToLog(`Response (${text.length} chars)`);
    } catch(e: any) {
      const msg = `Error: ${e.message}`;
      addMessage('assistant', msg); addToLog(msg);
    } finally { setIsLoading(false); }
  };

  const toggleVoice = () => {
    if (!recognitionRef.current) { alert('Voice not supported. Use Chrome/Edge.'); return; }
    if (isListening) { recognitionRef.current.stop(); setIsListening(false); }
    else { try { recognitionRef.current.start(); setIsListening(true); } catch { addToLog('Voice failed'); setIsListening(false); } }
  };

  const editLast = () => {
    if (!currentChat) return;
    const last = [...currentChat.messages].reverse().find(m => m.role === 'user');
    if (last) setInput(last.content);
  };

  const handleKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } };

  const updateSetting = (k: keyof AppSettings, v: any) => setSettings(p => ({...p, [k]: v}));
  const updateKey = (p: Provider, v: string) => setApiKeys(prev => ({...prev, [p]: v}));

  // Avatar upload
  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      setCharacterAvatar(base64);
    };
    reader.readAsDataURL(file);
  };

  const removeAvatar = () => setCharacterAvatar(null);

  return (
    <div className="flex h-[100dvh] bg-[#0a0a0c] text-white overflow-hidden">
      {/* Mobile Drawer for History */}
      {showDrawer && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setShowDrawer(false)}>
          <div className="absolute left-0 top-0 h-full w-72 bg-[#1a0505] border-r border-[#4a0e0e] p-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <div className="font-semibold">Chats</div>
              <button onClick={() => setShowDrawer(false)}><X size={20} /></button>
            </div>
            <button onClick={createNewChat} className="w-full mb-3 flex items-center justify-center gap-2 py-2 bg-[#d4af37] text-black rounded-2xl font-medium">
              <Plus size={16} /> New Chat
            </button>
            <div className="space-y-1 overflow-y-auto max-h-[70vh]">
              {chats.map(chat => (
                <div key={chat.id} onClick={() => { setCurrentChatId(chat.id); setShowDrawer(false); }} className={`px-3 py-2.5 rounded-2xl cursor-pointer ${currentChatId === chat.id ? 'bg-[#4a0e0e]' : 'hover:bg-[#2d0a0a]'}`}>
                  <div className="font-medium truncate text-sm">{chat.title}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Sidebar (Desktop only) */}
      <div className="hidden md:flex w-72 bg-[#1a0505] border-r border-[#4a0e0e] flex-col">
        <div className="p-4 border-b border-[#4a0e0e] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#7f1d1d] to-[#d4af37] flex items-center justify-center">
              <span className="font-bold text-xl tracking-tighter">C</span>
            </div>
            <div>
              <div className="font-semibold text-xl tracking-tight">Cerberus</div>
              <div className="text-[10px] text-[#d4af37]/70 -mt-1">PRIVATE AI</div>
            </div>
          </div>
          <button onClick={createNewChat} className="p-2 hover:bg-[#4a0e0e] rounded-xl"><Plus size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {chats.length === 0 && <div className="text-center text-sm text-white/50 py-8">No chats</div>}
          {chats.map(chat => (
            <div key={chat.id} onClick={() => setCurrentChatId(chat.id)} className={`group px-3 py-2.5 rounded-2xl cursor-pointer flex justify-between items-center ${currentChatId === chat.id ? 'bg-[#4a0e0e]' : 'hover:bg-[#2d0a0a]'}`}>
              <div className="min-w-0">
                {editingChatId === chat.id ? (
                  <input type="text" value={editTitle} onChange={e=>setEditTitle(e.target.value)} onBlur={()=>updateChatTitle(chat.id, editTitle)} onKeyDown={e=>{if(e.key==='Enter')updateChatTitle(chat.id,editTitle); if(e.key==='Escape'){setEditingChatId(null);setEditTitle('');}}} className="bg-black/50 w-full px-2 py-1 rounded text-sm" autoFocus />
                ) : <div className="font-medium truncate text-sm">{chat.title}</div> }
                <div className="text-[10px] text-white/40">{new Date(chat.updatedAt).toLocaleDateString()}</div>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                <button onClick={e=>{e.stopPropagation(); setEditingChatId(chat.id); setEditTitle(chat.title);}} className="p-1.5 hover:bg-white/10 rounded"><Edit2 size={14}/></button>
                <button onClick={e=>{e.stopPropagation(); deleteChat(chat.id);}} className="p-1.5 hover:bg-red-900/30 rounded text-red-400"><Trash2 size={14}/></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar - Mobile Friendly */}
        <div className="h-14 border-b border-[#4a0e0e] px-4 md:px-6 flex items-center justify-between bg-[#1a0505]/90 backdrop-blur z-40">
          <div className="flex items-center gap-3">
            {/* Mobile Menu Button */}
            <button onClick={() => setShowDrawer(true)} className="md:hidden p-2 -ml-2">
              <Menu size={20} />
            </button>
            
            <div className="flex items-center gap-3">
              {characterAvatar ? (
                <img src={characterAvatar} alt="Character" className="w-8 h-8 rounded-full object-cover border border-[#d4af37]/30" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#7f1d1d] to-[#d4af37] flex items-center justify-center">
                  <User size={16} className="text-black" />
                </div>
              )}
              <div>
                <div className="font-semibold tracking-tight">Cerberus</div>
                <div className="text-[10px] text-white/50 -mt-0.5">{PROVIDERS.find(p => p.id === currentProvider)?.name}</div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => setShowSettings(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm hover:bg-white/5 rounded-2xl border border-white/10">
              <Settings size={16} /> <span className="hidden sm:inline">Settings</span>
            </button>
            <button onClick={createNewChat} className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white/5 hover:bg-white/10 rounded-2xl">
              <Plus size={16} /> New
            </button>
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto chat-container px-4 md:px-6 py-6 bg-[#0a0a0c]" style={{ aspectRatio: '9 / 16' }}>
          {!currentChat || currentChat.messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-[#7f1d1d] to-black flex items-center justify-center mb-5">
                <MessageSquare size={32} className="text-[#d4af37]" />
              </div>
              <h2 className="text-2xl font-semibold tracking-tight mb-2">Cerberus is listening.</h2>
              <p className="text-white/60 max-w-xs">Tap the mic or type to begin. Your data stays private.</p>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-5">
              {currentChat.messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-4 py-3 rounded-3xl text-[15px] leading-relaxed ${msg.role === 'user' ? 'bg-[#d4af37] text-black rounded-br-none' : 'bg-[#1a0505] border border-[#4a0e0e]'}`}>
                    {msg.role === 'assistant' && characterAvatar && (
                      <div className="flex items-center gap-2 mb-1.5">
                        <img src={characterAvatar} className="w-5 h-5 rounded-full object-cover" alt="" />
                        <span className="text-xs text-[#d4af37]/70 font-mono tracking-widest">CERBERUS</span>
                      </div>
                    )}
                    <div className="prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              ))}
              {isLoading && <div className="text-white/60 text-sm pl-1">Cerberus is thinking…</div>}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input - Mobile Optimized */}
        <div className="border-t border-[#4a0e0e] p-3 bg-[#1a0505] safe-area-bottom">
          <div className="max-w-2xl mx-auto flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Message Cerberus..."
              className="flex-1 bg-[#0a0a0c] border border-[#4a0e0e] rounded-3xl px-5 py-3 text-[15px] resize-none max-h-32 outline-none placeholder:text-white/40"
              rows={1}
            />
            <button onClick={toggleVoice} className={`p-3.5 rounded-3xl transition-all ${isListening ? 'bg-red-600' : 'bg-[#1a0505] border border-[#4a0e0e] hover:bg-[#2d0a0a]'}`}>
              {isListening ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            <button onClick={editLast} className="p-3.5 rounded-3xl border border-[#4a0e0e] hover:bg-[#2d0a0a]">
              <Edit2 size={17} />
            </button>
            <button onClick={sendMessage} disabled={!input.trim() || isLoading} className="p-3.5 bg-[#d4af37] text-black rounded-3xl disabled:opacity-50 active:scale-95 transition-transform">
              <Send size={18} />
            </button>
          </div>
          <div className="text-center text-[9px] text-white/30 mt-1.5 tracking-widest">9:16 MOBILE • LOCAL ONLY</div>
        </div>
      </div>

      {/* Settings Modal with Avatar Upload */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/90 z-[60] flex items-center justify-center p-4" onClick={() => setShowSettings(false)}>
          <div className="settings-modal bg-[#1a0505] border border-[#4a0e0e] rounded-3xl w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col" onClick={e=>e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4 border-b border-[#4a0e0e] flex justify-between items-center">
              <div className="text-xl font-semibold tracking-tight">Settings</div>
              <button onClick={() => setShowSettings(false)}><X size={20}/></button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-8 text-sm">
              {/* Avatar Upload */}
              <div>
                <div className="flex items-center gap-2 mb-3 text-[#d4af37]">
                  <User size={16} /> <span className="font-medium tracking-widest text-xs">CHARACTER AVATAR</span>
                </div>
                <div className="flex items-center gap-4">
                  {characterAvatar ? (
                    <img src={characterAvatar} alt="Avatar" className="w-16 h-16 rounded-2xl object-cover border-2 border-[#d4af37]/30" />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-[#2d0a0a] flex items-center justify-center border border-[#4a0e0e]">
                      <User size={28} className="text-white/40" />
                    </div>
                  )}
                  <div className="flex-1">
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                    <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-2xl text-sm w-full mb-2">
                      Upload Photo
                    </button>
                    {characterAvatar && <button onClick={removeAvatar} className="text-xs text-red-400 hover:text-red-500">Remove avatar</button>}
                  </div>
                </div>
                <p className="text-[10px] text-white/40 mt-1">Appears next to Cerberus messages</p>
              </div>

              {/* Rest of settings (keys, params, prompt, log) - same as before but compacted for mobile */}
              <div>
                <div className="flex items-center gap-2 mb-3 text-[#d4af37]"><Key size={16} /> <span className="font-medium tracking-widest text-xs">API KEYS</span></div>
                {PROVIDERS.map(p => (
                  <div key={p.id} className="flex items-center gap-3 mb-3">
                    <div className="w-20 text-xs text-white/70">{p.name}</div>
                    <input type="password" value={apiKeys[p.id]} onChange={e => updateKey(p.id, e.target.value)} placeholder="API Key" className="flex-1 bg-black border border-[#4a0e0e] rounded-2xl px-4 py-2 text-sm font-mono" />
                    <button onClick={() => setCurrentProvider(p.id)} className={`text-xs px-3 py-1 rounded-2xl border ${currentProvider === p.id ? 'border-[#d4af37] bg-[#d4af37]/10' : 'border-white/20'}`}>Use</button>
                  </div>
                ))}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-3 text-[#d4af37]"><Zap size={16} /> <span className="font-medium tracking-widest text-xs">PARAMETERS</span></div>
                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-1"><span>Temperature</span><span className="font-mono text-[#d4af37]">{settings.temperature}</span></div>
                  <input type="range" min="0" max="2" step="0.1" value={settings.temperature} onChange={e=>updateSetting('temperature', parseFloat(e.target.value))} className="w-full accent-[#d4af37]" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><div className="text-xs mb-1">Max Tokens</div><input type="number" value={settings.maxTokens} onChange={e=>updateSetting('maxTokens', parseInt(e.target.value))} className="w-full bg-black border border-[#4a0e0e] rounded-2xl px-3 py-2 text-sm" /></div>
                  <div><div className="text-xs mb-1">Top P</div><input type="number" step="0.05" value={settings.topP} onChange={e=>updateSetting('topP', parseFloat(e.target.value))} className="w-full bg-black border border-[#4a0e0e] rounded-2xl px-3 py-2 text-sm" /></div>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2 text-[#d4af37]"><MessageSquare size={16} /> <span className="font-medium tracking-widest text-xs">SYSTEM PROMPT</span></div>
                <textarea value={settings.systemPrompt} onChange={e=>updateSetting('systemPrompt', e.target.value)} className="w-full h-28 bg-black border border-[#4a0e0e] rounded-3xl p-4 text-sm resize-y font-mono" />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2 text-[#d4af37]"><span className="font-medium tracking-widest text-xs">API LOG</span></div>
                  <button onClick={()=>setApiLog([])} className="text-xs">Clear</button>
                </div>
                <div className="bg-black border border-[#4a0e0e] rounded-3xl p-3 h-32 overflow-y-auto text-xs font-mono text-white/70">
                  {apiLog.length === 0 ? <span className="text-white/40">No calls yet</span> : apiLog.map((l,i)=><div key={i}>{l}</div>)}
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-[#4a0e0e] flex gap-3">
              <button onClick={() => setShowSettings(false)} className="flex-1 py-3 rounded-2xl hover:bg-white/5">Close</button>
              <button onClick={() => setShowSettings(false)} className="flex-1 py-3 bg-[#d4af37] text-black rounded-2xl font-medium">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;