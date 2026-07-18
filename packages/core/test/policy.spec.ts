import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import type { EvaluationConfig } from '../policy';
import { cooloffFor, effectiveWindowMs, evaluateRecord } from '../policy';
import type { FailureRecord } from '../interfaces';

describe('cooloffFor', () => {
  it('returns the base cooloff when no tiers are configured', () => {
    assert.equal(cooloffFor(5, 1000), 1000);
    assert.equal(cooloffFor(5, 1000, []), 1000);
  });

  it('returns the base cooloff below the first tier threshold', () => {
    assert.equal(
      cooloffFor(2, 1000, [{ atFailures: 3, cooloffMs: 5000 }]),
      1000,
    );
  });

  it('applies a tier once its failure threshold is reached', () => {
    const tiers = [{ atFailures: 3, cooloffMs: 5000 }];
    assert.equal(cooloffFor(3, 1000, tiers), 5000);
    assert.equal(cooloffFor(4, 1000, tiers), 5000);
  });

  it('selects the highest reached tier regardless of array order', () => {
    const tiers = [
      { atFailures: 9, cooloffMs: 60000 },
      { atFailures: 3, cooloffMs: 5000 },
      { atFailures: 6, cooloffMs: 20000 },
    ];
    assert.equal(cooloffFor(2, 1000, tiers), 1000);
    assert.equal(cooloffFor(3, 1000, tiers), 5000);
    assert.equal(cooloffFor(7, 1000, tiers), 20000);
    assert.equal(cooloffFor(12, 1000, tiers), 60000);
  });

  it('keeps the higher reached tier when a later tier does not beat it', () => {
    // The second tier has a lower threshold than the first: the bestAt guard
    // must keep the already-chosen higher tier.
    const tiers = [
      { atFailures: 6, cooloffMs: 20000 },
      { atFailures: 3, cooloffMs: 5000 },
    ];
    assert.equal(cooloffFor(6, 1000, tiers), 20000);
  });
});

describe('effectiveWindowMs', () => {
  it('defaults to the base cooloff when no window or tiers are set', () => {
    assert.equal(effectiveWindowMs(1000), 1000);
  });

  it('uses the explicit window when it is the longest', () => {
    assert.equal(effectiveWindowMs(1000, 10000), 10000);
  });

  it('never shrinks below the base cooloff', () => {
    assert.equal(effectiveWindowMs(5000, 1000), 5000);
  });

  it('expands to cover the longest tier cooloff', () => {
    assert.equal(
      effectiveWindowMs(1000, 2000, [
        { atFailures: 3, cooloffMs: 500 },
        { atFailures: 6, cooloffMs: 60000 },
      ]),
      60000,
    );
  });
});

describe('evaluateRecord', () => {
  const config = (over: Partial<EvaluationConfig> = {}): EvaluationConfig => ({
    limit: 3,
    cooloffMs: 1000,
    windowMs: 1000,
    ...over,
  });

  it('is not locked for a null record', () => {
    assert.deepEqual(evaluateRecord(null, 0, config()), {
      locked: false,
      retryAfterMs: null,
    });
  });

  it('is not locked once the window has fully elapsed', () => {
    // Enough failures to lock, but the window has aged out: not locked.
    const record: FailureRecord = { key: 'k', failures: 9, firstFailureAt: 0, lastFailureAt: 0 };
    assert.deepEqual(evaluateRecord(record, 1000, config()), {
      locked: false,
      retryAfterMs: null,
    });
  });

  it('is not locked below the failure limit', () => {
    const record: FailureRecord = { key: 'k', failures: 2, firstFailureAt: 0, lastFailureAt: 0 };
    assert.deepEqual(evaluateRecord(record, 10, config()), {
      locked: false,
      retryAfterMs: null,
    });
  });

  it('locks with a positive retry-after at the limit', () => {
    const record: FailureRecord = { key: 'k', failures: 3, firstFailureAt: 0, lastFailureAt: 0 };
    assert.deepEqual(evaluateRecord(record, 200, config()), {
      locked: true,
      retryAfterMs: 800,
    });
  });

  it('unlocks once the cooloff has elapsed within a longer window', () => {
    const record: FailureRecord = { key: 'k', failures: 3, firstFailureAt: 0, lastFailureAt: 0 };
    // Base cooloff 1000 has elapsed at now=1000, but the window is 5000, so the
    // record is still present — yet no longer locked.
    assert.deepEqual(evaluateRecord(record, 1000, config({ windowMs: 5000 })), {
      locked: false,
      retryAfterMs: null,
    });
  });

  it('uses the tier cooloff when computing retry-after', () => {
    const record: FailureRecord = { key: 'k', failures: 6, firstFailureAt: 0, lastFailureAt: 0 };
    const cfg = config({
      windowMs: 60000,
      tiers: [{ atFailures: 6, cooloffMs: 30000 }],
    });
    assert.deepEqual(evaluateRecord(record, 5000, cfg), {
      locked: true,
      retryAfterMs: 25000,
    });
  });

  it('anchors the cooloff to lastFailureAt, not firstFailureAt', () => {
    // A run that started at 0 but whose latest failure was at 5000. With the
    // cooloff anchored to lastFailureAt (5000), the lock runs to 5000+1000=6000.
    // (The old firstFailureAt anchor would have said 0+1000-5500 < 0 → unlocked
    // — that was the between-tier gap this fix closes.)
    const record: FailureRecord = {
      key: 'k',
      failures: 3,
      firstFailureAt: 0,
      lastFailureAt: 5000,
    };
    assert.deepEqual(evaluateRecord(record, 5500, config({ windowMs: 100000 })), {
      locked: true,
      retryAfterMs: 500,
    });
  });

  it('caps retry-after at the window when the window lifts sooner than the cooloff', () => {
    // Window (from firstFailureAt) expires at 1000; cooloff (from lastFailureAt
    // 900) would run to 1900. Still locked at now=500, but retry-after is capped
    // to the window remaining (500), not the cooloff remaining (1400).
    const record: FailureRecord = {
      key: 'k',
      failures: 3,
      firstFailureAt: 0,
      lastFailureAt: 900,
    };
    assert.deepEqual(evaluateRecord(record, 500, config()), {
      locked: true,
      retryAfterMs: 500, // min(900+1000-500, 0+1000-500) = min(1400, 500)
    });
  });

  it('lets the window (from firstFailureAt) cap a lock the cooloff would extend', () => {
    // lastFailureAt is recent (cooloff from it would keep locking), but the
    // window measured from firstFailureAt has fully elapsed — the run is capped.
    const record: FailureRecord = {
      key: 'k',
      failures: 3,
      firstFailureAt: 0,
      lastFailureAt: 900,
    };
    // now - firstFailureAt(0) = 1000 >= windowMs 1000 → not locked, even though
    // lastFailureAt(900) + cooloff(1000) = 1900 > now. This bounds max lockout.
    assert.deepEqual(evaluateRecord(record, 1000, config()), {
      locked: false,
      retryAfterMs: null,
    });
  });
});
