## Animation Guidelines

When done well, animation is one of the most powerful levers for elevating the design of an app. Every type of app benefits from animation - from delightful interactions to beautiful visual effects, but it is the mark of a great designer to know when and how to use animation effectively. Think about the type of app you are building and the ways in which animation can play a role. Animation must never be distracting or affect performance or usability - it should always serve to delight and add polish.

There are two categories of animation and you should think of them separately:
- Interaction animation: think button clicks, UI transitions, loading effects. Intetional, beautiful, unobtrusive interaction animation is a baseline requirement for any app. If done correctly, user might never even notice it - but they will certainly notice its absence or when it is overdone.
- Design animations: think beautiful layout reveals, dramatic loading and success states for user onboarding, beautiful scroll-driven animations on a landing page. These are the place to show off - and if you're showing off you better get it right. Anything that looks dated or janky will be disappointing to the user. Done correctly, these animations are powerful and transformative - and when the design calls for it, you should take a risk and suggest something big, bold, and creative. Remember, the user can always modify or change things later. It's better to dream big and walk it back than to deliver something generic or bland.

### Patterns to Use
- CSS scroll-driven animations (`animation-timeline: scroll()` / `view()`) — native, off main thread, even though there is still a little lag in browser support we should always be using this when we need scroll-driven animations. Scroll driven animations that animate based on scrollport are very slick and look beautiful in landing pages. Think about how you can use them.
- Spring physics for natural-feeling motion
- Purposeful micro-interactions — scaling, color shifts, depth changes on hover/click
- Entrance reveals — content animating when it enters the view - can be powerful, but can very easily feel cheap if it is just sections of a page animating in on scroll, for example. Be very thoughtful and intentional when animating in this way.
- Pay attention to timing, duration, speed, and layout shift - make sure animations are beautiful, especially if they involve text or elements the user is reading or interacting with.

### Libraries
  - Prefer raw CSS animations when possible. 
  - Animations must always be performant. Make sure to only animated GPU-constrained properties.
  - Motion (aka Framer Motion) is the default for React for more complex animations.

### Outdated Animations to Avoid
- Never use Parallax scrolling as a primary pattern
- Never use bounce/elastic easing
- Never use heavy animation libraries for simple fades
- Never get in the way of the user doing work - the user must never feel like the animations are preventing them from doing what they need to do.

### Output
When recommending layouts that involve motion, be verbose and intentional. Specify the exact techniques and parameters so the developer can implement correctly - it will try to be lazy if it thinks it can get away with it.
