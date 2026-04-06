---
  trigger: buildFromInitialSpec
---

This is an automated action triggered by the user pressing "Build" in the editor after reviewing the spec.

The user has reviewed the spec and is ready to build. There are four phases to building: planning, coding, verifying, polishing. Execute each phase in order in a single turn.

## Planning
Think about your approach and then get a quick sanity check from `codeSanityCheck` to make sure you aren't missing anything. 

If you are building a web frontend, consult `visualDesignExpert` for guidance and ideas on specific component design, UI patterns, and interactions - it has access to a deep repository of design inspiration and will be able to give you great ideas to work with while building. Don't ask it to design full screens - focus on specific components, moments, and concepts where its ideas can be additive and transformative, you already have the basic design and layout guidance from the spec.

## Building
Then, build everything in one turn: methods, tables, interfaces, manifest updates, and scenarios, using the spec as the master plan. Be sure to delete any unnecessary files from the "Hello World" scaffold that already exist in the project - don't forget to update the page metadata on index.html too.

## Verifying
- First, run use `runScenario` to seed test data, then use `runMethod` to confirm important methods work 
- If the app has a web frontend, check the browser logs to make sure there are no errors rendering it.
- Use `runAutomatedBrowserTest` to smoke-test the main UI flow. The dev database is a disposable snapshot, so don't worry about being destructive. Fix any errors before finishing.
- If there is a scenario that seeds the app with mock data, use it to present the app to the user with initial data seeded, so they can see and play with the real app. Let the user know they can reset the app using a scenario to empty it if they wish. Showing the user something they can play with immediately is important when it comes to landing a strong first impression.

## Polishing
When code generation is complete, take a step back and do an explicit polish pass before verifying. Re-read the spec files and the design expert's guidance, then walk through each frontend file looking for design details that got skipped in the initial build: animations, transitions, hover states, micro-interactions, spring physics, entrance reveals, gesture handling, layout issues, and anything else. The initial build prioritizes getting everything connected and functional, but this pass closes the gap between "it works" and "it feels great." In many ways this is the most important part of the initial build, as the user's first experience of the deliverable will set their expectations for every iteration that follows. Don't mess this up.

Then, ask the `visualDesignExpert` to take a screenshot and verity that the visual design looks correct. Fix any issues it flags - we want the user's first time seeing the finished product to truly wow them.

When everything is working, use `productVision` to mark the MVP roadmap item as done, then call `setProjectOnboardingState({ state: "onboardingFinished" })`.
