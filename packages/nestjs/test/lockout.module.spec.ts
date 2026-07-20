import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { InMemoryLockoutStore } from '@authlock/core';
import { Controller, Get, Module, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import {
  LOCKOUT_MANAGER,
  LockoutGuard,
  LockoutModule,
  type LockoutModuleOptions,
  LockoutService,
} from '../index';

// The store/policy come from the core; LockoutModuleOptions is the adapter type.
function baseOptions(): LockoutModuleOptions {
  return {
    store: new InMemoryLockoutStore(),
    limit: 2,
    cooloffMs: 1000,
    parameters: [['username']],
  };
}

describe('LockoutModule.forRoot', () => {
  it('provides a LockoutService wired to the engine', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [LockoutModule.forRoot(baseOptions())],
    }).compile();

    const service = moduleRef.get(LockoutService);
    const identity = { username: 'bob' };

    assert.equal((await service.reportFailure(identity)).locked, false);
    assert.equal((await service.reportFailure(identity)).locked, true); // limit 2
    assert.equal((await service.check(identity)).locked, true);

    await service.reportSuccess(identity); // resets
    assert.equal((await service.check(identity)).locked, false);

    await moduleRef.close();
  });

  it('threads a core `normalize` option through to the manager', async () => {
    // The adapter passes options straight to LockoutManager, so a per-dimension
    // normalizer configured here must collapse case end-to-end.
    const moduleRef = await Test.createTestingModule({
      imports: [
        LockoutModule.forRoot({
          ...baseOptions(),
          normalize: { username: (v) => v.toLowerCase() },
        }),
      ],
    }).compile();

    const service = moduleRef.get(LockoutService);
    assert.equal((await service.reportFailure({ username: 'Bob' })).locked, false);
    assert.equal((await service.reportFailure({ username: 'bob' })).locked, true);
    await moduleRef.close();
  });

  it('resetAll() clears every counter through the service', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [LockoutModule.forRoot(baseOptions())],
    }).compile();
    const service = moduleRef.get(LockoutService);
    await service.reportFailure({ username: 'a' });
    await service.reportFailure({ username: 'a' }); // limit 2 → locked
    await service.reportFailure({ username: 'b' });
    await service.reportFailure({ username: 'b' });
    await service.resetAll();
    assert.equal((await service.check({ username: 'a' })).locked, false);
    assert.equal((await service.check({ username: 'b' })).locked, false);
    await moduleRef.close();
  });

  it('reset() administratively unlocks even with resetOnSuccess disabled', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        LockoutModule.forRoot({ ...baseOptions(), resetOnSuccess: false }),
      ],
    }).compile();

    const service = moduleRef.get(LockoutService);
    const identity = { username: 'carol' };
    await service.reportFailure(identity);
    assert.equal((await service.reportFailure(identity)).locked, true);

    await service.reset(identity);
    assert.equal((await service.check(identity)).locked, false);

    await moduleRef.close();
  });

  it('exposes the guard and the manager token', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [LockoutModule.forRoot(baseOptions())],
    }).compile();

    assert.ok(moduleRef.get(LockoutGuard));
    assert.ok(moduleRef.get(LOCKOUT_MANAGER));

    await moduleRef.close();
  });

  it('resolves LockoutGuard used via @UseGuards from a consuming module', async () => {
    // Regression: the guard depends on the options token, so that token must be
    // EXPORTED — otherwise instantiating the guard for a controller in another
    // module fails DI at bootstrap ("… is available in the AppModule module").
    @Controller('protected')
    class ProtectedController {
      @Get()
      @UseGuards(LockoutGuard)
      handler(): string {
        return 'ok';
      }
    }

    const moduleRef = await Test.createTestingModule({
      imports: [LockoutModule.forRoot(baseOptions())],
      controllers: [ProtectedController],
    }).compile();

    const app = moduleRef.createNestApplication();
    await app.init(); // throws here if the guard's deps don't resolve
    await app.close();
  });
});

describe('LockoutModule.forRootAsync', () => {
  it('builds the engine from a factory', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        LockoutModule.forRootAsync({ useFactory: () => baseOptions() }),
      ],
    }).compile();

    const service = moduleRef.get(LockoutService);
    assert.equal((await service.reportFailure({ username: 'x' })).locked, false);
    assert.equal((await service.reportFailure({ username: 'x' })).locked, true);

    await moduleRef.close();
  });

  it('accepts a factory with a TYPED injected parameter', async () => {
    // Regression: a factory declared with a typed param (the common case when
    // injecting a typed dependency, e.g. a Drizzle handle) must assign to
    // useFactory without widening to `unknown`. This test only COMPILES if
    // useFactory is `(...args: any[])` — like NestJS's own FactoryProvider.
    const STORE = 'STORE_TOKEN';

    @Module({
      providers: [{ provide: STORE, useValue: new InMemoryLockoutStore() }],
      exports: [STORE],
    })
    class StoreModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [
        LockoutModule.forRootAsync({
          imports: [StoreModule],
          inject: [STORE],
          useFactory: (store: InMemoryLockoutStore): LockoutModuleOptions => ({
            store,
            limit: 2,
            cooloffMs: 1000,
            parameters: [['username']],
          }),
        }),
      ],
    }).compile();

    const service = moduleRef.get(LockoutService);
    await service.reportFailure({ username: 'y' });
    assert.equal((await service.reportFailure({ username: 'y' })).locked, true);

    await moduleRef.close();
  });
});
