---
trigger: sync
---

This is an automated action triggered by the user pressing "Sync" in the editor.

Review the spec files in `src/` and the corresponding code in `dist/`. Identify any differences where one side has changes that the other doesn't reflect. Write a sync plan with `writePlan` describing what changed and what you intend to update. Write it for a human: describe changes in plain language ("renamed the greeting field", "added a note about error handling"), not as a list of file paths and code diffs.

If the plan is approved:
- If spec files (`src/`) changed, update the corresponding code in `dist/` to match
- If code files (`dist/`) changed, update the corresponding spec in `src/` to match
- If both changed, reconcile — spec is the source of truth for intent, but respect code changes that add implementation detail
