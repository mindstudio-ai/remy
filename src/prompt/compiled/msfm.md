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

**Annotate ambiguity, not the obvious.** If a statement has only one reasonable interpretation, leave it alone. Annotations resolve genuine ambiguity — places where two engineers might implement different things.

**Pin down edge cases.** The most valuable annotations answer "what happens when...":
- What happens when a reviewer rejects?
- What happens when the amount is exactly on the threshold?
- What happens when no user has the required role?
- What happens when this is called twice?

**Specify data when it matters.** When "amount" could mean integer cents or decimal dollars, annotate the representation. When "status" could be any string, list the valid values.

**Let the spec breathe.** A spec with more annotation than prose is over-specified. Annotate the hard parts. Trust the compiler on the straightforward parts.

## Spec Structure

A spec starts with YAML frontmatter (`name`, `description`, `version`) followed by freeform Markdown. There's no mandated structure — use headings, prose, tables, lists, whatever makes sense for the domain.

```markdown
---
name: Expense Tracker
version: 1
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
