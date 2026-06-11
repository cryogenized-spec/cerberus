# Cerberus

Private multi-provider AI chat interface. Proof of concept.

## Features
- Multi-provider support: **Gemini** (safety filters OFF), OpenAI, xAI (Grok)
- Voice-to-text (Web Speech API)
- Full settings: Temperature, Max Tokens, Top P, System Prompt
- Per-provider API keys (stored locally)
- Chat history with titles
- API request/response log
- PWA ready (installable)
- Inline editable input + message editing
- Dark Cerberus theme

## Quick Start

```bash
npm install
npm run dev
```

Then open http://localhost:5173

## Deploy to Vercel
1. Push this folder to a new GitHub repo
2. Import on Vercel
3. It will auto-detect Vite

## Important Notes (PoC)
- API keys are stored in browser localStorage only.
- For Gemini: Safety filters are explicitly set to BLOCK_NONE.
- Voice input works best in Chrome/Edge.
- Add real PNG icons for production PWA (replace pwa-*.png).

## Next Steps
- Add conversation branching
- Better message editing
- Export chats
- Encrypted key storage

Built as a fast proof of concept. Enjoy.