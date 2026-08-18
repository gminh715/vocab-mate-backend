import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole, UserStatus } from '../../../../generated/prisma/enums';

export class PublicUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'email', example: 'user@example.com' })
  email!: string;

  @ApiProperty({ enum: UserRole, example: UserRole.USER })
  role!: UserRole;

  @ApiProperty({ enum: UserStatus, example: UserStatus.ACTIVE })
  status!: UserStatus;
}

export class AuthDataDto {
  @ApiProperty({ type: PublicUserDto })
  user!: PublicUserDto;

  @ApiProperty({ example: '<jwt-access-token>' })
  accessToken!: string;
}

export class AuthSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: AuthDataDto })
  data!: AuthDataDto;
}

export class RegistrationDataDto {
  @ApiProperty({ type: PublicUserDto })
  user!: PublicUserDto;
}

export class RegistrationSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: RegistrationDataDto })
  data!: RegistrationDataDto;
}

export class AccessTokenDataDto {
  @ApiProperty({ example: '<jwt-access-token>' })
  accessToken!: string;
}

export class AccessTokenSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: AccessTokenDataDto })
  data!: AccessTokenDataDto;
}

export class MessageDataDto {
  @ApiProperty({ example: 'Operation completed successfully.' })
  message!: string;
}

export class MessageSuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ type: MessageDataDto })
  data!: MessageDataDto;
}

export class ErrorDataDto {
  @ApiProperty({ example: 'UNAUTHORIZED' })
  code!: string;

  @ApiProperty({ example: 'Invalid email or password' })
  message!: string;

  @ApiPropertyOptional({ type: [String] })
  details?: string[];
}

export class ApiErrorResponseDto {
  @ApiProperty({ example: false })
  success!: false;

  @ApiProperty({ type: ErrorDataDto })
  error!: ErrorDataDto;
}
