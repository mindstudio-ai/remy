---
name: Data Visualization
what: Charts, dashboards, metrics, and tables of numbers — the surfaces where an app shows its data. Most remy apps have one, and it is where designs most reliably go lazy - default chart-library styling, chart junk, and fake-looking demo curves. The craft is brand-derived and hand-built: models are genuinely strong at authoring SVG charts directly (the default medium — no library), with visx as the escalation for heavyweight interaction, plus the typography of numbers, color-for-data discipline, and honest seed data that make a dashboard read as a real instrument.
when: Before designing (or reviewing) any chart, graph, dashboard, metric tile, sparkline, or data-heavy table — anything that visualizes the app's data.
---

# Data Visualization

Data surfaces are where an app earns trust: a dashboard that reads like a real instrument makes
the whole product feel serious, and one assembled from chart-library defaults makes it feel like
a template. This is also where design most reliably goes lazy — three failure modes account for
almost all of it: **default library styling** (the recognizable palette and tooltip of a chart
package), **chart junk** (decoration that encodes nothing), and **fake demo data** (perfect
curves that mark the dashboard as a mockup). Everything in this reference exists to defeat those
three.

## The medium: hand-authored SVG first

**The default medium is SVG you author directly — no charting library.** You (and the developer)
are genuinely good at this: a line chart is a `<path>`, a bar chart is rects, a sparkline is a
20-line component — and direct authorship gives brand-exact control over every hairline, tick,
and easing with zero dependency weight. Most dashboards need nothing more: lines, bars, areas,
donuts, sparklines, small multiples, and metric tiles are all comfortably hand-built.

- **Escalate to visx** for genuinely heavyweight work: brush-and-zoom, force layouts, complex
  time scales with smart tick generation, streaming series, hierarchies, geographic projections.
  visx is the right escalation because it is d3's math wrapped in unstyled React primitives — you
  keep authoring the visual layer yourself; the library only does scales and layout. Prefer it
  over raw d3, and never adopt a styled chart package (Chart.js, Recharts, ECharts and kin) —
  their baked-in palettes, fonts, and tooltips are precisely the "defaulted" look this reference
  exists to prevent.
- **Canvas is the escape hatch for scale**, not style: reach for it only past roughly ten
  thousand rendered points (dense scatter, long high-frequency series), where SVG's DOM cost
  becomes real. The visual rules below apply identically.

## The register

Touchstones, stated as qualities to reproduce rather than moods:

- **New Relic** — density done right. Sparklines carrying real trend at tiny sizes; the
  billboard pattern (a large current value, its delta, and a small trend chart composed as one
  tile); color used as *series identity*, never decoration; a dark ground with luminous series;
  density achieved through small multiples and rhythm, never through clutter.
- **Bloomberg / TradingView** — the terminal register. Information density as the aesthetic:
  monospaced/tabular figures everywhere, thin crosshairs, precise session gridlines, color
  reserved almost entirely for signal (up/down, in/out of range), instant legibility at a
  glance across dozens of numbers. Right for finance-adjacent and power-user tools where
  density *is* the brand.
- **Stripe's dashboard** — the light editorial register. Hairline charts, generous whitespace,
  restrained single-accent palettes, numbers doing the talking with charts in a supporting
  role. Right for business tools that want calm authority instead of mission-control density.
- **Observable** — the craft canon. Direct labeling instead of legends, considered axes, every
  mark earning its place; what a chart looks like when someone thought about it.
- **Apple Health / Fitness** — the consumer register. Friendly, chunky, glanceable: rounded
  bars, large type, one number per view that matters, charts you can read at arm's length.
  Right for consumer wellness/habit/lifestyle apps where the terminal look would feel hostile.

Pick the register the app's brand and audience call for — density and calm are both excellent
when chosen deliberately.

## Numbers are typography

The cheapest, highest-leverage move on any data surface, and the one most often skipped:

- **`font-variant-numeric: tabular-nums`** on every column of figures, every ticking value,
  every timer — proportional figures wobble as values change and never align in columns.
- **Right-align numeric columns** in tables; align to the decimal when precision varies.
- **Precision discipline**: two or three significant figures for display ("4.2K", "12.4%",
  "1.3s") — never raw floats with a tail of decimals. Full precision belongs in the tooltip.
- **Units styled as units**: smaller, lighter, or muted next to the value ("142 ms", "$4,210"),
  not baked into the number's own weight.
- **Big numbers are typography first**: a metric tile is a type specimen — the brand's face at
  display scale, the delta and label set quietly around it. The chart under it is context, not
  the star.

