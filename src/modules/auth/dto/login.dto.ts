import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({
    example: 'SecurePassword123!',
    format: 'password',
    maxLength: 128,
  })
  @IsString()
  @MaxLength(128)
  password!: string;
}
