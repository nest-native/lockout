import { InMemoryLockoutStore } from '@authlock/core';
import { LockoutModule } from '@nest-native/lockout';
import { Module, type Type } from '@nestjs/common';

import { AuthController } from './auth.controller';

/**
 * Build the application module. `now` is injectable so the smoke test can drive
 * the cooloff deterministically; a real app just omits it and uses the wall
 * clock. In production you would pass a Drizzle store instead of the in-memory
 * one so the counters are shared across instances.
 */
export function createAppModule(now: () => number = () => Date.now()): Type {
  @Module({
    imports: [
      LockoutModule.forRoot({
        store: new InMemoryLockoutStore(),
        limit: 3,
        cooloffMs: 15 * 60_000,
        parameters: [['username'], ['ip']],
        now,
      }),
    ],
    controllers: [AuthController],
  })
  class AppModule {}

  return AppModule;
}
