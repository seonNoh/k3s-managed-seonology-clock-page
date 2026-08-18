import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  GithubReleaseError,
  ReleasePlanError,
  createGithubAdapter,
  createChangelogSection,
  createGitAdapter,
  planRepositoryRelease,
  planRelease,
  publishRelease,
  writeGithubOutput,
} from '../../scripts/release-gate.mjs'

const base = { version: '1.2.3', baseSha: 'a'.repeat(40) }

test('release 대상 commit이 없으면 plan은 release를 만들지 않는다', () => {
  const plan = planRelease({ ...base, commits: [{ subject: 'test: add coverage', body: '' }] })
  assert.deepEqual(plan, { ...base, released: false, nextVersion: '', commits: [] })
})

test('fix는 patch release를 계산한다', () => {
  const plan = planRelease({ ...base, commits: [{ subject: 'fix: repair clock', body: '' }] })
  assert.equal(plan.nextVersion, '1.2.4')
})

test('feat는 patch보다 우선하는 minor release를 계산한다', () => {
  const plan = planRelease({ ...base, commits: [
    { subject: 'fix: repair clock', body: '' },
    { subject: 'feat: add timezone', body: '' },
  ] })
  assert.equal(plan.nextVersion, '1.3.0')
})

test('breaking change는 0.x에서 minor, 1.x에서 major를 계산한다', () => {
  assert.equal(planRelease({ version: '0.8.4', baseSha: 'b', commits: [{ subject: 'feat!: replace API', body: '' }] }).nextVersion, '0.9.0')
  assert.equal(planRelease({ ...base, commits: [{ subject: 'fix: change API', body: 'BREAKING CHANGE: old endpoint removed' }] }).nextVersion, '2.0.0')
})

test('malformed VERSION은 명시적으로 거부한다', () => {
  assert.throws(() => planRelease({ ...base, version: '1.2', commits: [] }), ReleasePlanError)
})

test('malformed release tag은 planner가 무시하지 않고 거부한다', () => {
  const git = createGitAdapter({ run: () => ({ status: 0, stdout: 'v1.2\n' }) })
  assert.throws(() => git.latestSemverTag(), ReleasePlanError)
})

test('release commit은 [skip ci]와 함께 release 대상에서 제외한다', () => {
  const plan = planRelease({ ...base, commits: [{ subject: 'chore(release): 1.2.4 [skip ci]', body: '' }] })
  assert.equal(plan.released, false)
})

test('changelog은 type과 subject 기준으로 결정적으로 정렬한다', () => {
  const section = createChangelogSection({
    version: '1.3.0',
    date: '2026-08-18',
    commits: [
      { type: 'fix', subject: 'fix: zebra' },
      { type: 'feat', subject: 'feat: alpha' },
      { type: 'fix', subject: 'fix: apple' },
    ],
  })
  assert.equal(section, '## [1.3.0] - 2026-08-18\n\n### Features\n\n- feat: alpha\n\n### Fixes\n\n- fix: apple\n- fix: zebra\n')
})

test('GITHUB_OUTPUT에 기존 released/version 계약을 기록한다', () => {
  const directory = mkdtempSync(join(tmpdir(), 'release-output-'))
  const outputPath = join(directory, 'output')
  try {
    writeGithubOutput({ released: true, nextVersion: '1.2.4', baseSha: 'base' }, outputPath)
    assert.equal(readFileSync(outputPath, 'utf8'), 'released=true\nversion=1.2.4\nbase_sha=base\n')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('stale remote이면 publish는 파일 또는 git mutation 전에 중단한다', async () => {
  const writes = []
  await assert.rejects(() => publishRelease({
    plan: { ...base, released: true, nextVersion: '1.2.4', commits: [{ type: 'fix', subject: 'fix: repair clock' }] },
    files: { read: () => '# Changelog\n', write: (...args) => writes.push(args) },
    git: { remoteMainSha: () => 'different' },
    github: { createRelease: async () => {} },
  }), /stale release plan/)
  assert.deepEqual(writes, [])
})

test('GitHub API 오류는 token과 response body를 노출하지 않는다', async () => {
  const token = 'secret-token'
  const github = {
    createRelease: async () => { throw new GithubReleaseError(`GitHub release request failed (status 500): ${token} body`) },
  }
  await assert.rejects(() => publishRelease({
    plan: { ...base, released: true, nextVersion: '1.2.4', commits: [{ type: 'fix', subject: 'fix: repair clock' }] },
    files: { read: () => '# Changelog\n', write: () => {} },
    git: { remoteMainSha: () => base.baseSha, stageRelease: () => {}, commitRelease: () => {}, tagRelease: () => {}, pushRelease: () => {} },
    github,
  }), (error) => error instanceof GithubReleaseError && !error.message.includes(token) && !error.message.includes('body'))
})

test('GitHub REST adapter도 실패 response body를 노출하지 않는다', async () => {
  const token = 'secret-token'
  const github = createGithubAdapter({
    token,
    repository: 'owner/repo',
    fetchImpl: async () => ({ ok: false, status: 500, text: async () => token }),
  })
  await assert.rejects(() => github.createRelease('1.2.4', 'notes'), (error) => error instanceof GithubReleaseError && !error.message.includes(token))
})

test('no-release publish는 파일, git, network mutation을 수행하지 않는다', async () => {
  const forbidden = () => { throw new Error('must not be called') }
  const result = await publishRelease({
    plan: { ...base, released: false, nextVersion: '', commits: [] },
    files: { read: forbidden, write: forbidden },
    git: { remoteMainSha: forbidden },
    github: { createRelease: forbidden },
  })
  assert.equal(result.released, false)
})

test('git adapter는 주입된 command runner로 명령을 실행한다', () => {
  const calls = []
  const git = createGitAdapter({ run: (command, args) => { calls.push([command, args]); return { status: 0, stdout: 'a'.repeat(40) + '\trefs/heads/main\n' } } })
  assert.equal(git.remoteMainSha(), 'a'.repeat(40))
  assert.deepEqual(calls, [['git', ['ls-remote', 'origin', 'refs/heads/main']]])
})

test('임시 git repository에서 tag 이후 commit으로 release를 계획한다', () => {
  const directory = mkdtempSync(join(tmpdir(), 'release-plan-git-'))
  const runGit = (args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8' })
  try {
    runGit(['init', '--quiet'])
    runGit(['config', 'user.name', 'Release Test'])
    runGit(['config', 'user.email', 'release-test@example.invalid'])
    writeFileSync(join(directory, 'VERSION'), '0.1.0\n')
    runGit(['add', 'VERSION'])
    runGit(['commit', '--quiet', '-m', 'chore: initial version'])
    runGit(['tag', 'v0.1.0'])
    writeFileSync(join(directory, 'feature.txt'), 'timezone\n')
    runGit(['add', 'feature.txt'])
    runGit(['commit', '--quiet', '-m', 'feat: add timezone'])
    const git = createGitAdapter({ run: (command, args) => {
      const result = spawnSync(command, args, { cwd: directory, encoding: 'utf8' })
      return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
    } })
    const plan = planRepositoryRelease({ git, version: '0.1.0' })
    assert.deepEqual({ released: plan.released, nextVersion: plan.nextVersion }, { released: true, nextVersion: '0.2.0' })
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
