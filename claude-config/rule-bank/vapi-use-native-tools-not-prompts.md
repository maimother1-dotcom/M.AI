---
id: vapi-use-native-tools-not-prompts
triggers: [vapi, calling, voice, phone, wapi, endcall, hangup]
severity: hard
applies_to: [all]
created: 2026-04-14
source: correction
---
VAPI has built-in tools and features for call control (endCall, voicemail detection, call transfer, etc.). Use VAPI's native tool configurations instead of trying to prompt-engineer the LLM to do these things. Research VAPI's actual feature set, tools, and configuration options before writing prompts. Prompt engineering is the wrong approach when the platform has native functionality for it.
