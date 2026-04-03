# Frontend Design Notes

Design standards for web interfaces in MindStudio apps.

## Quality Bar

Every interface must feel like a polished, shipping product — not a prototype, not a starter template, not a homework assignment. If it wouldn't look good on Dribbble, Behance, or Mobbin, it's not done.

MindStudio apps are end-user products. The interface is the product. Users judge the entire app by how it looks and feels in the first 3 seconds.

For questions about design, layout, UI, interfaces, components, and anything else, ask the design expert! They have access to countless resources and references and can provide great inspiration as you plan and work - the response to a quick "I'm making XYZ - wdyt?" can be such a powerful input to your thinking!

## Design System from the Spec

The brand spec files in `src/interfaces/@brand/` define the app's visual identity at the brand level: a small palette of named colors and font choices with one or two anchor styles. These are brand decisions, not implementation details. Derive the full design system (CSS variables, component styles, spacing, borders, etc.) from these foundations.

Set up a lightweight theme layer early (CSS variables or a small tokens file) so brand colors and type styles are defined once and referenced everywhere. Map brand colors to semantic roles (background, text, accent, surface, border) and derive any additional shades you need. Keep it simple: a handful of CSS variables for colors and a few reusable text style classes or utilities for typography.

**When brand spec files are present, always use the defined fonts and colors in generated code.** Do not pick your own fonts or colors when the spec defines them. Reference colors semantically (as CSS variables or named constants) rather than scattering raw hex values through the codebase.

## Important: Build Apps, Not Web Pages

Interfaces run fullscreen in the user's browser or a wrapped webview mobile app. They must feel like native Mac or iOS apps, not websites.

- **No long scrolling pages.** Use structured layouts: cards, split panes, steppers, tabs, grouped sections that fit the viewport. The interface should feel like an award winning iOS or macOS app, not a document.
- **On mobile**, scrolling may be necessary, but use sticky headers, fixed CTAs, and anchored navigation to keep key actions within reach.
- Think of every screen as something the user opens, uses, and closes — not something they read.

## Layout Stability

Layout shift is never acceptable. Elements jumping around as content loads or streams in makes an interface feel broken.

- Reserve space for content that hasn't arrived yet. Use fixed/min-height containers, subtle skeletons, or aspect-ratio boxes.
- Images must always have explicit dimensions so the browser reserves space before the image loads.
- Loading-to-loaded transitions should swap content in-place without changing container size.
- Buttons must not change size during loading states. Use a fixed width or `min-width`, and swap the label for a spinner or short text that fits the same space. "Submit" becoming "Submitting..." should not make the button wider and push adjacent elements around.
- Conditional UI should use opacity/overlay transitions, not insertion into flow that displaces existing content.
- This is especially important to keep in mind when building things that display AI generated text, especially if the text streams in. Make sure to never shift layout because of streaming AI text.

## Responsive Design

Every interface must work on both desktop and mobile. Think about how the app will be used and prioritize the primary use case - mobile apps should be mobile-first, business apps are more likely to be used on desktops.

- Use the full viewport. Backgrounds should extend to edges.
- On desktop, use the space — multi-column layouts, sidebars, spacious cards. Avoid narrow centered columns with empty gutters on a wide screen.
- On mobile, stack gracefully. Prioritize content and actions.
- Test at both extremes. A layout that only looks good at one breakpoint is not done.
- When the app is primarily mobile (e.g., a mobile-first consumer app, a tool designed for on-the-go use), set `"defaultPreviewMode": "mobile"` in `web.json` so the editor previews in a mobile viewport by default.

## Forms

Forms should feel like interactions, not paperwork.

- Group related fields visually. Use cards or sections, not a flat list.
- Inline validation — show errors as the user types, not after submit. Validation must never introduce layout shift.
- Loading states after submission. Always indicate that something is happening.
- Disabled states should be visually distinct but not jarring.
- Media uploads should optimistically load in a local preview of an image or video and show upload progress
- Even data entry can be beautiful. Pay attention to alignment, padding, and spacing. Consistency is key.

#### Form Elements

- When loading elements dynamically, make sure the experience isn't janky (e.g., user selects something from a dropdown and suddenly a bunch of thigns snap in, or user loads a form and then after 500ms once a network call resolves the user sees a jump for a new element to appear)

### Placeholders

- Always use icon placeholders for things like empty user profile pictures and other empty images. Especially when creating scenarios that include mock user data, be sure to leave profile pictures and other images empty so they fall back to these default states.
- Create beautiful empty states by using icons alongside labels. Empty states should feel like an invitation to get started, not an error mode.

#### Loading states

Buttons should use a small animated spinner during loading, not text labels like "Loading..." or "Submitting...". The `loader-2` tabler icon with a CSS spin animation is a common pattern. The spinner replaces the button label while maintaining the button's size — be sure there is no layout shift. Recommend the developer implement this as a reusable pattern early.

## Data Fetching and Updates

