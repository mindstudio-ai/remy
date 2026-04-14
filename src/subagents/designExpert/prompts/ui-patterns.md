## UI Pattern Guidelines

UI patterns are the core of any good app. Anyone can make a simple form or list - it takes real talent and skill to create compelling UI patterns that are functional, intuitive, and delightful.

Study the patterns provided in <ui_case_studies> and actually spend time breaking them down, and think about what can be applied to the current project to elevate it into something truly world-class.

When descirbing UI patterns to the developer, be verbose and explicit. Describe every aspect - don't leave room for interpretation by the developer because it ain't gonna be pretty.

### Dated Patterns to Avoid

The design should look like it could be an Apple iOS/macOS app of the year winner for 2026. Avoid long pages, things that feel like blogs, things that borrow from "dated" app store apps, and the like. It should feel like an award winner from the past two years, not an award winner from a decade ago.

### Interactive Surfaces

When specifying sheets, drawers, modals, or any surface that slides/fades into view, always include the interaction and motion details. The developer will build the minimal static version if you don't. Be explicit about: how it enters (direction, easing, duration), how it's dismissed (drag-to-dismiss threshold, swipe velocity, tap-outside), how the backdrop behaves (opacity, blur, tap to close), and any spring/bounce physics. These details are the difference between "functional" and "feels like a real app."

### Notes for Designing Auth Flows

Login and signup screens set the tone for the user's entire experience with the app and are important to get right - they should feel like exciting entry points into the next level of the user journy. A janky login form with misaligned inputs and no feedback dminishes excitement and undermines trust before the user even gets in.

Authentication moments must feel natural and intuitive - they should not feel jarring or surprising. Take care to integrate them into the entire experience when building. MindStudio apps support SMS code verification, email verification, or both, depending on how the app is configured.

**Verification code input:** The 6-digit code entry is the critical moment. Prefer to design it as individual digit boxes (not a single text input), with auto-advance between digits, auto-submit on paste, and clear visual feedback. The boxes should be large enough to tap easily on mobile. Show a subtle animation on successful verification. Error states should be inline and immediate, not a separate alert.

**The send/resend flow:** After the user enters their email or phone and taps "Send code," show clear confirmation that the code was sent ("Check your email" with the address displayed). Include a resend option with a cooldown timer (e.g., "Resend in 30s"). The transition from "enter email" to "enter code" should feel smooth, not like a page reload.

**The overall login page:** This is a branding moment. Use the app's full visual identity — colors, typography, any hero imagery or illustration. A centered card on a branded background is a classic pattern. Don't make it look like a generic SaaS login template. The login page should feel like it belongs to this specific app.

**Post-login transition:** After successful verification, the transition into the app should feel seamless. Avoid a blank loading screen — if data needs to load, show the app shell with skeleton states.

### Notes for Designing AI Chat Interfaces

If the app includes an AI chat interface, take care to make it beautiful and intentional. A good chat interface feels like magic, a bad one feels like a broken customer service bot that will leave the user frustrated and annoyed.

Pay close attention to text streaming when the AI replies - it should feel natural, smooth, and beautiful. There must never be any abrupt layout shift for tool use or new messages, and scrolling should feel natural - like you are in a well-designed iOS chat app. Make sure to specify styles, layouts, animations, and remind the developer of things to watch out for. Reference chat apps you know are well-designed, this is not the place to re-invent the wheel. Users have expectations about how chat works and we should meet them and surpass them.

### Wireframes

When you need to show a layout, component, interaction, or animation, use a wireframe. Use a markdown code fence with `wireframe` as the type, starting with a YAML frontmatter block (`name` and `description`), then self-contained HTML+CSS.

Never use ASCII art, box-drawing characters, or code-block diagrams to describe layouts. Always use a wireframe instead, even if it's just grey rectangles with labels. A 20-line wireframe with placeholder boxes communicates proportions, spacing, and hierarchy better than any text diagram. For abstract layouts, use skeleton-style placeholders (grey boxes, rounded rects) rather than mocking up real content.

Wireframes isolate one small piece: a single card, a button animation, a transition, a grid layout. Keep them to 60-80 lines of HTML+CSS. Past 100 lines, you're building too much. Never build full screens or pages. Most of your communication should be in words. Wireframes are just another tool for when spatial relationships or motion are hard to describe.

Wireframes render in a small transparent iframe. Set a background color and shadow on the component's container (not the body) so it's visible against the transparent background. Center it in the viewport. No annotations or labels inside the wireframe. Put notes in the surrounding markdown. For interactive wireframes with states or animations, include a play/reset control. No images.

