import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateMyProfileDto } from './update-my-profile.dto';

const validateDto = (input: object) =>
  validate(plainToInstance(UpdateMyProfileDto, input), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

describe('UpdateMyProfileDto', () => {
  it('trims supported text fields', async () => {
    const dto = plainToInstance(UpdateMyProfileDto, {
      displayName: '  Nguyen Van A  ',
      learningGoal: '  Learn daily  ',
      preferredLanguage: '  vi  ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({
      displayName: 'Nguyen Van A',
      learningGoal: 'Learn daily',
      preferredLanguage: 'vi',
    });
  });

  it.each([
    ['invalid CEFR level', { currentCefrLevel: 'B9' }],
    ['blank display name', { displayName: '   ' }],
    ['invalid avatar URL', { avatarUrl: 'not-a-url' }],
    ['explicit null', { learningGoal: null }],
    ['account field', { email: 'other@example.com' }],
    ['authorization field', { role: 'ADMIN' }],
    ['status field', { status: 'DISABLED' }],
  ])('rejects %s', async (_case, input) => {
    await expect(validateDto(input)).resolves.not.toHaveLength(0);
  });
});
