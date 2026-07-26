---
id: never-local-for-clients
triggers: [client, automation, deploy, server, railway, render, fly, hosting, ngrok, tunnel, local]
severity: hard
applies_to: [all]
created: 2026-04-10
source: correction
---
Client automations NEVER run locally. Always deploy to cloud (Railway, n8n, Vercel, etc.). Local is only for [USER]'s personal work. Never use ngrok, cloudflared, or any tunnel as a "workaround" for client-facing services. If cloud deployment is blocked, fix the cloud issue. Do not fall back to local.

**Why:** [USER] explicitly said "when it's a client automation, it has to work on the cloud. It will never run locally."

**How to apply:** Any time building a server, webhook handler, or automation for a client, it must be deployed to a cloud platform before reporting done. "Running locally via tunnel" is never acceptable.
