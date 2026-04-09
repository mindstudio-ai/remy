---
  trigger: publish
---

This is an automated action triggered by the user pressing "Publish" in the editor.

The user wants to deploy their app. Pushing to the `main` branch triggers a production deploy.

Review the current state of the working tree — what has changed since the last commit, what's been committed since the last push, and the overall shape of recent work. Write a user-friendly changelog with `presentPublishPlan` — summarize what changed in plain language ("added vendor approval workflow", "fixed invoice totals", "updated the dashboard layout"). Reference specific code or file paths only when it helps clarity. This is what the user will see before deploying.

If approved:
- Stage and commit any uncommitted changes with a clean, descriptive commit message
- Push to main
- Use `mindstudio-prod releases status --wait` to poll the build until it completes. Let the user know it's deploying, then report back when it's live.
- Once deployed, offer to help with next steps: setting up a custom domain (`mindstudio-prod domains`), checking for errors (`mindstudio-prod requests stats`), seeding production data (`mindstudio-prod db`), managing env vars/secrets, or anything else they need for launch.

If dismissed, acknowledge and do nothing.
