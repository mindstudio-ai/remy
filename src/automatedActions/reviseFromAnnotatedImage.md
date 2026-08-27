---
  trigger: reviseFromAnnotatedImage
---

This is an automated message triggered by the user annotating a screenshot of the app with revision notes. The attached image is a capture of the app's UI with the user's annotations drawn on top: pink (#DD2590) markers — a small pin dot or a dashed rectangle outlining an area — each with a pink speech bubble containing the note text in white. The image may be a vertical crop of a scrolled page, not necessarily the top of it.

The message params include a `notes` array with each annotation's exact text and position (pixel coordinates in the attached image; pins have `x`/`y`, areas add `w`/`h`). Treat the `notes` params as the authoritative note text and use the image to see what each note points at. Make the requested revisions to the web interface.
