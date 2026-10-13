#!/usr/bin/env bash
set -euo pipefail

case "$USE_DEFAULT_CONFIG" in
  true|false) ;;
  *) echo "::error::useDefaultConfig must be true or false"; exit 1 ;;
esac
if [[ "$USE_DEFAULT_CONFIG" == "true" || -z "$CONFIG_FILE_PATH" ]]; then
  CONFIG="$ACTION_PATH/gitversion.yml"
else
  CONFIG="$CONFIG_FILE_PATH"
fi
if [[ ! -f "$CONFIG" ]]; then
  echo "::error::GitVersion config not found at $CONFIG"
  exit 1
fi
printf 'path=%s\n' "$CONFIG" >> "$GITHUB_OUTPUT"