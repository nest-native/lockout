import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import { deriveKeys } from '../key';

function expectedKey(pairs: Array<[string, string]>): string {
  return createHash('sha256').update(JSON.stringify(pairs)).digest('hex');
}

describe('deriveKeys', () => {
  it('returns no keys when no parameters are configured', () => {
    assert.deepEqual(deriveKeys({ username: 'a' }, []), []);
  });

  it('derives one key per applicable parameter', () => {
    const keys = deriveKeys({ username: 'alice', ip: '1.2.3.4' }, [
      ['username'],
      ['ip'],
    ]);
    assert.equal(keys.length, 2);
    assert.deepEqual(keys[0].parameter, ['username']);
    assert.equal(keys[0].key, expectedKey([['username', 'alice']]));
    assert.deepEqual(keys[1].parameter, ['ip']);
    assert.equal(keys[1].key, expectedKey([['ip', '1.2.3.4']]));
  });

  it('combines multiple dimensions in the parameter’s declared order', () => {
    const [derived] = deriveKeys({ ip: '1.2.3.4', userAgent: 'curl' }, [
      ['ip', 'userAgent'],
    ]);
    assert.equal(
      derived.key,
      expectedKey([
        ['ip', '1.2.3.4'],
        ['userAgent', 'curl'],
      ]),
    );
  });

  it('skips a single-dimension parameter when its dimension is absent', () => {
    // No username on this attempt → the ['username'] parameter does not apply,
    // so it must not fall back to some shared "empty username" bucket.
    const keys = deriveKeys({ ip: '1.2.3.4' }, [['username'], ['ip']]);
    assert.equal(keys.length, 1);
    assert.deepEqual(keys[0].parameter, ['ip']);
  });

  it('skips a multi-dimension parameter when any dimension is absent', () => {
    const keys = deriveKeys({ ip: '1.2.3.4' }, [['ip', 'userAgent']]);
    assert.deepEqual(keys, []);
  });

  it('is stable across calls for the same input', () => {
    const a = deriveKeys({ username: 'x' }, [['username']]);
    const b = deriveKeys({ username: 'x' }, [['username']]);
    assert.equal(a[0].key, b[0].key);
  });

  it('never exposes the raw dimension value in the key', () => {
    const [derived] = deriveKeys({ username: 'secret-user' }, [['username']]);
    assert.doesNotMatch(derived.key, /secret-user/);
    assert.match(derived.key, /^[0-9a-f]{64}$/);
  });

  it('produces distinct keys for distinct values and distinct dimensions', () => {
    const a = deriveKeys({ username: 'a' }, [['username']])[0].key;
    const b = deriveKeys({ username: 'b' }, [['username']])[0].key;
    // The same string under a different dimension name must not collide.
    const c = deriveKeys({ ip: 'a' }, [['ip']])[0].key;
    assert.notEqual(a, b);
    assert.notEqual(a, c);
  });

  describe('normalize', () => {
    const lower = { username: (v: string) => v.trim().toLowerCase() };

    it('collapses case/whitespace variants to a single key (the bypass defence)', () => {
      const canonical = deriveKeys({ username: 'alice' }, [['username']], lower)[0].key;
      for (const variant of ['Alice', 'ALICE', '  alice ', 'aLiCe']) {
        const [derived] = deriveKeys({ username: variant }, [['username']], lower);
        assert.equal(derived.key, canonical, `${variant} must normalize to alice`);
      }
      // And it equals hashing the normalized value directly.
      assert.equal(canonical, expectedKey([['username', 'alice']]));
    });

    it('only normalizes listed dimensions, leaving others verbatim', () => {
      const [byUser, byIp] = deriveKeys(
        { username: 'BOB', ip: '1.2.3.4' },
        [['username'], ['ip']],
        lower,
      );
      assert.equal(byUser.key, expectedKey([['username', 'bob']]));
      assert.equal(byIp.key, expectedKey([['ip', '1.2.3.4']]), 'ip untouched');
    });

    it('normalizes each dimension of a combination parameter independently', () => {
      const [derived] = deriveKeys(
        { username: 'CAROL', ip: '1.2.3.4' },
        [['username', 'ip']],
        { username: (v: string) => v.toLowerCase() },
      );
      assert.equal(
        derived.key,
        expectedKey([
          ['username', 'carol'],
          ['ip', '1.2.3.4'],
        ]),
      );
    });

    it('is a no-op when no normalizer is given for a dimension', () => {
      const withEmptyMap = deriveKeys({ username: 'Dave' }, [['username']], {})[0].key;
      const without = deriveKeys({ username: 'Dave' }, [['username']])[0].key;
      assert.equal(withEmptyMap, without);
    });
  });
});
