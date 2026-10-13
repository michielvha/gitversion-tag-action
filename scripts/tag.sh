#!/usr/bin/env bash
set -euo pipefail

finish() {
  printf 'tagged=%s\npushed-tag=%s\npushed-tags=%s\nskip-reason=%s\n' \
    "$1" "$2" "$3" "$4" >> "$GITHUB_OUTPUT"
  exit 0
}
case "$DRY_RUN" in
  true|false) ;;
  *) echo "::error::dry-run must be true or false"; exit 1 ;;
esac
if [[ -z "$SEMVER" ]]; then
  echo "::error::GitVersion produced no semantic version"
  exit 1
fi
echo "SemVer: $SEMVER"
if [[ "$DRY_RUN" == "true" ]]; then
  finish false "" "" dry-run
fi
TAG="$PREFIX$SEMVER"
git check-ref-format "refs/tags/$TAG"
REMOTE_TAG=$(git ls-remote --tags origin "refs/tags/$TAG")
if [[ -n "$REMOTE_TAG" ]]; then
  echo "Tag $TAG already exists on remote. Skipping tagging."
  finish false "" "" tag-exists
fi
git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@noreply.github.com"
if [[ -z "$TAG_MESSAGE" ]]; then
  TAG_MESSAGE=$(git log -1 --pretty=%s)
fi
if git show-ref --verify --quiet "refs/tags/$TAG"; then
  if [[ "$(git rev-parse "refs/tags/$TAG^{commit}")" != "$(git rev-parse HEAD)" ]]; then
    echo "::error::Local tag $TAG points to a different commit"
    exit 1
  fi
else
  git tag -a "$TAG" -m "$TAG_MESSAGE"
fi
git push origin "refs/tags/$TAG:refs/tags/$TAG"
finish true "$TAG" "$TAG" ""