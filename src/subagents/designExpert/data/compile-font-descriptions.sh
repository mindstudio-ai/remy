#!/usr/bin/env bash
#
# Analyze font specimen images and write descriptions into fonts.json.
#
# Reads each font from fonts.json, looks for a matching specimen image
# in specimens/fonts/{slug}.png, runs analyze-image, and writes the
# description back to the font's "description" field.
#
# Run: bash src/subagents/designExpert/data/compile-font-descriptions.sh
# Supports resuming — skips fonts that already have a description.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FONTS_FILE="$SCRIPT_DIR/fonts.json"
SPECIMENS_BASE="https://i.mscdn.ai/remy-font-specimens/fonts"
PROMPT_FILE="$SCRIPT_DIR/../prompts/tool-prompts/font-analysis.md"

if [ ! -f "$PROMPT_FILE" ]; then
  echo "Error: $PROMPT_FILE not found"
  exit 1
fi
PROMPT=$(cat "$PROMPT_FILE")

if [ ! -f "$FONTS_FILE" ]; then
  echo "Error: $FONTS_FILE not found"
  exit 1
fi

# Get fonts that need descriptions
SLUGS=$(python3 -c "
import json
data = json.load(open('$FONTS_FILE'))
for f in data['fonts']:
    if not f.get('description'):
        print(f['slug'])
")

TOTAL=$(python3 -c "import json; print(len(json.load(open('$FONTS_FILE'))['fonts']))")
DONE=$(python3 -c "import json; print(sum(1 for f in json.load(open('$FONTS_FILE'))['fonts'] if f.get('description')))")
echo "Font descriptions: $DONE/$TOTAL already done"

if [ -z "$SLUGS" ]; then
  echo "All fonts already have descriptions."
  exit 0
fi

REMAINING=$(echo "$SLUGS" | wc -l | tr -d ' ')
echo "Processing $REMAINING remaining fonts..."

TMPDIR=$(mktemp -d)

process_one() {
  local slug="$1"
  local url="${SPECIMENS_BASE}/${slug}.png"
  local outfile="$TMPDIR/${slug}.txt"

  DESCRIPTION=$(mindstudio analyze-image \
    --prompt "$PROMPT" \
    --image-url "$url" \
    --output-key analysis \
    --no-meta 2>&1) || true

  if [ -z "$DESCRIPTION" ] || echo "$DESCRIPTION" | grep -q '"error"'; then
    echo "    FAILED — $slug"
    return
  fi

  echo "$DESCRIPTION" > "$outfile"
  echo "    OK — $slug"
}

merge_batch() {
  python3 -c "
import json, os
fonts_file = '$FONTS_FILE'
tmp_dir = '$TMPDIR'
with open(fonts_file, 'r') as f:
    data = json.load(f)
slug_to_font = {f['slug']: f for f in data['fonts']}
for filename in os.listdir(tmp_dir):
    if not filename.endswith('.txt'):
        continue
    slug = filename[:-4]
    if slug in slug_to_font:
        with open(os.path.join(tmp_dir, filename)) as f:
            slug_to_font[slug]['description'] = f.read().strip()
        os.remove(os.path.join(tmp_dir, filename))
with open(fonts_file, 'w') as f:
    json.dump(data, f, indent=2)
    f.write('\n')
"
}

# Process in batches of 5
BATCH=()
BATCH_COUNT=0
while IFS= read -r slug; do
  BATCH+=("$slug")
  if [ ${#BATCH[@]} -eq 5 ]; then
    BATCH_COUNT=$((BATCH_COUNT + ${#BATCH[@]}))
    echo "  Batch $BATCH_COUNT/$REMAINING"
    for s in "${BATCH[@]}"; do
      process_one "$s" &
    done
    wait
    merge_batch
    BATCH=()
  fi
done <<< "$SLUGS"

# Process remaining
if [ ${#BATCH[@]} -gt 0 ]; then
  BATCH_COUNT=$((BATCH_COUNT + ${#BATCH[@]}))
  echo "  Batch $BATCH_COUNT/$REMAINING"
  for s in "${BATCH[@]}"; do
    process_one "$s" &
  done
  wait
  merge_batch
fi

rm -rf "$TMPDIR"
FINAL=$(python3 -c "import json; print(sum(1 for f in json.load(open('$FONTS_FILE'))['fonts'] if f.get('description')))")
echo "Done. $FINAL/$TOTAL fonts have descriptions."
