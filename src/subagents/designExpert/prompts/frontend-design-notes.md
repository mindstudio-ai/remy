# Web App Interface Design Notes

Design standards for web interfaces in MindStudio apps.

## Quality Bar

Every interface must feel like a polished, shipping product — not a prototype, not a starter template, not a homework assignment. The standard is iOS and Apple's bundled iOS apps, Notion, Stripe. If it wouldn't look good on Dribbble, Behance, or Mobbin, it's not done.

MindStudio apps are end-user products. The interface is the product. Users judge the entire app by how it looks and feels in the first 3 seconds.

## Design System from the Spec

The brand spec files in `src/interfaces/@brand/` define the app's visual identity at the brand level: a small palette of named colors and font choices with one or two anchor styles. These are brand decisions, not implementation details. Derive the full design system (CSS variables, component styles, spacing, borders, etc.) from these foundations.

**When brand spec files are present, always use the defined fonts and colors in generated code.** Do not pick your own fonts or colors when the spec defines them. Reference colors semantically (as CSS variables or named constants) rather than scattering raw hex values through the codebase.

## Important: Build Apps, Not Web Pages

Interfaces run fullscreen in the user's browser or a wrapped webview mobile app. They must feel like native Mac or iOS apps, not websites.

- **No long scrolling pages.** Use structured layouts: cards, split panes, steppers, tabs, grouped sections that fit the viewport. The interface should feel like an award winning iOS or macOS app, not a document.
- **On mobile**, scrolling may be necessary, but use sticky headers, fixed CTAs, and anchored navigation to keep key actions within reach.
- Think of every screen as something the user opens, uses, and closes — not something they read.

## Layout Stability

Layout shift is never acceptable. Elements jumping around as content loads or streams in makes an interface feel broken.

- Reserve space for content that hasn't arrived yet. Use fixed/min-height containers, skeletons (but keep them subtle/simple - no shimmers), or aspect-ratio boxes.
- Images must always have explicit dimensions so the browser reserves space before the image loads.
- Loading-to-loaded transitions should swap content in-place without changing container size.
- Buttons must not change size during loading states. Use a fixed width or `min-width`, and swap the label for a spinner or short text that fits the same space. "Submit" becoming "Submitting..." should not make the button wider and push adjacent elements around.
- Conditional UI should use opacity/overlay transitions, not insertion into flow that displaces existing content.
- This is especially important to keep in mind when building things that display AI generated text, especially if the text streams in. Make sure to never shift layout because of streaming AI text.

## Responsive Design

Every interface must work on both desktop and mobile.

- Use the full viewport. Backgrounds should extend to edges.
- On desktop, use the space — multi-column layouts, sidebars, spacious cards. Avoid narrow centered columns with empty gutters on a wide screen.
- On mobile, stack gracefully. Prioritize content and actions.
- Test at both extremes. A layout that only looks good at one breakpoint is not done.
- When the app is primarily mobile, recommend setting `"defaultPreviewMode": "mobile"` in `web.json` so the editor previews in a mobile viewport by default.

## What to Actively Avoid At All Costs

- **Avoid generic fonts.** Overused defaults that strip away all personality. Instead: pick a distinctive Google Font that fits the app's character.
- **Avoid purple or indigo anything.** Purple gradients, purple buttons, purple accents are overused. The user will be dismissive of our designs if they come out looking purple or indigo.
- **Avoid colored left-border callout boxes.** Rounded divs with a thick colored `border-left` — the generic "info card" pattern. Instead: use typography, spacing, and background tints to create hierarchy. If you need to call something out, use a full subtle background or a top border.
- **Avoid three equal boxes with icons.** The default AI landing page layout. Instead: use asymmetric layouts, varied column widths, or a single focused content area.
- **Avoid timid color palettes.** Evenly distributed, non-committal colors. Instead: one or two dominant colors with sharp accents. Commit to a direction.
- **Avoid card-heavy nested layouts.** Cards inside cards, everything boxed. Instead: use space, typography, and dividers to create hierarchy without extra containers.
- **Avoid inconsistent spacing.** 12px here, 20px there, 8px somewhere else. Instead: define a spacing scale (4/8/12/16/24/32/48/64) and use it everywhere.
- **Avoid components from different visual languages.** Rounded buttons next to square inputs, shadows mixed with flat design. Instead: pick one system and apply it consistently.
- **Avoid long scrolling forms with no visual grouping.** Instead: group fields into sections with clear headings, cards, or stepped flows.
- **Avoid cramped layouts.** Text pressed against edges, no room to breathe. Instead: generous padding, comfortable margins, let the content float.
- **Avoid loading states that are just a centered spinner on a blank page.** Instead: use subtle skeletons (no shimmer) that mirror the layout, or keep the existing structure visible with a subtle loading indicator.

Most importantly: **Avoid any interface where the first reaction is "this looks like a demo" or "this looks like it was made with a website builder."**
