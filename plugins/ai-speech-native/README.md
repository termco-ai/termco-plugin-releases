# AI Speech Transcription

Default provider for `ai.speech@1`. It owns OpenAI, Groq, and loopback
Whisper.cpp transcription, including credential lookup, endpoint policy,
multipart requests, audio conversion, timeouts, and configuration status.
Consumers send recorded bytes and never receive provider keys.
