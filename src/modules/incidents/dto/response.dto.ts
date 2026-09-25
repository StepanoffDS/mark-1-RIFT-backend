import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { IncidentSeverity, IncidentStatus } from '../types';

export class IncidentDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty({ enum: IncidentStatus })
  status!: IncidentStatus;

  @ApiProperty({ enum: IncidentSeverity })
  severity!: IncidentSeverity;

  @ApiProperty({ format: 'uuid' })
  createdBy!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  assignedTo!: string | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;

  @ApiPropertyOptional({ format: 'date-time', nullable: true })
  resolvedAt!: Date | null;
}

export class IncidentResponseDto {
  @ApiProperty({ type: IncidentDto })
  incident!: IncidentDto;
}
