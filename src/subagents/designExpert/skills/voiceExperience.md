---
name: Voice Agent Experience
what: The holistic on-screen experience of a live voice agent — the audio-reactive centerpiece, the streaming captions, the way tool activity surfaces, and the call controls, composed as one scene. It is the most visual thing a voice app has and a first-class design deliverable end to end - a real-time computed centerpiece (WebGL; three.js when a dedicated voice-first app should wow), layout-stable captions, in-character tool status, controls that belong to the composition. This reference carries the full craft recipe — technique families, motion language, palette discipline, caption and control patterns, and the performance budget that separate a living instrument from a janky blob with widgets around it.
when: Before designing (or reviewing) the UI of a voice interface — the agent's centerpiece, captions, tool-activity presentation, or call controls.
---

# Voice Agent Experience

A voice agent, live on screen, is one composed scene, and you own the whole scene: the centerpiece the user watches, the captions streaming beneath it, the quiet line that says what the agent is doing, and the controls that frame it. Every other surface of a voice app is transient — this scene is on screen from the first "listening" to the last "ended," and it *is* the product's face while the product is speaking. It deserves the same design investment as the brand itself, and it is the single most common place voice apps ship something embarrassing: a pulsing CSS circle with default buttons scattered around it.

Design the scene as a composition with hierarchy — centerpiece dominant, captions supporting, tool status quiet, controls present but calm — not as four widgets that happen to share a screen. And decide the framing deliberately: when the app has a web interface, voice is a layer over it (the app stays visible and usable); a full-screen voice mode is the immersive option for apps where the conversation is the product — earn it, don't default to it.

## The register

Whatever the app, this surface pulls from one aesthetic register: the 2026-and-beyond language of ambient intelligence — future-ish, clean, quietly beautiful. The app's brand supplies the hues, the type, and the object; this register supplies the bearing. Touchstones worth drawing on, stated as qualities to reproduce rather than moods:

- **Siri / Apple Intelligence** — intelligence rendered as *light behaving intentionally*: a luminous, iridescent presence on a restrained neutral ground, hardware-grade polish, color that glows from within the form rather than being painted onto it. Note what it never does: no mascot, no face, no skeuomorphic microphone.
- **Arrival (the film)** — monolithic calm. An immense, precise thing communicating slowly: vast negative space, a restrained near-monochrome ground, organic form emerging from exact structure, motion measured in tens of seconds. The awe comes from patience and scale, not activity.
- **Precision instruments** — the confidence of something measured: exact alignment, real signal driving every moving element, monospaced labels earning their place, nothing decorative that doesn't encode state.

And the register's explicit exclusions — each of these reads as costume sci-fi or AI slop; never ship any of them: the hologram-cockpit HUD (fake crosshairs, orbiting rings, scattered random digits, wireframe globes, corner brackets); the generic AI-assistant look (an indigo-to-violet gradient blob with an outer glow); chrome and lens flares; "digital rain"; a robot or assistant mascot in any form.

## The centerpiece

**Computed, structured, alive, brand-derived.** The piece is rendered in real time, every frame — a real-time WebGL rendering, not a video, not a GIF, not a CSS transform on a blurred div. Raw WebGL or a small helper library is right for a voice layer over an app; three.js is justified when the app is voice-first and the visual is the product's hero. What makes the difference between "computed" and "janky" is structure: the good ones read as something *measured or sampled* — an instrument, a scan, a constellation — never as smoke, lava, or a screensaver.

The shape is not prescribed. A sphere is one option among many, and often the least interesting. Let the domain pick the object: a vector-search product wants an embedding constellation or a query lighting up its neighbors; a terminal-flavored dev tool wants a levels meter or scope; a wellness app might want something botanical built from the same sampled medium. Whatever the object, it should be unmistakably *this app's*.

### Archetype families

