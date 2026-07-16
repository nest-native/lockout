import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { InMemoryLockoutStore } from '@authlock/core';
import { Controller, Get, UseGuards } from '@nestjs/common';
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
});
