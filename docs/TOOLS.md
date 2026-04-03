# Tool Reference

Complete reference for every tool Remy exposes. Intended for frontend developers building UI around Remy's tool events.

**Key concepts:**
- **External tools** are intercepted by the sandbox — Remy emits `tool_use`, the sandbox handles execution and returns the real `tool_result`. The local `execute()` is never used.
- **Clearable tools** have their results eligible for server-side context management clearing after they age out of the conversation.
- All tool events include `id` (tool call ID) and `name`. Subagent tool events also include `parentToolId`.

---

## Common Tools

### `setProjectOnboardingState`
Advances the project through onboarding phases. External — sandbox updates project state.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `state` | string (enum) | yes | `initialSpecReview`, `initialCodegen`, or `onboardingFinished` |

- External: yes
- Clearable: no
- Result: confirmation from sandbox

### `promptUser`
Presents a form or inline question to the user. External — the sandbox renders UI and returns the user's response.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `type` | string (enum) | yes | `form` or `inline` |
| `questions` | array | yes | Array of question objects (see below) |

**Question object:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | yes | Unique identifier for the question |
| `question` | string | yes | The question text |
| `type` | string (enum) | yes | `select`, `checklist`, `text`, or `file` |
| `helpText` | string | no | Subtext below the question |
| `required` | boolean | no | Whether the question must be answered |
| `options` | array | no | For select/checklist — strings or `{ label, description }` objects |
| `multiple` | boolean | no | For file type — allow multiple files |
| `format` | string (enum) | no | For text — `email`, `url`, `phone`, or `number` |
| `placeholder` | string | no | Placeholder text for text inputs |
| `accept` | string | no | For file type — accepted MIME types |

- External: yes
- Clearable: no
- Result: JSON object mapping question IDs to user responses

### `confirmDestructiveAction`
Asks the user to confirm a destructive action. External — sandbox renders confirmation dialog.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `message` | string | yes | What the user is confirming |
| `confirmLabel` | string | no | Custom confirm button text |
| `dismissLabel` | string | no | Custom dismiss button text |

- External: yes
- Clearable: no
- Result: `"confirmed"` or rejection

### `searchGoogle`
Web search via MindStudio SDK.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `query` | string | yes | Search query |

- External: no
- Clearable: no
- Result: JSON string with search results

### `scrapeWebUrl`
Fetches and extracts content from a URL.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `url` | string | yes | URL to scrape |
| `screenshot` | boolean | no | Also take a screenshot of the page |

- External: no
- Clearable: no
- Result: Extracted text/markdown content from the page

### `setProjectMetadata`
Sets project-level metadata (name, icon, share image). External — sandbox updates project.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | no | Project display name |
| `iconUrl` | string | no | CDN URL for the project icon |
| `openGraphShareImageUrl` | string | no | CDN URL for OG share image |

- External: yes
- Clearable: no
- Result: confirmation from sandbox

---

## Spec Tools

### `readSpec`
Reads a spec file from `src/`.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | string | yes | File path, must start with `src/` |
| `offset` | number | no | Line to start from (1-indexed, negative for from end) |
| `maxLines` | number | no | Max lines to return (default 500, 0 for all) |

- External: no
- Clearable: yes
- Result: File content with line numbers

### `writeSpec`
Writes a full spec file.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | string | yes | File path, must start with `src/` |
| `content` | string | yes | Full MSFM markdown content |

- External: no
- Clearable: yes
- Result: Confirmation with diff

### `editSpec`
Edits a spec file by heading-targeted operations.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | string | yes | File path, must start with `src/` |
| `edits` | array | yes | Array of edit operations (see below) |

**Edit object:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `heading` | string | yes | Heading path with ` > ` separator |
| `operation` | string (enum) | yes | `replace`, `insert_after`, `insert_before`, or `delete` |
| `content` | string | no | Content for replace/insert operations |

- External: no
- Clearable: yes
- Result: Diff showing changes

### `listSpecFiles`
Lists all files in `src/`.

No input properties.

- External: no
- Clearable: no
- Result: File listing

