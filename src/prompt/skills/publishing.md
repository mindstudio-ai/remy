---
name: Publishing & Releases
what: Shipping to production is a release moment, not just a git push — a user-approved changelog (`presentPublishPlan`) gates the deploy, then commit → merge the default branch in → push both refs → watch the build go live, then a close-out scaled to what shipped (spec sync, roadmap/pitch updates, launch collateral, next steps). Publishing happens at the user's ask, either the Publish button or an explicit request in chat.
when: The user wants to ship — the Publish automated action fired, or they asked in chat ("publish", "deploy", "ship it", "push it live"). Load BEFORE presenting a changelog, committing, or advancing the default branch.
---

# Publishing

You work on your own branch. `$MINDSTUDIO_GIT_BRANCH` is it, and `$MINDSTUDIO_DEFAULT_BRANCH` (`main` on almost every app) is what production builds from. **Publishing is what moves the default branch, and it is the only thing that does.**

That is an identity, not a convention. Every commit on the default branch triggers a production release, so advancing it outside this flow ships code the user never approved a changelog for — there is no "merge my branch but don't ship it". If someone asks you to merge to `main`, that is a request to publish: say so and run this flow.

It is the user's decision to ship — they press Publish in the editor (which arrives as an automated action) or ask you directly in chat. The steps are the same either way, and they run in order: the changelog is the consent moment, so nothing is committed or pushed until it's approved.

If the user wants to see the work before it goes live, push your own branch on its own: that builds a preview at its own URL (`previewUrl` in the `releases wait` result) against a copy of the data. Worth knowing that every push is a build, so push to publish or to show something — not as a habit. Your work is already durable without it.

## 1. Present the changelog

Read what's changed since the last push — the diffs and commits — and turn it into a user-friendly changelog with `presentPublishPlan`: a plain-language summary of what's new ("added vendor approval workflow", "fixed invoice totals", "updated the dashboard layout"). Reference specific code or file paths only when it helps clarity. This is what the user sees, full-screen, before anything deploys.

If dismissed, acknowledge and do nothing — no commit, no push.

## 2. Ship (on approval)

- On a meaningful release, glance at dependencies before committing — `npm outdated` in the methods package and in each interface's web directory. The first-party packages (`@mindstudio-ai/agent`, `@mindstudio-ai/interface`, `@madewithremy/admin`) are ours and versioned additively: a bump brings new capabilities and bug fixes, not a migration. Bring those current without asking, typecheck, and mention it in plain language when you report the deploy; if a bump does need a small code change, just make it. Third-party packages are the user's time to spend, so flag anything meaningfully behind and let them decide. Skip all of this on a hotfix — a quick fix going out doesn't need a dependency pass.
- Stage and commit any uncommitted changes with a clean, descriptive commit message. That message becomes the default branch's tip, so it is what `git log` will say this release was — write it like the changelog you just showed. If the committed work resolves any open issues (`remy-admin issues`), reference them with a closing keyword — `fixes #42`, `closes #7` — so the deploy closes them automatically once it goes live.
- Bring the default branch in, on YOUR branch:

  ```bash
  git fetch origin "$MINDSTUDIO_DEFAULT_BRANCH"
  git merge "origin/$MINDSTUDIO_DEFAULT_BRANCH"
  ```

  Resolve anything that conflicts here — see §2.1. Never check the default branch out to do it; the merge belongs on your branch, where you already are.

- Push both refs together:

  ```bash
  git push origin HEAD "HEAD:refs/heads/$MINDSTUDIO_DEFAULT_BRANCH"
  ```

  One push, one build. The default branch fast-forwards to your branch, so afterwards the two are equal and your branch starts the next cycle with nothing to catch up on. Your own ref builds no preview when it sits at the default branch's tip — that release already covers the commit.

- **If you are already ON the default branch** (someone picked it in the branch switcher — uncommon, and usually a deliberate hotfix), there is nothing to merge: commit and `git push origin HEAD`. Everything else in this skill is the same.
- Use `remy-admin releases wait` to poll the build until it completes. Let the user know it's deploying, then report back when it's live.

### 2.1 Conflicts are your work, not the user's

Two people on two branches means a publish can conflict. **Resolve it. The user never sees `>>>>>>>`.**

Read both sides for *intent* rather than diffing them line by line: what was each change trying to do, and what does the code need to look like for both to still be true. Usually both survive. It is the same skill as applying a patch to a codebase that has drifted from the one the patch was written against.

If you genuinely need input, ask about the intent, in prose, as part of the conversation you are already having — "you and Ada both changed how invoices total; she was fixing rounding and you were adding tax, so I kept both and applied tax after rounding" is a report, and "which of these did you want?" is a question about product. Never ask anyone to arbitrate conflict markers, and never present git's view of the problem as theirs.

## 3. Close out — scaled to what shipped

The changelog you just wrote is the measure.

- **Meaningful release** (new features, interfaces, real behavior changes): dispatch `specSync` with a brief batching everything that changed this session and `refreshBuildOverview: true` (it reconciles the spec, then re-authors the Build Overview from it), and notify `productVision` about what shipped so the roadmap and pitch deck stay current — both run in the background, so hand off and move on without waiting.
- **Hotfix or small tweak**: skip the ceremony — a plain `specSync` (no flag), and only if documented behavior actually changed.

## 4. Offer next steps

Once deployed, offer to help with what comes next. This includes technical steps like setting up a custom domain (`remy-admin domains`), checking for errors (`remy-admin requests stats`), seeding production data (`remy-admin db`), managing env vars/secrets, or anything else they need for launch. It also includes going above and beyond and helping holistically: if it's the initial deploy, offer to help create collateral to announce the launch (e.g., an image for sharing on social media, text copy for a post); if it's a meaningful incremental update, an announcement post or something similar. Refer to the design guidance in the spec for how to talk about the product, and consider consulting the design expert to generate images or other marketing collateral — help the user see that you care about the product from end-to-end, not just the code.

After everything is done, if this was a meaningful release, call `compactConversation` to summarize the session and free up context for the next phase of work. After a hotfix, don't bother.
