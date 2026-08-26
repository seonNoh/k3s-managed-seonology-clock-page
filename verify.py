#!/usr/bin/env python3
"""Verify the repository-local Phase B and Gitea migration contract."""

from __future__ import annotations

import argparse
import hashlib
import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

READMES = ("README.md", "README.ko.md", "README.ja.md")
SVG_NAMES = tuple(
    f"{stem}{suffix}.svg"
    for stem in ("architecture", "tool-landscape", "delivery", "security-boundaries")
    for suffix in ("", ".ko", ".ja")
)
REQUIRED = (
    *READMES,
    "LICENSE",
    "CONTRIBUTING.md",
    ".editorconfig",
    ".gitignore",
    "README_STRUCTURE.md",
    ".gitea/PULL_REQUEST_TEMPLATE.md",
    ".gitea/ISSUE_TEMPLATE/bug-report.yaml",
    ".gitea/ISSUE_TEMPLATE/feature-request.yaml",
    ".gitea/workflows/ci.yml",
    ".gitea/workflows/image.yml",
    ".gitea/workflows/release.yml",
)
GITHUB_WORKFLOW_SHA256 = {
    ".github/workflows/cms_presentation_hub.code-workspace": "caabe4afbec9af4298d50af65a65fdd695dd6b6506053cc39e440806dad0b869",
    ".github/workflows/release.yaml": "b152e1432a7a1c2f15ff39a941ddb4e5a4bce29c018249b0dfd5b808bf7a038a",
}
FORBIDDEN_COLORS = ("#0f172a", "#1e293b", "#38bdf8", "#a78bfa", "#f472b6", "#34d399", "#fbbf24")


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", type=Path, default=Path(__file__).resolve().parent)
    root = parser.parse_args().repository.resolve()
    errors: list[str] = []

    def check(name: str, passed: bool, detail: object) -> None:
        print(f"[{'PASS' if passed else 'FAIL'}] {name}: {detail}")
        if not passed:
            errors.append(name)

    missing = [name for name in REQUIRED if not (root / name).is_file()]
    check("required files", not missing, missing or "all present")

    texts = {name: (root / name).read_text(encoding="utf-8") for name in READMES if (root / name).is_file()}
    switcher = "[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md)"
    metrics: dict[str, tuple[int, int, int]] = {}
    code_blocks: dict[str, list[str]] = {}
    images: dict[str, list[str]] = {}
    for name in READMES:
        text = texts.get(name, "")
        headings = re.findall(r"^#{1,6} .+$", re.sub(r"```.*?```", "", text, flags=re.DOTALL), re.MULTILINE)
        h2 = [item for item in headings if item.startswith("## ")]
        linked = re.findall(r"!\[[^]]*\]\((docs/svg/[^)]+)\)", text)
        blocks = re.findall(r"```[^\n]*\n.*?```", text, re.DOTALL)
        metrics[name] = (len(h2), len(linked), len(blocks))
        code_blocks[name] = blocks
        images[name] = linked
        check(f"{name} structure", sum(item.startswith("# ") for item in headings) == 1 and metrics[name] == (8, 4, 2), metrics[name])
        check(f"{name} language switcher", switcher in text.splitlines()[:6], "present")
        missing_links = []
        for target in re.findall(r"(?<!!)\[[^]]+\]\(([^)]+)\)", text):
            target = target.split("#", 1)[0]
            if target and not re.match(r"^(?:https?://|mailto:)", target) and not (root / target).exists():
                missing_links.append(target)
        check(f"{name} relative links", not missing_links, missing_links or "valid")

    check("README structural parity", len(set(metrics.values())) == 1, metrics)
    check("README code block parity", len(code_blocks) == 3 and len({tuple(value) for value in code_blocks.values()}) == 1, "byte-identical")
    check("Korean headings", bool(re.search(r"[가-힣]", "\n".join(re.findall(r"^## .+$", texts.get("README.ko.md", ""), re.MULTILINE)))), "localized")
    check("Japanese headings", bool(re.search(r"[ぁ-んァ-ン一-龯]", "\n".join(re.findall(r"^## .+$", texts.get("README.ja.md", ""), re.MULTILINE)))), "localized")

    expected = {
        "README.md": [f"docs/svg/{stem}.svg" for stem in ("architecture", "tool-landscape", "delivery", "security-boundaries")],
        "README.ko.md": [f"docs/svg/{stem}.ko.svg" for stem in ("architecture", "tool-landscape", "delivery", "security-boundaries")],
        "README.ja.md": [f"docs/svg/{stem}.ja.svg" for stem in ("architecture", "tool-landscape", "delivery", "security-boundaries")],
    }
    for name in READMES:
        check(f"{name} diagram set", images.get(name) == expected[name], images.get(name))

    svg_paths = sorted((root / "docs/svg").glob("*.svg"))
    check("SVG names", [path.name for path in svg_paths] == sorted(SVG_NAMES), [path.name for path in svg_paths])
    seen_ids: set[str] = set()
    svg_errors: list[str] = []
    for path in svg_paths:
        raw = path.read_text(encoding="utf-8")
        try:
            xml = ET.fromstring(raw)
        except ET.ParseError as exc:
            svg_errors.append(f"{path.name}: XML {exc}")
            continue
        ids = re.findall(r'\bid="([^"]+)"', raw)
        duplicate_ids = [value for value in ids if value in seen_ids]
        seen_ids.update(ids)
        if duplicate_ids:
            svg_errors.append(f"{path.name}: cross-file ids {duplicate_ids}")
        if not xml.tag.endswith("svg") or "<style" not in raw or "<defs" not in raw:
            svg_errors.append(f"{path.name}: self-contained structure")
        if raw.count("<title") != 1 or raw.count("<desc") != 1:
            svg_errors.append(f"{path.name}: title/desc")
        if "prefers-reduced-motion" not in raw or "<animate" in raw:
            svg_errors.append(f"{path.name}: motion policy")
        if 'viewBox="0 0 960 540"' not in raw:
            svg_errors.append(f"{path.name}: canvas")
        if not all(token in raw for token in ("#0d1117", "#1b222c", "#7c9fff", "#5b636d")):
            svg_errors.append(f"{path.name}: Relief tokens")
        if any(color in raw.lower() for color in FORBIDDEN_COLORS):
            svg_errors.append(f"{path.name}: forbidden palette")
        if "marker-end" not in raw or "stroke-linejoin:round" not in raw:
            svg_errors.append(f"{path.name}: arrow contract")
    check("SVG Relief contract", not svg_errors, svg_errors or "valid")

    workflow_errors = []
    for relative, expected_digest in GITHUB_WORKFLOW_SHA256.items():
        path = root / relative
        if not path.is_file() or digest(path) != expected_digest:
            workflow_errors.append(f"{relative}: missing or changed")
    check("GitHub workflow checksums", not workflow_errors, workflow_errors or "byte-identical")

    workflows = sorted((root / ".gitea/workflows").glob("*.y*ml"))
    workflow_text = "\n".join(path.read_text(encoding="utf-8") for path in workflows)
    forbidden = [token for token in ("ghcr.io", "GITHUB_TOKEN", "api.github.com", "github.", "gh api", "gh release") if token.lower() in workflow_text.lower()]
    check("Gitea workflow count", len(workflows) == 3, [path.name for path in workflows])
    check("Gitea workflow boundary", not forbidden, forbidden or "Gitea-native")
    check("Gitea checkout source", workflow_text.count("https://gitea.com/actions/checkout@v4") == 3, "pinned to Gitea")
    check("multi-architecture image declarations", workflow_text.count("linux/amd64,linux/arm64") >= 2 and workflow_text.count('architecture == "amd64"') >= 2 and workflow_text.count('architecture == "arm64"') >= 2, "image and release")

    owned = [*READMES, "README_STRUCTURE.md", "CONTRIBUTING.md", ".gitea/PULL_REQUEST_TEMPLATE.md", ".gitea/ISSUE_TEMPLATE/bug-report.yaml", ".gitea/ISSUE_TEMPLATE/feature-request.yaml"]
    policy_text = "\n".join((root / name).read_text(encoding="utf-8", errors="replace") for name in owned)
    emoji = re.search(r"[\U0001F300-\U0001FAFF\u2600-\u27BF]", policy_text)
    ai_signature = re.search(r"(?i)(co-authored-by:.*(?:codex|openai|anthropic|claude)|generated (?:with|by) (?:codex|openai|anthropic|claude))", policy_text)
    check("emoji policy", emoji is None, emoji.group(0) if emoji else "clean")
    check("AI signature policy", ai_signature is None, ai_signature.group(0) if ai_signature else "clean")

    print("SUMMARY:", "ALL PASS" if not errors else f"{len(errors)} FAIL")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
