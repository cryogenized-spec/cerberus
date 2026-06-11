export type Provider = 'gemini' | 'openai' | 'xai';

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export interface ApiKeys {
  gemini: string;
  openai: string;
  xai: string;
}

export interface Settings {
  temperature: number;
  maxTokens: number;
  topP: number;
  systemPrompt: string;
}