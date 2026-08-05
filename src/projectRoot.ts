/**
 * The app's project root — the directory remy was started in.
 *
 * Every file tool (readFile, writeFile, glob, grep, listDir) passes its
 * relative path straight to `fs`, so the root has always been the process
 * cwd. This just names it, so the agent can be told where it is and `bash`
 * can pin itself there instead of inheriting it by accident.
 *
 * Captured once at module load rather than read live: a `chdir` anywhere in
 * the process would otherwise silently move every tool's frame of reference
 * mid-session.
 *
 * Not to be confused with `ROOT` in `assets.ts`, which is remy's *own*
 * install directory (found by walking up for package.json) and is where
 * bundled prompt/markdown assets live.
 */

export const PROJECT_ROOT = process.cwd();
