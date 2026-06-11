import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, Mic, MicOff, Settings, Plus, Trash2, Edit2, Zap, Key, MessageSquare 
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Provider, Message, Chat, ApiKeys, Settings as AppSettings } from './types';