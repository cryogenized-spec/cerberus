import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, Mic, MicOff, Settings, Plus, Trash2, Edit2, Zap, Key, MessageSquare 
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
  const [currentProvider, setCurrentProvider] = useState<Provider>('gemini');
  const [apiKeys, setApiKeys] = useState<ApiKeys>({ gemini: '', openai: '', xai: '' });
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [apiLog, setApiLog] = useState<string[]>([]);
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

    // Create initial chat if none
    if (!savedChats || JSON.parse(savedChats).length === 0) {
      createNewChat();
    }
  }, []);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem('cerberus_chats', JSON.stringify(chats));
  }, [chats]);

  useEffect(() => {
    localStorage.setItem('cerberus_api_keys', JSON.stringify(apiKeys));
  }, [apiKeys]);

  useEffect(() => {
    localStorage.setItem('cerberus_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem('cerberus_provider', currentProvider);
  }, [currentProvider]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentChat?.messages, isLoading]);

  // Voice recognition setup
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

      recognitionRef.current.onerror = () => {
        setIsListening(false);
        addToLog('Voice recognition error');
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const createNewChat = () => {
    const newChat: Chat = {
      id: Date.now().toString(36),
      title: 'New Conversation',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setChats(prev => [newChat, ...prev]);
    setCurrentChatId(newChat.id);
    setInput('');
  };

  const deleteChat = (id: string) => {
    if (chats.length === 1) {
      createNewChat();
      setChats(prev => prev.filter(c => c.id !== id));
      return;
    }
    const remaining = chats.filter(c => c.id !== id);
    setChats(remaining);
    if (currentChatId === id) {
      setCurrentChatId(remaining[0].id);
    }
  };

  const updateChatTitle = (id: string, newTitle: string) => {
    setChats(prev => prev.map(chat => 
      chat.id === id ? { ...chat, title: newTitle || 'Untitled' } : chat
    ));
    setEditingChatId(null);
    setEditTitle('');
  };

  const addMessage = (role: 'user' | 'assistant', content: string) => {
    if (!currentChatId) return;

    const newMessage: Message = {
      id: Date.now().toString(36),
      role,
      content,
      timestamp: Date.now(),
    };

    setChats(prev => prev.map(chat => {
      if (chat.id === currentChatId) {
        const updatedMessages = [...chat.messages, newMessage];
        // Auto title from first user message
        let newTitle = chat.title;
        if (chat.messages.length === 0 && role === 'user') {
          newTitle = content.slice(0, 40) + (content.length > 40 ? '...' : '');
        }
        return {
          ...chat,
          messages: updatedMessages,
          title: newTitle,
          updatedAt: Date.now(),
        };
      }
      return chat;
    }));
  };

  const addToLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setApiLog(prev => [`[${timestamp}] ${message}`, ...prev].slice(0, 50));
  };

  // Main send function
  const sendMessage = async () => {
    if (!input.trim() || !currentChatId || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    addMessage('user', userMessage);

    setIsLoading(true);

    const currentApiKey = apiKeys[currentProvider];
    if (!currentApiKey) {
      addMessage('assistant', `Please add your ${PROVIDERS.find(p => p.id === currentProvider)?.name} API key in Settings.`);
      setIsLoading(false);
      setShowSettings(true);
      return;
    }

    try {
      const messagesForAPI = currentChat?.messages || [];
      const fullMessages = [
        { role: 'system', content: settings.systemPrompt },
        ...messagesForAPI.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage }
      ];

      let responseText = '';

      if (currentProvider === 'gemini') {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${PROVIDERS[0].model}:generateContent?key=${currentApiKey}`;
        
        const geminiBody = {
          contents: [{ parts: [{ text: fullMessages.map(m => `${m.role}: ${m.content}`).join('\n\n') }] }],
          generationConfig: {
            temperature: settings.temperature,
            maxOutputTokens: settings.maxTokens,
            topP: settings.topP,
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
          ]
        };

        addToLog(`Gemini request \u2192 temp:${settings.temperature}`);
        
        const res = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geminiBody)
        });

        const data = await res.json();
        
        if (data.error) {
          throw new Error(data.error.message || 'Gemini API error');
        }
        
        responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from Gemini.';
        
      } else if (currentProvider === 'openai' || currentProvider === 'xai') {
        const isXAI = currentProvider === 'xai';
        const baseUrl = isXAI ? 'https://api.x.ai/v1' : 'https://api.openai.com/v1';
        const model = PROVIDERS.find(p => p.id === currentProvider)?.model || 'gpt-4o-mini';

        const openaiBody = {
          model,
          messages: fullMessages,
          temperature: settings.temperature,
          max_tokens: settings.maxTokens,
          top_p: settings.topP,
        };

        addToLog(`${isXAI ? 'xAI' : 'OpenAI'} request \u2192 model:${model}`);

        const res = await fetch(`${baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentApiKey}`,
          },
          body: JSON.stringify(openaiBody)
        });

        const data = await res.json();

        if (data.error) {
          throw new Error(data.error.message || 'API error');
        }

        responseText = data.choices?.[0]?.message?.content || 'No response.';
      }

      addMessage('assistant', responseText);
      addToLog(`Response received (${responseText.length} chars)`);

    } catch (error: any) {
      console.error(error);
      const errorMsg = `Error: ${error.message || 'Failed to get response'}`;
      addMessage('assistant', errorMsg);
      addToLog(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  // Voice to text
  const toggleVoiceInput = () => {
    if (!recognitionRef.current) {
      alert('Voice recognition not supported in this browser. Try Chrome or Edge.');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {
        addToLog('Voice start failed');
        setIsListening(false);
      }
    }
  };

  // Edit message (simple inline for last user message)
  const editLastMessage = () => {
    if (!currentChat || currentChat.messages.length === 0) return;
    
    const lastUserMsg = [...currentChat.messages].reverse().find(m => m.role === 'user');
    if (lastUserMsg) {
      setInput(lastUserMsg.content);
    }
  };

  // Handle key press
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Update settings
  const updateSetting = (key: keyof AppSettings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  // Update API key
  const updateApiKey = (provider: Provider, value: string) => {
    setApiKeys(prev => ({ ...prev, [provider]: value }));
  };

  return (
    <div className="flex h-screen bg-[#0a0a0c] text-white overflow-hidden">
      {/* Sidebar - Chat History */}
      <div className="w-72 bg-[#1a0505] border-r border-[#4a0e0e] flex flex-col">
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
          <button 
            onClick={createNewChat}
            className="p-2 hover:bg-[#4a0e0e] rounded-xl transition-colors"
            title="New Chat"
          >
            <Plus size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {chats.length === 0 && (
            <div className="text-center text-sm text-white/50 py-8">No chats yet</div>
          )}
          {chats.map(chat => (
            <div 
              key={chat.id}
              onClick={() => setCurrentChatId(chat.id)}
              className={`group flex items-center justify-between px-3 py-2.5 rounded-2xl cursor-pointer transition-all ${
                currentChatId === chat.id 
                  ? 'bg-[#4a0e0e] text-white' 
                  : 'hover:bg-[#2d0a0a] text-white/80'
              }`}
            >
              <div className="flex-1 min-w-0 pr-2">
                {editingChatId === chat.id ? (
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onBlur={() => updateChatTitle(chat.id, editTitle)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') updateChatTitle(chat.id, editTitle);
                      if (e.key === 'Escape') { setEditingChatId(null); setEditTitle(''); }
                    }}
                    className="bg-black/50 w-full px-2 py-1 rounded text-sm outline-none border border-[#d4af37]/30"
                    autoFocus
                  />
                ) : (
                  <div className="font-medium truncate text-sm">{chat.title}</div>
                )}
                <div className="text-[10px] text-white/40 mt-0.5">
                  {new Date(chat.updatedAt).toLocaleDateString()}
                </div>
              </div>
              
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={(e) => { e.stopPropagation(); setEditingChatId(chat.id); setEditTitle(chat.title); }}
                  className="p-1.5 hover:bg-white/10 rounded-lg"
                >
                  <Edit2 size={14} />
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); deleteChat(chat.id); }}
                  className="p-1.5 hover:bg-red-900/30 hover:text-red-400 rounded-lg"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-[#4a0e0e] text-xs text-white/40 text-center">
          {chats.length} conversation{chats.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <div className="h-14 border-b border-[#4a0e0e] px-6 flex items-center justify-between bg-[#1a0505]/80 backdrop-blur-lg z-10">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: PROVIDERS.find(p => p.id === currentProvider)?.color }}
              />
              <span className="font-medium">{PROVIDERS.find(p => p.id === currentProvider)?.name}</span>
              <span className="text-xs px-2 py-0.5 bg-white/10 rounded-full text-white/60">
                {PROVIDERS.find(p => p.id === currentProvider)?.model}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 px-4 py-1.5 text-sm hover:bg-white/5 rounded-2xl transition-colors border border-white/10"
            >
              <Settings size={16} /> Settings
            </button>
            <button 
              onClick={createNewChat}
              className="flex items-center gap-2 px-4 py-1.5 text-sm bg-white/5 hover:bg-white/10 rounded-2xl transition-colors"
            >
              <Plus size={16} /> New Chat
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto chat-container px-6 py-8 bg-[#0a0a0c]">
          {!currentChat || currentChat.messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#7f1d1d] via-[#4a0e0e] to-black flex items-center justify-center mb-6">
                <MessageSquare size={42} className="text-[#d4af37]" />
              </div>
              <h2 className="text-3xl font-semibold tracking-tighter mb-2">Cerberus is ready.</h2>
              <p className="text-white/60 mb-8">Start a conversation. Your keys and data stay in your browser.</p>
              
              <div className="grid grid-cols-1 gap-2 w-full max-w-xs text-sm">
                {PROVIDERS.map(p => (
                  <button 
                    key={p.id}
                    onClick={() => setCurrentProvider(p.id)}
                    className={`px-4 py-3 rounded-2xl border flex items-center justify-between transition-all ${currentProvider === p.id ? 'border-[#d4af37] bg-[#d4af37]/10' : 'border-white/10 hover:border-white/30'}`}
                  >
                    <span>{p.name}</span>
                    <span className="text-xs opacity-60">{p.model}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-6">
              {currentChat.messages.map((msg) => (
                <div 
                  key={msg.id} 
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`message px-5 py-3.5 rounded-3xl text-[15px] leading-relaxed ${
                    msg.role === 'user' 
                      ? 'bg-[#d4af37] text-black rounded-br-none' 
                      : 'bg-[#1a0505] border border-[#4a0e0e]'
                  }`}>
                    {msg.role === 'assistant' && (
                      <div className="flex items-center gap-2 mb-1.5 text-xs text-[#d4af37]/70 font-mono tracking-widest">
                        CERBERUS
                      </div>
                    )}
                    <div className="prose prose-invert prose-sm max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-[#1a0505] border border-[#4a0e0e] px-5 py-3.5 rounded-3xl flex items-center gap-3 text-sm text-white/70">
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 bg-[#d4af37] rounded-full animate-bounce" />
                      <div className="w-1.5 h-1.5 bg-[#d4af37] rounded-full animate-bounce delay-150" />
                      <div className="w-1.5 h-1.5 bg-[#d4af37] rounded-full animate-bounce delay-300" />
                    </div>
                    Thinking...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t border-[#4a0e0e] p-4 bg-[#1a0505]">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-3 bg-[#0a0a0c] border border-[#4a0e0e] rounded-3xl p-2 pl-5">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message Cerberus..."
                className="inline-editor flex-1 bg-transparent outline-none resize-none max-h-40 py-2 text-[15px] placeholder:text-white/40"
                rows={1}
              />
              
              <div className="flex items-center gap-1 pr-1">
                <button
                  onClick={toggleVoiceInput}
                  className={`p-3 rounded-2xl transition-all ${isListening ? 'bg-red-600 text-white' : 'hover:bg-white/5 text-white/70'}`}
                  title={isListening ? "Stop listening" : "Voice input"}
                >
                  {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                </button>

                <button
                  onClick={editLastMessage}
                  className="p-3 hover:bg-white/5 rounded-2xl text-white/60 hover:text-white transition-colors"
                  title="Edit last message"
                >
                  <Edit2 size={17} />
                </button>

                <button
                  onClick={sendMessage}
                  disabled={!input.trim() || isLoading}
                  className="p-3.5 bg-[#d4af37] hover:bg-[#e8c36b] disabled:opacity-40 text-black rounded-2xl transition-all active:scale-[0.985]"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
            
            <div className="text-[10px] text-center mt-2 text-white/30 tracking-widest">
              CERBERUS • {currentProvider.toUpperCase()} • LOCAL HISTORY
            </div>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setShowSettings(false)}>
          <div 
            className="settings-modal bg-[#1a0505] border border-[#4a0e0e] rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-8 pt-8 pb-6 border-b border-[#4a0e0e] flex items-center justify-between">
              <div>
                <div className="text-2xl font-semibold tracking-tight">Settings</div>
                <div className="text-sm text-white/50">All data stays in your browser</div>
              </div>
              <button onClick={() => setShowSettings(false)} className="text-white/60 hover:text-white">✕</button>
            </div>

            <div className="p-8 overflow-y-auto flex-1 space-y-8 text-sm">
              {/* Provider & API Keys */}
              <div>
                <div className="flex items-center gap-2 mb-4 text-[#d4af37]">
                  <Key size={16} /> <span className="font-medium tracking-widest text-xs">API KEYS</span>
                </div>
                
                <div className="space-y-4">
                  {PROVIDERS.map(provider => (
                    <div key={provider.id} className="flex items-center gap-4">
                      <div className="w-28 text-right text-white/70">{provider.name}</div>
                      <input
                        type="password"
                        value={apiKeys[provider.id]}
                        onChange={(e) => updateApiKey(provider.id, e.target.value)}
                        placeholder={`Enter ${provider.name} API key`}
                        className="flex-1 bg-black border border-[#4a0e0e] rounded-2xl px-5 py-3 text-sm font-mono placeholder:text-white/30 focus:border-[#d4af37]/50 outline-none"
                      />
                      <button 
                        onClick={() => setCurrentProvider(provider.id)}
                        className={`px-4 py-2 text-xs rounded-2xl border transition-all ${currentProvider === provider.id ? 'border-[#d4af37] bg-[#d4af37]/10' : 'border-white/20 hover:bg-white/5'}`}
                      >
                        {currentProvider === provider.id ? 'ACTIVE' : 'USE'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Model Parameters */}
              <div>
                <div className="flex items-center gap-2 mb-4 text-[#d4af37]">
                  <Zap size={16} /> <span className="font-medium tracking-widest text-xs">MODEL PARAMETERS</span>
                </div>
                
                <div className="space-y-6 pl-1">
                  <div>
                    <div className="flex justify-between mb-2 text-sm">
                      <span>Temperature</span>
                      <span className="font-mono text-[#d4af37]">{settings.temperature}</span>
                    </div>
                    <input 
                      type="range" 
                      min="0" 
                      max="2" 
                      step="0.1" 
                      value={settings.temperature}
                      onChange={(e) => updateSetting('temperature', parseFloat(e.target.value))}
                      className="w-full accent-[#d4af37]"
                    />
                    <div className="flex justify-between text-[10px] text-white/40 mt-1">
                      <div>Precise</div><div>Creative</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm mb-2">Max Tokens</div>
                      <input 
                        type="number" 
                        value={settings.maxTokens}
                        onChange={(e) => updateSetting('maxTokens', parseInt(e.target.value))}
                        className="w-full bg-black border border-[#4a0e0e] rounded-2xl px-4 py-2.5 text-sm"
                      />
                    </div>
                    <div>
                      <div className="text-sm mb-2">Top P</div>
                      <input 
                        type="number" 
                        step="0.05" 
                        min="0" max="1"
                        value={settings.topP}
                        onChange={(e) => updateSetting('topP', parseFloat(e.target.value))}
                        className="w-full bg-black border border-[#4a0e0e] rounded-2xl px-4 py-2.5 text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* System Prompt */}
              <div>
                <div className="flex items-center gap-2 mb-3 text-[#d4af37]">
                  <MessageSquare size={16} /> <span className="font-medium tracking-widest text-xs">SYSTEM PROMPT</span>
                </div>
                <textarea
                  value={settings.systemPrompt}
                  onChange={(e) => updateSetting('systemPrompt', e.target.value)}
                  className="w-full h-32 bg-black border border-[#4a0e0e] rounded-3xl p-5 text-sm resize-y font-mono"
                  placeholder="System instructions for the AI..."
                />
              </div>

              {/* API Log */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-[#d4af37]">
                    <span className="font-medium tracking-widest text-xs">API LOG</span>
                  </div>
                  <button onClick={() => setApiLog([])} className="text-xs px-3 py-1 hover:bg-white/5 rounded-xl">Clear</button>
                </div>
                <div className="bg-black border border-[#4a0e0e] rounded-3xl p-4 h-40 overflow-y-auto font-mono text-xs text-white/70 space-y-1">
                  {apiLog.length === 0 ? (
                    <div className="text-white/40 italic">No API calls yet. Send a message to see logs.</div>
                  ) : (
                    apiLog.map((log, i) => <div key={i}>{log}</div>)
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-[#4a0e0e] flex justify-end gap-3">
              <button 
                onClick={() => setShowSettings(false)}
                className="px-8 py-3 rounded-2xl hover:bg-white/5 transition-colors"
              >
                Close
              </button>
              <button 
                onClick={() => {
                  setShowSettings(false);
                }}
                className="px-8 py-3 bg-[#d4af37] text-black rounded-2xl font-medium hover:bg-[#e8c36b] transition-all"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;