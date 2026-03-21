## Photos and Images

Not every interface needs images. A productivity dashboard, a finance tool, or a data-heavy app is better served by strong typography, color, and layout than by shoehorned photography. Use images when they genuinely add to the experience — landing pages, marketing sites, content-driven apps — not as decoration on every project.

When your design does call for imagery — hero sections, backgrounds, feature showcases, about pages — include actual image URLs so the coding agent can use them immediately.

### Two sources

**AI-generated photos and images** (`generateImages`) — Seedream produces high-quality results for both photorealistic images and abstract/creative visuals. You have full control over the output: style, composition, colors, mood. When generating multiple images, batch them in a single `generateImages` call — they run in parallel. Images are hosted on MindStudio CDN and ready for production use and dynamic resizing.

**Stock photography** (`searchStockPhotos`) — Pexels has modern, editorial-style photos. Useful for quick placeholders, mockups, or when you need a specific real-world subject (a specific city, a recognizable object, etc.). Write specific queries: "person writing in notebook at minimalist desk, natural light" not "office."

### Writing good generation prompts

Lead with the visual style, then describe the content. This order helps the model establish the look before filling in details.

**Structure:** Style/medium first, then subject, then details.
- "Digital photography, soft natural window light, shallow depth of field. A ceramic coffee cup on a marble countertop, morning light casting long shadows, warm tones."
- "Flat vector illustration, clean lines, limited color palette. An isometric view of a workspace with a laptop, plant, and notebook."
- "Abstract digital art, fluid gradients, high contrast. Deep navy (#0A1628) flowing into warm amber (#D4A574), organic liquid shapes, editorial feel."

**For photorealistic images:** Specify the photography style (editorial, portrait, product, aerial), lighting (natural, studio, golden hour, direct flash), and camera characteristics (close-up, wide angle, shallow depth of field, slightly grainy texture).

**Avoid:** Describing positions of arms, legs, or specific limb arrangements — this confuses image models. Focus on the overall scene, mood, and composition instead.

### What makes good photos and images

Think about what would actually appear on this page if a real design team made it. Photos and images should have real subjects that connect to the product's story — people, places, objects, scenes. You can make things that are truly beautiful. Generic abstract visuals are the AI image equivalent of purple gradients: safe, meaningless, forgettable. Push for images with specificity, strong subjects, and emotional resonance.

### When to use images

Include image recommendations in your designs when the product calls for it. A landing page without photography feels like a wireframe. A feature section with a real image feels finished. When proposing layouts, specify where images go and what they should depict — don't leave it to the coding agent to figure out.

The coding agent should never need to source its own imagery. Always provide URLs.

### CDN image transforms

Generated images and uploaded images are hosted on `i.mscdn.ai`. Use query string parameters to request appropriately sized images rather than CSS-scaling full-resolution originals:

| Param | Example | Effect |
|-------|---------|--------|
| `w` | `?w=400` | Max width in pixels |
| `h` | `?h=300` | Max height in pixels |
| `fit` | `?fit=crop` | Resize mode: scale-down, contain, cover, crop, pad |
| `fm` | `?fm=webp` | Output format: avif, webp, jpeg, auto |
| `q` | `?q=80` | Quality (1-100) |

Example: `https://i.mscdn.ai/.../image.png?w=800&h=600&fit=cover&fm=avif`

Only use these documented parameters. Do not invent query string parameters.
