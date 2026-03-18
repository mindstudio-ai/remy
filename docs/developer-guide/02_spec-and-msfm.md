# Spec & MSFM

## The Spec is the Application

The spec is the most important file in your project. It's the natural language document that describes what the app does: the data model, the business rules, the workflows, the edge cases. It lives in `src/app.md`.

The AI agent reads the spec and generates the backend code in `dist/`. A spec with good annotations compiles the same way every time. When you want to change the app's behavior, update the spec and the agent regenerates the code.

You can also write code directly in `dist/` without a spec. That works too. But the spec is what makes the project maintainable over time. Code shows *what* the app does; the spec captures *why*.

---

## MSFM (MindStudio-Flavored Markdown)

Specs are written in MSFM, which extends standard Markdown with two primitives: **block annotations** and **inline annotations**. These let you attach precision to prose so the AI compiler produces consistent results.

MSFM is a strict superset of Markdown. It works in any Markdown viewer; annotations render as code blocks and bracketed text. Nothing breaks.

### Design Principles

1. **One file.** A spec is a single `.md` file. No sidecars, no imports. Email it, paste it, diff it in git.
2. **Readable raw.** Useful in any text editor or LLM chat.
3. **Annotations are just more context.** Not typed or structured. They can be a word, a paragraph, or a code snippet.
4. **Additive precision.** A bare spec with no annotations is valid. Each annotation makes compilation more deterministic.

---

## Block Annotations

A fenced block using tildes (`~~~`) that attaches to the content immediately above it:

```markdown
When requesting a new vendor, there are three areas of review:
governance, legal, and accounting, with approvals flowing in that order.

~~~
The spec says "three areas" but lists four names. From the process flowchart, it is three sequential stages:

  1. Governance, Risk & Compliance (GRC), one combined stage
  2. Legal
  3. Accounts Payable (AP)

These are sequential. Each stage must complete before the next is notified. If any stage rejects, the entire request is rejected.
~~~
```

The annotation clarifies an ambiguity in the prose. "Three areas" names four things. Without the annotation, the agent might generate four separate stages. With it, the agent knows it's three.

**Rules:**
- Starts and ends with `~~~` on its own line
- Attaches to the nearest preceding block element (paragraph, heading, table, list)
- Multiple annotations can follow the same element (read in order)
- Can contain any Markdown content (use backtick code fences inside; they coexist with tilde fences)

---

## Inline Annotations

Attach to a specific word or phrase:

```markdown
All invoices can be sent to the [Accounts Payable]{The AP team in
this context refers to the internal accounts payable department, not
a vendor's AP. Only users with the "ap" or "admin" role can process
invoices.} team for processing against the PO.
```

The `[text]` is the visible, highlighted span. The `{content}` is the annotation, hidden by default in a rich editor and visible as literal text in plain Markdown.

Good for definitions, units, and clarifications:

```markdown
The PO [amount]{Total across all line items, in USD cents (integer).
Does not include tax, shipping, or fees.} must not exceed the approved
budget for the [cost center]{The organizational budget code that this
purchase is charged to.}.
```

---

## Pointers

When an annotation is too large for inline placement (lists, code, tables), use a pointer:

```markdown
The AP team pays the vendor according to the [contract payment terms]{#payment-terms}.

~~~#payment-terms
We do not model payment terms (net 30, net 60, etc.) on the PO or vendor. The dueDate on the invoice is the sole payment trigger.

A production implementation would:
- Store terms on the vendor record (net_30, net_60, due_on_receipt)
- Auto-calculate dueDate from invoiceDate + terms
- Support early payment discounts (2/10 net 30)

Default behavior when no terms are specified: due on receipt.
~~~
```

The `{#payment-terms}` inline reference points to the `~~~#payment-terms` block. Keep the block co-located, right after the paragraph containing the pointer.

A single block annotation can be referenced by multiple pointers. Useful for concepts like "amounts are in USD cents" that apply in several places.

---

## Authoring Conventions

### Annotate ambiguity, not the obvious

If a statement has only one reasonable interpretation, leave it alone. Annotations resolve genuine ambiguity, places where two engineers might implement different things.

### Pin down edge cases

The most valuable annotations answer "what happens when...":
- What happens when a reviewer rejects?
- What happens when the amount is exactly on the threshold?
- What happens when no user has the required role?
- What happens when this is called twice?

### Specify data when it matters

When "amount" could mean integer cents or decimal dollars, annotate the representation. When "status" could be any string, list the valid values.

### Let the spec breathe

Not every paragraph needs annotations. A spec with more annotation than prose is over-specified. Annotate the hard parts. Trust the compiler on the straightforward parts.

---

## Spec Structure

A spec starts with YAML frontmatter:

```yaml
---
name: Procure-to-Pay (P2P)
description: Procure-to-Pay process for all domestic (U.S.) spend.
version: 1
---
```

The body is freeform Markdown: headings, prose, tables, lists, whatever makes sense for the domain. There's no required structure or mandated heading hierarchy.

A typical pattern:

```markdown
---
name: Expense Tracker
version: 1
---

# Expense Tracker

[High-level description of the app]

~~~
[Clarifying annotations — roles, key constraints]
~~~

## [Domain Section 1]

[Prose describing the workflow]

~~~
[Edge cases, data representations, business rules]
~~~

## [Domain Section 2]

...
```

---

## How the Agent Uses the Spec

When the agent reads a spec:

1. **Understands the domain.** The prose gives it the big picture: what the app does, who uses it, how it works.
2. **Reads annotations for precision.** Annotations resolve the ambiguities that would otherwise produce inconsistent code.
3. **Generates the contract.** Methods, tables, and roles in `dist/` that implement the spec.
4. **Maintains consistency.** When modifying code, the agent checks against the spec to ensure changes are semantically correct, not just syntactically valid.

The spec is also what makes the project onboardable. A new developer (or a different AI agent) can read `src/app.md` and understand the entire application without reading any code.

---

## Standard Markdown Compatibility

| MSFM feature | Renders as in standard Markdown |
|---|---|
| Block annotation (`~~~...~~~`) | Fenced code block |
| Inline annotation (`[text]{content}`) | Literal text with brackets |
| Pointer (`[text]{#id}`) | Literal text |
| Tagged block (`~~~#id`) | Fenced code block with `#id` visible |
| Everything else | Standard Markdown |

Specs are fully readable in GitHub, VS Code, or any Markdown previewer.
