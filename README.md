# 🐬 Dolphin Chat

A clean, self-hostable, **streaming chat app** for the [Dolphin AI](https://dphn.ai/)
model — the uncensored, *steerable* LLM where **you** set the system prompt and
the alignment.

Dolphin's own native API isn't open to the public yet, so this app talks to the
flagship Dolphin model through [OpenRouter](https://openrouter.ai)'s
OpenAI-compatible API (the
[`dolphin-mistral-24b-venice-edition`](https://openrouter.ai/cognitivecomputations/dolphin-mistral-24b-venice-edition:free)
model, which has a **free tier**).

![Dolphin Chat](https://img.shields.io/badge/model-Dolphin%20Mistral%2024B-2fb6d8) ![Node](https://img.shields.io/badge/node-%3E%3D18-36d0a0)

## Two ways to run it

| Mode | File | Needs a server? | Best for |
| ---- | ---- | --------------- | -------- |
| 🌐 **Browser mode** | [`standalone.html`](standalone.html) | **No** — pure client-side | Just trying it; double-click to open; hosting on GitHub Pages |
| 🖥️ **Server mode** | [`server.js`](server.js) + `public/` | Yes — a tiny Node/Express app | Sharing with others via a single server-side key |

**Browser mode is the quickest start:** open `standalone.html` in any browser
(works from `file://`), click **⚙︎ API key**, paste your OpenRouter key, and
chat. Everything — your key, your conversations — stays in your browser, and
requests go **directly** to OpenRouter (which allows browser/CORS calls). There
is no backend to run, deploy, or trust.

Use **server mode** when you want to host the app for other people behind a
single shared `OPENROUTER_API_KEY` so visitors don't each need their own.

## Features

- **Token streaming** — replies appear live as the model writes them.
- **System-prompt front and center** — Dolphin's whole point. Type your own, or
  tap a persona chip (Default, Unfiltered, Coder, Tutor, Pirate).
- **Model picker** — switch between Dolphin variants.
- **Server key _or_ bring-your-own-key** — set `OPENROUTER_API_KEY` for everyone,
  or let each visitor paste their own key (stored only in their browser).
- **Conversation memory** — history persists in `localStorage`.
- **No build step, no framework, one dependency** (Express). Plain HTML/CSS/JS.
- **Mobile-friendly** responsive layout.

## Quick start — browser mode (no install)

1. Download / open **`standalone.html`** in your browser.
2. Click **⚙︎ API key** and paste a key from
   [openrouter.ai/keys](https://openrouter.ai/keys) (free).
3. Chat.

### Host it online with GitHub Pages

A ready-to-publish copy already lives at **[`docs/index.html`](docs/index.html)**.
To put it on the web:

1. Push this repo to GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment → Source**, choose **Deploy from a branch**.
4. Set **Branch** to your branch and the folder to **`/docs`**, then **Save**.
5. After a minute, your app is live at
   `https://<your-username>.github.io/<repo>/` — open it, add your OpenRouter
   key, and chat.

(`docs/index.html` is byte-for-byte identical to `standalone.html`; edit
`standalone.html` and copy it over, or edit `docs/index.html` directly.)

## Quick start — server mode

Requires **Node.js 18+** (uses the built-in `fetch`).

```bash
# 1. Install the one dependency
npm install

# 2. (Optional) add a server-side key so users don't need their own
cp .env.example .env
#   then edit .env and set OPENROUTER_API_KEY=sk-or-v1-...
#   Get a free key at https://openrouter.ai/keys

# 3. Run it
npm start
```

Open **http://localhost:3000**.

> No key in `.env`? The app still starts — click **⚙︎ API key** in the sidebar
> and paste your own OpenRouter key to begin chatting.

## How it works

```
Browser (public/)  ──POST /api/chat──▶  server.js  ──▶  OpenRouter  ──▶  Dolphin
        ▲                                    │
        └──────────  SSE token stream  ◀──────┘
```

- **`server.js`** — a small Express app. It serves the static frontend and
  exposes two endpoints:
  - `GET /api/config` — tells the UI whether a server key exists, plus the
    model list and default.
  - `POST /api/chat` — injects your system prompt, forwards the conversation to
    OpenRouter with `stream: true`, and pipes the SSE response straight back to
    the browser. The API key never reaches the client.
- **`public/`** — the frontend (`index.html`, `styles.css`, `app.js`). It parses
  the SSE stream, renders a small safe subset of Markdown, and keeps history in
  `localStorage`.

## Configuration

| Variable             | Default                                                          | Purpose                                          |
| -------------------- | ---------------------------------------------------------------- | ------------------------------------------------ |
| `OPENROUTER_API_KEY` | _(none)_                                                         | Server-side key. If unset, users supply their own. |
| `PORT`               | `3000`                                                           | Port to listen on.                               |
| `DEFAULT_MODEL`      | `cognitivecomputations/dolphin-mistral-24b-venice-edition:free` | Model used when the client doesn't pick one.     |

To offer different models, edit the `MODELS` array in `server.js`.

## A note on "uncensored"

Dolphin is intentionally uncensored and steerable — it follows the system prompt
you give it rather than imposing its own guidelines. **You** are responsible for
how you steer it and for complying with OpenRouter's terms and your local laws.

## License

MIT
