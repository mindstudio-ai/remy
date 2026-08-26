---
name: Publishing & Releases
what: Shipping to production is a release moment, not just a git push — a user-approved changelog (`presentPublishPlan`) gates the deploy, then commit → push to main → watch the build go live, then a close-out scaled to what shipped (spec sync, roadmap/pitch updates, launch collateral, next steps). Publishing happens at the user's ask, either the Publish button or an explicit request in chat.
when: The user wants to ship — the Publish automated action fired, or they asked in chat ("publish", "deploy", "ship it", "push it live"). Load BEFORE presenting a changelog, committing, or pushing to main.
---

# Publishing

Publishing deploys the app to `main`, which triggers a production build. It is the user's decision to ship — it happens when they press Publish in the editor (which arrives as an automated action) or ask you directly in chat. The steps are the same either way, and they run in order: the changelog is the consent moment, so nothing is committed or pushed until it's approved.

## 1. Present the changelog

Read what's changed since the last push — the diffs and commits — and turn it into a user-friendly changelog with `presentPublishPlan`: a plain-language summary of what's new ("added vendor approval workflow", "fixed invoice totals", "updated the dashboard layout"). Reference specific code or file paths only when it helps clarity. This is what the user sees, full-screen, before anything deploys.

If dismissed, acknowledge and do nothing — no commit, no push.

## 2. Ship (on approval)

- Stage and commit any uncommitted changes with a clean, descriptive commit message. If the committed work resolves any open issues (`mindstudio-prod issues`), reference them in the commit message with a closing keyword — `fixes #42`, `closes #7` — so the deploy closes them automatically once it goes live.
- Push to main.
- Use `mindstudio-prod releases wait` to poll the build until it completes. Let the user know it's deploying, then report back when it's live.

## 3. Close out — scaled to what shipped

The changelog you just wrote is the measure.

- **Meaningful release** (new features, interfaces, real behavior changes): dispatch `specSync` with a brief batching everything that changed this session and `refreshBuildOverview: true` (it reconciles the spec, then re-authors the Build Overview from it), and notify `productVision` about what shipped so the roadmap and pitch deck stay current — both run in the background, so hand off and move on without waiting.
- **Hotfix or small tweak**: skip the ceremony — a plain `specSync` (no flag), and only if documented behavior actually changed.

## 4. Offer next steps

Once deployed, offer to help with what comes next. This includes technical steps like setting up a custom domain (`mindstudio-prod domains`), checking for errors (`mindstudio-prod requests stats`), seeding production data (`mindstudio-prod db`), managing env vars/secrets, or anything else they need for launch. It also includes going above and beyond and helping holistically: if it's the initial deploy, offer to help create collateral to announce the launch (e.g., an image for sharing on social media, text copy for a post); if it's a meaningful incremental update, an announcement post or something similar. Refer to the design guidance in the spec for how to talk about the product, and consider consulting the design expert to generate images or other marketing collateral — help the user see that you care about the product from end-to-end, not just the code.

After everything is done, if this was a meaningful release, call `compactConversation` to summarize the session and free up context for the next phase of work. After a hotfix, don't bother.
