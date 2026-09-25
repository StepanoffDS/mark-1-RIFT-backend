import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';

import { IncidentSeverity } from '../types';

export class CreateIncidentDto {
  @ApiProperty({ example: 'Payment processing unavailable' })
  @IsString()
  @Length(1, 255)
  title!: string;

  @ApiPropertyOptional({
    example: 'Payments started failing...',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  description?: string | null;

  @ApiProperty({ enum: IncidentSeverity, example: IncidentSeverity.P1 })
  @IsEnum(IncidentSeverity)
  severity!: IncidentSeverity;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  assignedTo?: string | null;
}
