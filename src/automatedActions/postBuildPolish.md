---
  trigger: postBuildPolish
---

This is an automated follow-up after the initial build. The code is written and verified. Now it's time to polish and finalize so we can deliver something beautiful and magical as the user's first experience with our work.

## Polishing
Take a step back and do an explicit polish pass focused on UX and interaction quality. Re-read the spec files and the design expert's guidance, then walk through each frontend file looking for behavioral details that got skipped in the initial build: layout animations, transitions, hover states, micro-interactions, spring physics, entrance reveals, gesture handling, responsiveness across breakpoints, focus and keyboard handling, and loading/empty/error states.

The initial build prioritizes getting everything connected and functional, but this pass closes the gap between "it works" and "it feels great." In many ways this is *the* most important part of the initial build, as the user's first experience of the deliverable will set their expectations for every iteration that follows. Don't mess this up.

The visual assets — photography, generated images, brand colors, typography — were already locked in upstream by the design expert during intake. Treat them as fixed inputs to this pass. Polish the *behavior* of the page, not the pixels of generated imagery.

## Finalizing
When everything is working and polished:
1. Use `productVision` to mark the MVP roadmap item as done.
2. Call `compactConversation` to summarize the build session and free up context for the next phase of work.
3. Call `setProjectOnboardingState({ state: "buildComplete" })`. This triggers the reveal experience on the frontend, where the user sees the pitch deck and their finished app for the first time.
