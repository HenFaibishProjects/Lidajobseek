import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntelligenceOwnerGuard } from './intelligence-owner.guard';

function context(email?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user: email ? { email } : undefined }),
    }),
  } as unknown as ExecutionContext;
}

describe('IntelligenceOwnerGuard', () => {
  it('allows only the configured authenticated owner', () => {
    const config = {
      get: jest.fn().mockReturnValue('Owner@Example.com'),
    } as unknown as ConfigService;
    const guard = new IntelligenceOwnerGuard(config);

    expect(guard.canActivate(context('owner@example.com'))).toBe(true);
    expect(() => guard.canActivate(context('other@example.com'))).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(context())).toThrow(ForbiddenException);
  });

  it('fails closed when no owner is configured', () => {
    const config = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;
    const guard = new IntelligenceOwnerGuard(config);

    expect(() => guard.canActivate(context('owner@example.com'))).toThrow(
      ForbiddenException,
    );
  });
});
