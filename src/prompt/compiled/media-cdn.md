# Images and Media CDN

MindStudio has three CDN hosts:

- **Images:** `i.mscdn.ai`
- **Videos:** `v.mscdn.ai`
- **Files:** `f.mscdn.ai`

Always use CDN transform parameters to request appropriately sized images
rather than CSS-scaling full-resolution originals. Always set dpr=3 when sizing images to make sure they look good on Retina displays.

## CDN Image Transforms

Combine freely as query string parameters:

| Param | Example | Effect |
|-------|---------|--------|
| `w` | `?w=400` | Max width in pixels |
| `h` | `?h=300` | Max height in pixels |
| `fit` | `?fit=crop` | Resize mode: scale-down, contain, cover, crop, pad |
| `crop` | `?crop=face` | Face-aware crop (fit=crop + face detection) |
| `fm` | `?fm=webp` | Output format: avif, webp, jpeg, auto |
| `dpr` | `?dpr=2` | Device pixel ratio (auto-set to 3 when w/h specified) |
| `q` | `?q=80` | Quality (1-100) |
| `blur` | `?blur=10` | Blur radius |
| `sharpen` | `?sharpen=1` | Sharpen amount |

Example: `https://i.mscdn.ai/.../image.png?w=200&h=200&fit=crop&fm=avif`

## Video Thumbnails

Append `/thumbnail.png` or `/thumbnail.jpg` to any video URL:

```
https://v.mscdn.ai/{orgId}/videos/{videoId}.mp4/thumbnail.png?ts=last&w=400
```

The `ts` param selects the frame: a number (seconds) or `last`. Image CDN
resize params also work on video thumbnails.

## Media Metadata

Append `.json` to any CDN URL to get metadata (dimensions, duration, mime
type, orientation, etc.).

## General Rules

- Always set explicit width/height or aspect-ratio on images to prevent
  layout shift.
- Always load fonts directly from CDNs, never self-host font packages
  in the application.
