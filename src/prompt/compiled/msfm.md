# MSFM — MindStudio-Flavored Markdown

Specs are written in MSFM, a strict superset of Markdown that adds **block annotations** and **inline annotations**. Annotations attach precision to prose so the compiler produces consistent results. A bare spec with no annotations is valid — each annotation makes compilation more deterministic.

## Block Annotations

A tilde-fenced block (`~~~`) that attaches to the content immediately above it:

```markdown
When requesting a new vendor, there are three areas of review:
governance, legal, and accounting, with approvals flowing in that order.

~~~
The spec says "three areas" but lists four names. From the process
flowchart, it is three sequential stages:

  1. Governance, Risk & Compliance (GRC) — one combined stage
  2. Legal
  3. Accounts Payable (AP)

These are sequential. Each stage must complete before the next is
notified. If any stage rejects, the entire request is rejected.
~~~
```

**Rules:**
- Starts and ends with `~~~` on its own line
- Attaches to the nearest preceding block element (paragraph, heading, table, list)
- Multiple annotations can follow the same element (read in order)
- Can contain any Markdown content (use backtick code fences inside — they coexist with tilde fences)

## Inline Annotations

Attach to a specific word or phrase with `[text]{content}`:

```markdown
All invoices can be sent to the [Accounts Payable]{The AP team in
this context refers to the internal accounts payable department, not
a vendor's AP. Only users with the "ap" or "admin" role can process
invoices.} team for processing against the PO.
```

Good for definitions, units, and clarifications:

```markdown
The PO [amount]{Total across all line items, in USD cents (integer).
Does not include tax, shipping, or fees.} must not exceed the approved
budget for the [cost center]{The organizational budget code that this
purchase is charged to.}.
```

## Pointers

When an annotation is too large for inline placement, use a pointer — an inline `{#id}` reference that points to a `~~~#id` block:

```markdown
The AP team pays the vendor according to the [contract payment terms]{#payment-terms}.

~~~#payment-terms
We do not model payment terms (net 30, net 60, etc.) on the PO or
vendor. The dueDate on the invoice is the sole payment trigger.

A production implementation would:
- Store terms on the vendor record (net_30, net_60, due_on_receipt)
- Auto-calculate dueDate from invoiceDate + terms
- Support early payment discounts (2/10 net 30)

Default behavior when no terms are specified: due on receipt.
~~~
```

Keep the block co-located (right after the paragraph containing the pointer). A single block annotation can be referenced by multiple pointers — useful for concepts like "amounts are in USD cents" that apply in several places.

## Authoring Conventions

**Specs are written in human language for humans.** The prose should describe what the app does the way you'd explain it to a colleague — not in code. No variable names, table names, column types, or function signatures in the prose. Technical details like column types, data representations, and implementation notes belong in annotations, where they serve as precision hints for the compiler without cluttering the readable spec.

Good: "The app remembers every greeting it generates, along with who it was for."
Bad: "One table: `greetings` with two columns: `name` (string) and `greeting` (string)."

The annotation for the good version might be: `~~~\nOne table. Columns: the person's name (string) and the generated greeting text (string).\n~~~`

**Use inline annotations liberally.** Inline annotations (`[text]{content}`) are the primary annotation tool — use them the way you'd use comments in Google Docs, attached to the specific word or phrase that needs clarification. When the prose says "the user submits a [request]{Must include vendor name, contact email, and tax ID. All fields required.} for review," the annotation is pinned to exactly the word that's ambiguous.

Block annotations (`~~~...~~~`) are for longer notes that don't attach to a single word — implementation notes, edge case lists, multi-line technical details. But most annotations should be inline. A spec where every annotation is a block annotation under a heading is under-annotated — it means the prose itself isn't being examined for ambiguity at the word level.

**Annotations support full markdown.** Use backticks for code and variable names, lists for enumerating options, code blocks for snippets. This keeps the prose clean while giving the compiler precise technical detail:

```markdown
Each invoice has a [status]{One of: `pending_review`, `approved`, `rejected`, `paid`. Transitions:
- `pending_review` → `approved` or `rejected` (by AP)
- `approved` → `paid` (automatic on payment date)
- `rejected` → `pending_review` (if resubmitted)} that tracks where it is in the review process.
```

**Annotate ambiguity, not the obvious.** If a statement has only one reasonable interpretation, leave it alone. Annotations resolve genuine ambiguity — places where two engineers might implement different things.

**Pin down edge cases.** The most valuable annotations answer "what happens when...":
- What happens when a reviewer rejects?
- What happens when the amount is exactly on the threshold?
- What happens when no user has the required role?
- What happens when this is called twice?

**Specify data when it matters.** When "amount" could mean integer cents or decimal dollars, annotate the representation. When "status" could be any string, list the valid values. These are perfect for inline annotations: `The PO [amount]{Total across all line items, in USD cents (integer). Does not include tax, shipping, or fees.} must not exceed the budget.`

**Let the spec breathe.** A spec with more annotation than prose is over-specified. Annotate the hard parts. Trust the compiler on the straightforward parts.

## Spec Structure

A spec starts with YAML frontmatter followed by freeform Markdown. There's no mandated structure — use headings, prose, tables, lists, whatever makes sense for the domain.

**Frontmatter fields:**
- `name` (required) — display name for the spec file
- `description` (optional) — short summary of what this file covers
- `type` (optional) — defaults to `spec`. Other values: `design/color` (color palette definition), `design/typography` (font and type style definition). The frontend renders these types with specialized editors.

```markdown
---
name: Expense Tracker
description: Core application spec
---

# Expense Tracker

[High-level description]

~~~
[Clarifying annotations — roles, key constraints]
~~~

## [Domain Section]

[Prose describing the workflow]

~~~
[Edge cases, data representations, business rules]
~~~
```

Color design spec example (3-5 brand colors with evocative names):

```markdown
---
name: Colors
type: design/color
---

```colors
Midnight:
  value: "#000000"
  description: Primary background and dark surfaces
Snow:
  value: "#F5F5F7"
  description: Primary text and foreground elements
Smoke:
  value: "#86868B"
  description: Secondary text and supporting content
```
```

Typography design spec example (fonts with source URLs, 1-2 anchor styles):

```markdown
---
name: Typography
type: design/typography
---

```typography
fonts:
  DM Sans:
    src: https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700

styles:
  Display:
    font: DM Sans
    size: 40px
    weight: 600
    letterSpacing: -0.03em
    lineHeight: 1.1
    description: Page titles and hero text
  Body:
    font: DM Sans
    size: 16px
    weight: 400
    lineHeight: 1.5
    description: Default reading text
```
```
