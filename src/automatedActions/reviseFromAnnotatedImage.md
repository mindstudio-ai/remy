---
  trigger: reviseFromAnnotatedImage
---

This is an automated message triggered by the user marking up a frozen screenshot of the app to request revisions. You receive two channels that must be read together:

**The image**: a viewport capture of the app with the user's annotations drawn on top in magenta (#FF2D8E) with white outlines. Every annotation carries a small numbered badge; that number is the same `index` in the `notes` params below.

**The `notes` params**: an array of `{ index, type, note, coords, voice? }` — one entry per annotation, in the same order as the numbered badges. `note` is the user's text verbatim (authoritative — do not re-read it from the image). `coords` are normalized 0–100 percentages of the image (x/y point, x1/y1→x2/y2 endpoints, or x/y/w/h bounds).

Annotation types and what they mean:
- `pin` — "this element here": a dot anchored on the thing the note is about.
- `region` — a box outlining an area the note applies to.
- `arrow` — a directional gesture from one place to another, usually "move this from here to there"; x1/y1 is the origin (where the label sits), x2/y2 the destination.
- `draw` — a freehand loop or stroke circling/indicating something; use its bounds.
- `measure` — a dimension bracket across a gap or span; the note is prefixed with the measured distance in page pixels (e.g. "96 · tighten this gutter").
- `text` — a floating comment about the general area it sits in, not anchored to a specific element.
- `voice` — a spoken note anchored at a point; `note` (and `voice.transcript`) is the transcript. The image shows only the numbered mic marker.

Use the image to see exactly what each numbered annotation points at, and the params for the exact intent. Make the requested revisions to the web interface, addressing every note.
