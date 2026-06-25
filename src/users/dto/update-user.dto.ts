import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';

/**
 * Fields a learner may edit on their own profile.
 *
 * `email` and `password` are intentionally omitted — they are not editable
 * through profile management (changing them requires dedicated, security-aware
 * flows). Every remaining field is optional via `PartialType`.
 */
export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['email', 'password'] as const),
) {}
