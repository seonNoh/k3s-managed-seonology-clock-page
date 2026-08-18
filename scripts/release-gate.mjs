import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

function readVersion(versionPath = 'VERSION') {
  return existsSync(versionPath) ? readFileSync(versionPath, 'utf8').trim() : ''
}

export function evaluateRelease(beforeVersion, afterVersion) {
  const released = afterVersion.length > 0 && afterVersion !== beforeVersion
  return {
    released,
    version: released ? afterVersion : '',
  }
}

function writeGithubOutput(result) {
  const output = `released=${result.released}\nversion=${result.version}\n`
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output)
  process.stdout.write(output)
}

function runSemanticRelease() {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  const execution = spawnSync(npx, ['--no-install', 'semantic-release'], {
    stdio: 'inherit',
  })

  if (execution.error) throw execution.error
  if (execution.status !== 0) process.exit(execution.status ?? 1)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const beforeVersion = readVersion()
  runSemanticRelease()
  writeGithubOutput(evaluateRelease(beforeVersion, readVersion()))
}
