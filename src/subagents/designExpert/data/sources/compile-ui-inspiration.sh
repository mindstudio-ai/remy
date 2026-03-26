#!/usr/bin/env bash
#
# Compile ui_inspiration.json → ui_inspiration_compiled.json
#
# Reads each image URL from ui_inspiration.json (flat array of URLs),
# runs analyze-image via the mindstudio CLI with the UI analysis prompt,
# and writes the compiled output with URL + analysis.
#
# Run manually: bash src/subagents/designExpert/data/sources/compile-ui-inspiration.sh
# Processes images in batches of 5 (parallel within batch).
# Supports resuming — skips URLs already present in the output file.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RAW_FILE="$SCRIPT_DIR/ui_inspiration.json"
OUT_FILE="$SCRIPT_DIR/ui_inspiration_compiled.json"

PROMPT_FILE="$SCRIPT_DIR/prompts/ui-analysis.md"
if [ ! -f "$PROMPT_FILE" ]; then
  echo "Error: $PROMPT_FILE not found"
  exit 1
fi
PROMPT=$(cat "$PROMPT_FILE")

if [ ! -f "$RAW_FILE" ]; then
  echo "Error: $RAW_FILE not found"
  exit 1
fi

# Initialize output file if it doesn't exist
if [ ! -f "$OUT_FILE" ]; then
  echo '{"screens":[]}' > "$OUT_FILE"
fi

TOTAL=$(python3 -c "import json; print(len(json.load(open('$RAW_FILE'))))")
DONE=$(python3 -c "import json; print(len(json.load(open('$OUT_FILE'))['screens']))")
echo "Compiling UI inspiration: $DONE/$TOTAL already done"

# Get URLs that haven't been compiled yet
URLS=$(python3 -c "
import json
raw = json.load(open('$RAW_FILE'))
done = set(s['url'] for s in json.load(open('$OUT_FILE'))['screens'])
remaining = [u for u in raw if u not in done]
print('\n'.join(remaining))
")

if [ -z "$URLS" ]; then
  echo "All images already compiled."
  exit 0
fi

REMAINING=$(echo "$URLS" | wc -l | tr -d ' ')
echo "Processing $REMAINING remaining images (5 at a time)..."
BATCH_COUNT=0
TMPDIR=$(mktemp -d)

# Process a single URL — writes result to a temp file
process_one() {
  local url="$1"
  local idx="$2"
  local outfile="$TMPDIR/$idx.json"

  ANALYSIS=$(mindstudio analyze-image \
    --prompt "$PROMPT" \
    --image-url "$url" \
    --output-key analysis \
    --no-meta 2>&1) || true

  if echo "$ANALYSIS" | grep -q '"error"'; then
    echo "    FAILED — $url"
    return
  fi

  python3 -c "
import json, sys
json.dump({'url': sys.argv[1], 'analysis': sys.argv[2]}, open(sys.argv[3], 'w'))
" "$url" "$ANALYSIS" "$outfile"

  echo "    OK — $url"
}

# Merge all temp files from a batch into the output
merge_batch() {
  python3 -c "
import json, glob, os
out = '$OUT_FILE'
tmp = '$TMPDIR'
with open(out, 'r') as f:
    data = json.load(f)
for p in sorted(glob.glob(os.path.join(tmp, '*.json'))):
    with open(p) as f:
        data['screens'].append(json.load(f))
    os.remove(p)
with open(out, 'w') as f:
    json.dump(data, f, indent=2)
"
}

# Process in batches of 5
BATCH=()
IDX=0
while IFS= read -r url; do
  BATCH+=("$url")
  IDX=$((IDX + 1))
  if [ ${#BATCH[@]} -eq 5 ]; then
    BATCH_COUNT=$((BATCH_COUNT + 5))
    echo "  Batch $BATCH_COUNT/$REMAINING"
    for i in "${!BATCH[@]}"; do
      process_one "${BATCH[$i]}" "$((BATCH_COUNT - 5 + i))" &
    done
    wait
    merge_batch
    BATCH=()
  fi
done <<< "$URLS"

# Process remaining
if [ ${#BATCH[@]} -gt 0 ]; then
  BATCH_COUNT=$((BATCH_COUNT + ${#BATCH[@]}))
  echo "  Batch $BATCH_COUNT/$REMAINING"
  for i in "${!BATCH[@]}"; do
    process_one "${BATCH[$i]}" "$((BATCH_COUNT - ${#BATCH[@]} + i))" &
  done
  wait
  merge_batch
fi

rm -rf "$TMPDIR"
FINAL=$(python3 -c "import json; print(len(json.load(open('$OUT_FILE'))['screens']))")
echo "Done. $FINAL/$TOTAL screens compiled."
