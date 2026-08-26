## Summary

<!-- Explain the change, reason, and operational impact. -->

## Component

- [ ] React dashboard or shared UI
- [ ] Express API
- [ ] Browser extension or toolkit
- [ ] Container image or Gitea workflow
- [ ] Documentation or SVG assets
- [ ] GitOps follow-up

## Checks

- [ ] `python3 verify.py --repository .` passes
- [ ] Relevant tests and production build pass
- [ ] Container smoke test passes when the image changes
- [ ] `.github/workflows/` remains byte-identical
- [ ] Published images contain `linux/amd64` and `linux/arm64`
- [ ] No secret value or sensitive data appears in the diff or logs

## Delivery

<!-- Record the image tag, release tag, and isolated GitOps branch, or state that they are not applicable. -->
