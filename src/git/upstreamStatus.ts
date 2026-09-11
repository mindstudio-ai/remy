/**
 * Whether this workspace is behind the branch production builds from.
 *
 * Every editor in an app works in their own copy of it, and everyone commits to
 * `main` — so `origin/main` moving means somebody published. A workspace that
 * restored from a snapshot taken weeks ago comes back exactly as its owner left
 * it, which is the point of the snapshot and also means it can be arbitrarily
 * far behind without anything saying so.
 *
 * Read once at boot (see the headless `start`), and deliberately answering only
 * the narrow question: return a status when this workspace IS behind, and null
 * in every other case — current, ahead-only, brand new, or unknowable. That
 * keeps the git reasoning here instead of at the call site.
 *
 * Best-effort throughout, in the mould of the sandbox's fork detection: this
 * runs on the boot path, so a missing remote, a revoked credential, no network,
 * a timeout or a repo that cannot answer all resolve to "no note" rather than a
 * thrown error or a delayed start. Two rules follow from that, and they are the
 * reason several things here are shaped the way they are:
 *
 *   1. **A failure must never become an assertion.** Every field distinguishes
 *      "false" from "could not tell", because the note is prose the agent will
 *      repeat to someone. Saying "no uncommitted changes" when `git status`
 *      merely failed is worse than saying nothing, since the publish flow reads
 *      that field before it merges.
 *   2. **Prefer the evidence over the inference.** The commit list is direct
 *      proof of what is missing, so when it can be read it settles the question
 *      and no count needs to be guessed at.
 */

import { execFile } from 'node:child_process';

import { PROJECT_ROOT } from '../projectRoot.js';
import { createLogger } from '../logger.js';

const log = createLogger('upstream');

/** The branch production builds from. Named here because git cannot be relied
 *  on to say: a `--no-checkout` clone does not always leave `origin/HEAD` set,
 *  and a restored `.git` carries whatever its original clone wrote. */
const DEFAULT_BRANCH = 'main';

/** How many incoming commit subjects to carry. Enough to characterise what
 *  landed; not so many that a workspace a year stale floods the turn. The note
 *  says when it has truncated, so the list never reads as complete. */
const MAX_INCOMING = 20;

const FETCH_TIMEOUT_MS = 30_000;
const GIT_TIMEOUT_MS = 10_000;
/** `git status` on a large untracked tree is easily past Node's 1MB default,
 *  and blowing the buffer would read as a clean tree. */
const MAX_BUFFER_BYTES = 32 * 1024 * 1024;

export interface UpstreamStatus {
  /** `origin/main`'s tip. The dedupe key: one note per distinct upstream state. */
  upstream: string;
  /**
   * Commits on `origin/main` that this workspace does not have.
   *
   * Null means "behind, but the count is unavailable" — a restored snapshot
   * carries whatever depth its clone had, and `rev-list` cannot count across
   * history a shallow repo does not hold. Reporting the fact without a number
   * beats staying silent.
   */
  behind: number | null;
  /** Commits here that are not on `origin/main`. Null when uncountable. */
  ahead: number | null;
  /**
   * Whether the working tree has uncommitted changes.
   *
   * `'unknown'` when `git status` could not be read — a lock held by another
   * git process, a buffer overrun. Not folded into `false`, because the publish
   * flow decides whether it is safe to merge partly on this, and a wrong "no"
   * is the one answer here that can lose someone's work.
   */
  dirty: boolean | 'unknown';
  /**
   * What landed upstream, newest first, as `author: subject`.
   *
   * The part that matters most: a count only supports "you are behind", while
   * these support telling someone what actually changed and answering "why
   * can't I see X". Empty when the repo cannot walk the range.
   */
  incoming: string[];
  /** Whether `incoming` was cut off at `MAX_INCOMING`. */
  incomingTruncated: boolean;
}

interface GitResult {
  ok: boolean;
  stdout: string;
  error: string | null;
}

function git(args: string[], timeout = GIT_TIMEOUT_MS): Promise<GitResult> {
  return new Promise((resolve) => {
    const child = execFile(
      'git',
      args,
      {
        cwd: PROJECT_ROOT,
        encoding: 'utf-8',
        timeout,
        maxBuffer: MAX_BUFFER_BYTES,
        // No controlling tty in a box, but an inherited one anywhere else would
        // let a credential prompt hold the whole timeout open.
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        // execFile's `timeout` sends SIGTERM, which a wedged `git-remote-https`
        // can ignore. Escalate so the boot path cannot be held by one.
        killSignal: 'SIGKILL',
      },
      (err, stdout, stderr) => {
        resolve({
          ok: !err,
          stdout: (stdout ?? '').trim(),
          // Kept so a failure can say WHY. For a probe whose entire failure
          // model is silence, this is the only line that makes it debuggable.
          error: err ? (stderr || '').trim() || err.message : null,
        });
      },
    );
    child.on('error', () => {});
  });
}

