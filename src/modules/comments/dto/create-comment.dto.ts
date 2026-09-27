import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({ example: 'Database connections appear to be exhausted.' })
  @IsString()
  @Length(1, 10_000)
  content!: string;
}
