import { createRequire } from 'node:module';
import process from 'node:process';

const require = createRequire(import.meta.url);
const { recoverCloudTokenBackup } = require('../api/infrastructure/storage/encrypted-token-store.js');

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!value || (flag !== '--backup' && flag !== '--target')) {
      throw new Error('Usage: recover-cloud-token-backup --backup <path> --target <new-path>');
    }
    const name = flag.slice(2);
    if (options[name]) throw new Error(`${flag} may only be specified once`);
    options[name] = value;
  }
  if (!options.backup || !options.target) {
    throw new Error('Usage: recover-cloud-token-backup --backup <path> --target <new-path>');
  }
  return options;
}

try {
  const { backup, target } = parseArguments(process.argv.slice(2));
  const recoveredPath = await recoverCloudTokenBackup({
    backupPath: backup,
    targetPath: target,
    key: process.env.CLOUD_TOKEN_ENCRYPTION_KEY,
  });
  process.stdout.write(`Cloud token backup recovered to ${recoveredPath}\n`);
} catch (error) {
  process.stderr.write(`Cloud token backup recovery failed: ${error.message}\n`);
  process.exitCode = 1;
}