### `clearSyncStatus`
Clears the sync status indicator. External — sandbox handles UI state.

No input properties.

- External: yes
- Clearable: no
- Result: confirmation from sandbox

### `presentSyncPlan`
Presents a sync plan for user approval. External — sandbox renders approval UI.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `content` | string | yes | Markdown plan content |

- External: yes
- Clearable: no
- Result: `"approved"` after user approval

### `presentPublishPlan`
Presents a publish changelog for user approval. External — sandbox renders approval UI.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `content` | string | yes | Markdown changelog |

- External: yes
- Clearable: no
- Result: `"approved"` after user approval

### `presentPlan`
Presents a general plan for user approval. External — user can approve or reject with feedback.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `content` | string | yes | Markdown plan content |

- External: yes
- Clearable: no
- Result: `"approved"` or rejection feedback text

---

## Code Tools

### `readFile`
Reads any file in the project.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | string | yes | File path relative to project root |
| `offset` | number | no | Line to start from (1-indexed, negative for from end) |
| `maxLines` | number | no | Max lines to return (default 500, 0 for all) |

- External: no
- Clearable: yes
- Result: File content with line numbers

### `writeFile`
Writes a complete file.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | string | yes | File path relative to project root |
| `content` | string | yes | Full file content |

- External: no
- Clearable: yes
- Result: Confirmation with diff

### `editFile`
String replacement in a file. Exact match, with whitespace-flexible fallback.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | string | yes | File path relative to project root |
| `old_string` | string | yes | Exact string to find (must be unique unless replace_all) |
| `new_string` | string | yes | Replacement string |
| `replace_all` | boolean | no | Replace all occurrences (default false) |

- External: no
- Clearable: yes
- Result: Confirmation with diff

### `bash`
Executes a shell command.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `command` | string | yes | Shell command to execute |
| `cwd` | string | no | Working directory (default: project root) |
| `timeout` | number | no | Timeout in seconds (default 120) |
| `maxLines` | number | no | Max output lines (default 500, 0 for all) |

- External: no
- Clearable: yes
- Result: Combined stdout + stderr

### `grep`
Regex search across files (uses ripgrep).

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `pattern` | string | yes | Regex pattern |
| `path` | string | no | Directory or file to search |
| `glob` | string | no | File glob filter |
| `maxResults` | number | no | Max results (default 50) |

- External: no
- Clearable: yes
- Result: Matching lines with file paths and line numbers

### `glob`
Find files by glob pattern.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `pattern` | string | yes | Glob pattern |
| `maxResults` | number | no | Max files (default 200) |

- External: no
- Clearable: yes
- Result: List of matching file paths

### `listDir`
Lists directory contents.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | string | no | Directory path (default `.`) |

- External: no
- Clearable: yes
- Result: Directory listing (directories first)

### `editsFinished`
Signals the preview to refresh. Call after a batch of file edits.

No input properties.

- External: no
- Clearable: no
- Result: `"Preview updated."`

### `lspDiagnostics`
Runs TypeScript diagnostics on a file.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `file` | string | yes | File path relative to workspace root |

- External: no
- Clearable: yes
- Result: Diagnostics with error messages, line numbers, and suggested fixes

### `restartProcess`
Restarts a managed process (e.g., dev server).

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | yes | Process name (e.g., `devServer`) |

- External: no
- Clearable: no
- Result: `"Restarted {name}."` or error

### `runScenario`
Seeds the dev database with test data. External — sandbox sends to dev tunnel.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `scenarioId` | string | yes | Scenario ID from mindstudio.json |
| `skipTruncate` | boolean | no | Skip table truncation (default false) |

- External: yes
- Clearable: yes
- Result: Execution output with console logs, errors, duration

### `runMethod`
Executes a backend method for testing. External — sandbox sends to dev tunnel.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `method` | string | yes | Method export name (camelCase) |
| `input` | object | no | Input payload |

- External: yes
- Clearable: yes
- Result: JSON with output, console output, errors (with stack traces), and duration

