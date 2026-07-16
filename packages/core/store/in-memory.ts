import type { FailureRecord, LockoutStore } from '../interfaces';

/**
 * A single-process, in-memory {@link LockoutStore} backed by a `Map`.
 *
 * SINGLE-INSTANCE ONLY. Its state lives in one process's heap, so failure
 * counts are NOT shared across workers, replicas, or restarts. It is the right
 * store for tests, single-process apps, and local development; a horizontally
 * scaled deployment needs a shared store (e.g. the `./drizzle` store) for the
 * cross-instance counting guarantee. This limitation is intentional and part of
 * the store's contract, not a bug.
 *
 * `increment` is atomic with respect to the single-threaded event loop: it
 * neither awaits nor yields, so two `increment` calls can never interleave.
 */
export class InMemoryLockoutStore implements LockoutStore {
  private readonly records = new Map<string, FailureRecord>();

  increment(key: string, now: number, windowMs: number): FailureRecord {
    const existing = this.records.get(key);
    const fresh =
      existing === undefined || now - existing.firstFailureAt >= windowMs;
    const record: FailureRecord = fresh
      ? { key, failures: 1, firstFailureAt: now }
      : {
          key,
          failures: existing.failures + 1,
          firstFailureAt: existing.firstFailureAt,
        };
    this.records.set(key, record);
    return record;
  }

  get(key: string): FailureRecord | null {
    return this.records.get(key) ?? null;
  }

  clear(key: string): void {
    this.records.delete(key);
  }

  clearExpired(olderThan: number): number {
    let removed = 0;
    for (const [key, record] of this.records) {
      if (record.firstFailureAt < olderThan) {
        this.records.delete(key);
        removed += 1;
      }
    }
    return removed;
  }
}
