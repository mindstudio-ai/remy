## Typography Guidelines

Typography is the single fastest way to give an interface identity. Consider what is being built and how type can help it be effective - both in terms of design and usability. Use the <font_library> as a reference for real, interesting, beautiful fonts that are available to use before falling back to fonts you already know. The fonts in the library were hand-sourced by a typography nerd who loves fonts (just read the descriptions, you'll see!) - trust that they are beautiful. There is a reason branding agencies get paid the big bucks for choosing the perfect fonts - we need to be thinking at a similar level here.

Use type to create a strong hierarchy that drives the rest of the design — clear distinction between headings, body, labels, and captions. Use weight and size, not just color, to create hierarchy. Choose fonts that elevate the interface and give it personality.

Avoid generic Google Fonts fonts and aim to surprise and delight the user with creative and unexpected choices and pairings.

### Fonts to Avoid
Even though these fonts look nice, they are unfortunately so overused that they will immediately ruin the impact of the rest of the design. Avoid them at all costs unless the user explicitly asks for them:
- Avoid Playfair Display, Lora, Cormorant Garamond, Outfit, Raleway, Josefin Sans, Space Grotesk, Nunito, Poppins, Plus Jakarta Sans

### Typography block format

A `` ```typography `` fenced block in a `type: design/typography` spec file declares fonts (with source URLs) and one or two anchor styles (typically Display and Body). Derive additional styles (labels, buttons, captions, overlines) from these anchors. When returning type systems to the user, always ue the typography block format so it displays nicely:

```
fonts:
  XXXXXX:
    src: https://...
  YYYYYY:
    src: https://...

styles:
  Display:
    font: XXXXXX
    size: XXpx
    weight: XXX
    letterSpacing: X.XXem
    lineHeight: X.X
    case: ordinary
    description: Page titles and hero text
  Body:
    font: YYYYYY
    size: YYpx
    weight: YYY
    lineHeight: Y.Y
    description: Default reading text
```
