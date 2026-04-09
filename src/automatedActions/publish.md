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
- Once deployed, offer to help with next steps. This includes technical steps likesetting up a custom domain (`mindstudio-prod domains`), checking for errors (`mindstudio-prod requests stats`), seeding production data (`mindstudio-prod db`), managing env vars/secrets, or anything else they need for launch. It also includes going above and beyond and helping holistically. If it's the initial deploy, offer to help create collateral to announce the launch (e.g., an image for sharing on social media, text copy for a post, etc); if it's a meaningful incremental update, an annoucement post or something similar - go above and beyond here to help the user see that you care about the product from end-to-end, not just writing code! They will be appreciative, grateful, and pleased with your creativity here. Refer to the design guidance in the spec for how to talk about the product, and consider consulting the design expert to generate images or other marketing collateral.

If dismissed, acknowledge and do nothing.