- **Computed point clouds** — thousands of individually lit points forming one recognizable object. Placement is algorithmic and even (a Fibonacci / golden-angle lattice for surfaces, low-discrepancy sampling for volumes) so coverage is uniform with no clumping — even sampling is most of why these read "computed" rather than "smoke." Objects: spheres, toruses, terrains, constellations, node graphs, lattices.
- **The instrument family** — meters, scopes, waveform lattices, spectrum bars with real signal behind them. Terminal-adjacent, precise, monospaced-label energy. Often the right call for developer tools and utilitarian brands where an orb would feel like costume jewelry.
- **Whatever the brand suggests** — the families above are starting points, not a menu. The test is the same either way: does it look designed for this app, and does it look *computed*?

### Craft techniques

These are the moves that make the difference, stated as implementable direction. Prescribe them concretely to the developer — point counts, timings, blend modes — not as vibes.

- **Even, algorithmic placement.** Points and elements sit on a computed lattice, never `Math.random()` scatter. Uniform coverage is what makes the object read as sampled and sharp.
- **Sharp opaque elements, not additive glow.** Each point is a small, depth-tested, round sprite with a solid core and a thin feather, on normal blending. Counterintuitively, *avoiding* additive glow is what keeps the piece crisp and gives it real volume; additive blending is how you get the hazy nebula.
- **Depth is the shading language.** Front-facing elements are brighter, larger, and more saturated; back elements recede — dimmer, desaturated, smaller. This single trick turns a flat particle set into something with genuine dimension.
- **The whole spectrum, present at once.** Map hue to a *spatial axis* through the object — not per-point random, not a time cycle. Every color exists across the surface simultaneously, and a slowly precessing spectral axis makes the color reorganize and flow without ever fading or strobing. This is the signature move people respond to.
- **Slow, layered, organic motion.** Think tens of seconds: a full rotation around ~50s, a gentle breathe (±1–2% scale on a ~7s sine), simplex-noise undulation, an occasional slow scan band washing across the object. Everything calm; nothing flashy. Layered slow motions read as alive; one fast motion reads as a loading spinner.
- **Give the light something to bloom against.** Sit the piece on a dark ground with a soft, blurred caustic or ambient pool behind it in the anchor hue, so the saturated points have depth behind them instead of floating on flat black.

### Palette discipline

Derive the hues from the app's brand — never ship a stock palette. The discipline that keeps an iridescent palette from turning to mud:

