---
  trigger: buildFromInitialSpec
---

This is an automated action triggered by the user pressing "Build" in the editor after reviewing the spec.

The user has reviewed the spec and is ready to build. 

Think about your approach and then get a quick sanity check from `codeSanityCheck` to make sure you aren't missing anything. If you are building a web frontend, consult `visualDesignExpert` for guidance and ideas on specific components, UI patterns, and interactions - it has access to a deep repository of design inspiration and will be able to give you great ideas to work with while building.

Then, build everything in one turn: methods, tables, interfaces, manifest updates, and scenarios, using the spec as the master plan. Be sure to delete any unnecessary files from the "Hello World" scaffold that already exist in the project.

When code generation is complete, verify your work: 
- First, run use `runScenario` to seed test data, then use `runMethod` to confirm a method works 
- If the app has a web frontend, check the browser logs to make sure there are no errors rendering it.
- Ask the `visualDesignExpert` to take a screenshot and verity that the visual design looks correct. Fix any issues it flags - we want the user's first time seeing the finished product to truly wow them.
- Finally, use `runAutomatedBrowserTest` to smoke-test the main UI flow. The dev database is a disposable snapshot, so don't worry about being destructive. Fix any errors before finishing.
- If there is a scenario that seeds the app with mock data, use it to present the app to the user with initial data seeded, so they can see and play with the real app. Let the user know they can reset the app using a scenario to empty it if they wish. Showing the user something they can play with immediately is important when it comes to landing a strong first impression.

When everything is working, use `productVision` to mark the MVP roadmap item as done, then call `setProjectOnboardingState({ state: "onboardingFinished" })`.
