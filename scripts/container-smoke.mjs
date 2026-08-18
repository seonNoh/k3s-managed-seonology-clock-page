import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

export function normalizeCommandOutput(output) {
  return String(output ?? '').trim()
}

function docker(args, options = {}) {
  return normalizeCommandOutput(execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }))
}

export function createBuildArgs(image, version) {
  return ['build', '--build-arg', `APP_VERSION=${version}`, '-t', image, '.']
}

export function createVersionProbeArgs(name, version) {
  return ['exec', name, 'grep', '-R', '-F', '-q', version, '/usr/share/nginx/html']
}

export function parsePublishedPort(value) {
  const address = value.trim().split('\n')[0]
  if (!address) throw new Error('Docker did not publish port 80')
  return `http://${address}`
}

export function createReadonlyRuntimeArgs(name, image) {
  return [
    'run',
    '-d',
    '--read-only',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,mode=1777,size=16m',
    '--tmpfs',
    '/var/cache/nginx:rw,noexec,nosuid,mode=1777,size=16m',
    '--tmpfs',
    '/var/run/nginx:rw,noexec,nosuid,mode=1777,size=4m',
    '--tmpfs',
    '/data:rw,noexec,nosuid,mode=1777,size=16m',
    '--name',
    name,
    '-p',
    '127.0.0.1::8080',
    image,
  ]
}

async function waitForHealth(endpoint) {
  let lastError
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${endpoint}/health`)
      if (response.ok && response.headers.get('content-type')?.includes('application/json')) return
      lastError = new Error(`Unexpected health response: ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }
  throw lastError ?? new Error('Health endpoint did not become ready')
}

async function healthFails(endpoint) {
  try {
    const response = await fetch(`${endpoint}/health`)
    return !response.ok
  } catch {
    return true
  }
}

async function main() {
  const image = process.env.SMOKE_IMAGE || 'seonology-clock-page:smoke'
  const version = process.env.SMOKE_APP_VERSION || undefined
  const name = `seonology-clock-page-smoke-${process.pid}-${Date.now()}`
  let started = false

  try {
    if (process.env.SMOKE_SKIP_BUILD !== '1') docker(createBuildArgs(image, version || readFileSync('VERSION', 'utf8').trim()), { stdio: 'inherit' })
    docker(createReadonlyRuntimeArgs(name, image))
    started = true
    const endpoint = parsePublishedPort(docker(['port', name, '8080']))
    await waitForHealth(endpoint)

    if (docker(['exec', name, 'id', '-u']) !== '10001') {
      throw new Error('Container did not run as UID 10001')
    }
    docker(createVersionProbeArgs(name, version || readFileSync('VERSION', 'utf8').trim()))

    docker(['exec', name, 'sh', '-c', 'kill -TERM "$(pidof node)"'])
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (await healthFails(endpoint)) return
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    throw new Error('Health endpoint remained ready after the API process stopped')
  } finally {
    if (started) docker(['rm', '-f', name])
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