### `queryDatabase`
Executes raw SQL against the dev database. External — sandbox sends to dev tunnel.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `sql` | string | yes | SQL query to execute |

- External: yes
- Clearable: yes
- Result: Query results (rows for SELECT, affected count for mutations)

### `screenshot`
Captures and analyzes a screenshot of the web preview.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | string | no | URL path to navigate to before capture |
| `prompt` | string | no | Specific question about the screenshot |
| `imageUrl` | string | no | URL of existing image to analyze instead |

- External: no
- Clearable: yes
- Result: Screenshot URL + AI analysis of what's visible

---

## Subagent Tools

### `runAutomatedBrowserTest`
Runs an automated browser test via a dedicated subagent with its own tool loop. Acquires a session lock — only one browser automation can run at a time.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `task` | string | yes | What to test, in natural language |

- External: no (but uses external `browserCommand` internally)
- Clearable: yes
- Result: Test findings and analysis
- Note: Resets browser before and after each session. Events are tagged with `parentToolId`.

### `visualDesignExpert`
Design expert subagent. Returns brand identity, UI patterns, image assets, font selections, layout guidance.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `task` | string | yes | Design brief in natural language |
| `background` | boolean | no | Run in background, return immediately |

- External: no
- Clearable: no
- Result: Design deliverables (hex values, font URLs, image CDN URLs, layout specs, wireframes). If backgrounded, result arrives later via `@@automated::background_results@@`.
- Note: Runs on Opus. Has its own tools (image generation, image editing, screenshots, web search/scrape). Events tagged with `parentToolId`.

### `productVision`
Product strategy subagent. Owns the roadmap, advises on what to build.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `task` | string | yes | What's needed |
| `background` | boolean | no | Run in background, return immediately |

- External: no
- Clearable: no
- Result: Roadmap updates, strategic guidance. If backgrounded, result arrives later via `@@automated::background_results@@`.
- Note: Events tagged with `parentToolId`.

### `codeSanityCheck`
Lightweight architecture reviewer. Readonly — searches web, reads code, checks SDK.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `task` | string | yes | Approach being reviewed |

- External: no
- Clearable: no
- Result: `"lgtm."` or brief flag with issue + fix

### `askMindStudioSdk`
MindStudio SDK consultant. Returns architectural guidance and working code for SDK integrations.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `query` | string | yes | What to build or what to know about the SDK |

- External: no
- Clearable: no
- Result: Architectural guidance with code examples

---

## Subagent Internal Tools

These tools run inside subagent loops. Events from them include `parentToolId` linking to the parent subagent tool call.

### Browser Automation (`runAutomatedBrowserTest`)

#### `browserCommand`
Sends commands to the browser preview. Commands execute sequentially with an animated cursor. External — the sandbox drives the browser.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `steps` | array | yes | Array of command step objects (see below) |

**Step object:**

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `command` | string (enum) | yes | `snapshot`, `click`, `type`, `select`, `wait`, `navigate`, `evaluate`, `styles`, `screenshotFullPage`, `screenshotViewport` |
| `ref` | string | no | Element ref from last snapshot |
| `text` | string | no | For click/wait: accessible name. For type: text to type |
| `role` | string | no | ARIA role (used with text) |
| `label` | string | no | Find input by associated label |
| `selector` | string | no | CSS selector (last resort) |
| `option` | string | no | For select: option text |
| `clear` | boolean | no | For type: clear field first |
| `timeout` | number | no | For wait: timeout in ms (default 5000) |
| `script` | string | no | For evaluate: JavaScript to execute |
| `url` | string | no | For navigate: path to navigate to |
| `properties` | array of strings | no | For styles: CSS property names to read |

- External: yes
- Clearable: yes
- Result: JSON with step results, including a `snapshot` of final page state. `screenshotViewport` steps include `result.url` (CDN) and `result.analysis`.

#### `screenshotFullPage`
Captures a full-height screenshot with AI analysis.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | string | no | Navigate to this path before capturing |

- External: no
- Clearable: yes
- Result: Screenshot URL + analysis

---

### Design Expert (`visualDesignExpert`)

