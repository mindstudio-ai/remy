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
 * thrown error or a delayed start.
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
 *  landed; not so many that a workspace a year stale floods the turn. */
const MAX_INCOMING = 20;

const FETCH_TIMEOUT_MS = 30_000;
const GIT_TIMEOUT_MS = 10_000;

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
  /** Whether the working tree has uncommitted changes. */
  dirty: boolean;
  /**
   * What landed upstream, newest first, as `author: subject`.
   *
   * The part that matters most: a count only supports "you are behind", while
   * these support telling someone what actually changed and answering "why
   * can't I see X". Empty when the repo cannot walk the range.
   */
  incoming: string[];
}

interface GitResult {
  ok: boolean;
  stdout: string;
}

function git(args: string[], timeout = GIT_TIMEOUT_MS): Promise<GitResult> {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      { cwd: PROJECT_ROOT, encoding: 'utf-8', timeout },
      (err, stdout) => {
        resolve({ ok: !err, stdout: (stdout ?? '').trim() });
      },
    );
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
    log.info('fetch failed; falling back to whatever origin/main is on disk');
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

  // Differing tips alone do not mean behind — this workspace may simply be
  // ahead with unpushed commits, which is normal and not worth a word.
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
  } else {
    // Shallow: settle the direction without counting. Exit 0 means origin/main
    // is already an ancestor of HEAD, so nothing is missing here. A non-zero
    // exit covers both "genuinely behind" and "cannot tell", and we treat both
    // as behind-without-a-count: erring toward saying something is the right
    // side to err on.
    const contained = await git([
      'merge-base',
      '--is-ancestor',
      `origin/${DEFAULT_BRANCH}`,
      'HEAD',
    ]);
    if (contained.ok) {
      return null;
    }
  }

  const [status, incoming] = await Promise.all([
    git(['status', '--porcelain']),
    git([
      'log',
      `--max-count=${MAX_INCOMING}`,
      '--format=%an: %s',
      `HEAD..origin/${DEFAULT_BRANCH}`,
    ]),
  ]);

  return {
    upstream,
    behind,
    ahead,
    dirty: status.ok && status.stdout.length > 0,
    incoming: incoming.ok
      ? incoming.stdout.split('\n').filter((line) => line.length > 0)
      : [],
  };
}
