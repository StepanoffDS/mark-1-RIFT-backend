import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignIncidentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;
}
