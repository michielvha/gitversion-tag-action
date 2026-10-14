#!/usr/bin/env bash
set -euo pipefail

if [[ -z "$CONFIG_FILE_PATH" ]]; then
  CONFIG="$ACTION_PATH/gitversion.yml"
else
  CONFIG="$CONFIG_FILE_PATH"
fi
if [[ ! -f "$CONFIG" ]]; then
  echo "::error::GitVersion config not found at $CONFIG"
  exit 1
fi
printf 'path=%s\n' "$CONFIG" >> "$GITHUB_OUTPUT"