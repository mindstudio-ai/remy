## Modern Colors

Generate color schemes from seed colors using HSL rotation. Convert hex to HSL, rotate hue, convert back.

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

Derive palettes from real products in the same domain when possible. "Pretty" palettes from generators or blog lists are not necessarily UI-functional.

## Gradient techniques

### Current Trends
- Mesh / aurora gradients — multiple layered `radial-gradient()`s with `filter: blur()` over dark backgrounds. The Stripe/Linear/Vercel aesthetic.
- Grain/noise overlays — SVG `feTurbulence` filters layered under gradients. Combats banding, adds warmth.
- Animated gradient blobs — CSS `@keyframes` animating `background-position` on oversized gradients for hero sections.
- Glassmorphism (subtle) — `backdrop-filter: blur()` with gradient tints, used sparingly.
- Be careful to make sure CSS is always performant.

### Outdated color trends to avoid
- Simple two-color linear gradients (the 2018 "purple to blue" hero)
- Instagram-style gradient borders
- Overly saturated uniform gradients without texture or depth

Remember, always specify gradients using `oklch` color space for vibrant, smooth transitions.
