import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import {
  InMemoryLockoutStore,
  LockoutManager,
  type FailureRecord,
  type LockoutStore,
} from '@authlock/core';
import type { ExecutionContext, HttpException } from '@nestjs/common';

import { LockoutGuard } from '../lockout.guard';
import { LockoutService } from '../lockout.service';
import type { LockoutModuleOptions } from '../interfaces';

function mockContext(request: unknown, response: unknown = {}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

function build(overrides: Partial<LockoutModuleOptions> = {}) {
  const options: LockoutModuleOptions = {
    store: new InMemoryLockoutStore(),
    limit: 2,
    cooloffMs: 1000,
    parameters: [['username']],
    ...overrides,
  };
  const manager = new LockoutManager(options);
  const service = new LockoutService(manager);
  const guard = new LockoutGuard(service, options);
  return { guard, service, options };
}

const throwingStore: LockoutStore = {
  increment(): FailureRecord {
    throw new Error('store down');
  },
  get(): FailureRecord | null {
    throw new Error('store down');
  },
  clear(): void {
    throw new Error('store down');
  },
  clearAll(): void {
    throw new Error('store down');
  },
  clearExpired(): number {
    throw new Error('store down');
  },
};

describe('LockoutGuard', () => {
  it('allows a non-locked identity', async () => {
    const { guard } = build();
    const context = mockContext({ body: { username: 'a' }, ip: '1', headers: {} });
    assert.equal(await guard.canActivate(context), true);
  });

  it('rejects a locked identity with 429 and a Retry-After header', async () => {
    const { guard, service } = build();
    await service.reportFailure({ username: 'a' });
    await service.reportFailure({ username: 'a' }); // trips the limit of 2

    const headers: Record<string, unknown> = {};
    const response = {
      setHeader: (name: string, value: unknown) => {
        headers[name] = value;
      },
    };
    const context = mockContext(
      { body: { username: 'a' }, ip: '1', headers: {} },
      response,
    );

    await assert.rejects(
      () => guard.canActivate(context),
      (error: HttpException) => {
        assert.equal(error.getStatus(), 429);
        return true;
      },
    );
    assert.equal(headers['Retry-After'], 1); // ceil(1000ms / 1000)
  });

  it('sets Retry-After via a Fastify-style header() too', async () => {
    const { guard, service } = build();
    await service.reportFailure({ username: 'a' });
    await service.reportFailure({ username: 'a' });

    const headers: Record<string, unknown> = {};
    const response = {
      header: (name: string, value: unknown) => {
        headers[name] = value;
      },
    };
    const context = mockContext(
      { body: { username: 'a' }, ip: '1', headers: {} },
      response,
    );

    await assert.rejects(() => guard.canActivate(context));
    assert.equal(headers['Retry-After'], 1);
  });

  it('uses a custom extractor', async () => {
    let called = false;
    const { guard } = build({
      extractor: () => {
        called = true;
        return { username: 'from-extractor' };
      },
    });
    await guard.canActivate(mockContext({}, {}));
    assert.equal(called, true);
  });

  it('denies on a store error when failMode is closed', async () => {
    const { guard } = build({ store: throwingStore, failMode: 'closed' });
    const context = mockContext({ body: { username: 'a' }, ip: '1', headers: {} });
    await assert.rejects(
      () => guard.canActivate(context),
      (error: HttpException) => {
        assert.equal(error.getStatus(), 429);
        return true;
      },
    );
  });

  it('allows on a store error when failMode is open (default)', async () => {
    const { guard } = build({ store: throwingStore });
    const context = mockContext({ body: { username: 'a' }, ip: '1', headers: {} });
    assert.equal(await guard.canActivate(context), true);
  });
});