- **One anchor hue** that owns the piece (and matches the brand's identity).
- **Warm as a deliberate minority** — a coral or amber presence, never half the wheel.
- **A bridge hue** between the warm end and the cool end so the loop never blends into brown.
- **A near-white** reserved for a handful of hot sparkle points and pulse crests.
- Bake the ramp into a small gradient texture (e.g. 256×1) and sample it in the shader — cheap, consistent, and easy to swap when the brand evolves.

### State mapping

The centerpiece carries the agent's state machine — idle → connecting → listening → thinking → speaking → ended — and reacts to live audio amplitude while listening and speaking. Design a distinct-but-related behavior for each state (at rest it should settle into the hero look), and **always pair the piece with a text state label**: state is never conveyed by color or motion alone. Specify each state's behavior explicitly — the amplitude response while listening, what "thinking" looks like (often the scan band's moment), how speaking differs from listening — so the developer isn't left to invent transitions.

## Captions

Captions are typography — design them like any other type in the app, with the brand's faces and scale, not a default sans in a gray box. Both sides of the conversation stream as captions; they are what makes the agent feel accurate and they are the accessibility story. The rules that make them feel engineered rather than jittery:

- **Layout-stable, always.** Reserve a fixed-height caption region so arriving text never shifts the composition around it. Streaming segments update in place (each event carries the segment's full text — replace, never append), the visible line count is capped, and old lines fade out rather than pushing content down. A caption region that reflows the page on every event reads as jank and fights the centerpiece for attention.
- **Smooth arrival.** Ease new words in (a fast opacity ramp is enough); never let text pop hard at stream rate. The target feel is a broadcast lower-third, not a log tail.
- **Differentiate the voices quietly.** User and agent captions need distinct treatments — weight, color, or alignment — legible at a glance without reading like a chat transcript. The agent's caption can carry slightly more presence; it's the one speaking.
- **Place them in the composition.** Captions sit in the centerpiece's orbit (typically below), sized to support rather than compete. In a layer-over-app treatment they stay compact — one or two lines — so the app remains usable behind them.

## Tool activity

When the agent calls the app's methods mid-conversation, the screen should acknowledge it the way the agent's voice does: quietly, in character, in the app's language. Design this layer — don't let it default to nothing (the agent looks frozen during a slow tool) or to raw output.

- **A compact inline status** near the captions or centerpiece: "Booking your appointment…", "Looking that up…" — the app's voice, never raw method names, spinners with no label, or JSON.
- **Results can render.** Successful tool results are delivered to the caller's browser in lockstep with the spoken answer — so the record the agent just pulled up, the booking it made, or the citation it found can appear as a real UI element (a card, a highlighted row) while the agent says it. Decide which tools deserve a visual result and what it looks like; this is the moment the voice agent proves it's operating the same product the user sees.
- **Transient by default.** Status lines appear, resolve, and clear; results persist only when they're genuinely useful to keep on screen. The scene should end each exchange as calm as it started.

## Controls and chrome

Controls are part of the composition, not an afterthought row of default buttons.

- **Mute and end call: always visible, always working**, styled as first-class elements of the scene. These two are non-negotiable; everything else is optional chrome.
- **A text input, when exactness matters.** The platform supports injecting typed text into the live conversation — design the affordance for apps where users will need to hand over an address, a code, or an email (typing beats spelling it aloud three times). Keep it secondary: a small "type instead" affordance, not a chat box competing with the mic.
- **Design the awkward states.** Mic permission denied (a gentle, non-blaming explanation with a path to fix it — never a dead end), connecting (the centerpiece's connecting behavior plus its label), reconnecting/ended (what the scene settles into). These states are where a defaulted UI most obviously falls apart.
- **The state label** (listening / thinking / speaking) lives with the centerpiece — set it in the brand's type, and treat it as chrome that's always legible over whatever the piece is doing.

## Performance and fallbacks — from day one

These are why the good ones perform, and they are design requirements, not optimizations to defer:

- Cap `devicePixelRatio` at 2.
- Reduce density on mobile (roughly 40% of the desktop element count).
- Pause the render loop entirely when the piece scrolls off-screen or the tab is hidden.
- Ship a static-but-labeled fallback for `prefers-reduced-motion` and for no-WebGL.

## Your deliverable: art direction, not suggestions

You art-direct this surface end-to-end. The developer has a terrible sense of design and will fill any gap you leave with a default — and defaults are how this surface dies. Deliver an implementation-ready specification:

- **Exact values everywhere.** Element counts (desktop and mobile), sizes in px, every duration in seconds, easing curves, blend modes, sprite core/feather proportions, amplitude-response ranges, the full color ramp as ordered hexes, dimensions for the caption region and controls.
- **State by state.** Cover idle / connecting / listening / thinking / speaking / ended — what the centerpiece does, what the label reads, how captions and controls behave — and the transitions between states, so none are left to improvisation.
- **Pseudocode or shader math where prose is ambiguous.** The lattice formula, the hue-to-axis mapping, the noise parameters — a few lines of code communicate what a paragraph can't.
- **One answer per question.** If you would accept either of two options, pick one and prescribe it. "Something like," "roughly," and "consider" are how implementations go generic; the only tolerances that exist are the ones you state numerically.
- **A verification checklist.** End with the specific things to screenshot-check after implementation — sprite sharpness, caption stability while streaming, each awkward state, the fallbacks — so the developer can prove the direction landed rather than assume it did.
