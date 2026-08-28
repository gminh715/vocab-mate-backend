import { ApiProperty } from '@nestjs/swagger';
import { CefrLevel } from '../../../../generated/prisma/enums';
import { PublicUserDto } from '../../auth/dto/auth-response.dto';

export class MyAccountDto extends PublicUserDto {
  @ApiProperty({ example: 'Nguyen Van A' })
  displayName!: string;

  @ApiProperty({
    example: 'https://example.com/avatar.png',
    format: 'uri',
    nullable: true,
  })
  avatarUrl!: string | null;

  @ApiProperty({ enum: CefrLevel, example: CefrLevel.B1 })
  currentCefrLevel!: CefrLevel;

  @ApiProperty({
    example: 'Learn 10 useful words each day',
    nullable: true,
  })
  learningGoal!: string | null;

  @ApiProperty({
    example: 'vi',
    description:
      'UI display-language preference only; does not control articles, translations, explanations, or AI output.',
  })
  preferredLanguage!: string;
}

export class MyAccountSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: MyAccountDto })
  data!: MyAccountDto;
}

export class UpdateMyProfileSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: MyAccountDto })
  data!: MyAccountDto;
}
