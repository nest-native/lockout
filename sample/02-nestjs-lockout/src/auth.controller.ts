import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { LockoutGuard, LockoutService } from '@nest-native/lockout';
import type { Request } from 'express';

// The one demo credential — a real app verifies a password hash here.
export const DEMO_PASSWORD = 'correct horse battery staple';

interface LoginDto {
  username?: string;
  password?: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly lockout: LockoutService) {}

  // LockoutGuard runs FIRST: a locked identity is rejected with 429 +
  // Retry-After before we ever look at the credential. The handler then reports
  // the outcome, because NestJS won't tell the engine about it.
  @Post('login')
  @HttpCode(HttpStatus.OK) // a login success is 200, not Nest's default 201
  @UseGuards(LockoutGuard)
  async login(@Body() body: LoginDto, @Req() request: Request) {
    const identity = { username: body.username, ip: request.ip };

    if (body.password !== DEMO_PASSWORD) {
      await this.lockout.reportFailure(identity);
      throw new UnauthorizedException('invalid_credentials');
    }

    await this.lockout.reportSuccess(identity);
    return { ok: true };
  }
}
