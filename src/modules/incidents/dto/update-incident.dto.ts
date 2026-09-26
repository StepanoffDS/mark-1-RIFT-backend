import { OmitType, PartialType } from '@nestjs/mapped-types';

import { CreateIncidentDto } from './create-incident.dto';

export class UpdateIncidentDto extends PartialType(
  OmitType(CreateIncidentDto, ['assignedTo'] as const),
) {}
