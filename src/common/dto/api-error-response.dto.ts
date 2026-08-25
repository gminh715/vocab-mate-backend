import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
