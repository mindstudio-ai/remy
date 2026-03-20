# Frontend Design Notes

Design standards for web interfaces in MindStudio apps.

## Quality Bar

Every interface must feel like a polished, shipping product — not a
prototype, not a starter template, not a homework assignment. The standard
is iOS and Apple's bundled iOS apps, Notion, Stripe. If it wouldn't look
good on Dribbble, Behance, or Mobbin, it's not done.

MindStudio apps are end-user products. The interface is the product. Users
judge the entire app by how it looks and feels in the first 3 seconds.

## Be Distinctive

AI-generated interfaces tend to converge on the same generic look: safe
fonts, timid colors, predictable layouts. Fight this actively. Every
interface should have character and intentionality — it should look like a
designer made deliberate choices, not like it was generated from a template.

**Typography must be a conscious choice.** Pick fonts that are beautiful,
distinctive, and appropriate for the product's personality. Generic system
fonts and overused defaults make everything look the same. Typography is
the single fastest way to give an interface identity.

**Commit to a color palette.** One or two dominant colors with sharp accents
outperform timid, evenly-distributed palettes. Draw inspiration from the
app's domain — a finance tool might use deep greens and golds; a creative
tool might use bold, saturated primaries. The palette should feel intentional
and owned, not randomly selected.

**Backgrounds create atmosphere.** Solid white or solid gray is the safe
default and the enemy of distinctiveness. Layer subtle gradients, use warm
or cool tints, add geometric patterns or contextual textures. The background
sets the mood before the user reads a single word.

**Layouts should surprise.** Avoid the predictable patterns: three equal
boxes with icons, centered hero with subtitle, generic card grid. Use
asymmetry, varied column widths, creative negative space, unexpected
compositions. Study Behance and Mobbin for layout inspiration. Every screen
should feel considered, not generated.

## App-Like, Not Web-Page-Like

Interfaces run fullscreen in the user's browser or a wrapped webview mobile
app. They should feel like native apps, not websites.

- **No long scrolling pages.** Use structured layouts: cards, split panes,
  steppers, tabs, grouped sections that fit the viewport. The interface
  should feel like a single-purpose tool, not a document.
- **On mobile**, scrolling may be necessary, but use sticky headers, fixed
  CTAs, and anchored navigation to keep key actions within reach.
- Think of every screen as something the user opens, uses, and closes —
  not something they read.

## Visual Design

- **Typography:** Strong hierarchy — clear distinction between headings,
  body, labels, and captions. Use weight and size, not just color, to
  create hierarchy. Choose fonts that elevate the interface and give it
  personality.
- **Color:** Clean, vibrant, intentional. Use color to communicate state
  and guide attention, not to decorate. Commit to a direction — bold and
  saturated, or muted and editorial — and follow through consistently.
- **Spacing:** Consistent and generous. Padding and margins should be
  uniform across all components — nothing should feel cramped or uneven.
  White space is a feature, not wasted space.
- **Components:** Every component (buttons, inputs, cards, modals, lists)
  should look like it belongs to the same design system. Consistent border
  radii, consistent shadows, consistent padding. If two buttons on the
  same screen look different for no reason, that's a bug.

## Animation

Use motion to make interactions feel polished, not to show off. Focus on
high-impact moments: a well-orchestrated page load with staggered reveals
creates more delight than scattered micro-interactions everywhere.

- Transitions between states should be smooth but fast.
- Streaming content should flow into containers that grow naturally without
  pushing sibling elements around.
- No parallax, no cheesy scroll effects, no bounce/elastic easing, no
  gratuitous loading animations.

## Layout Stability

Layout shift is never acceptable. Elements jumping around as content loads
or streams in makes an interface feel broken.

- Reserve space for content that hasn't arrived yet. Use fixed/min-height
  containers, skeletons, or aspect-ratio boxes.
- Images must always have explicit dimensions so the browser reserves space
  before the image loads.
- Loading-to-loaded transitions should swap content in-place without
  changing container size.
- Buttons must not change size during loading states. Use a fixed width or
  `min-width`, and swap the label for a spinner or short text that fits the
  same space. "Submit" becoming "Submitting..." should not make the button
  wider and push adjacent elements around.
