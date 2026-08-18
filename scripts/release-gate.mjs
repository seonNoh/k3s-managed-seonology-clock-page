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

function classifyCommit(commit) {
  const subject = String(commit.subject ?? '').trim()
  const body = String(commit.body ?? '')
  if (/\[skip ci\]/i.test(subject)) return null
  const match = COMMIT_PATTERN.exec(subject)
  if (!match || !RELEASE_TYPES.includes(match[1])) return null
  return { type: match[1], subject, breaking: match[2] === '!' || /^BREAKING[ -]CHANGE:/mi.test(body) }
}

function calculateBump(version, commits) {
  if (commits.some((commit) => commit.breaking)) return version.major === 0 ? 'minor' : 'major'
  if (commits.some((commit) => commit.type === 'feat')) return 'minor'
  return commits.length ? 'patch' : null
}

export function planRelease({ version, baseSha, commits }) {
  const parsedVersion = parseVersion(version)
  if (!baseSha) throw new ReleasePlanError('release plan requires a base SHA')
  const releaseCommits = commits.map(classifyCommit).filter(Boolean)
  const bump = calculateBump(parsedVersion, releaseCommits)
  return {
    version: formatVersion(parsedVersion), baseSha, released: Boolean(bump),
    nextVersion: bump ? formatVersion(nextVersion(parsedVersion, bump)) : '',
    commits: releaseCommits,
  }
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
      const tags = requireSuccess(run, ['tag', '--merged', 'HEAD', '--sort=-creatordate']).trim().split('\n').filter(Boolean)
      for (const tag of tags) {
        const tagVersion = tag.startsWith('v') ? tag.slice(1) : tag
        if (/^\d/.test(tagVersion)) {
          parseVersion(tagVersion, `tag ${tag}`)
          return tag
        }
      }
      return ''
    },
    commitsSince(tag) { return parseLog(requireSuccess(run, ['log', tag ? `${tag}..HEAD` : 'HEAD', '--format=%s%x00%b%x00'])) },
    remoteMainSha() { return requireSuccess(run, ['ls-remote', 'origin', 'refs/heads/main']).trim().split(/\s+/)[0] ?? '' },
    stageRelease() { requireSuccess(run, ['add', 'VERSION', 'CHANGELOG.md']) },
    commitRelease(version) { requireSuccess(run, ['commit', '-m', `chore(release): ${version} [skip ci]`]) },
    tagRelease(version) { requireSuccess(run, ['tag', '-a', `v${version}`, '-m', `Release v${version}`]) },
    pushRelease(version) { requireSuccess(run, ['push', 'origin', 'HEAD:main']); requireSuccess(run, ['push', 'origin', `v${version}`]) },
  }
}

function readVersion(versionPath = 'VERSION') {
  if (!existsSync(versionPath)) throw new ReleasePlanError(`missing ${versionPath}`)
  return readFileSync(versionPath, 'utf8').trim()
}

export function planRepositoryRelease({ git = createGitAdapter(), version = readVersion() } = {}) {
  parseVersion(version)
  const tag = git.latestSemverTag()
  return planRelease({ version: tag ? tag.replace(/^v/, '') : version, baseSha: git.headSha(), commits: git.commitsSince(tag) })
}

export function createChangelogSection({ version, date, commits }) {
  parseVersion(version)
  const groups = new Map(RELEASE_TYPES.map((type) => [type, []]))
  for (const commit of commits) groups.get(commit.type)?.push(commit.subject)
  const sections = []
  for (const type of RELEASE_TYPES) {
    const subjects = groups.get(type).sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
    if (subjects.length) sections.push(`### ${TYPE_HEADINGS[type]}\n\n${subjects.map((subject) => `- ${subject}`).join('\n')}`)
  }
  return `## [${version}] - ${date}\n\n${sections.join('\n\n')}\n`
}

export function writeGithubOutput(plan, outputPath = process.env.GITHUB_OUTPUT) {
  const output = `released=${plan.released}\nversion=${plan.nextVersion}\nbase_sha=${plan.baseSha}\n`
  if (outputPath) appendFileSync(outputPath, output)
  return output
}

export function createGithubAdapter({ token, repository, fetchImpl = fetch } = {}) {
  if (!token) throw new GithubReleaseError('GITHUB_TOKEN is required')
  if (!repository) throw new GithubReleaseError('GITHUB_REPOSITORY is required')
  return {
    async createRelease(version, notes) {
      let response
      try {
        response = await fetchImpl(`https://api.github.com/repos/${repository}/releases`, {
          method: 'POST', headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
          body: JSON.stringify({ tag_name: `v${version}`, name: `v${version}`, body: notes }),
        })
      } catch { throw new GithubReleaseError('GitHub release request failed') }
      if (!response.ok) throw new GithubReleaseError(`GitHub release request failed (status ${response.status})`)
    },
  }
}

export async function publishRelease({ plan, git = createGitAdapter(), files = { read: (path) => readFileSync(path, 'utf8'), write: writeFileSync }, github, date = new Date().toISOString().slice(0, 10) } = {}) {
  if (!plan?.released) return plan
  if (git.remoteMainSha() !== plan.baseSha) throw new ReleasePlanError('stale release plan: origin/main no longer matches the planned base SHA')
  const notes = createChangelogSection({ version: plan.nextVersion, date, commits: plan.commits }).trim()
  files.write('VERSION', `${plan.nextVersion}\n`)
  files.write('CHANGELOG.md', `${notes}\n\n${files.read('CHANGELOG.md')}`)
  git.stageRelease(); git.commitRelease(plan.nextVersion); git.tagRelease(plan.nextVersion); git.pushRelease(plan.nextVersion)
  try { await github.createRelease(plan.nextVersion, notes) } catch (error) {
    const status = error instanceof GithubReleaseError ? /status \d+/.exec(error.message)?.[0] : ''
    throw new GithubReleaseError(`GitHub release request failed${status ? ` (${status})` : ''}`)
  }
  return plan
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const plan = planRepositoryRelease()
  process.stdout.write(writeGithubOutput(plan))
}
