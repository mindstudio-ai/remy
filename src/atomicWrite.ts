/**
 * Atomic file writes: write a tmp sibling, fsync, then rename. Concurrent
 * readers (the sandbox's file watcher broadcasts several `.remy-*` state
 * files to the frontend, git snapshots force-add them mid-write, and remy
 * itself re-reads some on restart) must never observe a torn file — a plain
 * writeFile opens with O_TRUNC, leaving a zero-byte window. rename(2) is
 * atomic within a filesystem.
 *
 * The tmp name carries the pid: tools run in a Promise.all batch, so two
 * writers of the same file (or two remy processes in one cwd) must not
 * clobber each other's tmp and publish the wrong bytes. The fsync matters on
 * a hard VM kill (sandbox suspend/OOM) — without it the rename can land
 * while the data hasn't, publishing a zero-length file.
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';

export const writeFileAtomicSync = (file: string, data: string): void => {
  const tmp = `${file}.${process.pid}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
};

export const writeFileAtomic = async (
  file: string,
  data: string | Buffer,
): Promise<void> => {
  const tmp = `${file}.${process.pid}.tmp`;
  const handle = await fsp.open(tmp, 'w');
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fsp.rename(tmp, file);
};
