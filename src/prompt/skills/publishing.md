---
name: Publishing & Releases
what: Shipping to production is a release moment, not just a git push — a user-approved changelog (`presentPublishPlan`) gates the deploy, then commit → push to main → watch the build go live, then a close-out scaled to what shipped (spec sync, roadmap/pitch updates, launch collateral, next steps). Publishing happens at the user's ask, either the Publish button or an explicit request in chat.
when: The user wants to ship — the Publish automated action fired, or they asked in chat ("publish", "deploy", "ship it", "push it live"). Load BEFORE presenting a changelog, committing, or pushing to main.
---

# Publishing

Publishing deploys the app to `main`, which triggers a production build. **It is the only thing that ships.** Every commit on `main` triggers a production release, so pushing it outside this flow ships code the user never approved a changelog for — there is no "merge it but don't ship it". If someone asks you to merge to `main`, that is a request to publish: say so and run this flow.

It is the user's decision to ship — they press Publish in the editor (which arrives as an automated action) or ask you directly in chat. The steps are the same either way, and they run in order: the changelog is the consent moment, so nothing is committed or pushed until it's approved.

If the user wants to see the work before it goes live, push a feature branch instead: that builds a preview at its own URL (`previewUrl` in the `releases wait` result) against a copy of the data, and publishing later is the same flow from `main`. Worth knowing that every push is a build, so push to publish or to show something — not as a habit. Your work is already durable without it.

## 1. Present the changelog

Read what is about to go live and turn it into a user-friendly changelog with `presentPublishPlan`: a plain-language summary of what's new ("added vendor approval workflow", "fixed invoice totals", "updated the dashboard layout"). Reference specific code or file paths only when it helps clarity. This is what the user sees, full-screen, before anything deploys.

What is about to go live is everything this workspace has that production does not — and at this point almost none of it is committed yet, because you commit in §2. So read the working tree, not just the history:

```bash
git fetch origin main
git status --short          # what you are about to commit
git diff origin/main        # every change that will ship, committed or not
git log --oneline origin/main..HEAD   # anything already committed here
```

`git diff origin/main` with two dots, deliberately: it compares the working tree against production, so it covers the uncommitted work that makes up most of a normal session. The three-dot form and a bare `git log` are commit-to-commit and would describe an empty release while the actual changes sat unstaged — a changelog the user approves that says nothing about what ships.

Production as the base, not "since my last push" — a colleague with their own copy of this app may have published in between, so your last push is not the line production sits at.

If dismissed, acknowledge and do nothing — no commit, no push.

## 2. Ship (on approval)

- On a meaningful release, glance at dependencies before committing — `npm outdated` in the methods package and in each interface's web directory. The first-party packages (`@mindstudio-ai/agent`, `@mindstudio-ai/interface`, `@madewithremy/admin`) are ours and versioned additively: a bump brings new capabilities and bug fixes, not a migration. Bring those current without asking, typecheck, and mention it in plain language when you report the deploy; if a bump does need a small code change, just make it. Third-party packages are the user's time to spend, so flag anything meaningfully behind and let them decide. Skip all of this on a hotfix — a quick fix going out doesn't need a dependency pass.
- Stage and commit any uncommitted changes with a clean, descriptive commit message. That message becomes `main`'s tip, so it is what `git log` will say this release was — write it like the changelog you just showed. If the committed work resolves any open issues (`remy-admin issues`), reference them with a closing keyword — `fixes #42`, `closes #7` — so the deploy closes them automatically once it goes live.
- Check where you are, then push:

  ```bash
  git branch --show-current
  git push origin HEAD
  ```

  Normally that is `main` and the push deploys. **If it is anything else, stop — pushing will not publish.** You are on a branch because something earlier in the session put you there (a preview push, a data-source experiment), and `git push origin HEAD` builds another preview instead of a release. Get the work onto `main` first: `git checkout main`, `git merge <your branch>` (resolving as in §2.1), then push. Never publish by pushing a branch ref at `main` — say what you are doing and why, because the user's mental model is that they asked you to ship.

  **If the push is rejected** (`non-fast-forward` / `fetch first`), somebody published between your changelog and your push — a colleague has their own copy of this app. Bring their release in and push again:

  ```bash
  git fetch origin main
  git merge origin/main
  git push origin HEAD
  ```

  Resolve anything that conflicts — see §2.1. You are catching up to their release, not overwriting it. **Never force-push `main`, and never `--force-with-lease` it either**: a rejection here always means a release you have not seen, and discarding it would take a live app back to code its author did not choose.

  **Before any merge, make sure you have the history to do it with.** This workspace is a shallow clone, so a merge can fail for want of a common ancestor rather than for any real conflict — and that failure is what invites `--allow-unrelated-histories`, which silently resurrects deleted files and drops the other publisher's hunks. `git fetch --unshallow origin` first (it is a no-op on a complete clone). **`--allow-unrelated-histories` is never the answer**: if a merge still reports unrelated histories on a full clone, stop and say so rather than forcing a graft that would publish a tree sharing no ancestry with production.

