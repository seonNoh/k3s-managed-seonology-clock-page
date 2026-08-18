import {
  ReleasePlanError,
  createGithubAdapter,
  planRepositoryRelease,
  publishRelease,
} from './release-gate.mjs'

function requiredEnvironment(name) {
  const value = process.env[name]
  if (!value) throw new ReleasePlanError(`${name} is required`)
  return value
}

const plannedBaseSha = requiredEnvironment('RELEASE_BASE_SHA')
const plannedVersion = requiredEnvironment('RELEASE_VERSION')
const plan = planRepositoryRelease()

if (!plan.released || plan.baseSha !== plannedBaseSha || plan.nextVersion !== plannedVersion) {
  throw new ReleasePlanError('stale release plan: repository state differs from the approved plan')
}

await publishRelease({
  plan,
  github: createGithubAdapter({
    token: requiredEnvironment('GITHUB_TOKEN'),
    repository: requiredEnvironment('GITHUB_REPOSITORY'),
  }),
})
