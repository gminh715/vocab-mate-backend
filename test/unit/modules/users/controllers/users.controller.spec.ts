import { Test, TestingModule } from '@nestjs/testing';
import type { AuthenticatedUser } from '../../../../../src/modules/auth/auth.types';
import { UsersService } from '../../../../../src/modules/users/users.service';
import { UsersController } from '../../../../../src/modules/users/controllers/users.controller';

describe('UsersController', () => {
  it('uses only the authenticated identity for self-service operations', async () => {
    const usersService = {
      getMe: jest.fn(),
      updateMe: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    }).compile();
    const controller = module.get(UsersController);
    const user: AuthenticatedUser = {
      id: 'authenticated-user-id',
      email: 'user@example.com',
      role: 'USER',
      status: 'ACTIVE',
    };

    await controller.getMe(user);
    await controller.updateMe(user, { displayName: 'Updated Name' });

    expect(usersService.getMe).toHaveBeenCalledWith('authenticated-user-id');
    expect(usersService.updateMe).toHaveBeenCalledWith(
      'authenticated-user-id',
      { displayName: 'Updated Name' },
    );
  });
});
