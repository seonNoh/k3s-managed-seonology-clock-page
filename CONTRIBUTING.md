# Contributing

Keep changes focused on this repository. Central GitOps `main`, Argo CD, live workloads, repository settings, mirrors, and original GitHub workflow state are coordinated separately.

## Required checks

```sh
npm ci
npm ci --prefix api
npm ci --prefix toolkit-extension
python3 verify.py --repository .
npm run lint
npm run test:unit
npm run test:api
npm run test:e2e
npm run build
npm run smoke:container
```

Use synthetic fixtures and sanitize logs. Write an English Conventional Commit title and a Korean body that explains the reason and impact. Do not add automated authorship or co-author trailers.

Do not modify `.github/workflows/`; it is byte-preserved migration evidence. Gitea delivery belongs in `.gitea/workflows/` and must not use GHCR, GitHub tokens, or the GitHub API. OCI images must remain one index for `linux/amd64` and `linux/arm64`.

Keep the three README files structurally aligned and their fenced command blocks byte-identical. Update all three language variants and the same pedia records when a diagram changes. Never commit or print tokens, passwords, private keys, OAuth client secrets, encryption keys, NAS credentials, or personal data.
