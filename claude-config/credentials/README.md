# Credentials

This folder holds your API keys and credentials. Claude reads them automatically when it needs them.

**Never share this folder. Never commit it to git.**

---

## Setup during onboarding

Claude will walk you through filling these in. You can also do it manually:

### anthropic.env
```
ANTHROPIC_API_KEY=sk-ant-...
```
Get it: [console.anthropic.com](https://console.anthropic.com) → API Keys

### goldbot.env
Broker credentials for the gold trading bot. MT5 login/password/server, or an
OANDA v20 token and account id. Copy `goldbot.env.template` and fill it in.
Nothing here is ever written back to the bot's YAML config.

### gmail_credentials.json
OAuth credentials from Google Cloud Console.
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project → Enable Gmail API
3. APIs & Services → Credentials → Create OAuth 2.0 Client ID (Desktop app)
4. Download the JSON → save here as `gmail_credentials.json`
5. First time Claude uses Gmail, a browser window will open for OAuth authorization

### Any other API keys
Add them as `.env` files: `servicename.env`
Format: `SERVICE_API_KEY=your-key-here`

---

## How Claude accesses credentials

```bash
# To look up a credential:
source ~/.claude/credentials/anthropic.env && echo $ANTHROPIC_API_KEY
```

Claude does this automatically when it needs a key.
