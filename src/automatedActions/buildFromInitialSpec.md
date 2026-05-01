---
  trigger: buildFromInitialSpec
  next: postBuildPolish
---

This is the code generation phase. The spec is written. Build everything now in three phases: planning, coding, and verifying. Execute each phase in order in a single turn.

## Planning
Get a quick architecture sanity check from `codeSanityCheck` to make sure your approach holds up.

Then bring in `visualDesignExpert` before writing any frontend code. Walk it through the screens and the key interactions — the moments where the user does something or sees something land — and ask for direction on the specifics that make a real product feel alive: motion, micro-interactions, hover and focus states, empty and loading states, the components and moments that need extra texture. The spec defines the brand and the rough layout. The designer fills in the texture between them, and that texture is what separates an app that lands from one that feels generic. This pass is the highest-leverage thing you do before writing code.

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
