import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const OLLAMA_API = 'http://127.0.0.1:11434';
const VALID_ACTIONS = new Set(['pull', 'delete', 'load', 'unload']);
const MODEL_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,255}$/;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}

function hasSameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function isValidModelName(model) {
  return typeof model === 'string' && MODEL_NAME_PATTERN.test(model);
}

async function runOllama(args, timeout = 120000) {
  return execFileAsync('ollama', args, {
    timeout,
    maxBuffer: 1024 * 1024,
    shell: false
  });
}

async function generate(model, keepAlive) {
  const response = await fetch(`${OLLAMA_API}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: '', keep_alive: keepAlive }),
    signal: AbortSignal.timeout(120000)
  });

  if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) return;
  while (true) {
    const { done } = await reader.read();
    if (done) break;
  }
}

export async function POST({ request }) {
  if (!hasSameOrigin(request)) return json({ error: 'Cross-origin requests are not allowed.' }, 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const { action, model } = body || {};
  if (!VALID_ACTIONS.has(action)) return json({ error: 'Invalid action.' }, 400);
  if (!isValidModelName(model)) return json({ error: 'Invalid model name.' }, 400);

  try {
    if (action === 'pull') {
      await runOllama(['pull', model], 600000);
      return json({ success: true, message: `Model ${model} downloaded successfully.` });
    }

    if (action === 'delete') {
      await runOllama(['rm', model]);
      return json({ success: true, message: `Model ${model} deleted successfully.` });
    }

    if (action === 'load') {
      await generate(model, '5m');
      return json({ success: true, message: `Model ${model} loaded.` });
    }

    await generate(model, 0);
    return json({ success: true, message: `Model ${model} unloaded.` });
  } catch (error) {
    console.error('Ollama operation failed:', error?.code || error?.name || 'unknown error');
    return json({ error: 'Ollama operation failed.' }, 500);
  }
}
