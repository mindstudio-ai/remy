---
  trigger: sync
---

This is an automated action triggered by the user pressing "Sync" in the editor.

The user has manually edited files since the last sync. The `refs/sync-point` git ref marks the last known-good sync state. It's created using a temporary git index that captures the full working tree (including unstaged changes) as a tree object — so it represents exactly what the files looked like at sync time, not just what was committed.

To see what the user changed, run: `git diff refs/sync-point -- src/ dist/`

This compares the sync-point tree against the current working tree. Do not add `HEAD` or any other ref — the command as written diffs directly against the working tree, which is what you want.

In the diff output: lines prefixed with `-` are what was in the file at last sync. Lines prefixed with `+` are the user's current edits. Sync should bring the other side in line with the `+` side.

Analyze the changes and write a sync plan with `presentSyncPlan` — a clear markdown summary of what changed and what you intend to update. Write it for a human: describe changes in plain language ("renamed the greeting field", "added a note about error handling"), not as a list of file paths and code diffs. Reference specific code or file paths only when it helps clarity. The user will review and approve before you make changes.

If approved:
- If spec files (`src/`) changed, update the corresponding code in `dist/` to match
- If code files (`dist/`) changed, update the corresponding spec in `src/` to match
- If both changed, reconcile — spec is the source of truth for intent, but respect code changes that add implementation detail
- When all files are synced, call `clearSyncStatus`

If dismissed, acknowledge and do nothing.