- Use `remy-admin releases wait` to poll the build until it completes, and read the `outcome` it returns. **Only `outcome: 'live'` is a deploy.** Everything else means production is unchanged: `failed` is a build error to fix and re-push, `superseded` means a newer commit took the release, `timeout` and `not_found` mean you do not yet know, and `preview` means the commit built but `main` never moved — you pushed a feature branch rather than publishing, so go back and push `main`. Let the user know it's deploying, then report back what actually happened; never call it shipped on anything but `live`.

### 2.1 Conflicts: merge them, never pick a winner

Two people working the same app in their own copies means a publish can conflict. Resolving it is your job, not the user's — **but "resolve it" means merge both intents. It never means choose a side.** That distinction is the whole section.

**The floor: a conflict you cannot merge is never settled by discarding one side.** If both changes cannot coexist, that is a product question and it goes back to the user before you push. Approval of their change is not approval to drop somebody else's — they approved a changelog for their own work and have never seen the conflicting change. Resolving to your own side and calling it their intent silently reverts someone's work on the authority of a person who was never asked. There is no reading of "the user never sees `>>>>>>>`" that licenses it; keeping conflict markers off their screen is about not making them do git, not about deciding for them.

Know what you are looking at. The other side is **another person's work, already pushed** — usually a colleague, though it can be the same person from another machine. In the merge §2 prescribes, `ours` is always this workspace and `theirs` is always the already-pushed side; that is reliable, and it is how you tell which is which. What it does *not* tell you is whether their side is live: a push whose build came back `failed` or `superseded` moved `origin/main` without shipping. Check with `remy-admin releases list` before you describe it to the user as something their users have been seeing.

Then read both sides for *intent* rather than diffing them line by line. What was each change trying to do, and what does the code need to look like for both to still be true? Usually both survive — it is the same skill as applying a patch to a codebase that has drifted from the one the patch was written against.

Conflict markers carry no author and no intent, so go and find them rather than guessing:

```bash
git log origin/main -- <path>    # who changed this, and what they said they were doing
git show <sha>                   # the whole change, in context
```

When you do need input, ask about the intent, in prose, as part of the conversation you are already having — a sentence that names what each change was for, and whose it was, is a report; a question about which behaviour the product should have is a question about product. Never ask anyone to arbitrate conflict markers, and never present git's view of the problem as theirs.

## 3. Close out — scaled to what shipped

The changelog you just wrote is the measure.

- **Meaningful release** (new features, interfaces, real behavior changes): dispatch `specSync` with a brief batching everything that changed this session and `refreshBuildOverview: true` (it reconciles the spec, then re-authors the Build Overview from it), and notify `productVision` about what shipped so the roadmap and pitch deck stay current — both run in the background, so hand off and move on without waiting.
- **Hotfix or small tweak**: skip the ceremony — a plain `specSync` (no flag), and only if documented behavior actually changed.

## 4. Offer next steps

Once deployed, offer to help with what comes next. This includes technical steps like setting up a custom domain (`remy-admin domains`), checking for errors (`remy-admin requests stats`), seeding production data (`remy-admin db`), managing env vars/secrets, or anything else they need for launch. It also includes going above and beyond and helping holistically: if it's the initial deploy, offer to help create collateral to announce the launch (e.g., an image for sharing on social media, text copy for a post); if it's a meaningful incremental update, an announcement post or something similar. Refer to the design guidance in the spec for how to talk about the product, and consider consulting the design expert to generate images or other marketing collateral — help the user see that you care about the product from end-to-end, not just the code.

After everything is done, if this was a meaningful release, call `compactConversation` to summarize the session and free up context for the next phase of work. After a hotfix, don't bother.
