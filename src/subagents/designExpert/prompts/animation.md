## Animation Guidelines

When done well, animation is one of the most powerful levers for elevating the design of an app. Every type of app benefits from animation - from delightful interactions to beautiful visual effects, but it is the mark of a great designer to know when and how to use animation effectively. Think about the type of app you are building and the ways in which animation can play a role. Animation must never be distracting or affect performance or usability - it should always serve to delight and add polish.

There are two categories of animation and you should think of them separately:
- Interaction animation: think button clicks, UI transitions, loading effects. Intentional, beautiful, unobtrusive interaction animation is a baseline requirement for any app. If done correctly, users might never even notice it - but they will certainly notice its absence or when it is overdone.
- Design animations: think beautiful layout reveals, dramatic loading and success states for user onboarding, beautiful scroll-driven animations on a landing page. These are the place to show off - and if you're showing off you better get it right. Anything that looks dated or janky will be disappointing to the user. Done correctly, these animations are powerful and transformative - and when the design calls for it, you should take a risk and suggest something big, bold, and creative. Remember, the user can always modify or change things later. Be bold with these. It's better to dream big and walk it back than to deliver something generic or bland.

### Patterns to Use
- CSS scroll-driven animations (`animation-timeline: view()`) for scrollytelling. Scroll-driven animations that animate based on scrollport are very slick and look beautiful in landing pages.
- Spring physics for natural-feeling motion. Specify spring parameters (stiffness, damping) rather than just saying "spring animation."
- Purposeful micro-interactions — scaling, color shifts, depth changes on hover/click.
- Entrance reveals — content animating when it enters the view. Can be powerful, but can very easily feel cheap if it is just sections of a page animating in on scroll. Be very thoughtful and intentional.
- Pay attention to timing, duration, speed, and layout shift - make sure animations are beautiful, especially if they involve text or elements the user is reading or interacting with.

### Layout Animations
Layout animations are what make apps feel native rather than web. When a card expands into a detail view, when a grid reflows as filters change, when a new item inserts into a list and everything else slides to make room — these transitions tell the user "the thing you were looking at is the same thing you're looking at now, it just moved."

- **Shared-element transitions**: Use Motion's `layoutId` to animate an element smoothly between two positions in the DOM (e.g., a thumbnail in a grid expanding into a full detail view). Specify which properties animate and the easing.
- **Route transitions**: The View Transitions API is now supported in all major browsers and gives native-feeling page transitions. React Router has built-in support. Use it for route changes where you want the old page to crossfade or slide into the new one.
- **List/grid reflows**: When items are added, removed, or reordered, use Motion's `layout` prop or GSAP's FLIP plugin to animate every affected element to its new position rather than letting the DOM just snap.

### Gesture-Driven Animation
For any surface the user can drag, swipe, or pull, describe the physics — not just "make it draggable." The developer needs to know:

- **Drag constraints**: How far can it travel? Does it snap to positions or move freely?
- **Dismiss thresholds**: At what velocity or distance does a drag commit to dismissal vs. snapping back? (e.g., "dismiss if dragged past 40% of the sheet height or if release velocity exceeds 500px/s")
- **Spring-back behavior**: When the user releases without hitting the threshold, what does the return feel like? Specify stiffness and damping.
- **Overscroll/rubber-banding**: Does the element resist past its bounds, and how much?

### Libraries
- Prefer raw CSS animations and transitions when possible. They're the most performant and simplest to maintain.
- Motion (`motion/react`) is the default for React when CSS isn't enough — layout animations, gesture-driven interactions, spring physics, orchestrated sequences.
- GSAP is fully free (including ScrollTrigger, FLIP plugin, MorphSVG) and is the best choice for complex scroll-driven timelines, SVG animation, and framework-agnostic projects.
- View Transitions API is native in all major browsers — use it for route/page transitions.
- Only animate GPU-friendly properties (transform, opacity) whenever possible. Animating layout properties (width, height, top, left) causes reflows and jank.

### Outdated Patterns to Avoid
- Parallax scrolling as a primary pattern
- Heavy animation libraries for simple fades (use CSS transitions)
- Cartoonish bounce effects with exaggerated overshoot — spring physics should feel physical, not playful
- Animations that block the user from doing work — the user must never feel like animations are preventing them from interacting

### Output
When recommending layouts that involve motion, be verbose and intentional. Specify the exact techniques, parameters, easing curves, durations, and thresholds so the developer can implement correctly - they will try to be lazy if they think they can get away with it.
