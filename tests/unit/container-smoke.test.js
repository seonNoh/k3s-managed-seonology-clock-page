import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { createBuildArgs, createReadonlyRuntimeArgs, normalizeCommandOutput, parsePublishedPort, verifyAppVersion } from '../../scripts/container-smoke.mjs'

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

test('container smoke는 HTTP app-version marker의 정확한 version만 수락한다', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ version: '1.52.0' }) })
  await assert.doesNotReject(() => verifyAppVersion('http://127.0.0.1:8080', '1.52.0', { fetchImpl }))
  await assert.rejects(() => verifyAppVersion('http://127.0.0.1:8080', '1.52.0', { fetchImpl: async () => ({ ok: true, json: async () => ({ version: '1.52.1' }) }) }), /version marker mismatch/)
  await assert.rejects(() => verifyAppVersion('http://127.0.0.1:8080', '1.52.0', { fetchImpl: async () => ({ ok: false, status: 404, json: async () => ({}) }) }), /version marker request failed/)
  await assert.rejects(() => verifyAppVersion('http://127.0.0.1:8080', '1.52.0', { fetchImpl: async () => ({ ok: true, json: async () => { throw new Error('invalid JSON') } }) }), /version marker response is invalid/)
})

test('Dockerfile과 release workflow가 APP_VERSION을 build artifact에 연결한다', () => {
  const dockerfile = readFileSync(new URL('../../Dockerfile', import.meta.url), 'utf8')
  const workflow = readFileSync(new URL('../../.github/workflows/release.yaml', import.meta.url), 'utf8')

  assert.match(dockerfile, /^ARG APP_VERSION$/m)
  assert.match(dockerfile, /printf '%s\\n' "\$APP_VERSION" > VERSION/)
  assert.match(dockerfile, /dist\/app-version\.json/)
  assert.match(workflow, /build-args: \|\n\s+APP_VERSION=\$\{\{ needs\.plan\.outputs\.version \}\}/)
  assert.match(workflow, /git config user\.name "github-actions\[bot\]"/)
  assert.match(workflow, /git config user\.email "41898282\+github-actions\[bot\]@users\.noreply\.github\.com"/)
})

test('release workflow는 push 전에 load한 planned image를 동일 version으로 smoke한다', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/release.yaml', import.meta.url), 'utf8')
  const smokeIndex = workflow.indexOf('- name: Smoke planned image')
  const pushIndex = workflow.indexOf('- name: Push verified Docker image')

  assert.ok(smokeIndex >= 0)
  assert.ok(pushIndex > smokeIndex)
  assert.match(workflow, /- name: Build planned image for smoke[\s\S]*?load: true[\s\S]*?push: false/)
  assert.match(workflow, /SMOKE_IMAGE: seonology-clock-page:release-verify-\$\{\{ needs\.plan\.outputs\.version \}\}/)
  assert.match(workflow, /SMOKE_SKIP_BUILD: '1'/)
  assert.match(workflow, /SMOKE_APP_VERSION: \$\{\{ needs\.plan\.outputs\.version \}\}/)
  assert.match(workflow, /- name: Smoke planned image[\s\S]*?run: node scripts\/container-smoke\.mjs/)
})

test('release workflow는 image push 직전에 remote main의 planned base SHA를 검증한다', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/release.yaml', import.meta.url), 'utf8')
  const preflightIndex = workflow.indexOf('- name: Verify planned base SHA before image push')
  const smokeIndex = workflow.indexOf('- name: Smoke planned image')
  const pushIndex = workflow.indexOf('- name: Push verified Docker image')

  assert.ok(preflightIndex >= 0)
  assert.ok(preflightIndex > smokeIndex)
  assert.ok(pushIndex > preflightIndex)
  assert.match(workflow, /RELEASE_BASE_SHA: \$\{\{ needs\.plan\.outputs\.base_sha \}\}/)
  assert.match(workflow, /- name: Verify planned base SHA before image push[\s\S]*?node scripts\/release-image-gate\.mjs/)
})

test('release workflow는 smoke한 단일 loaded artifact만 v tag와 latest로 push한다', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/release.yaml', import.meta.url), 'utf8')

  assert.equal((workflow.match(/uses: docker\/build-push-action@/g) ?? []).length, 1)
  assert.match(workflow, /- name: Build planned image for smoke[\s\S]*?load: true[\s\S]*?push: false[\s\S]*?ghcr\.io\/\$\{\{ steps\.lowercase\.outputs\.owner \}\}\/seonology-clock-page:v\$\{\{ needs\.plan\.outputs\.version \}\}[\s\S]*?ghcr\.io\/\$\{\{ steps\.lowercase\.outputs\.owner \}\}\/seonology-clock-page:latest/)
  assert.match(workflow, /- name: Push verified Docker image[\s\S]*?docker push ghcr\.io\/\$\{\{ steps\.lowercase\.outputs\.owner \}\}\/seonology-clock-page:v\$\{\{ needs\.plan\.outputs\.version \}\}[\s\S]*?docker push ghcr\.io\/\$\{\{ steps\.lowercase\.outputs\.owner \}\}\/seonology-clock-page:latest/)
})
