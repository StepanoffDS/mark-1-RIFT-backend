import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CommentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  incidentId!: string;

  @ApiProperty({ format: 'uuid' })
  authorId!: string;

  @ApiProperty()
  content!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  updatedAt!: Date | null;
}

export class CommentResponseDto {
  @ApiProperty({ type: CommentDto })
  comment!: CommentDto;
}
