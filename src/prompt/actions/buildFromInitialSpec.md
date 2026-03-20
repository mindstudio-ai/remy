This is an automated action triggered by the user pressing "Build" in the editor after reviewing the spec.

The user has reviewed the spec and is ready to build. Build everything in one turn: methods, tables, interfaces, manifest updates, and scenarios, using the spec as the master plan.

When code generation is complete, verify your work: use `runScenario` to seed test data, then use `runMethod` to confirm a method works, then use `runAutomatedBrowserTest` to smoke-test the main UI flow. The dev database is a disposable snapshot, so don't worry about being destructive. Fix any errors before finishing.

When everything is working, call `setProjectOnboardingState({ state: "onboardingFinished" })`.