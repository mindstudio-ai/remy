The user has manually edited files since the last sync. Diff against refs/sync-point to see what changed:

1. Run: git diff refs/sync-point -- src/ dist/ --stat
2. Read the full diff for any changed files to understand the edits
3. Write a sync plan with presentSyncPlan — a clear markdown summary of what changed and what you intend to update. The user will review and approve before you make changes.
4. If approved:
   - If spec files (src/) changed, update the corresponding code in dist/ to match
   - If code files (dist/) changed, update the corresponding spec in src/ to match
   - If both changed, reconcile — spec is the source of truth for intent, but respect code changes that add implementation detail
   - When all files are synced, call clearSyncStatus
5. If dismissed, acknowledge and do nothing.