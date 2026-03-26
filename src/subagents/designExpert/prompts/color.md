## Color Guidelines

Choose modern color schemes from seed colors using HSL rotation. Convert hex to HSL, rotate hue, convert back.

- **Complementary** — rotate hue 180°
- **Analogous** — rotate hue ±30°
- **Triadic** — rotate hue ±120°
- **Split-complementary** — rotate hue 150° and 210°
- **Tetradic** — rotate hue 90°, 180°, 270°

For tint/shade ramps, adjust lightness in HSL. Lighter variants increase L; darker variants decrease L.

Use `oklch` color space when recommending gradients or derived colors. It produces perceptually uniform transitions without the muddy gray zone of RGB/HSL. Example: `linear-gradient(to right in oklch, #3b82f6, #10b981)`.

For programmatic color derivation, recommend `color-mix()` and relative color syntax:
- `color-mix(in oklch, #3b82f6 70%, white)` — tint generation
- `oklch(from var(--brand) calc(l * 1.25) c h)` — lightness adjustment from a token

Derive palettes from real products in the same domain when possible. "Pretty" palettes from generators or blog lists are not necessarily UI-functional. Use <visual_design_references> and <ui_case_studies> for inspiration, ideas, and direct reference. There is no issue using the same base colors as something else - good design is always built on the shoulders of giants.

## Gradient Techniques
- Mesh / aurora gradients — multiple layered `radial-gradient()`s with `filter: blur()` over dark backgrounds. The Stripe/Linear/Vercel aesthetic.
- Grain/noise overlays — SVG `feTurbulence` filters layered under gradients. Combats banding, adds warmth.
- Animated gradient blobs — CSS `@keyframes` animating `background-position` on oversized gradients for hero sections.
- Glassmorphism (subtle) — `backdrop-filter: blur()` with gradient tints, used sparingly.
- Stacked/layered box shadows make shadows appear more realistic and subtle than a single-value shadow.
- Be careful to make sure CSS is always performant.

### Outdated color trends to avoid
- Simple two-color linear gradients (the 2018 "purple to blue" hero)
- Instagram-style gradient borders
- Overly saturated uniform gradients without texture or depth

Remember, always specify gradients using `oklch` color space for vibrant, smooth transitions.

### Colors block format

A `` ```colors `` fenced block in a `type: design/color` spec file declares 3-5 brand colors with evocative names, hex values, and descriptions. The names are brand identity names (not CSS property names), and the descriptions explain the color's role in the brand. Be creative with naming colors - you are building a brand book, not a paint swatch. When returning color palettes to the user, always ue the color block format so they display nicely:

```
Color Name:
  value: "#XXXXXX"
  description: Primary background and dark surfaces
Color Name:
  value: "#XXXXXX"
  description: Elevated surfaces and containers
Color Name:
  value: "#XXXXXX"
  description: Primary text and foreground elements
COlor Name:
  value: "#XXXXXX"
  description: Secondary text and supporting content
```

Derive additional implementation colors (borders, focus states, hover states, disabled states) from the brand palette rather than expecting them to be specified.
