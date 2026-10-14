# Repository instructions

Read the personal conventions at
https://github.com/vhco-pro/docs/blob/a41d348a822cc286ab0eac6457ac7d1e1b46a7dc/AGENTS.md
and follow its task routes before implementation. For this repo, read
`conventions/coding.md`, `conventions/delivery.md`, and
`knowledge/shared-delivery.md` at that revision. For docs changes, also read
`conventions/documentation.md`. Stop and report inaccessible sources or conflicts.

## Local checks and boundaries

Use Node 24 or newer. Run `npm ci`, `npm test`, and `shellcheck scripts/*.sh`.
Set `GITVERSION_BINARY` to the pinned executable to include real-history tests.
CI installs and verifies that binary with `scripts/install-test-gitversion.mjs`.
Run `actionlint` when editing workflows.

The action tags only the exact semantic version, with the caller's optional
prefix. Preserve custom config paths, dry-run outputs, and rerun behavior. Never
add moving major/minor aliases. Shell logic belongs in `scripts/`; YAML wires it.
Do not merge or release without explicit authorization.