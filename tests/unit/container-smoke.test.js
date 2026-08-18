import assert from 'node:assert/strict'
import test from 'node:test'

import { parsePublishedPort } from '../../scripts/container-smoke.mjs'

test('Docker의 loopback port 출력을 HTTP endpoint로 변환한다', () => {
  assert.equal(
    parsePublishedPort('127.0.0.1:32771\n'),
    'http://127.0.0.1:32771',
  )
})
