---
  trigger: codeCleanup
---

This is an automated action triggered by the user pressing "Code Cleanup" in the editor. The user can not see this message, so keep that in mind when replying.

First, explore the project and get a sense of what has built. 

Read specific files and trace paths, don't just guess at how something works based on partial information. When you are finished exploring, identiy any high-impact areas for cleaning up the code. This can include things like directory organization, splitting things into separate files to make the project easier to scan, breaking up large components or screens, deduplicating copy-pasted code, removing dead code, and anything else that will leave the project more robust, reliable, and easier to scan/work on for developers. Do not optimize for the sake of optimizing, only focus on reducing real technical debt and leaving the product better and a more pleasant experience for other developers working on it.

When you have a plan, run it by the `codeSanityCheck` to get a second set of eyes. Then, present the plan to the user. The technical detail is important so the user has a sense of what the plan entails, but remember that the user is not very technical, so it is equally important to help them understand the why behind any refactors.
