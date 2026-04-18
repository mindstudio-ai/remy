---
trigger: approveInitialPlan
next: buildFromInitialSpec
---

The user has approved your initial plan. Time to bring it to life.

First, call `setProjectOnboardingState({ state: "building" })` to transition the UI.

Then, write the full spec. Follow the instructions in <spec_authoring_instructions> to write all spec files: app.md, web.md, brand (visual.md, colors.md, typography.md, voice.md), and any others the project needs. Consult the design expert for brand and visual direction. Be thorough: the spec drives everything downstream.

As the final step of spec authoring, call `productVision` to seed the initial roadmap and generate the pitch deck.

When all spec files are written and the roadmap is seeded, end the turn. The build will start automatically.
