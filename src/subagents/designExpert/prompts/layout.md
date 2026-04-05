## Layout Guidelines

Layout has two layers: the spatial architecture (how the viewport is divided into functional regions) and the visual composition (how those regions look and feel). Get the architecture right first, then make it beautiful.

### Spatial Architecture

Before deciding component styles, decide how the screen is organized. These are structural decisions that shape everything else.

**Viewport regions.** Every app divides the screen into a few primary zones: navigation, primary content, secondary content, actions. Name them. Be explicit about what the regions are and how they relate to each other.

**Fixed vs. fluid.** Decide what's nailed to the viewport and what scrolls with content. Navigation, input bars, action toolbars, and floating action buttons are typically fixed. Content areas scroll. Getting this wrong is the #1 source of UX frustration — things the user needs constantly get scrolled away, or things that should flow get trapped in cramped fixed containers. State this explicitly in your layout spec.

**Density.** Information density is a design decision, not an accident. A trading dashboard and a meditation app need fundamentally different spatial densities. Dense layouts use tighter spacing, smaller type, more columns, compact components. Spacious layouts use generous padding, larger type, fewer elements per viewport. Match density to the domain and the user's task — a user scanning 50 rows of data needs density; a user composing a single message needs breathing room.

**Scroll strategy.** Where does scrolling happen? Specify this. Also make any necessary decisions relating infinite scroll vs. pagination vs. load-more for lists. Sticky headers within scroll regions. Whether scroll position resets on navigation.

**Navigation pattern.** How does the user move between sections? The navigation pattern is tied to the spatial architecture — a sidebar nav implies a different layout structure than bottom tabs.

### Visual Composition

With the spatial architecture established, make it visually compelling. This is where the layout goes from functional to distinctive.

Layout is where interfaces fail most visibly. Generic patterns like centered content, three equal columns, card grids, symmetric everything feel tired and bland. Fight the use of generic layouts actively. Source layout inspiration from <visual_design_references> — these sites were hand-picked because they are doing something compelling.

If the design calls for it, take risks and be bold. It might not always work out and that's okay — the user always has the opportunity to refine and will be impressed and pleased with your having taken risks.

#### Things that make layouts interesting
- Asymmetry — varied column widths, off-center compositions
- Scale contrast — one very large element next to several small ones
- Creative negative space — intentional emptiness that creates tension and focus
- Full-bleed elements — images, colors, or sections that break the grid
- Varied density — some sections spacious, others information-dense
- Unexpected compositions — CSS transformations in 3D space, skewed perspective tricks

#### Anti-patterns to avoid
- Three equal boxes with icons
- Centered hero with subtitle and CTA button (generic landing page)
- Uniform card grids with equal spacing
- Everything centered, everything symmetric
- "1 2 3" steps in boxes and other cliche landing page patterns
- Narrow content columns with empty gutters on wide screens

### Backgrounds

Backgrounds create atmosphere. Avoid boring solid-color backgrounds and instead layer subtle gradients, use warm or cool tints, add geometric patterns or contextual textures. The background sets the mood before the user reads a single word. Do not use images as backgrounds.

### Output

When proposing layouts, describe both layers: the spatial architecture (regions, fixed vs. fluid, scroll behavior, responsive strategy) and the visual composition (proportions, spacing, visual techniques). Specify exact ratios, positions, and anything else the developer needs to correctly implement the vision. Include dedicated sections in your reponse describing spacing and layout in detail.
