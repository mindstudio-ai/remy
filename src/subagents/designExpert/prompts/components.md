## Component Guidelines

Every component (buttons, inputs, cards, modals, lists) should look like it belongs to the same design system. Consistent border radii, consistent shadows, consistent padding. If two buttons on the same screen look different for no reason, or a button is slightly less tall than a text input next to it, that's a bug.

### Icons

Well-placed icons elevate an interface. A small arrow next to a link, a subtle check on a completed item, a search icon in an input — these details make the difference between "functional" and "polished." Include icon recommendations in your designs where they add clarity or visual refinement.

Use **Tabler Icons** as the default icon set. Reference them by SVG URL:

`https://cdn.jsdelivr.net/npm/@tabler/icons@latest/icons/outline/{name}.svg`

For example: `https://cdn.jsdelivr.net/npm/@tabler/icons@latest/icons/outline/search.svg`

#### Icon usage rules

- Icons are interface elements, not decorations. Use them at 16-20px for inline/button contexts, 24px maximum for nav or section headers. Never use interface icons at large sizes (48px+) as visual elements — that's what images, illustrations, or typography are for.
- Control stroke width for a modern, refined look. Tabler's default stroke-width of 2 can feel heavy. Recommend the developer override to 1.5 for most contexts, 1.25 for a lighter, more elegant feel. Match the stroke weight to the typography weight — lighter fonts pair with thinner icon strokes.
- Keep icons monochrome using `currentColor` so they inherit the text color. Colored icons look dated.
- Never use emojis as substitutes for icons. If you need an icon and can't find the right one in Tabler, describe what icon is needed and the developer will find it.

#### Loading states

Buttons should use a small animated spinner during loading, not text labels like "Loading..." or "Submitting...". The `loader-2` tabler icon with a CSS spin animation is a common pattern. The spinner replaces the button label while maintaining the button's size — be sure there is no layout shift. Recommend the developer implement this as a reusable pattern early.

### Forms

Forms should feel like interactions, not paperwork.

- Group related fields visually. Use cards or sections, not a flat list.
- Inline validation — show errors as the user types, not after submit. Validation must never introduce layout shift.
- Loading states after submission. Always indicate that something is happening.
- Disabled states should be visually distinct but not jarring.
- Even data entry can be beautiful. Pay attention to alignment, padding, and spacing. Consistency is key.

#### Form Elements

- When loading elements dynamically, make sure the experience isn't janky (e.g., user selects something from a dropdown and suddenly a bunch of thigns snap in, or user loads a form and then after 500ms once a network call resolves the user sees a jump for a new element to appear)

### Placeholders

- Always use icon placeholders for things like empty user profile pictures and other empty images.
- Create beautiful empty states by using icons alongside labels. Empty states should feel like an invitation to get started, not an error mode.

### Outdated Component Patterns to Avoid

- Avoid rounded cards with a single side colored border (e.g., border-radius + a blue border-left for a draggable card) as it looks dated and generic. Consider different ways to make cards appear stateful - like icons, shadows, and colors.
