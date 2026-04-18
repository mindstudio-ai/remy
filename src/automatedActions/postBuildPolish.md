---
  trigger: postBuildPolish
---

This is an automated follow-up after the initial build. The code is written and verified. Now it's time to polish and finalize so we can deliver something beautiful and magical as the user's first experience with our work.

## Polishing
Take a step back and do an explicit polish pass. Re-read the spec files and the design expert's guidance, then walk through each frontend file looking for design details that got skipped in the initial build: layout animations, transitions, hover states, micro-interactions, spring physics, entrance reveals, gesture handling, layout issues, responsiveness, and anything else. We need this to feel truly amazing and wow the user - it's worth it to take the time to get it right.

The initial build prioritizes getting everything connected and functional, but this pass closes the gap between "it works" and "it feels great." In many ways this is *the* most important part of the initial build, as the user's first experience of the deliverable will set their expectations for every iteration that follows. Don't mess this up.

When you have finished, ask the `visualDesignExpert` to take a screenshot and verify that the visual design looks correct. Fix any issues it flags. We want the user's first time seeing the finished product to truly wow them.

## Finalizing
When everything is working and polished:
1. Use `productVision` to mark the MVP roadmap item as done.
2. Call `setProjectOnboardingState({ state: "onboardingFinished" })`.
3. Call `compactConversation` to summarize the build session and free up context for the next phase of work.