- Conditional UI should use opacity/overlay transitions, not insertion into
  flow that displaces existing content.

## Responsive Design

Every interface must work on both desktop and mobile.

- Use the full viewport. Backgrounds should extend to edges.
- On desktop, use the space — multi-column layouts, sidebars, spacious
  cards. Avoid narrow centered columns with empty gutters on a wide screen.
- On mobile, stack gracefully. Prioritize content and actions.
- Test at both extremes. A layout that only looks good at one breakpoint
  is not done.

## Forms

Forms should feel like interactions, not paperwork.

- Group related fields visually. Use cards or sections, not a flat list.
- Inline validation — show errors as the user types, not after submit.
  Validation must never introduce layout shift.
- Loading states after submission. Always indicate that something is
  happening.
- Disabled states should be visually distinct but not jarring.
- Even data entry can be beautiful. Pay attention to alignment, padding,
  and spacing. Consistency is key.

## Data Fetching and Updates

The UI should feel instant. Never make the user wait for a server round-trip
to see the result of their own action.

- **Optimistic updates.** When a user adds a row, toggles a setting, or
  submits a form, update the UI immediately and let the backend confirm
  in the background. If the backend fails, revert and show an error.
- **Use SWR for data fetching** (`useSWR` from the `swr` package). It
  handles caching, revalidation, and stale-while-revalidate out of the box.
  Prefer SWR over manual `useEffect` + `useState` fetch patterns.
- **Mutate after actions.** After a successful create/update/delete, call
  `mutate()` to revalidate the relevant SWR cache rather than manually
  updating local state.
- **Skeleton loading.** Show skeletons that mirror the layout on initial
  load. Never show a blank page or centered spinner while data is loading.

## What Good Looks Like

- A dashboard that feels like Linear — clean data, clear hierarchy, every
  pixel intentional.
- A form that feels like Stripe Checkout — focused, calm, confident.
- A settings page that feels like iOS Settings — organized, scannable,
  no clutter.
- A list view that feels like Notion — flexible, spacious, information-dense
  without feeling crowded.

## What to Actively Avoid

These are the hallmarks of generic AI-generated interfaces. Every one of
them makes an interface look like it was auto-generated rather than designed.

- **Generic fonts.** Overused defaults that strip away all personality.
  Instead: pick a distinctive Google Font that fits the app's character.
- **Purple or indigo anything.** Purple gradients, purple buttons, purple
  accents. This is the #1 AI-generated aesthetic cliché. Instead: use
  a color palette that fits the app's domain — greens for finance, warm
  neutrals for productivity, bold primaries for creative tools, or just
  confident grayscale.
- **Colored left-border callout boxes.** Rounded divs with a thick colored
  `border-left` — the generic "info card" pattern. Instead: use typography,
  spacing, and background tints to create hierarchy. If you need to call
  something out, use a full subtle background or a top border.
- **Three equal boxes with icons.** The default AI landing page layout.
  Instead: use asymmetric layouts, varied column widths, or a single
  focused content area.
- **Timid color palettes.** Evenly distributed, non-committal colors.
  Instead: one or two dominant colors with sharp accents. Commit to a
  direction.
- **Card-heavy nested layouts.** Cards inside cards, everything boxed.
  Instead: use space, typography, and dividers to create hierarchy without
  extra containers.
- **Inconsistent spacing.** 12px here, 20px there, 8px somewhere else.
  Instead: define a spacing scale (4/8/12/16/24/32/48/64) and use it
  everywhere.
- **Components from different visual languages.** Rounded buttons next to
  square inputs, shadows mixed with flat design. Instead: pick one system
  and apply it consistently.
- **Long scrolling forms with no visual grouping.** Instead: group fields
  into sections with clear headings, cards, or stepped flows.
- **Cramped layouts.** Text pressed against edges, no room to breathe.
  Instead: generous padding, comfortable margins, let the content float.
- **Loading states that are just a centered spinner on a blank page.**
  Instead: use skeletons that mirror the layout, or keep the existing
  structure visible with a subtle loading indicator.
- **Any interface where the first reaction is "this looks like a demo" or
  "this looks like it was made with a website builder."**
