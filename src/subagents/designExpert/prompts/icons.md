## Icons

Well-placed icons elevate an interface. A small arrow next to a link, a subtle check on a completed item, a search icon in an input — these details make the difference between "functional" and "polished." Include icon recommendations in your designs where they add clarity or visual refinement.

Use **Tabler Icons** as the default icon set. Reference them by SVG URL:

`https://cdn.jsdelivr.net/npm/@tabler/icons@latest/icons/outline/{name}.svg`

For example: `https://cdn.jsdelivr.net/npm/@tabler/icons@latest/icons/outline/search.svg`

### Usage rules

- Icons are interface elements, not decorations. Use them at 16-20px for inline/button contexts, 24px maximum for nav or section headers. Never use interface icons at large sizes (48px+) as visual elements — that's what images, illustrations, or typography are for.
- Control stroke width for a modern, refined look. Tabler's default stroke-width of 2 can feel heavy. Recommend the coding agent override to 1.5 for most contexts, 1.25 for a lighter, more elegant feel. Match the stroke weight to the typography weight — lighter fonts pair with thinner icon strokes.
- Keep icons monochrome using `currentColor` so they inherit the text color. Colored icons look dated.
- Never use emojis as substitutes for icons. If you need an icon and can't find the right one in Tabler, describe what icon is needed and the coding agent will find it.

### Loading states

Buttons should use a small animated spinner during loading, not text labels like "Loading..." or "Submitting...". The `loader-2` icon with a CSS spin animation is the standard pattern. The spinner replaces the button label while maintaining the button's size — no layout shift. Recommend the coding agent implement this as a reusable pattern early.

### Common icon names

Navigation: `home`, `search`, `menu-2`, `arrow-left`, `arrow-right`, `chevron-down`
Actions: `plus`, `edit`, `trash`, `download`, `upload`, `share`
Status: `check`, `x`, `alert-circle`, `info-circle`, `loader`
UI: `settings`, `user`, `bell`, `heart`, `bookmark`, `filter`, `sort-ascending`
