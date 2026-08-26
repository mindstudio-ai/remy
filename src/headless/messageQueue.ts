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
  /** Delivery semantics. 'afterTurn' (default, also when absent — including
   * items persisted before this field existed) waits for the current turn to
   * end and drains FIFO. 'asap' — user-promoted — is pulled into the running
   * turn at its next tool boundary. When no turn is running the tag is
   * ignored and the item drains in normal FIFO order. */
  delivery?: 'asap' | 'afterTurn';
  /**
   * Waiting on the user, not on the agent: delivered only by an explicit
   * action (a new send, a promote, an explicit resume), never by the automatic
   * post-turn drain. Set on the user messages that survive a cancel, and on
   * user messages restored from disk after a restart.
   *
   * Both cases used to auto-run: a cancel drained the queue into a fresh turn
   * milliseconds later (so Stop never appeared to work), and a restored
   * message fired at the end of whatever unrelated turn came next (a "ghost
   * turn" the user had given up on). Held items also don't count as agent
   * activity — see the sandbox's derived busy.
   */
  held?: boolean;
}

/**
 * Mark the user messages in a disk-restored queue `held`, leaving Remy's own
 * chain/background items alone. Applied to `loadQueue()`'s result before the
 * queue is constructed, so the hold is in place before anything can drain.
 */
export function holdRestoredUserItems(items: QueuedMessage[]): QueuedMessage[] {
  return items.map((item) =>
    item.source === 'user' ? { ...item, held: true } : item,
  );
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

  /**
   * Index of the first deliverable item, or -1 when there is none.
   *
   * Held items are out of the delivery sequence, so the drain skips past them
   * rather than stopping at them: a message the user parked sits at the head
   * of the array, and stopping there would strand Remy's own chain steps and
   * background results queued behind it.
   */
  firstDeliverableIndex(): number {
    return this.items.findIndex((item) => !item.held);
  }

  /** Remove and return the item at `i`; fires onChange. */
  takeAt(i: number): QueuedMessage | undefined {
    const [item] = this.items.splice(i, 1);
    if (item) {
      this.onChange?.();
    }
    return item;
  }

  /** Remove and return `count` items starting at `start`; fires onChange once. */
  takeRange(start: number, count: number): QueuedMessage[] {
    if (count <= 0) {
      return [];
    }
    const items = this.items.splice(start, count);
    if (items.length > 0) {
      this.onChange?.();
    }
    return items;
  }

  /**
   * Remove all items matching `predicate`. Fires onChange only if something
   * was removed. Returns the removed items.
   */
  removeWhere(predicate: (item: QueuedMessage) => boolean): QueuedMessage[] {
    const removed: QueuedMessage[] = [];
    this.items = this.items.filter((item) => {
      if (predicate(item)) {
        removed.push(item);
        return false;
      }
      return true;
    });
    if (removed.length > 0) {
      this.onChange?.();
    }
    return removed;
  }

  /**
   * Mark matching items `held` — waiting on the user rather than on the agent.
   * Fires onChange only if something changed. Returns the held items.
   */
  holdWhere(predicate: (item: QueuedMessage) => boolean): QueuedMessage[] {
    const held: QueuedMessage[] = [];
    let changed = false;
    for (const item of this.items) {
      if (!predicate(item)) {
        continue;
      }
      changed = changed || !item.held;
      item.held = true;
      held.push(item);
    }
    if (changed) {
      this.onChange?.();
    }
    return held;
  }

  /**
   * Release held items so the normal drain picks them up again — all of them,
   * or one by command requestId. Fires onChange only if something changed.
   * Returns the released items.
   */
  releaseHeld(id?: string): QueuedMessage[] {
    const released: QueuedMessage[] = [];
    for (const item of this.items) {
      if (!item.held || (id !== undefined && item.command.requestId !== id)) {
        continue;
      }
      delete item.held;
      released.push(item);
    }
    if (released.length > 0) {
      this.onChange?.();
    }
    return released;
  }

  /** Whether anything in the queue will drain on its own (i.e. isn't held). */
  hasDeliverable(): boolean {
    return this.items.some((item) => !item.held);
  }

  /**
   * Change a queued item's delivery semantics, keyed by its command
   * requestId. Fires onChange (→ persist + queue_changed) on success.
   * Returns the item, or undefined if no queued item matches (e.g. it was
   * already consumed).
   */
  setDelivery(
    id: string,
    delivery: 'asap' | 'afterTurn',
  ): QueuedMessage | undefined {
    const item = this.items.find((it) => it.command.requestId === id);
    if (!item) {
      return undefined;
    }
    item.delivery = delivery;
    this.onChange?.();
    return item;
  }

  /**
   * Promote an item to ASAP: release any hold, and move it to the head so it
   * is the next thing delivered. One onChange for all of it.
   *
   * Position matters only when no turn is running — mid-turn, ASAP items are
   * pulled by predicate at the next tool boundary regardless of where they sit
   * (`takeSteering`), jumping whatever is queued ahead of them. Moving to the
   * head makes the idle case behave the same way, and matches the card, which
   * already renders promoted items above everything else.
   *
   * Returns the item, or undefined if nothing matches (e.g. it was already
   * consumed by the running turn).
   */
  promoteToFront(id: string): QueuedMessage | undefined {
    const idx = this.items.findIndex((it) => it.command.requestId === id);
    if (idx === -1) {
      return undefined;
    }
    const [item] = this.items.splice(idx, 1);
    item.delivery = 'asap';
    delete item.held;
    this.items.unshift(item);
    this.onChange?.();
    return item;
  }

  /** Copy of current queue contents (for surfacing on events). */
  snapshot(): QueuedMessage[] {
    return [...this.items];
  }

  /** Return the item at index `i` without removing it. */
  peekAt(i: number): QueuedMessage | undefined {
    return this.items[i];
  }

  get length(): number {
    return this.items.length;
  }
}
