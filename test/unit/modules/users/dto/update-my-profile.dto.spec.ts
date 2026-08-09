import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateMyProfileDto } from '../../../../../src/modules/users/dto/update-my-profile.dto';

const validateDto = (input: object) =>
  validate(plainToInstance(UpdateMyProfileDto, input), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

describe('UpdateMyProfileDto', () => {
  it('trims supported text fields', async () => {
    const dto = plainToInstance(UpdateMyProfileDto, {
      displayName: '  Nguyen Van A  ',
      preferredLanguage: '  vi  ',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({
      displayName: 'Nguyen Van A',
      preferredLanguage: 'vi',
    });
  });

  it('accepts valid CEFR enum for learningGoal', async () => {
    const dto = plainToInstance(UpdateMyProfileDto, {
      learningGoal: 'B2',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each([
    ['invalid CEFR level', { currentCefrLevel: 'B9' }],
    ['invalid learningGoal CEFR', { learningGoal: 'INVALID' }],
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
