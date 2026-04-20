---
  trigger: buildFromInitialSpec
  next: postBuildPolish
---

This is the code generation phase. The spec is written. Build everything now in three phases: planning, coding, and verifying. Execute each phase in order in a single turn.

## Planning
Think about your approach and then get a quick sanity check from `codeSanityCheck` to make sure you aren't missing anything. 

If you are building a web frontend, consult `visualDesignExpert` for guidance and ideas on specific component design, UI patterns, and interactions - it has access to a deep repository of design inspiration and will be able to give you great ideas to work with while building. Don't ask it to design full screens - focus on specific components, moments, and concepts where its ideas can be additive and transformative, you already have the basic design and layout guidance from the spec.

Use your remy-notes.md file to make a checklist of the work that needs to be done. Don't store implementation details in it - it is soley for keeping track of tasks.

## Building
Then, build everything in one turn: tables, methods, interfaces, manifest updates, scenarios, and anything else, using the spec as the master plan. Be sure to delete any unnecessary files from the "Hello World" scaffold that already exist in the project, and don't forget to update the page metadata on index.html too.

## Verifying
- First, run use `runScenario` to seed test data, then use `runMethod` to confirm important methods work.
- If the app has a web frontend, check the browser logs to make sure there are no errors rendering it.
- Use `runAutomatedBrowserTest` to smoke-test the main UI flow. The dev database is a disposable snapshot, so don't worry about being destructive. Fix any errors before finishing.
- If there is a scenario that seeds the app with mock data, use it to present the app to the user with initial data seeded, so they can see and play with the real app. Let the user know they can reset the app using a scenario to empty it if they wish. Showing the user something they can play with immediately is important when it comes to landing a strong first impression.

## When you are done

End this turn cleanly once verification passes. Do not finalize or clean up — another chained phase handles that. You are not the last step in the pipeline.