## Color for data

Derive every data color from the app's brand, then apply data discipline on top:

- **Categorical**: at most six distinguishable hues, separated enough in lightness to survive
  colorblindness and grayscale; assign each series a color once and keep it consistent across
  every chart and view in the app.
- **Sequential and diverging ramps** for intensity and for above/below-baseline — built from
  brand hues, perceptually ordered (lightness does the work), not rainbow.
- **Reserve semantic color.** If the app uses green/red (or any pair) for good/bad, those hues
  never moonlight as ordinary series colors.
- **Highlight by contrast**: the focused series saturated, everything else muted to the same
  quiet gray-toned family — not seven series all shouting.
- Gridlines, axes, and labels sit in the muted end of the palette; the data gets the color.

## Anatomy restraint

- Gridlines quiet or absent — a few horizontal hairlines at most; never a full grid cage.
- Few ticks, no redundant axis lines, no boxed borders around the plot.
- **Direct labeling over legends** wherever the layout allows — label the line's endpoint, not a
  color key the eye has to shuttle to.
- **Honest scales**: bars start at zero; a truncated line-chart axis is acceptable for trend but
  never for magnitude comparison; time axes have honest, even intervals.
- The chart-junk ban, explicitly: no 3D, no drop shadows on marks, no gradient-filled bars, no
  exploded pies, no dual y-axes (two charts beat one lie), no decorative icons inside plots.

## Chart-type judgment

Line for change over time; bar for comparison across categories; area only when the quantity is
cumulative or the filled mass means something; a **table is often the correct visualization**
(sortable, tabular-numeric, with sparklines inline if trend matters); small multiples over one
overloaded chart; donut/pie only for a single part-of-whole at a glance, never a six-slice pie;
scatter for correlation with a fitted context line when it helps. When a chart needs a paragraph
to explain, the chart is wrong.

## Interaction and life

- **Design the tooltip** — a browser-default tooltip on a designed chart is a slop marker. Spec
  its card: background, radius, type scale, the full-precision values, and the crosshair or
  point-highlight that anchors it.
- **Crosshair on time series**; hover states that lift the focused series and mute the rest.
- **Draw-in animation on first render only** — a line drawing in or bars rising once is a
  designed moment; replaying it on every data refresh is noise.
- **Live updates tween.** Apps here poll routinely — when a value or series updates, animate the
  transition (a few hundred ms, eased) instead of snapping; ticking numbers count toward their
  new value with tabular figures so nothing shifts.
- **Loading and empty are designed states**: skeletons shaped like the chart they precede, and a
  zero-state that reads as an invitation ("data appears after your first sync") rather than an
  empty axis frame.
- **Responsive means recomposed**, not shrunk: on mobile, reduce tick counts, drop to
  sparkline-plus-number tiles, stack small multiples — an illegible miniature of the desktop
  chart is a failure.

## Honest seed data

Demo and scenario data must look like it came from a real system: plausible noise, weekday/
weekend rhythm, the occasional gap or spike, series that don't move in lockstep. A perfect sine
wave or a smooth exponential marks the whole dashboard as fake in one glance — it's the data
equivalent of lorem ipsum. Specify realistic shapes when you hand seed guidance to the
developer (ranges, trend, noise character, anomalies worth including), and make sure the axis
ranges are set from the data's real domain, not defaulted.

## Your deliverable: art direction, not suggestions

You art-direct this surface end-to-end. The developer has a terrible sense of design and will
fill any gap you leave with a library default — and on this surface the defaults are
instantly recognizable as no design at all. Deliver an implementation-ready specification:

- **Exact values everywhere.** The data palette as hexes with role mapping (each series, the
  ramps, semantic colors, gridline/label grays), stroke widths, tick counts per breakpoint,
  tile dimensions, type scale for values/labels/deltas, tooltip card spec, animation durations
  and easings.
- **Per-chart engine calls.** For each visualization: hand-SVG or visx (or canvas past the
  point threshold), the chart type and why, its axes/scales, and its responsive recomposition.
- **One answer per question.** If you would accept either of two options, pick one and
  prescribe it. "Something like," "roughly," and "consider" are how implementations go generic;
  the only tolerances that exist are the ones you state numerically.
- **A verification checklist.** End with the specific things to screenshot-check after
  implementation — tabular alignment in columns, the designed tooltip, first-render vs refresh
  animation, the empty and loading states, the mobile recomposition, and the seed data's
  realism — so the developer can prove the direction landed rather than assume it did.