The UI should feel instant. Never make the user wait for a server round-trip to see the result of their own action. Consider loading a bunch of data in one API call, rather than a bunch of small calls (e.g., if loading a post, also preload comments, likes, user artifacts, etc - don't use separate API calls for each GET).

- **Optimistic updates.** When a user adds a row, toggles a setting, or submits a form, update the UI immediately and let the backend confirm in the background. If the backend fails, revert and show an error.
- **Use SWR for data fetching** (`useSWR` from the `swr` package). It handles caching, revalidation, and stale-while-revalidate out of the box. Prefer SWR over manual `useEffect` + `useState` fetch patterns.
- **Mutate after actions.** After a successful create/update/delete, call `mutate()` to revalidate the relevant SWR cache rather than manually updating local state.
- **Skeleton loading.** Show subtle, simple skeletons (light pulse - no shimmer) that mirror the layout on initial load. Never show a blank page or centered spinner while data is loading.

### Errors

Handle errors gracefully. You don't need to design for every error case, but if remote API requests fail, make sure to show them nicely in a toast or some other appropriate view with a human-friendly label - don't just drop "Error 500 XYZ" inline in a form.

## Auth
Login and signup screens set the tone for the user's entire experience with the app and are important to get right - they should feel like exciting entry points into the next level of the user journy. A janky login form with misaligned inputs and no feedback dminishes excitement and undermines trust before the user even gets in.

Authentication moments must feel natural and intuitive - they should not feel jarring or surprising. Take care to integrate them into the entire experience when building. MindStudio apps support SMS code verification, email verification, or both, depending on how the app is configured.

### Rules for building auth screens

Consult the `visualDesignExpert` to help you work through authentication at a high level. In general, a user should never land on auth at the root of an app (except in cases where the app is, e.g., an internal tool or some other protected experience). Users should be able to explore public resources, or at least encounter some kind of landing/introduction moment, before they get hit with a signup/login screen. Make auth feel like a natural moment in the user's journey.

**Auth modes:** Think about which mode(s) makes the most sense for the type of app you are building. Consumer apps likely to be used on mobile should probably tend toward SMS auth as the default - business apps used on desktop make more sense to use email verification - or allow both, there's no harm in giving the user choice!

**Verification code input:** The 6-digit code entry is the critical moment. Prefer to design it as individual digit boxes (not a single text input), with auto-advance between digits, a beautiful animation and auto-submit on paste, and clear visual feedback. The boxes should be large enough to tap easily on mobile. Show a subtle animation on successful verification. Error states should be inline and immediate, not a separate alert. Make sure there is no layout shift when loading in the success/error states.

**The send/resend flow:** After the user enters their email or phone and taps "Send code," show clear confirmation that the code was sent ("Check your email" with the address displayed). Include a resend option with a cooldown timer (e.g., "Resend in 30s"). The transition from "enter email/phone" to "enter code" should feel smooth, not like a page reload. Always make sure the user can cancel and exit the flow (e.g., they had a typo in their email, or remembered they used a different email to sign up).

**The overall login page:** This is a branding moment. Use the app's full visual identity — colors, typography, any logos, hero imagery, or illustration. A centered card on a branded background is a classic pattern. Don't make it look like a generic SaaS login template. The login page must feel like it belongs to this specific app. Consult the `visualDesignExpert` for additional guidance.

**Post-login transition:** After successful verification, the transition into the app should feel seamless. Avoid a blank loading screen — if data needs to load, show the app shell with skeleton states. Always make sure the user has a way of logging out.

## FTUE

All interactive apps must be intuitive and easy to use. Form elements must be well-labelled. Complex interfaces should have descriptions or tooltips when helpful. Complex apps benefit from a beautiful simple onboarding modal on first use or a simple click tour. Mobile apps need a beautiful welcome screen sequence that orients the user to the app. Ask the `visualDesignExpert` for advice here. 

Even if the app is intuitive and easy to use, users showing up for the first time might still be overwhelmed or confused, and we have an opportunity to set expectations, provide context, and make the user confident as they use our product. Don't neglect this.

## What to Actively Avoid At All Costs

- **Avoid generic fonts.** Overused defaults that strip away all personality. Instead: pick a distinctive Google Font that fits the app's character.
- **Avoid purple or indigo anything.** Purple gradients, purple buttons, purple accents are overused. The user will be dismissive of our designs if they come out looking purple or indigo.
- **Avoid colored left-border callout boxes.** Rounded divs with a thick colored `border-left` — the generic "info card" pattern. Instead: use typography, spacing, and background tints to create hierarchy. If you need to call something out, use a full subtle background or a top border.
- **Avoid three equal boxes with icons.** The default AI landing page layout. Instead: use asymmetric layouts, varied column widths, or a single focused content area.
- **Avoid timid color palettes.** Evenly distributed, non-committal colors. Instead: one or two dominant colors with sharp accents. Commit to a direction.
- **Avoid card-heavy nested layouts.** Cards inside cards, everything boxed. Instead: use space, typography, and dividers to create hierarchy without extra containers.
- **Avoid inconsistent spacing.** 12px here, 20px there, 8px somewhere else. Instead: define a spacing scale (4/8/12/16/24/32/48/64) and use it everywhere.
- **Avoid components from different visual languages.** Rounded buttons next to square inputs, shadows mixed with flat design. Instead: pick one system and apply it consistently.
- **Avoid long scrolling forms with no visual grouping.** Instead: group fields into sections with clear headings, cards, or stepped flows.
- **Avoid cramped layouts.** Text pressed against edges, no room to breathe. Instead: generous padding, comfortable margins, let the content float.
- **Avoid loading states that are just a centered spinner on a blank page.** Instead: use skeletons that mirror the layout, or keep the existing structure visible with a subtle loading indicator.

Most importantly: **Avoid any interface where the first reaction is "this looks like a demo" or "this looks like it was made with a website builder."**
