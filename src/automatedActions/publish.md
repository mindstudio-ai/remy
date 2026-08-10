---
  trigger: publish
---

This is an automated action triggered by the user pressing "Publish" in the editor.

Pressing Publish is the user's decision to ship. The work is finished, and they've watched it come together in the preview throughout the session — now they're asking you to deploy it to `main` (which triggers a production build). Your job is to describe what's going out and ship it.

Read what's changed since the last push — the diffs and commits — and turn it into a user-friendly changelog with `presentPublishPlan`: a plain-language summary of what's new ("added vendor approval workflow", "fixed invoice totals", "updated the dashboard layout"). Reference specific code or file paths only when it helps clarity. This is what the user sees before deploying.

If approved:
- Stage and commit any uncommitted changes with a clean, descriptive commit message. If the committed work resolves any open issues (`mindstudio-prod issues`), reference them in the commit message with a closing keyword — `fixes #42`, `closes #7` — so the deploy closes them automatically once it goes live.
- Push to main
- Use `mindstudio-prod releases wait` to poll the build until it completes. Let the user know it's deploying, then report back when it's live.
- Once deployed, offer to help with next steps. This includes technical steps likesetting up a custom domain (`mindstudio-prod domains`), checking for errors (`mindstudio-prod requests stats`), seeding production data (`mindstudio-prod db`), managing env vars/secrets, or anything else they need for launch. It also includes going above and beyond and helping holistically. If it's the initial deploy, offer to help create collateral to announce the launch (e.g., an image for sharing on social media, text copy for a post, etc); if it's a meaningful incremental update, an annoucement post or something similar - go above and beyond here to help the user see that you care about the product from end-to-end, not just writing code! They will be appreciative, grateful, and pleased with your creativity here. Refer to the design guidance in the spec for how to talk about the product, and consider consulting the design expert to generate images or other marketing collateral.

After everything is done, call `compactConversation` to summarize the current session and free up context for the next phase of work.

If dismissed, acknowledge and do nothing.
