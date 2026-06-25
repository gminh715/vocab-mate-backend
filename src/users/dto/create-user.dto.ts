import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  EnglishLevel,
  LearningGoal,
  SubscriptionTier,
} from '../../common/enums';

export class CreateUserDto {
  @IsEmail({}, { message: 'A valid email address is required' })
  @IsNotEmpty({ message: 'Email must not be empty' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'Password must not be empty' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(72, { message: 'Password must not exceed 72 characters' })
  password: string;

  @IsString()
  @IsNotEmpty({ message: 'Name must not be empty' })
  @MaxLength(100)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  name: string;

  @IsOptional()
  @IsEnum(SubscriptionTier, {
    message: `subscriptionTier must be one of: ${Object.values(SubscriptionTier).join(', ')}`,
  })
  subscriptionTier?: SubscriptionTier;

  @IsEnum(LearningGoal, {
    message: `learningGoal must be one of: ${Object.values(LearningGoal).join(', ')}`,
  })
  learningGoal: LearningGoal;

  @IsEnum(EnglishLevel, {
    message: `englishLevel must be one of: ${Object.values(EnglishLevel).join(', ')}`,
  })
  englishLevel: EnglishLevel;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20, { message: 'You can select at most 20 interests' })
  @IsString({ each: true, message: 'Each interest must be a string' })
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? value
          .filter((v): v is string => typeof v === 'string')
          .map((v) => v.trim().toLowerCase())
          .filter((v) => v.length > 0)
      : value,
  )
  interests?: string[];
}
