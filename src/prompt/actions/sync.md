The user has manually edited files since the last sync. Diff against refs/sync-point to see what changed:

1. Run: git diff refs/sync-point -- src/ dist/ --stat
2. Read the full diff for any changed files to understand the edits
3. If spec files (src/) changed, update the corresponding code in dist/ to match
4. If code files (dist/) changed, update the corresponding spec in src/ to match
5. If both changed, reconcile — spec is the source of truth for intent, but respect code changes that add implementation detail
6. When all files are synced, call clearSyncStatus