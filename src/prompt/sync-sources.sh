#!/bin/bash
#
# Sync prompt source materials from their sources of truth.
#
# Reads sources.yaml and pulls each source's files into sources/<name>/.
# Supports local paths (with globs) and remote URLs.
#
# Usage: ./src/prompt/sync-sources.sh
#
# After syncing, compile sources into prompt fragments in compiled/
# (see compiled/README.md for instructions).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SOURCES_DIR="$SCRIPT_DIR/sources/fetched"
YAML_FILE="$SCRIPT_DIR/sources.yaml"

if [ ! -f "$YAML_FILE" ]; then
  echo "Error: $YAML_FILE not found"
  exit 1
fi

# Parse sources.yaml — simple line-by-line parsing (no yq dependency)
current_name=""
in_files=false

while IFS= read -r line || [ -n "$line" ]; do
  # Skip empty lines and comments
  [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue

  # Match "- name: <name>"
  if [[ "$line" =~ ^[[:space:]]*-[[:space:]]*name:[[:space:]]*(.*) ]]; then
    current_name="${BASH_REMATCH[1]}"
    in_files=false
    # Clean and recreate the target directory
    dest="$SOURCES_DIR/$current_name"
    echo "=== $current_name ==="
    rm -rf "$dest"
    mkdir -p "$dest"
    continue
  fi

  # Match "files:"
  if [[ "$line" =~ ^[[:space:]]*files: ]]; then
    in_files=true
    continue
  fi

  # Match file entries "- <path-or-url>"
  if $in_files && [[ "$line" =~ ^[[:space:]]*-[[:space:]]*(.*) ]]; then
    entry="${BASH_REMATCH[1]}"
    dest="$SOURCES_DIR/$current_name"

    if [[ "$entry" == http://* || "$entry" == https://* ]]; then
      # Remote URL — download
      filename=$(basename "$entry")
      echo "  Fetching $entry"
      curl -sfL "$entry" -o "$dest/$filename"
    else
      # Local path — expand globs
      expanded=($entry)
      for f in "${expanded[@]}"; do
        if [ -e "$f" ]; then
          echo "  Copying $f"
          cp "$f" "$dest/"
        else
          echo "  Warning: $f not found, skipping"
        fi
      done
    fi
  fi
done < "$YAML_FILE"

echo ""
echo "Done. Sources synced to $SOURCES_DIR/"
echo "Next: compile into prompt fragments (see src/prompt/compiled/README.md)"
