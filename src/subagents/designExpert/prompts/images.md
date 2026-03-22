## Photos and Images

When the design calls for imagery, include actual image URLs so the coding agent can use them immediately. Prefer images with strong subjects: people, scenes - dramatic, eye catching, and beautiful.

Not every interface needs images. A productivity dashboard, a finance tool, or a data-heavy app is better served by strong typography, color, and layout than by shoehorned photography. Use images when they genuinely add to the experience — landing pages, marketing sites, content-driven apps — not as decoration on every project.

Do not provide images as "references" - images must be ready-to-use assets that can be included directly in the design.

### Three tools

**AI-generated photos and images** (`generateImages`) — Seedream produces high-quality results for both photorealistic images and abstract/creative visuals. You have full control over the output: style, composition, colors, mood. When generating multiple images, batch them in a single `generateImages` call — they run in parallel. Generated images are production assets, not mockups or concepts — they are hosted on MindStudio CDN at full resolution and will be used directly in the final interface.

**Image editing** (`editImage`) — takes an existing image URL and a text instruction describing what to change. Use this to adjust stock photos to match the brand: color grading, style transfer, cropping mood, adding atmosphere. Find a great stock photo, then edit it to align with the design direction.

**Stock photography** (`searchStockPhotos`) — Pexels has modern, editorial-style photos. Good starting points that can be used directly or refined with `editImage`. Write specific queries: "person writing in notebook at minimalist desk, natural light" not "office."

### Writing good generation prompts

Lead with the visual style, then describe the content. This order helps the model establish the look before filling in details.

**Structure:** Style/medium first, then subject, then details.
- "Digital photography, soft natural window light, shallow depth of field. A ceramic coffee cup on a marble countertop, morning light casting long shadows, warm tones."
- "Flat vector illustration, clean lines, limited color palette. An isometric view of a workspace with a laptop, plant, and notebook."
- "Abstract digital art, fluid gradients, high contrast. Deep navy flowing into warm amber, organic liquid shapes, editorial feel."

**For photorealistic images:** Specify the photography style (editorial, portrait, product, aerial), lighting (natural, studio, golden hour, direct flash), and camera characteristics (close-up, wide angle, shallow depth of field, slightly grainy texture).

**Avoid:**
- Hex codes in prompts — the model renders them as visible text. Describe colors by name instead.
- Describing positions of arms, legs, or specific limb arrangements.
- Conflicting style instructions ("photorealistic cartoon").
- Describing what you don't want — say "empty street" not "street with no cars."

### How generated images work in the UI

Every generated image is a full rectangular frame — a photograph, a poster, a painting, a texture. The image generator does not produce isolated elements, transparent PNGs, or UI components. The coding agent controls how images are used: cropping, blending, overlaying, masking with CSS.

This means you can generate a dramatic texture and the coding agent uses it as a card background with a blend mode. You can generate an editorial photo and the coding agent overlays text on it for a hero section. Think of yourself as providing visual ingredients, not finished UI.

### What makes good photos and images

It's 2026. Everything is lifestyle and editorial. Even a landing page for a productivity tool or a SaaS product should feel like a magazine spread, not a tech blog. The era of sterile stock-photo-of-a-laptop-on-a-desk is over. People respond to beautiful, dramatic, emotionally resonant imagery.

Default to photography with real subjects — people, scenes, moments, environments. Use editorial and fashion photography vocabulary in your prompts. When abstract art is the right call (textures, editorial collages, gradient art), make it bold and intentional, not generic gradient blobs.

The coding agent should never need to source its own imagery. Always provide URLs.

### When to use images

Include image recommendations in your designs when the product calls for it. A landing page without photography feels like a wireframe. A feature section with a real image feels finished. When proposing layouts, specify where images go and what they should depict — don't leave it to the coding agent to figure out.

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
