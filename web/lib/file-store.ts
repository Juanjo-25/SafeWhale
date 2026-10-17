import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, link, unlink } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';
import lockfile from 'proper-lockfile';
import { StateError } from './state-error';

export async function withFileStore<T, R>(file: string, initial: () => T, parse: (input: unknown) => T,
  work: (state: T, save: () => Promise<void>) => Promise<R>): Promise<R> {
  if (!isAbsolute(file)) throw new StateError('STATE_PATH_INVALID', 'STATE_FILE debe resolverse a una ruta absoluta.');
  await mkdir(dirname(file), { recursive: true });
  try { await readFile(file); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new StateError('STATE_UNAVAILABLE', 'No se pudo leer el estado.');
    const temporary = file + '.' + randomUUID() + '.tmp';
    try {
      await writeFile(temporary, JSON.stringify(initial()), { flag: 'wx', mode: 0o600 });
      try { await link(temporary, file); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
    } finally { await unlink(temporary).catch(() => {}); }
  }
  let compromised = false;
  let release: () => Promise<void>;
  try { release = await lockfile.lock(file, { realpath: false, stale: 120000, update: 5000,
    retries: { retries: 600, minTimeout: 100, maxTimeout: 100, factor: 1 }, onCompromised: () => { compromised = true; } }); }
  catch { throw new StateError('STATE_BUSY', 'Hay una transacción en curso. Reintenta la misma acción.'); }
  try {
    let state: T;
    try { state = parse(JSON.parse(await readFile(file, 'utf8'))); }
    catch { throw new StateError('STATE_INVALID', 'El estado persistido no es válido; se conservó sin modificar.'); }
    const save = async () => {
      if (compromised) throw new StateError('STATE_BUSY', 'Se perdió el bloqueo del estado.');
      parse(state);
      const temporary = file + '.' + randomUUID() + '.tmp';
      try {
        await writeFile(temporary, JSON.stringify(state, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
        if (compromised) throw new StateError('STATE_BUSY', 'Se perdió el bloqueo del estado.');
        await rename(temporary, file);
      } finally { await unlink(temporary).catch(() => {}); }
    };
    return await work(state, save);
  } finally { await release(); }
}
