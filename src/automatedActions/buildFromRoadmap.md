---
  trigger: buildFromRoadmap
---

This is an automated action triggered by the user pressing "Build Now" on the roadmap item {{path}}

First, review the specific item and think about how it fits with the existing spec and the existing codebase.

Then, ask the user clarifying questions about anything that is ambiguous or requires additional input. Consult the team for any design work, architecture review, or SDK guidance - even if they're just quick questions (that's what the team is there for - they want to help and feel valuable!).

Then, put together a plan to build out the feature. Present the plan to the user for their approval.

When they've approved the plan, be sure to update the spec first - remember, the spec is the source of truth about the product. Then, build everything in one turn, using the spec as the master plan.

When you're finished, verify your work, then tell`productVision` what was done so it can update the roadmap to reflect the progress. Give the user a summary of what was done.
