import { ApiProperty } from '@nestjs/swagger';
import { CefrLevel } from '../../../../generated/prisma/enums';
import { PublicUserDto } from '../../auth/dto/auth-response.dto';

export class MyProfileDto {
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

  @ApiProperty({ example: 'Learn 10 words per day', nullable: true })
  learningGoal!: string | null;

  @ApiProperty({ example: 'vi' })
  preferredLanguage!: string;
}

export class MyAccountDto extends PublicUserDto {
  @ApiProperty({ type: MyProfileDto })
  profile!: MyProfileDto;
}

export class MyAccountSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: MyAccountDto })
  data!: MyAccountDto;
}

export class UpdateMyProfileDataDto {
  @ApiProperty({ type: PublicUserDto })
  user!: PublicUserDto;

  @ApiProperty({ type: MyProfileDto })
  profile!: MyProfileDto;
}

export class UpdateMyProfileSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: UpdateMyProfileDataDto })
  data!: UpdateMyProfileDataDto;
}
