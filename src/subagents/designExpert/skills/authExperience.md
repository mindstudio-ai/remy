---
name: Auth Experience
what: The app's front door — login and signup screens, verification-code entry, delegated org sign-in, mid-experience sign-in gates, and the post-login transition. Auth is the one surface every user passes through and usually the first designed thing they see, and it is where trust is won or lost before the product gets a chance - a first-class design deliverable and a branding moment, never a generic SaaS template. This reference carries the full craft recipe — the branded login moment, code-entry mechanics, send/resend flow, progressive-auth gates, transitions, and the failure states that make or break it.
when: Before designing (or reviewing) any auth surface — a login or signup screen, verification-code entry, a "Continue with {Org}" moment, an in-app sign-in gate or verification sheet, or the post-login transition.
---

# Auth Experience

Auth is the front door: the one surface every user passes through, usually before they've seen anything else you designed. A janky login form with misaligned inputs and no feedback undermines trust before the user is even inside — and a beautiful one sets the expectation that everything past it is built to the same standard. Users arrive fluent in login flows, so like chat this is craft within convention: a familiar shape, executed like the entrance to something worth entering.

One platform fact shapes everything here: **Remy apps are passwordless.** Sign-in is a verification code (SMS or email), a delegated "Continue with {Org}" button, or a combination — there is no password anywhere in the system. Never design a password field, a "forgot password" link, or a password-strength meter; their presence marks the design as a template pasted onto the wrong product.

## The branded login moment

The login screen is a branding moment — the app's full visual identity working: its palette, its type, its imagery or illustration if the brand has one. A centered card on a branded field is a classic, reliable composition; what's forbidden is the generic SaaS template look that could belong to any product. The screen should feel like the front door of *this specific app*, and it should feel like an exciting entry point to the next level of the user's journey, not a checkpoint.

Method hierarchy is part of the composition:

- **"Continue with {Org}" (delegated sign-in)** — a rare configuration used by a small minority of apps: internal business tools whose members sign in through the platform with a single button, no code step. **The default assumption is that this method does not exist.** It is available ONLY when <org_context> explicitly enables it or the user has explicitly asked for it — when neither is true, ignore it entirely: do not design the button, do not offer it as an option, do not leave space for it in the composition. Never design it into a public-facing app. On the rare app where it IS enabled, it is often the *only* path — give it real presence in the branded moment (a primary, confident button labeled with the organization's actual name), and when code methods coexist, the delegated button leads with the code form beneath.
- **Code methods (email / SMS)** — one clear input, one clear action. If both methods exist, pick a primary and make switching quiet (a text link, not dueling forms).

## Code entry

The 6-digit code is the critical moment of the flow — design it precisely:

- **Individual digit boxes**, not a single text input: auto-advance between digits, full-code paste handled (auto-submit on a complete paste), backspace moving backward naturally.
- **Sized for thumbs.** The boxes are large enough to tap easily on mobile, and the numeric keyboard is requested (`inputmode="numeric"`).
- **Success is felt**: a subtle confirmation animation on verification — a settle, a check, the boxes tinting to the brand's positive tone — before the transition begins.
- **Errors are inline and immediate**: the boxes shake or tint, a one-line message appears in place, the code clears for retry with focus back on the first box. Never a browser alert, never a separate error page.

## The send and resend flow

After the user enters their address and requests a code, confirm it plainly: "Check your email" with the actual address displayed (mistyped addresses are the most common failure, and showing it is the fix — pair it with a quiet "edit" affordance to go back). Include resend with a visible cooldown ("Resend in 30s") so the user is never staring at a dead link. The transition from enter-address to enter-code is a designed motion within the same composition — a slide or crossfade — never a page reload.

Design the unhappy paths with the same care: a code that never arrives (the resend plus a check-spam hint, or the other method as fallback), an expired code (say so, offer resend — don't make the user diagnose it), rate-limited resends (the cooldown communicates it).

## Mid-experience gates and progressive auth

Not every sign-in happens at the front door. Apps that allow anonymous use gate specific actions — and chat or voice agents open verification sheets mid-conversation. Design these gates as invitations rather than walls:

- **Keep the context visible.** The gate renders over the live experience (a sheet or modal with the app dimmed behind it), so the user can see the thing they're unlocking. Never navigate away to a full login page mid-flow.
- **Say why.** One line connecting the gate to the action ("Verify your number to save this booking") outperforms a bare "Sign in required."
- **Return the user precisely.** After verification, the user lands exactly where they were, with the gated action completed or one tap away — the conversation, the cart, the draft all intact.

## The post-login transition

Entering the app is the payoff — make it seamless. No blank loading screens: if data needs to load, show the app shell immediately with skeleton states. The moment of transition can carry a small piece of brand motion (the login card releasing into the app), but it must be fast; the best post-login transition is barely noticed. Returning users with a live session skip the front door entirely — make sure the signed-in landing carries the same polish, since for them *that's* the entry.

## The register's exclusions

Each of these reads as a template or an afterthought — never ship them: a password field or "forgot password" link in any form; the generic SaaS login card (gray page, blue button, product name in plain text where a brand should be); social sign-in buttons for providers the app doesn't have; a single bare text input for the verification code; full page reloads between auth steps; browser alerts for errors; "Welcome back!" boilerplate copy in place of the app's actual voice; CAPTCHAs or terms-checkbox clutter the platform never asked for.

## Your deliverable: art direction, not suggestions

You art-direct this surface end-to-end. The developer has a terrible sense of design and will fill any gap you leave with a default — and on this surface the default is the generic template that undermines the app before it opens. Deliver an implementation-ready specification:

- **Exact values everywhere.** The login composition's dimensions and breakpoints, the card's radius/border/shadow, type sizes, the digit boxes' size/gap/radius, every transition duration and easing, all colors as hexes from the brand.
- **The flow, state by state.** Enter-address / code-sent / entering-code / verifying / success / error / resend-cooldown — what appears, what animates, where focus lands — plus the delegated path and the mid-experience gate variant when the app has them.
- **One answer per question.** If you would accept either of two options, pick one and prescribe it. "Something like," "roughly," and "consider" are how implementations go generic; the only tolerances that exist are the ones you state numerically.
- **A verification checklist.** End with the specific things to screenshot-check after implementation — the login screen on mobile and desktop, the code boxes mid-entry and in the error state, the send-confirmation with the address shown, the post-login skeleton — so the developer can prove the direction landed rather than assume it did.
