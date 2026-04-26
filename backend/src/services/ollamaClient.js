const axios = require('axios');

const DEFAULT_BASE_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'gemma3:1b';
const DEFAULT_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS) || 25000;

function asArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  return [v];
}

async function postJson(url, payload, timeoutMs = 120000) {
  return axios.post(url, payload, {
    timeout: timeoutMs,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function chat({ messages, model = DEFAULT_MODEL, baseUrl = DEFAULT_BASE_URL, timeoutMs = DEFAULT_TIMEOUT_MS, options }) {
  const url = `${baseUrl.replace(/\/$/, '')}/api/chat`;
  const payload = {
    model,
    stream: false,
    messages: asArray(messages),
    ...(options && typeof options === 'object' ? { options } : {}),
  };
  const resp = await postJson(url, payload, timeoutMs);
  const content = resp?.data?.message?.content;
  if (!content) throw new Error('Ollama /api/chat: empty response');
  return content;
}

async function generate({ prompt, model = DEFAULT_MODEL, baseUrl = DEFAULT_BASE_URL, timeoutMs = DEFAULT_TIMEOUT_MS, options }) {
  const url = `${baseUrl.replace(/\/$/, '')}/api/generate`;
  const payload = {
    model,
    stream: false,
    prompt,
    ...(options && typeof options === 'object' ? { options } : {}),
  };
  const resp = await postJson(url, payload, timeoutMs);
  const content = resp?.data?.response;
  if (!content) throw new Error('Ollama /api/generate: empty response');
  return content;
}

async function askOllama({ system, user, model, baseUrl, timeoutMs = DEFAULT_TIMEOUT_MS, options }) {
  // Prefer /api/chat, fallback to /api/generate.
  try {
    return await chat({
      model,
      baseUrl,
      timeoutMs,
      options,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
  } catch (e) {
    const prompt = `${system}\n\nUSER QUESTION:\n${user}`;
    return generate({ prompt, model, baseUrl, timeoutMs, options });
  }
}

module.exports = { askOllama };
