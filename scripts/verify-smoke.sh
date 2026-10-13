#!/usr/bin/env bash
set -euo pipefail

test -n "$SEMVER"
test -n "$FULL_SEMVER"
test "$TAGGED" = false
test "$SKIP_REASON" = dry-run
git diff --exit-code