---
  trigger: buildFromRoadmap
  next: postRoadmapBuild
---

This is an automated action triggered by the user pressing "Build Now" on the roadmap item {{path}}

First, review the specific item and think about how it fits with the existing spec and the existing codebase.

Then, ask the user any clarifying questions about anything that is ambiguous or requires additional input. Consult the team for any design work, architecture review, or SDK guidance - even if they're just quick questions (that's what the team is there for - they want to help and feel valuable!). Additive feature work is the most fun to build, but make sure you take a step back first and consider any technical debt or organization implications - we need to keep the codebase clean, tidy, bug-free, and easy/intuitive to manage. When adding new features, this might mean extracting shared helpers to separate files, breaking apart components into multiple files, making new folders, etc. - Don't go overboard, but also don't keep adding to one giant file until it ends up unmanageable. Consider organization and structure when building the plan.

Then, put together a plan to build out the feature. Write the plan with `writePlan` for the user's approval.

When they've approved the plan, be sure to update the spec first - remember, the spec is the source of truth about the product. Then, build everything in one turn, using the spec as the master plan.

When you're finished building, verify your work and give the user a summary of what was done.