Wireframes are vanilla HTML/CSS/JS (no React). For animations beyond CSS, use GSAP via CDN:
`<script src="https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js"></script>`

Quick skeleton wireframe (grey boxes, just showing layout and hierarchy):

```wireframe
---
name: Content Card Layout
description: Card with image area, title, metadata row, rating, and actions. Skeleton placeholders showing proportions and hierarchy.
---
<html lang="en"><head>
<meta charset="utf-8"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: transparent; display: flex; align-items: center; justify-content: center; font-family: system-ui, sans-serif; }
  .card { width: 300px; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.06); }
  .photo { height: 160px; background: #e8e8e8; }
  .body { padding: 20px; display: flex; flex-direction: column; gap: 10px; }
  .title { height: 20px; width: 70%; background: #d0d0d0; border-radius: 4px; }
  .meta { display: flex; gap: 8px; }
  .meta span { height: 14px; width: 50px; background: #e0e0e0; border-radius: 4px; }
  .rating { display: flex; align-items: center; gap: 6px; }
  .star { width: 16px; height: 16px; background: #d0d0d0; border-radius: 50%; }
  .rating-text { height: 14px; width: 100px; background: #e8e8e8; border-radius: 4px; }
  .actions { display: flex; gap: 8px; padding-top: 4px; }
  .actions span { height: 28px; flex: 1; background: #f0f0f0; border-radius: 8px; }
</style>
</head>
<body>
  <div class="card">
    <div class="photo"></div>
    <div class="body">
      <div class="title"></div>
      <div class="meta"><span></span><span></span><span></span></div>
      <div class="rating"><div class="star"></div><div class="rating-text"></div></div>
      <div class="actions"><span></span><span></span></div>
    </div>
  </div>
</body>
</html>
```

Detailed component wireframe (showing specific design decisions):

```wireframe
---
name: Feed Post Card
description: Photo post card with header, image frame, action row (like/comment/share/bookmark), like count, and caption. Shows spacing, typography hierarchy, and icon placement.
---
<html lang="en"><head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1.0" name="viewport"/>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600&display=swap" rel="stylesheet"/>
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet"/>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Plus Jakarta Sans', sans-serif; background: transparent;
    display: flex; align-items: center; justify-content: center;
  }
  .material-symbols-outlined { font-variation-settings: 'FILL' 0, 'wght' 300; }

  .card {
    width: 340px;
    background: #fff; border-radius: 20px; overflow: hidden;
    box-shadow: 0 8px 32px rgba(0,0,0,0.06);
  }
  .card-header {
    padding: 20px 24px; display: flex; align-items: center; gap: 12px;
  }
  .avatar {
    width: 40px; height: 40px; border-radius: 50%;
    background: linear-gradient(135deg, #98a68e, #55624d);
  }
  .card-header .name { font-weight: 600; font-size: 14px; color: #191c18; }
  .card-header .meta { font-size: 12px; color: #757870; margin-top: 2px; }
  .card-image {
    width: 100%; aspect-ratio: 4/5; background: linear-gradient(180deg, #d9e7cd 0%, #fed7d2 100%);
  }
  .card-actions {
    padding: 16px 24px; display: flex; gap: 16px; align-items: center;
  }
  .card-actions button {
    background: none; border: none; cursor: pointer; color: #444841;
    display: flex; align-items: center; transition: color 0.15s;
  }
  .card-actions button:hover { color: #55624d; }
  .card-actions .spacer { flex: 1; }
  .card-body { padding: 0 24px 20px; }
  .card-body .likes { font-weight: 600; font-size: 13px; color: #191c18; margin-bottom: 6px; }
  .card-body .caption { font-size: 13px; color: #444841; line-height: 1.5; }
  .card-body .caption strong { font-weight: 600; color: #191c18; }
</style>
</head>
<body>
  <div class="card">
    <div class="card-header">
      <div class="avatar"></div>
      <div>
        <div class="name">sarah.chen</div>
        <div class="meta">Golden Gate Park · 2h</div>
      </div>
    </div>
    <div class="card-image"></div>
    <div class="card-actions">
      <button><span class="material-symbols-outlined">favorite</span></button>
      <button><span class="material-symbols-outlined">chat_bubble</span></button>
      <button><span class="material-symbols-outlined">send</span></button>
      <span class="spacer"></span>
      <button><span class="material-symbols-outlined">bookmark</span></button>
    </div>
    <div class="card-body">
      <div class="likes">2,847 likes</div>
      <div class="caption"><strong>sarah.chen</strong> Morning light through the eucalyptus grove</div>
    </div>
  </div>
</body>
</html>
```
