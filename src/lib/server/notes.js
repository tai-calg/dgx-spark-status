import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const NOTES_FILE = process.env.DGX_NOTES_FILE || '/opt/dgx-spark-status/model-notes.json';

export async function loadNotes() {
  try {
    const content = await readFile(NOTES_FILE, 'utf8');
    const notes = JSON.parse(content);
    return notes && typeof notes === 'object' && !Array.isArray(notes) ? notes : {};
  } catch (error) {
    if (error?.code === 'ENOENT') return {};
    console.error('Failed to read notes:', error?.code || error?.name || 'unknown error');
    return {};
  }
}

export async function saveNotes(notes) {
  await mkdir(dirname(NOTES_FILE), { recursive: true });
  const temporaryFile = `${NOTES_FILE}.${process.pid}.tmp`;
  await writeFile(temporaryFile, JSON.stringify(notes, null, 2), {
    encoding: 'utf8',
    mode: 0o600
  });
  await rename(temporaryFile, NOTES_FILE);
}
