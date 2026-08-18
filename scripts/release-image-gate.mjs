import { ReleasePlanError, assertPlannedBaseSha, createGitAdapter } from './release-gate.mjs'

const baseSha = process.env.RELEASE_BASE_SHA
if (!baseSha) throw new ReleasePlanError('RELEASE_BASE_SHA is required')

assertPlannedBaseSha({ baseSha, git: createGitAdapter() })
