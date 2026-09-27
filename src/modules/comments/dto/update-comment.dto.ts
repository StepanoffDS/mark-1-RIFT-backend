import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class UpdateCommentDto {
  @ApiProperty({ example: 'Updated comment' })
  @IsString()
  @Length(1, 10_000)
  content!: string;
}
