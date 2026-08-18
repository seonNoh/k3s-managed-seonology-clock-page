import assert from 'node:assert/strict'
import test from 'node:test'

import { evaluateRelease } from '../../scripts/release-gate.mjs'

test('VERSION이 바뀌면 새 release와 version을 출력한다', () => {
  assert.deepEqual(evaluateRelease('1.51.1', '1.51.2'), {
    released: true,
    version: '1.51.2',
  })
})

test('VERSION이 같으면 image push를 건너뛴다', () => {
  assert.deepEqual(evaluateRelease('1.51.1', '1.51.1'), {
    released: false,
    version: '',
  })
})

test('release 전후 VERSION이 없으면 image push를 건너뛴다', () => {
  assert.deepEqual(evaluateRelease('', ''), {
    released: false,
    version: '',
  })
})
