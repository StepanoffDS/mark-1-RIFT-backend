import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { IncidentSeverity, IncidentStatus } from '../types';

export class ListIncidentsQueryDto {
  @ApiPropertyOptional({ enum: IncidentStatus })
  @IsOptional()
  @IsEnum(IncidentStatus)
  status?: IncidentStatus;

  @ApiPropertyOptional({ enum: IncidentSeverity })
  @IsOptional()
  @IsEnum(IncidentSeverity)
  severity?: IncidentSeverity;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}
