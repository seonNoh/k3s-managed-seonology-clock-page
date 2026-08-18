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

test('allowlist 밖 conventional type의 breaking change도 major release를 계산한다', () => {
  assert.equal(planRelease({ ...base, commits: [{ subject: 'build!: replace image contract', body: '' }] }).nextVersion, '2.0.0')
  assert.equal(planRelease({ ...base, commits: [{ subject: 'ci: replace runner', body: 'BREAKING CHANGE: older runner is unsupported' }] }).nextVersion, '2.0.0')
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

test('일반 feat의 [skip ci]는 release 대상에서 제외하지 않는다', () => {
  const plan = planRelease({ ...base, commits: [{ subject: 'feat: keep image version [skip ci]', body: '' }] })
  assert.equal(plan.nextVersion, '1.3.0')
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

test('release date가 있으면 GITHUB_OUTPUT에 함께 기록한다', () => {
  const directory = mkdtempSync(join(tmpdir(), 'release-output-date-'))
  const outputPath = join(directory, 'output')
  try {
    writeGithubOutput({ released: true, nextVersion: '1.2.4', baseSha: 'base', releaseDate: '2026-08-18' }, outputPath)
    assert.equal(readFileSync(outputPath, 'utf8'), 'released=true\nversion=1.2.4\nbase_sha=base\nrelease_date=2026-08-18\n')
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

test('GitHub REST adapter는 POST 전에 기존 tag release를 조회한다', async () => {
  const calls = []
  const github = createGithubAdapter({
    token: 'token',
    repository: 'owner/repo',
    fetchImpl: async (url, options) => {
      calls.push({ url, options })
      return { ok: true, status: 200, json: async () => ({ tag_name: 'v1.2.4', name: 'v1.2.4', body: 'notes', prerelease: false, draft: false }) }
    },
  })
  const result = await github.ensureRelease('1.2.4', 'notes')
  assert.equal(result.created, false)
  assert.deepEqual(calls.map(({ options }) => options.method), ['GET'])
})

test('GitHub REST adapter는 기존 release의 모든 기대 필드가 일치할 때만 성공한다', async () => {
  const expected = { tag_name: 'v1.2.4', name: 'v1.2.4', body: 'notes', prerelease: false, draft: false }
  for (const field of Object.keys(expected)) {
    const github = createGithubAdapter({
      token: 'token',
      repository: 'owner/repo',
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ ...expected, [field]: field === 'prerelease' || field === 'draft' ? true : 'different' }) }),
    })
    await assert.rejects(() => github.ensureRelease('1.2.4', 'notes'), GithubReleaseError)
  }
})

test('GitHub REST adapter는 tag release가 없을 때만 POST한다', async () => {
  const methods = []
  const github = createGithubAdapter({
    token: 'token',
    repository: 'owner/repo',
    fetchImpl: async (_url, options) => {
      methods.push(options.method)
      return options.method === 'GET'
        ? { ok: false, status: 404 }
        : { ok: true, status: 201, json: async () => ({}) }
    },
  })
  assert.deepEqual(await github.ensureRelease('1.2.4', 'notes'), { created: true })
  assert.deepEqual(methods, ['GET', 'POST'])
})

test('GitHub REST adapter는 POST 422 경쟁 뒤 GET 재조회로 동일 release를 수락한다', async () => {
  const methods = []
  const github = createGithubAdapter({
    token: 'token',
    repository: 'owner/repo',
    fetchImpl: async (_url, options) => {
      methods.push(options.method)
      if (methods.length === 1) return { ok: false, status: 404 }
      if (methods.length === 2) return { ok: false, status: 422 }
      return { ok: true, status: 200, json: async () => ({ tag_name: 'v1.2.4', name: 'v1.2.4', body: 'notes', prerelease: false, draft: false }) }
    },
  })
  assert.deepEqual(await github.ensureRelease('1.2.4', 'notes'), { created: false })
  assert.deepEqual(methods, ['GET', 'POST', 'GET'])
})

test('GitHub REST adapter는 POST 422 뒤 불일치 release를 fail-closed 한다', async () => {
  let calls = 0
  const github = createGithubAdapter({
    token: 'token',
    repository: 'owner/repo',
    fetchImpl: async () => {
      calls += 1
      if (calls === 1) return { ok: false, status: 404 }
      if (calls === 2) return { ok: false, status: 422 }
      return { ok: true, status: 200, json: async () => ({ tag_name: 'v1.2.4', name: 'v1.2.4', body: 'other', prerelease: false, draft: false }) }
    },
  })
  await assert.rejects(() => github.ensureRelease('1.2.4', 'notes'), GithubReleaseError)
})

test('이미 git publish된 stale plan은 GitHub Release 단계만 재개한다', async () => {
  const writes = []
  const result = await publishRelease({
    plan: { ...base, released: true, nextVersion: '1.2.4', commits: [{ type: 'fix', subject: 'fix: repair clock' }] },
    files: { read: () => '# Changelog\n', write: (...args) => writes.push(args) },
    git: { remoteMainSha: () => 'release-commit', isPublishedRelease: () => true },
    github: { ensureRelease: async () => ({ created: true }) },
  })
  assert.equal(result.recovered, true)
  assert.deepEqual(writes, [])
})

test('API-only recovery는 annotated tag, parent, VERSION, changelog provenance를 모두 요구한다', () => {
  const baseSha = 'a'.repeat(40)
  const releaseSha = 'b'.repeat(40)
  const tagObjectSha = 'c'.repeat(40)
  const version = '1.2.4'
  const notes = '## [1.2.4] - 2026-08-18\n\n### Fixes\n\n- fix: publish'
  const runFor = (overrides = {}) => (_command, args) => {
    const key = args.join(' ')
    const defaults = {
      [`fetch --quiet origin main refs/tags/v${version}`]: { status: 0, stdout: '' },
      'rev-parse origin/main': { status: 0, stdout: `${releaseSha}\n` },
      [`cat-file -t refs/tags/v${version}`]: { status: 0, stdout: 'tag\n' },
      [`rev-parse refs/tags/v${version}`]: { status: 0, stdout: `${tagObjectSha}\n` },
      [`rev-parse refs/tags/v${version}^{commit}`]: { status: 0, stdout: `${releaseSha}\n` },
      [`ls-remote origin refs/tags/v${version} refs/tags/v${version}^{}`]: { status: 0, stdout: `${tagObjectSha}\trefs/tags/v${version}\n${releaseSha}\trefs/tags/v${version}^{}\n` },
      [`rev-parse ${releaseSha}^`]: { status: 0, stdout: `${baseSha}\n` },
      [`log -1 --format=%s refs/tags/v${version}`]: { status: 0, stdout: `chore(release): ${version} [skip ci]\n` },
      [`show ${releaseSha}:VERSION`]: { status: 0, stdout: `${version}\n` },
      [`show ${releaseSha}:CHANGELOG.md`]: { status: 0, stdout: `${notes}\n\n# Changelog\n` },
      [`merge-base --is-ancestor ${releaseSha} ${releaseSha}`]: { status: 0, stdout: '' },
    }
    return overrides[key] ?? defaults[key] ?? { status: 1, stdout: '', stderr: 'unexpected command' }
  }
  const input = { baseSha, version, notes }
  assert.equal(createGitAdapter({ run: runFor() }).isPublishedRelease(input), true)
  assert.equal(createGitAdapter({ run: runFor({ [`cat-file -t refs/tags/v${version}`]: { status: 0, stdout: 'commit\n' } }) }).isPublishedRelease(input), false)
  assert.equal(createGitAdapter({ run: runFor({ [`rev-parse ${releaseSha}^`]: { status: 0, stdout: `${'d'.repeat(40)}\n` } }) }).isPublishedRelease(input), false)
  assert.equal(createGitAdapter({ run: runFor({ [`show ${releaseSha}:VERSION`]: { status: 0, stdout: '9.9.9\n' } }) }).isPublishedRelease(input), false)
  assert.equal(createGitAdapter({ run: runFor({ [`show ${releaseSha}:CHANGELOG.md`]: { status: 0, stdout: '## [1.2.4] - 2026-08-18\n\n### Fixes\n\n- fake\n' } }) }).isPublishedRelease(input), false)
  assert.equal(createGitAdapter({ run: runFor({ [`ls-remote origin refs/tags/v${version} refs/tags/v${version}^{}`]: { status: 0, stdout: `${tagObjectSha}\trefs/tags/v${version}\n${'d'.repeat(40)}\trefs/tags/v${version}^{}\n` } }) }).isPublishedRelease(input), false)
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

test('git adapter는 branch와 annotated tag를 atomic push 하나로 전송한다', () => {
  const calls = []
  const git = createGitAdapter({ run: (command, args) => { calls.push([command, args]); return { status: 0, stdout: '' } } })
  git.pushRelease('1.2.4')
  assert.deepEqual(calls, [['git', ['push', '--atomic', 'origin', 'HEAD:main', 'refs/tags/v1.2.4']]])
})

test('latest semver tag는 생성 시각이 아닌 가장 큰 stable version을 선택한다', () => {
  const git = createGitAdapter({ run: () => ({ status: 0, stdout: 'v1.9.0\nv1.10.0\nv1.8.9\n' }) })
  assert.equal(git.latestSemverTag(), 'v1.10.0')
})

test('stable tag 선택은 v 접두사 없는 tag를 무시한다', () => {
  const git = createGitAdapter({ run: () => ({ status: 0, stdout: '1.99.0\nv1.9.0\nv1.10.0\n' }) })
  assert.equal(git.latestSemverTag(), 'v1.10.0')
})

test('VERSION과 latest tag가 다르면 repository plan을 fail-closed 한다', () => {
  const git = {
    latestSemverTag: () => 'v1.2.4',
    headSha: () => 'base',
    commitsSince: () => [],
  }
  assert.throws(() => planRepositoryRelease({ git, version: '1.2.3' }), ReleasePlanError)
})

test('tag가 없는 bootstrap은 VERSION을 base로 전체 history를 계획한다', () => {
  const calls = []
  const git = {
    latestSemverTag: () => '',
    headSha: () => 'base',
    commitsSince: (tag) => { calls.push(tag); return [{ subject: 'feat: first release', body: '' }] },
  }
  const plan = planRepositoryRelease({ git, version: '0.0.0' })
  assert.equal(plan.nextVersion, '0.1.0')
  assert.deepEqual(calls, [''])
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

test('임시 bare remote에 author identity와 atomic release commit/tag를 게시하고 API만 재개한다', async () => {
  const remote = mkdtempSync(join(tmpdir(), 'release-remote-'))
  const directory = mkdtempSync(join(tmpdir(), 'release-publish-git-'))
  const gitAt = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8' })
  try {
    gitAt(remote, ['init', '--bare', '--quiet'])
    gitAt(directory, ['init', '--quiet', '--initial-branch=main'])
    gitAt(directory, ['config', 'user.name', 'github-actions[bot]'])
    gitAt(directory, ['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'])
    gitAt(directory, ['remote', 'add', 'origin', remote])
    writeFileSync(join(directory, 'VERSION'), '1.2.3\n')
    writeFileSync(join(directory, 'CHANGELOG.md'), '# Changelog\n')
    gitAt(directory, ['add', 'VERSION', 'CHANGELOG.md'])
    gitAt(directory, ['commit', '--quiet', '-m', 'chore: bootstrap'])
    gitAt(directory, ['push', '--quiet', '--set-upstream', 'origin', 'main'])
    const baseSha = gitAt(directory, ['rev-parse', 'HEAD']).trim()
    const git = createGitAdapter({ run: (command, args) => {
      const result = spawnSync(command, args, { cwd: directory, encoding: 'utf8' })
      return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
    } })
    const plan = { version: '1.2.3', baseSha, released: true, nextVersion: '1.2.4', commits: [{ type: 'fix', subject: 'fix: atomic publish', breaking: false }] }
    const files = {
      read: (path) => readFileSync(join(directory, path), 'utf8'),
      write: (path, content) => writeFileSync(join(directory, path), content),
    }
    let calls = 0
    await publishRelease({ plan, git, files, github: { ensureRelease: async () => { calls += 1; return { created: true } } } })
    assert.equal(gitAt(remote, ['show-ref', '--verify', '--quiet', 'refs/heads/main']), '')
    assert.equal(gitAt(remote, ['show-ref', '--verify', '--quiet', 'refs/tags/v1.2.4']), '')
    assert.match(gitAt(remote, ['log', '-1', '--format=%an <%ae>', 'refs/heads/main']), /github-actions\[bot\] <41898282\+github-actions\[bot\]@users\.noreply\.github\.com>/)

    const writes = []
    const recovered = await publishRelease({
      plan,
      git,
      files: { read: () => '# Changelog\n', write: (...args) => writes.push(args) },
      github: { ensureRelease: async () => { calls += 1; return { created: false } } },
    })
    assert.equal(recovered.recovered, true)
    assert.equal(calls, 2)
    assert.deepEqual(writes, [])
  } finally {
    rmSync(remote, { recursive: true, force: true })
    rmSync(directory, { recursive: true, force: true })
  }
})
