import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

describe('UsersService', () => {
  it('maps Prisma unique-constraint errors to ConflictException', async () => {
    const repository = {
      createWithProfile: jest
        .fn()
        .mockRejectedValue(
          Object.assign(new Error('duplicate'), { code: 'P2002' }),
        ),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: UsersRepository, useValue: repository },
      ],
    }).compile();

    await expect(
      module.get(UsersService).createRegisteredUser({
        email: 'user@example.com',
        passwordHash: 'hash',
        displayName: 'User',
        currentCefrLevel: 'B1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
