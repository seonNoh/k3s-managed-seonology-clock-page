import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const RELEASE_TYPES = ['feat', 'fix', 'chore', 'refactor', 'docs', 'perf']
const TYPE_HEADINGS = { feat: 'Features', fix: 'Fixes', chore: 'Chores', refactor: 'Refactors', docs: 'Documentation', perf: 'Performance' }
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const COMMIT_PATTERN = /^([a-z]+)(?:\([^)]*\))?(!)?:\s+(.+)$/

export class ReleasePlanError extends Error {}
export class GithubReleaseError extends Error {}

function parseVersion(value, label = 'VERSION') {
  const match = VERSION_PATTERN.exec(String(value).trim())
  if (!match) throw new ReleasePlanError(`${label} must be a stable semantic version`)
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

function formatVersion(version) { return `${version.major}.${version.minor}.${version.patch}` }

function nextVersion(version, bump) {
  if (bump === 'major') return { major: version.major + 1, minor: 0, patch: 0 }
  if (bump === 'minor') return { major: version.major, minor: version.minor + 1, patch: 0 }
  return { major: version.major, minor: version.minor, patch: version.patch + 1 }
}

function compareVersions(left, right) {
  if (left.major !== right.major) return left.major - right.major
  if (left.minor !== right.minor) return left.minor - right.minor
  return left.patch - right.patch
}

function classifyCommit(commit) {
  const subject = String(commit.subject ?? '').trim()
  const body = String(commit.body ?? '')
  if (/^chore\(release\):\s+\d+\.\d+\.\d+\s+\[skip ci\]$/i.test(subject)) return null
  const match = COMMIT_PATTERN.exec(subject)
  if (!match) return null
  const breaking = match[2] === '!' || /^BREAKING[ -]CHANGE:/mi.test(body)
  if (!breaking && !RELEASE_TYPES.includes(match[1])) return null
  return { type: match[1], subject, breaking }
}

function calculateBump(version, commits) {
  if (commits.some((commit) => commit.breaking)) return version.major === 0 ? 'minor' : 'major'
  if (commits.some((commit) => commit.type === 'feat')) return 'minor'
  return commits.length ? 'patch' : null
}

export function planRelease({ version, baseSha, commits, releaseDate }) {
  const parsedVersion = parseVersion(version)
  if (!baseSha) throw new ReleasePlanError('release plan requires a base SHA')
  const releaseCommits = commits.map(classifyCommit).filter(Boolean)
  const bump = calculateBump(parsedVersion, releaseCommits)
  const plan = {
    version: formatVersion(parsedVersion), baseSha, released: Boolean(bump),
    nextVersion: bump ? formatVersion(nextVersion(parsedVersion, bump)) : '',
    commits: releaseCommits,
  }
  if (releaseDate) plan.releaseDate = releaseDate
  return plan
}

function defaultRun(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' })
  if (result.error) throw result.error
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

function requireSuccess(run, args) {
  const result = run('git', args)
  if (result.status !== 0) throw new ReleasePlanError(`git ${args[0]} failed`)
  return result.stdout
}

function commandSucceeded(run, args) {
  return run('git', args).status === 0
}

export function assertPlannedBaseSha({ baseSha, git = createGitAdapter() } = {}) {
  if (!baseSha || git.remoteMainSha() !== baseSha) {
    throw new ReleasePlanError('stale release plan: origin/main no longer matches the planned base SHA')
  }
}

function parseLog(output) {
  const fields = output.split('\0')
  const commits = []
  for (let index = 0; index + 1 < fields.length; index += 2) if (fields[index]) commits.push({ subject: fields[index], body: fields[index + 1] })
  return commits
}

export function createGitAdapter({ run = defaultRun } = {}) {
  return {
    headSha: () => requireSuccess(run, ['rev-parse', 'HEAD']).trim(),
    latestSemverTag() {
      const tags = requireSuccess(run, ['tag', '--merged', 'HEAD']).trim().split('\n').filter(Boolean)
      const versions = []
      for (const tag of tags) {
        if (!tag.startsWith('v')) continue
        const tagVersion = tag.slice(1)
        if (/^\d/.test(tagVersion)) versions.push({ tag, version: parseVersion(tagVersion, `tag ${tag}`) })
      }
      return versions.sort((left, right) => compareVersions(right.version, left.version))[0]?.tag ?? ''
    },
    commitsSince(tag) { return parseLog(requireSuccess(run, ['log', tag ? `${tag}..HEAD` : 'HEAD', '--format=%s%x00%b%x00'])) },
    remoteMainSha() { return requireSuccess(run, ['ls-remote', 'origin', 'refs/heads/main']).trim().split(/\s+/)[0] ?? '' },
    stageRelease() { requireSuccess(run, ['add', 'VERSION', 'CHANGELOG.md']) },
    commitRelease(version) { requireSuccess(run, ['commit', '-m', `chore(release): ${version} [skip ci]`]) },
    tagRelease(version) { requireSuccess(run, ['tag', '-a', `v${version}`, '-m', `Release v${version}`]) },
    pushRelease(version) { requireSuccess(run, ['push', '--atomic', 'origin', 'HEAD:main', `refs/tags/v${version}`]) },
    isPublishedRelease({ baseSha, version, notes }) {
      if (!commandSucceeded(run, ['fetch', '--quiet', 'origin', 'main', `refs/tags/v${version}`])) return false
      try {
        const tag = `refs/tags/v${version}`
        const remoteMain = requireSuccess(run, ['rev-parse', 'origin/main']).trim()
        const localTagObject = requireSuccess(run, ['rev-parse', tag]).trim()
        const tagCommit = requireSuccess(run, ['rev-parse', `${tag}^{commit}`]).trim()
        const tagType = requireSuccess(run, ['cat-file', '-t', tag]).trim()
        const remoteRefs = requireSuccess(run, ['ls-remote', 'origin', tag, `${tag}^{}`]).trim().split('\n')
          .map((line) => line.split(/\s+/)).reduce((refs, [sha, name]) => ({ ...refs, [name]: sha }), {})
        const parents = requireSuccess(run, ['rev-list', '--parents', '-n', '1', tagCommit]).trim().split(/\s+/)
        const subject = requireSuccess(run, ['log', '-1', '--format=%s', tag]).trim()
        const taggedVersion = requireSuccess(run, ['show', `${tagCommit}:VERSION`]).trim()
        const changelog = requireSuccess(run, ['show', `${tagCommit}:CHANGELOG.md`])
        const baseChangelog = requireSuccess(run, ['show', `${baseSha}:CHANGELOG.md`])
        const changedFiles = requireSuccess(run, ['diff-tree', '--no-commit-id', '--name-only', '-r', tagCommit]).trim().split('\n').filter(Boolean).sort()
        return tagType === 'tag'
          && remoteRefs[tag] === localTagObject
          && remoteRefs[`${tag}^{}`] === tagCommit
          && parents.length === 2
          && parents[0] === tagCommit
          && parents[1] === baseSha
          && subject === `chore(release): ${version} [skip ci]`
          && taggedVersion === version
          && changedFiles.length === 2
          && changedFiles[0] === 'CHANGELOG.md'
          && changedFiles[1] === 'VERSION'
          && changelog === `${notes}\n\n${baseChangelog}`
          && commandSucceeded(run, ['merge-base', '--is-ancestor', tagCommit, remoteMain])
      } catch {
        return false
      }
    },
  }
}

function readVersion(versionPath = 'VERSION') {
  if (!existsSync(versionPath)) throw new ReleasePlanError(`missing ${versionPath}`)
  return readFileSync(versionPath, 'utf8').trim()
}

export function planRepositoryRelease({ git = createGitAdapter(), version = readVersion(), releaseDate } = {}) {
  const parsedVersion = parseVersion(version)
  const tag = git.latestSemverTag()
  const tagVersion = tag ? parseVersion(tag.replace(/^v/, ''), `tag ${tag}`) : null
  if (tagVersion && compareVersions(parsedVersion, tagVersion) !== 0) {
    throw new ReleasePlanError(`VERSION ${formatVersion(parsedVersion)} does not match latest tag ${tag}`)
  }
  return planRelease({ version: tagVersion ? formatVersion(tagVersion) : formatVersion(parsedVersion), baseSha: git.headSha(), commits: git.commitsSince(tag), releaseDate })
}

export function createChangelogSection({ version, date, commits }) {
  parseVersion(version)
  const groups = new Map(RELEASE_TYPES.map((type) => [type, []]))
  const breakingSubjects = commits.filter((commit) => commit.breaking).map((commit) => commit.subject)
  for (const commit of commits) if (!commit.breaking) groups.get(commit.type)?.push(commit.subject)
  const sections = []
  if (breakingSubjects.length) sections.push(`### Breaking Changes\n\n${breakingSubjects.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)).map((subject) => `- ${subject}`).join('\n')}`)
  for (const type of RELEASE_TYPES) {
    const subjects = groups.get(type).sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
    if (subjects.length) sections.push(`### ${TYPE_HEADINGS[type]}\n\n${subjects.map((subject) => `- ${subject}`).join('\n')}`)
  }
  return `## [${version}] - ${date}\n\n${sections.join('\n\n')}\n`
}

export function writeGithubOutput(plan, outputPath = process.env.GITHUB_OUTPUT) {
  const output = `released=${plan.released}\nversion=${plan.nextVersion}\nbase_sha=${plan.baseSha}\n${plan.releaseDate ? `release_date=${plan.releaseDate}\n` : ''}`
  if (outputPath) appendFileSync(outputPath, output)
  return output
}

export function createGithubAdapter({ token, repository, fetchImpl = fetch } = {}) {
  if (!token) throw new GithubReleaseError('GITHUB_TOKEN is required')
  if (!repository) throw new GithubReleaseError('GITHUB_REPOSITORY is required')
  return {
    async ensureRelease(version, notes) {
      const tag = `v${version}`
      const expected = { tag_name: tag, name: tag, body: notes, prerelease: false, draft: false }
      const matchesExpectedRelease = (release) => Object.entries(expected).every(([field, value]) => release[field] === value)
      const getRelease = async () => {
        let response
        try {
          response = await fetchImpl(`https://api.github.com/repos/${repository}/releases/tags/${tag}`, {
            method: 'GET', headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
          })
        } catch { throw new GithubReleaseError('GitHub release request failed') }
        if (!response.ok) return { response }
        try { return { response, release: await response.json() } } catch { throw new GithubReleaseError('GitHub release request failed') }
      }
      const existing = await getRelease()
      if (existing.response.ok) {
        if (!matchesExpectedRelease(existing.release)) throw new GithubReleaseError('GitHub release mismatch')
        return { created: false }
      }
      if (existing.response.status !== 404) throw new GithubReleaseError(`GitHub release request failed (status ${existing.response.status})`)
      let response
      try {
        response = await fetchImpl(`https://api.github.com/repos/${repository}/releases`, {
          method: 'POST', headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
          body: JSON.stringify(expected),
        })
      } catch { throw new GithubReleaseError('GitHub release request failed') }
      if (response.status === 422) {
        const retried = await getRelease()
        if (retried.response.ok && matchesExpectedRelease(retried.release)) return { created: false }
        if (retried.response.ok) throw new GithubReleaseError('GitHub release mismatch')
      }
      if (!response.ok) throw new GithubReleaseError(`GitHub release request failed (status ${response.status})`)
      return { created: true }
    },
    async createRelease(version, notes) { return this.ensureRelease(version, notes) },
  }
}

async function ensureGithubRelease(github, version, notes) {
  if (github.ensureRelease) return github.ensureRelease(version, notes)
  return github.createRelease(version, notes)
}

export async function publishRelease({ plan, git = createGitAdapter(), files = { read: (path) => readFileSync(path, 'utf8'), write: writeFileSync }, github, date } = {}) {
  if (!plan?.released) return plan
  const notes = createChangelogSection({ version: plan.nextVersion, date: plan.releaseDate ?? date ?? new Date().toISOString().slice(0, 10), commits: plan.commits }).trim()
  try { assertPlannedBaseSha({ baseSha: plan.baseSha, git }) } catch {
    if (git.isPublishedRelease?.({ baseSha: plan.baseSha, version: plan.nextVersion, notes })) {
      try { await ensureGithubRelease(github, plan.nextVersion, notes) } catch (error) {
        const status = error instanceof GithubReleaseError ? /status \d+/.exec(error.message)?.[0] : ''
        throw new GithubReleaseError(`GitHub release request failed${status ? ` (${status})` : ''}`)
      }
      return { ...plan, recovered: true }
    }
    throw new ReleasePlanError('stale release plan: origin/main no longer matches the planned base SHA')
  }
  files.write('VERSION', `${plan.nextVersion}\n`)
  files.write('CHANGELOG.md', `${notes}\n\n${files.read('CHANGELOG.md')}`)
  git.stageRelease(); git.commitRelease(plan.nextVersion); git.tagRelease(plan.nextVersion); git.pushRelease(plan.nextVersion)
  try { await ensureGithubRelease(github, plan.nextVersion, notes) } catch (error) {
    const status = error instanceof GithubReleaseError ? /status \d+/.exec(error.message)?.[0] : ''
    throw new GithubReleaseError(`GitHub release request failed${status ? ` (${status})` : ''}`)
  }
  return plan
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const plan = planRepositoryRelease({ releaseDate: new Date().toISOString().slice(0, 10) })
  process.stdout.write(writeGithubOutput(plan))
}