/**
 * Read the workspace's position relative to `origin/main`, fetching first.
 *
 * The fetch is not optional. The sandbox's own `refreshGitRemote` already
 * fetches on the restore path, but it is backgrounded with a long timeout, so
 * this boot races it — reading `origin/main` without fetching would report a
 * weeks-stale workspace as current, which is the exact failure this exists to
 * prevent.
 */
export async function readUpstreamStatus(): Promise<UpstreamStatus | null> {
  const inRepo = await git(['rev-parse', '--git-dir']);
  if (!inRepo.ok) {
    return null;
  }

  // A failed fetch is not fatal: origin/main may still be present from an
  // earlier one, and a stale answer is better than none. It does mean a note
  // can lag reality, which is why the count is never presented as authoritative.
  const fetched = await git(
    ['fetch', 'origin', DEFAULT_BRANCH],
    FETCH_TIMEOUT_MS,
  );
  if (!fetched.ok) {
    log.info(
      `fetch failed, falling back to the origin/${DEFAULT_BRANCH} on disk: ${fetched.error}`,
    );
  }

  const [upstreamRef, headRef] = await Promise.all([
    git(['rev-parse', `origin/${DEFAULT_BRANCH}`]),
    git(['rev-parse', 'HEAD']),
  ]);
  // No origin/main at all is a brand-new app that has never been pushed, and no
  // HEAD is a repo with no commits. Neither is behind anything.
  if (!upstreamRef.ok || !headRef.ok) {
    return null;
  }
  const upstream = upstreamRef.stdout;
  if (upstream === headRef.stdout) {
    return null;
  }

  // Read before deciding, because this is the direct evidence. `git log
  // HEAD..origin/main` succeeding with nothing in it PROVES the workspace is
  // not behind (differing tips only mean it is ahead), and that is a better
  // answer than anything the count fallbacks can infer.
  const incomingResult = await git([
    'log',
    `--max-count=${MAX_INCOMING + 1}`,
    '--format=%an: %s',
    `HEAD..origin/${DEFAULT_BRANCH}`,
  ]);
  const incomingLines = incomingResult.ok
    ? incomingResult.stdout.split('\n').filter((line) => line.length > 0)
    : [];
  if (incomingResult.ok && incomingLines.length === 0) {
    return null;
  }

  let behind: number | null = null;
  let ahead: number | null = null;
  const counts = await git([
    'rev-list',
    '--left-right',
    '--count',
    `origin/${DEFAULT_BRANCH}...HEAD`,
  ]);
  if (counts.ok) {
    const [left, right] = counts.stdout.split(/\s+/);
    behind = Number(left);
    ahead = Number(right);
    if (!Number.isFinite(behind) || behind <= 0) {
      return null;
    }
    if (!Number.isFinite(ahead)) {
      ahead = null;
    }
  } else if (!incomingResult.ok) {
    // Neither the list nor the count could be read, so nothing has established
    // the DIRECTION yet — and differing tips alone are equally consistent with
    // being ahead, which is normal and not worth a word. `--is-ancestor`
    // exiting 0 means origin/main is already contained here, so nothing is
    // missing. A non-zero exit covers both "genuinely behind" and "still cannot
    // tell"; treat it as behind-without-a-count, since a workspace this broken
    // is worth a mention either way.
    const contained = await git([
      'merge-base',
      '--is-ancestor',
      `origin/${DEFAULT_BRANCH}`,
      'HEAD',
    ]);
    if (contained.ok) {
      return null;
    }
    log.info(
      `behind by an unknown amount: rev-list and log both failed (${counts.error})`,
    );
  }

  const status = await git(['status', '--porcelain']);
  if (!status.ok) {
    log.info(`could not read the working tree state: ${status.error}`);
  }

  return {
    upstream,
    behind,
    ahead,
    dirty: status.ok ? status.stdout.length > 0 : 'unknown',
    incoming: incomingLines.slice(0, MAX_INCOMING),
    incomingTruncated: incomingLines.length > MAX_INCOMING,
  };
}
