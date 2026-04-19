/**
 * Message queue for the headless protocol.
 *
 * A FIFO queue holding commands that will be delivered to the agent
 * when the current turn ends. Unifies three previously-separate
 * mechanisms:
 *   - chained automated actions (when a resolved action has a `next`)
 *   - background sub-agent results (delivered as @@automated::background_results@@)
 *   - user messages sent during a running turn (queued instead of rejected)
 *
 * Strict FIFO — no priority. `source` is metadata for the sandbox, not
 * ordering. The queue persists via the optional onPersist callback so
 * chains and queued messages survive process restarts.
 */

import type { StdinCommand } from '../types.js';

export interface QueuedMessage {
  /** The command to deliver when this item is shifted from the queue. */
  command: StdinCommand;
  /** Where this message came from. Diagnostic only. */
  source: 'user' | 'chain' | 'background';
  /** When the message was enqueued (ms epoch). */
  enqueuedAt: number;
}

export class MessageQueue {
  private items: QueuedMessage[] = [];
  private readonly onChange?: () => void;

  constructor(initial: QueuedMessage[] = [], onChange?: () => void) {
    this.items = [...initial];
    this.onChange = onChange;
  }

  push(item: QueuedMessage): void {
    this.items.push(item);
    this.onChange?.();
  }

  shift(): QueuedMessage | undefined {
    const item = this.items.shift();
    if (item) {
      this.onChange?.();
    }
    return item;
  }

  /** Remove and return all queued items. */
  drain(): QueuedMessage[] {
    if (this.items.length === 0) {
      return [];
    }
    const all = this.items.splice(0);
    this.onChange?.();
    return all;
  }

  /** Copy of current queue contents (for surfacing on events). */
  snapshot(): QueuedMessage[] {
    return [...this.items];
  }

  get length(): number {
    return this.items.length;
  }
}
