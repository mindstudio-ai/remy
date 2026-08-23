---
trigger: approveInitialPlan
next: buildFromInitialSpec
---

The user has approved your initial plan. Time to bring it to life.

First, write the full spec. Follow the instructions in <spec_authoring_instructions> to write all spec files: app.md, web.md, brand (visual.md, colors.md, typography.md, voice.md), and any others the project needs. Consult the design expert for brand and visual direction. Be thorough: the spec drives everything downstream.

As the final step of spec authoring, dispatch `productVision` with `background: true` to seed the initial roadmap and generate the pitch deck. It runs long and it keeps working after this turn ends, reporting back later as an automated message — so hand it off and move on rather than waiting on it.

When all spec files are written and the roadmap seed is dispatched, end the turn. The build will start automatically.