#### `searchGoogle`
Web search for design research.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `query` | string | yes | Search query |

- Clearable: no

#### `scrapeWebUrl`
Fetch web page content as markdown.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `url` | string | yes | URL to fetch |

- Clearable: no

#### `analyzeDesign`
Analyze the visual design of a website or image URL. Websites are auto-screenshotted.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `url` | string | yes | Website or image URL |
| `prompt` | string | no | Custom analysis prompt (default: full design reference analysis) |

- Clearable: no

#### `analyzeImage`
Analyze an image via vision model. Returns objective description of contents.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `imageUrl` | string | yes | Image URL to analyze |
| `prompt` | string | no | Specific questions about the image |

- Clearable: yes

#### `screenshot`
Capture a screenshot of the app preview with optional interactive instructions.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `path` | string | no | Navigate to this path before capturing |
| `prompt` | string | no | Specific question about the screenshot |
| `instructions` | string | no | Interactive steps to perform before capture (delegates to browser automation) |

- Clearable: yes

#### `generateImages`
Generate images from text prompts. Returns CDN URLs with quality analysis.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `prompts` | array of strings | yes | Image briefs (run in parallel) |
| `width` | number | no | Width in px (default 2048, range 2048-4096) |
| `height` | number | no | Height in px (default 2048, range 2048-4096) |
| `transparentBackground` | boolean | no | Remove background, produce transparent PNG |

- Clearable: no
- Result: Array of `{ url, analysis }` objects

#### `editImages`
Edit/transform existing images using source references.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `prompts` | array of strings | yes | Edit briefs (run in parallel) |
| `sourceImages` | array of strings | yes | Source/reference image URLs |
| `width` | number | no | Output width in px (default 2048) |
| `height` | number | no | Output height in px (default 2048) |
| `transparentBackground` | boolean | no | Remove background from output |

- Clearable: no
- Result: Array of `{ url, analysis }` objects

---

### Product Vision (`productVision`)

#### `writeRoadmapItem`
Create a new roadmap item in `src/roadmap/`.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `slug` | string | yes | Kebab-case filename without `.md` |
| `name` | string | yes | User-facing feature name |
| `description` | string | yes | Short summary (1-2 sentences) |
| `effort` | string (enum) | yes | `quick`, `small`, `medium`, or `large` |
| `requires` | array of strings | yes | Prerequisite slugs (empty if independent) |
| `body` | string | yes | MSFM body with prose + `~~~annotation~~~` block |

- Clearable: no

#### `updateRoadmapItem`
Update an existing roadmap item. Only include fields to change.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `slug` | string | yes | Item slug |
| `status` | string (enum) | no | `done`, `in-progress`, or `not-started` |
| `name` | string | no | Updated name |
| `description` | string | no | Updated summary |
| `effort` | string (enum) | no | Updated effort |
| `requires` | array of strings | no | Updated prerequisites |
| `body` | string | no | Full replacement body |
| `appendHistory` | string | no | History entry to append (format: `- **2026-03-22** — Description`) |

- Clearable: no

#### `deleteRoadmapItem`
Remove a roadmap item.

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `slug` | string | yes | Item slug to delete |

- Clearable: no

---

### Code Sanity Check (`codeSanityCheck`)

Uses a subset of main agent tools (readonly): `readFile`, `grep`, `glob`, `searchGoogle`, `scrapeWebUrl`, `askMindStudioSdk`, `bash`.

---

## Summary

| Category | Count | External | Clearable |
|----------|-------|----------|-----------|
| Common | 6 | 4 | 0 |
| Spec | 8 | 4 | 3 |
| Code | 14 | 3 | 11 |
| Subagent | 5 | 0 | 1 |
| **Total** | **33** | **11** | **15** |

**External tools** (sandbox-handled): `setProjectOnboardingState`, `promptUser`, `confirmDestructiveAction`, `setProjectMetadata`, `clearSyncStatus`, `presentSyncPlan`, `presentPublishPlan`, `presentPlan`, `runScenario`, `runMethod`, `queryDatabase`
