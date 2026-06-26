// Dolphin Chat — tiny Express backend that proxies to OpenRouter and streams
// responses back to the browser. The OpenRouter API is OpenAI-compatible, so
// this same proxy works for any model OpenRouter hosts; we just default to the
// uncensored, steerable Dolphin model.
//
// The API key lives server-side (OPENROUTER_API_KEY) so it never reaches the
// browser. If no server key is set, clients may supply their own via the
// `x-openrouter-key` header (bring-your-own-key).

import express from "express";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import process from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env if present (no dependency needed — tiny parser).
await loadDotEnv();

const PORT = process.env.PORT || 3000;
const DEFAULT_MODEL =
  process.env.DEFAULT_MODEL ||
  "cognitivecomputations/dolphin-mistral-24b-venice-edition:free";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Models surfaced in the UI picker. All are Dolphin / uncensored variants that
// OpenRouter hosts; the first is the project's flagship and has a free tier.
const MODELS = [
  {
    id: "cognitivecomputations/dolphin-mistral-24b-venice-edition:free",
    label: "Dolphin Mistral 24B — Venice Edition (free)",
  },
  {
    id: "cognitivecomputations/dolphin-mistral-24b-venice-edition",
    label: "Dolphin Mistral 24B — Venice Edition",
  },
  {
    id: "cognitivecomputations/dolphin3.0-mistral-24b:free",
    label: "Dolphin 3.0 Mistral 24B (free)",
  },
];

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(join(__dirname, "public")));

// Tells the client whether a server-side key exists and what models/default to
// offer. Never leaks the key itself.
app.get("/api/config", (_req, res) => {
  res.json({
    hasServerKey: Boolean(process.env.OPENROUTER_API_KEY),
    defaultModel: DEFAULT_MODEL,
    models: MODELS,
  });
});

// Streaming chat endpoint. Body: { model?, system?, messages: [{role, content}] }
app.post("/api/chat", async (req, res) => {
  const key = process.env.OPENROUTER_API_KEY || req.get("x-openrouter-key");
  if (!key) {
    return res.status(401).json({
      error:
        "No OpenRouter API key. Set OPENROUTER_API_KEY on the server, or add your own key in Settings.",
    });
  }

  const { model, system, messages } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "`messages` array is required." });
  }

  // Prepend the system prompt (Dolphin's whole point: you set the alignment).
  const fullMessages = [];
  if (system && String(system).trim()) {
    fullMessages.push({ role: "system", content: String(system) });
  }
  for (const m of messages) {
    if (m && m.role && typeof m.content === "string") {
      fullMessages.push({ role: m.role, content: m.content });
    }
  }

  let upstream;
  try {
    upstream = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        // OpenRouter likes these for attribution/rankings; harmless if ignored.
        "HTTP-Referer": "https://github.com/dolphin-chat",
        "X-Title": "Dolphin Chat",
      },
      body: JSON.stringify({
        model: model || DEFAULT_MODEL,
        messages: fullMessages,
        stream: true,
      }),
    });
  } catch (err) {
    return res
      .status(502)
      .json({ error: `Could not reach OpenRouter: ${err.message}` });
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await safeReadText(upstream);
    return res
      .status(upstream.status || 502)
      .json({ error: `OpenRouter error (${upstream.status}): ${detail}` });
  }

  // Stream the SSE response straight through to the browser.
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();

  // If the client disconnects, stop pulling from upstream.
  let aborted = false;
  req.on("close", () => {
    aborted = true;
    reader.cancel().catch(() => {});
  });

  try {
    while (!aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
  } catch (err) {
    if (!aborted) {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    }
  } finally {
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`\n  🐬 Dolphin Chat running at http://localhost:${PORT}`);
  console.log(
    `     Server key: ${
      process.env.OPENROUTER_API_KEY ? "set ✓" : "not set (BYOK in Settings)"
    }`
  );
  console.log(`     Default model: ${DEFAULT_MODEL}\n`);
});

async function safeReadText(resp) {
  try {
    const t = await resp.text();
    return t.slice(0, 500);
  } catch {
    return "unknown error";
  }
}

// Minimal .env loader so we don't pull in a dependency for one file.
async function loadDotEnv() {
  try {
    const raw = await readFile(join(__dirname, ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const k = trimmed.slice(0, eq).trim();
      let v = trimmed.slice(eq + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!(k in process.env)) process.env[k] = v;
    }
  } catch {
    // No .env file — fine, rely on real env vars.
  }
}
