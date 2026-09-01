import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const normalizeEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com', format: 'email' })
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ example: 'StrongPass@123', format: 'password' })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/, {
    message:
      'password must contain uppercase, lowercase, number, and special character',
  })
  password!: string;

  @ApiProperty({ example: 'Nguyen Van A', minLength: 1, maxLength: 100 })
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  displayName!: string;

  @ApiPropertyOptional({
    enum: ['vi', 'en'],
    example: 'vi',
    default: 'vi',
    description:
      'UI display-language preference only; does not control articles, translations, explanations, or AI output.',
  })
  @IsOptional()
  @Transform(trimString)
  @IsIn(['vi', 'en'])
  preferredLanguage?: string;
}
