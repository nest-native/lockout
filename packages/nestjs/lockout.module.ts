import { LockoutManager } from '@authlock/core';
import { type DynamicModule, Module, type Provider } from '@nestjs/common';

import { LockoutGuard } from './lockout.guard';
import { LockoutService } from './lockout.service';
import type {
  LockoutModuleAsyncOptions,
  LockoutModuleOptions,
} from './interfaces';
import { LOCKOUT_MANAGER, LOCKOUT_OPTIONS } from './tokens';

/**
 * Wires the `@authlock/core` engine into NestJS DI. Register it once with your
 * store + policy, then use {@link LockoutGuard} (reject-if-locked) and
 * {@link LockoutService} (report the auth outcome) in your login flow.
 *
 * ```ts
 * LockoutModule.forRoot({
 *   store: new InMemoryLockoutStore(),
 *   limit: 5,
 *   cooloffMs: 15 * 60_000,
 *   parameters: [['username'], ['ip']],
 * });
 * ```
 */
@Module({})
export class LockoutModule {
  static forRoot(options: LockoutModuleOptions): DynamicModule {
    const providers: Provider[] = [
      { provide: LOCKOUT_OPTIONS, useValue: options },
      {
        provide: LOCKOUT_MANAGER,
        useFactory: () => new LockoutManager(options),
      },
      LockoutService,
      LockoutGuard,
    ];
    return {
      module: LockoutModule,
      global: options.isGlobal ?? true,
      providers,
      exports: [LockoutService, LockoutGuard, LOCKOUT_MANAGER],
    };
  }

  static forRootAsync(options: LockoutModuleAsyncOptions): DynamicModule {
    const providers: Provider[] = [
      {
        provide: LOCKOUT_OPTIONS,
        useFactory: options.useFactory,
        inject: options.inject ?? [],
      },
      {
        provide: LOCKOUT_MANAGER,
        useFactory: (resolved: LockoutModuleOptions) =>
          new LockoutManager(resolved),
        inject: [LOCKOUT_OPTIONS],
      },
      LockoutService,
      LockoutGuard,
    ];
    return {
      module: LockoutModule,
      global: options.isGlobal ?? true,
      imports: options.imports ?? [],
      providers,
      exports: [LockoutService, LockoutGuard, LOCKOUT_MANAGER],
    };
  }
}
