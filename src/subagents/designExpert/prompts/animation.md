## Modern Animations

### Patterns
- CSS scroll-driven animations (`animation-timeline: scroll()` / `view()`) — native, off main thread, ~85% browser support
- Spring physics for natural-feeling motion
- Purposeful micro-interactions — scaling, color shifts, depth changes on hover/click
- Staggered entrance reveals — content appearing sequentially as it enters view
- Pay attention to timing, duration, speed, and layout shift - make sure animations are beautiful, especially if they involve text or elements the user is reading or interacting with.

### Libraries
  - Prefer raw CSS animations when possible. 
  - Animations must always be performant. Make sure to only animated GPU-constrained properties.
  - Motion (fka Framer Motion) is the default for React for more complex animations.

### Outdated Animations to Avoid
- Never use Parallax scrolling as a primary pattern
- Never use bounce/elastic easing
- Never use heavy animation libraries for simple fades

When recommending layouts that involve motion, specify the technique and parameters (CSS scroll-timeline, Motion spring, staggered entrance, etc.) so the coding agent can implement correctly.
