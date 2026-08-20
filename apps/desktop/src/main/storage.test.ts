import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(`encrypted:${value}`, 'utf8'),
    decryptString: (value: Buffer) => value.toString('utf8').replace(/^encrypted:/, ''),
  },
}));

import { AtomicDatabase } from './storage';

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(createdDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function databasePaths() {
  const directory = await mkdtemp(join(tmpdir(), 'ai-whiteboard-storage-'));
  createdDirectories.push(directory);
  return {
    databasePath: join(directory, 'database.json'),
    backupPath: join(directory, 'database.json.bak'),
  };
}

describe('atomic local persistence', () => {
  it('round-trips sessions and produces portable exports without secrets', async () => {
    const paths = await databasePaths();
    const database = await AtomicDatabase.open(paths);
    const session = await database.createSession('STEM notes', { elements: [{ id: 'box-1' }] });
    await database.saveSession(session.id, { elements: [{ id: 'box-1' }, { id: 'arrow-1' }] });
    const exported = database.exportSession(session.id);
    const imported = await database.importSession(exported);
    const reexported = database.exportSession(imported.id);
    await database.close();

    const reopened = await AtomicDatabase.open(paths);
    expect(reopened.getSession(session.id)?.document).toEqual({ elements: [{ id: 'box-1' }, { id: 'arrow-1' }] });
    expect(JSON.stringify(exported)).not.toMatch(/apiKey|secret|token/i);
    expect(reexported.snapshots.map((snapshot) => snapshot.document)).toEqual(exported.snapshots.map((snapshot) => snapshot.document));
    expect(reexported.events.slice(0, exported.events.length).map((event) => event.type)).toEqual(exported.events.map((event) => event.type));
    expect(reexported.events.at(-1)?.type).toBe('session.imported');
    await reopened.close();
  });

  it('recovers the last valid backup when the primary file is corrupted', async () => {
    const paths = await databasePaths();
    const database = await AtomicDatabase.open(paths);
    await database.createSession('Recover me', { elements: [] });
    await database.updateSettings({ alwaysOnTop: false });
    await database.close();

    const backup = await readFile(paths.backupPath, 'utf8');
    expect(backup).toContain('Recover me');
    await writeFile(paths.databasePath, '{ interrupted write', 'utf8');

    const recovered = await AtomicDatabase.open(paths);
    expect(recovered.listSessions()[0]?.title).toBe('Recover me');
    await recovered.close();
  });

  it('uses the backup when a versioned primary has an invalid database shape', async () => {
    const paths = await databasePaths();
    const database = await AtomicDatabase.open(paths);
    await database.createSession('Keep the valid copy', { elements: [] });
    await database.updateSettings({ alwaysOnTop: false });
    await database.close();

    await writeFile(
      paths.databasePath,
      JSON.stringify({ version: 1, sessions: [{ id: 42 }], snapshots: [], events: [], aiRequests: [], settings: {} }),
      'utf8',
    );

    const recovered = await AtomicDatabase.open(paths);
    expect(recovered.listSessions()[0]?.title).toBe('Keep the valid copy');
    await recovered.close();
  });
});
