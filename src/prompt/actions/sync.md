This is an automated action triggered by the user pressing "Sync" in the editor.

The user has manually edited files since the last sync. The `refs/sync-point` git ref marks the last known-good sync state (captures the full working tree, including unstaged changes). Diff against it to see what changed in `src/` and `dist/`.

Analyze the changes and write a sync plan with `presentSyncPlan` — a clear markdown summary of what changed and what you intend to update. The user will review and approve before you make changes.

If approved:
- If spec files (`src/`) changed, update the corresponding code in `dist/` to match
- If code files (`dist/`) changed, update the corresponding spec in `src/` to match
- If both changed, reconcile — spec is the source of truth for intent, but respect code changes that add implementation detail
- When all files are synced, call `clearSyncStatus`

If dismissed, acknowledge and do nothing.