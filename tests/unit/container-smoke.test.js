import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { createBuildArgs, createReadonlyRuntimeArgs, createVersionProbeArgs, normalizeCommandOutput, parsePublishedPort } from '../../scripts/container-smoke.mjs'

test('Docker의 loopback port 출력을 HTTP endpoint로 변환한다', () => {
  assert.equal(
    parsePublishedPort('127.0.0.1:32771\n'),
    'http://127.0.0.1:32771',
  )
})

test('output이 없는 성공 docker command도 빈 문자열로 처리한다', () => {
  assert.equal(normalizeCommandOutput(null), '')
})

test('smoke는 read-only root와 필요한 writable tmpfs만 제공한다', () => {
  const args = createReadonlyRuntimeArgs('smoke-container', 'clock:smoke')

  assert.deepEqual(args.slice(0, 7), [
    'run',
    '-d',
    '--read-only',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,mode=1777,size=16m',
    '--tmpfs',
    '/var/cache/nginx:rw,noexec,nosuid,mode=1777,size=16m',
  ])
  assert.ok(args.includes('/var/run/nginx:rw,noexec,nosuid,mode=1777,size=4m'))
  assert.ok(args.includes('/data:rw,noexec,nosuid,mode=1777,size=16m'))
  assert.deepEqual(args.slice(-5), ['--name', 'smoke-container', '-p', '127.0.0.1::8080', 'clock:smoke'])
})

test('container build는 planned app version을 APP_VERSION build arg로 주입한다', () => {
  assert.deepEqual(createBuildArgs('clock:smoke', '1.52.0'), [
    'build',
    '--build-arg',
    'APP_VERSION=1.52.0',
    '-t',
    'clock:smoke',
    '.',
  ])
})

test('container smoke는 최종 image artifact의 version 문자열을 확인한다', () => {
  assert.deepEqual(createVersionProbeArgs('smoke-container', '1.52.0'), [
    'exec',
    'smoke-container',
    'grep',
    '-R',
    '-F',
    '-q',
    '1.52.0',
    '/usr/share/nginx/html',
  ])
})

test('Dockerfile과 release workflow가 APP_VERSION을 build artifact에 연결한다', () => {
  const dockerfile = readFileSync(new URL('../../Dockerfile', import.meta.url), 'utf8')
  const workflow = readFileSync(new URL('../../.github/workflows/release.yaml', import.meta.url), 'utf8')

  assert.match(dockerfile, /^ARG APP_VERSION$/m)
  assert.match(dockerfile, /printf '%s\\n' "\$APP_VERSION" > VERSION/)
  assert.match(workflow, /build-args: \|\n\s+APP_VERSION=\$\{\{ needs\.plan\.outputs\.version \}\}/)
  assert.match(workflow, /git config user\.name "github-actions\[bot\]"/)
  assert.match(workflow, /git config user\.email "41898282\+github-actions\[bot\]@users\.noreply\.github\.com"/)
})
