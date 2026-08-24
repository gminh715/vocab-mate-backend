import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaModule } from '../../../src/database/prisma.module';
import { PrismaService } from '../../../src/database/prisma.service';

describe('PrismaService lifecycle', () => {
  let app: INestApplication;
  let appClosed: boolean;
  const connect = jest.fn();
  const disconnect = jest.fn();

  beforeEach(async () => {
    appClosed = false;
    connect.mockReset();
    disconnect.mockReset();
    connect.mockResolvedValue(undefined);
    disconnect.mockResolvedValue(undefined);

    const prisma = Object.create(PrismaService.prototype) as PrismaService;
    Object.defineProperties(prisma, {
      $connect: { value: connect },
      $disconnect: { value: disconnect },
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [PrismaModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleFixture.createNestApplication();
    app.enableShutdownHooks();
    await app.init();
  });

  afterEach(async () => {
    if (!appClosed) {
      await app.close();
    }
  });

  it('connects at startup and disconnects cleanly during shutdown', () => {
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('executes Prisma disconnect without errors when the application closes', async () => {
    await expect(app.close()).resolves.toBeUndefined();
    appClosed = true;

    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
