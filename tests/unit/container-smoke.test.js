import assert from 'node:assert/strict'
import test from 'node:test'

import { createReadonlyRuntimeArgs, parsePublishedPort } from '../../scripts/container-smoke.mjs'

test('Docker의 loopback port 출력을 HTTP endpoint로 변환한다', () => {
  assert.equal(
    parsePublishedPort('127.0.0.1:32771\n'),
    'http://127.0.0.1:32771',
  )
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
