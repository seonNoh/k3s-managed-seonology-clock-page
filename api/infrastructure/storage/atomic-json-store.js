const crypto = require('node:crypto');
const path = require('node:path');
const { mkdir, open, readFile, rename, unlink } = require('node:fs/promises');

const updateQueues = new Map();

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function createAtomicJsonStore({ filePath, defaultValue, validate = () => true, mode = 0o600 }) {
  if (!filePath) throw new TypeError('filePath is required');
  const resolvedPath = path.resolve(filePath);
  const directory = path.dirname(resolvedPath);

  function assertValid(value) {
    if (!validate(value)) throw new Error(`Invalid JSON data for ${resolvedPath}`);
    return value;
  }

  async function readCurrent() {
    let source;
    try {
      source = await readFile(resolvedPath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return cloneJson(defaultValue);
      throw error;
    }

    let value;
    try {
      value = JSON.parse(source);
    } catch (error) {
      throw new Error(`Invalid JSON in ${resolvedPath}`, { cause: error });
    }
    return assertValid(value);
  }

  async function writeCurrent(value) {
    assertValid(value);
    await mkdir(directory, { recursive: true });
    const temporaryPath = path.join(
      directory,
      `.${path.basename(resolvedPath)}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`,
    );
    let temporaryFile;
    try {
      temporaryFile = await open(temporaryPath, 'wx', mode);
      await temporaryFile.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
      await temporaryFile.sync();
      await temporaryFile.close();
      temporaryFile = null;
      await rename(temporaryPath, resolvedPath);
      const directoryHandle = await open(directory, 'r');
      try {
        await directoryHandle.sync();
      } finally {
        await directoryHandle.close();
      }
      return cloneJson(value);
    } catch (error) {
      if (temporaryFile) await temporaryFile.close().catch(() => {});
      await unlink(temporaryPath).catch(unlinkError => {
        if (unlinkError.code !== 'ENOENT') throw unlinkError;
      });
      throw error;
    }
  }

  function enqueue(operation) {
    const previous = updateQueues.get(resolvedPath) || Promise.resolve();
    const current = previous.catch(() => {}).then(operation);
    updateQueues.set(resolvedPath, current);
    current.finally(() => {
      if (updateQueues.get(resolvedPath) === current) updateQueues.delete(resolvedPath);
    }).catch(() => {});
    return current;
  }

  return {
    read: readCurrent,
    write(value) {
      return enqueue(() => writeCurrent(cloneJson(value)));
    },
    update(updater) {
      return enqueue(async () => {
        const current = await readCurrent();
        const next = await updater(cloneJson(current));
        const value = next === undefined ? current : next;
        return writeCurrent(value);
      });
    },
  };
}

module.exports = { createAtomicJsonStore };
