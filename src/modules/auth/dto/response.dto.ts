import { ApiProperty } from '@nestjs/swagger';

export class UserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'user@example.com' })
  email!: string;

  @ApiProperty({ example: 'alex_ivanov' })
  username!: string;
}

export class UserResponseDto {
  @ApiProperty({ type: UserDto })
  user!: UserDto;
}

export class SessionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    example: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    nullable: true,
  })
  userAgent!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  lastUsedAt!: string;

  @ApiProperty({ format: 'date-time' })
  expiresAt!: string;

  @ApiProperty()
  current!: boolean;
}

export class SessionsResponseDto {
  @ApiProperty({ type: [SessionDto] })
  sessions!: SessionDto[];
}
