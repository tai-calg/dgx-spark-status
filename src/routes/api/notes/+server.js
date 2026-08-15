import { loadNotes, saveNotes } from '$lib/server/notes.js';

const MAX_MODEL_ID_LENGTH = 256;
const MAX_NOTE_LENGTH = 4096;

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

export async function GET() {
  return json(await loadNotes());
}

export async function POST({ request }) {
  if (!hasSameOrigin(request)) return json({ error: 'Cross-origin requests are not allowed.' }, 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const modelId = typeof body?.modelId === 'string' ? body.modelId.trim() : '';
  const note = typeof body?.note === 'string' ? body.note.trim() : '';

  if (!modelId || modelId.length > MAX_MODEL_ID_LENGTH) return json({ error: 'Invalid modelId.' }, 400);
  if (note.length > MAX_NOTE_LENGTH) return json({ error: 'Note is too long.' }, 400);

  const notes = await loadNotes();
  if (note) notes[modelId] = note;
  else delete notes[modelId];

  try {
    await saveNotes(notes);
    return json({ ok: true, notes });
  } catch (error) {
    console.error('Failed to save notes:', error?.code || error?.name || 'unknown error');
    return json({ error: 'Failed to save notes.' }, 500);
  }
}
