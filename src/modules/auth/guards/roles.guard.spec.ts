import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

const executionContext = (role: 'ADMIN' | 'USER'): ExecutionContext =>
  ({
    getHandler: () => RolesGuard,
    getClass: () => RolesGuard,
    switchToHttp: () => ({
      getRequest: () => ({ user: { role } }),
    }),
  }) as ExecutionContext;

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RolesGuard, Reflector],
    }).compile();

    guard = module.get(RolesGuard);
    reflector = module.get(Reflector);
  });

  it('allows an ADMIN for ADMIN metadata', () => {
    const getRoles = jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['ADMIN']);

    expect(guard.canActivate(executionContext('ADMIN'))).toBe(true);
    expect(getRoles).toHaveBeenCalledWith(ROLES_KEY, expect.any(Array));
  });

  it('rejects a normal USER for ADMIN metadata', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['ADMIN']);

    expect(() => guard.canActivate(executionContext('USER'))).toThrow(
      ForbiddenException,
    );
  });
});
