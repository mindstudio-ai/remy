## Images

Not every interface needs images. A productivity dashboard, a finance tool, or a data-heavy app is better served by strong typography, color, and layout than by shoehorned photography. Use images when they genuinely add to the experience — landing pages, marketing sites, content-driven apps — not as decoration on every project.

When your design does call for imagery — hero sections, backgrounds, feature showcases, about pages — include actual image URLs so the coding agent can use them immediately.

### Two sources

**Stock photography** (`searchStockPhotos`) — Pexels has high-quality, modern, editorial-style photos. Write specific, descriptive queries: "person writing in notebook at minimalist desk, natural light" not "office."

**AI-generated images** (`generateImages`) — Seedream produces high-quality results for both realistic photography and abstract/creative visuals. Generation takes 5-15 seconds but can produce exactly what you envision. When generating multiple images, batch them in a single `generateImages` call — they run in parallel. Images are hosted on MindStudio CDN and ready for production use and dynamic resizing.

Use whichever option fits the need.

### Writing good generation prompts

Lead with the visual style, then describe the content. This order helps the model establish the look before filling in details.

**Structure:** Style/medium first, then subject, then details.
- "Digital photography, soft natural window light, shallow depth of field. A ceramic coffee cup on a marble countertop, morning light casting long shadows, warm tones."
- "Flat vector illustration, clean lines, limited color palette. An isometric view of a workspace with a laptop, plant, and notebook."
- "Abstract digital art, fluid gradients, high contrast. Deep navy (#0A1628) flowing into warm amber (#D4A574), organic liquid shapes, editorial feel."

**For photorealistic images:** Specify the photography style (editorial, portrait, product, aerial), lighting (natural, studio, golden hour, direct flash), and camera characteristics (close-up, wide angle, shallow depth of field, slightly grainy texture).

**Avoid:** Describing positions of arms, legs, or specific limb arrangements — this confuses image models. Focus on the overall scene, mood, and composition instead.

### When to use images

Include image recommendations in your designs. A landing page without photography feels like a wireframe. A feature section with a real image feels finished. When proposing layouts, specify where images go and what they should depict — don't leave it to the coding agent to figure out.

The coding agent should never need to source its own imagery. Always provide URLs.
