import { AccessTokenGuard } from '@modules/auth/guards/access-token.guard';
import { CsrfGuard } from '@modules/auth/guards/csrf.guard';
import { AuthenticatedRequest } from '@modules/auth/types';
import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CreateIncidentDto } from './dto/create-incident.dto';
import { IncidentResponseDto } from './dto/response.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import { IncidentsService } from './incidents.service';
import type { IncidentRow } from './types';

@ApiTags('Incidents')
@ApiCookieAuth('accessCookie')
@UseGuards(AccessTokenGuard)
@Controller('incidents')
export class IncidentsController {
  constructor(private readonly service: IncidentsService) {}

  @Post()
  @UseGuards(AccessTokenGuard, CsrfGuard)
  @ApiOperation({ summary: 'Create an incident' })
  @ApiHeader({
    name: 'X-CSRF-Token',
    required: true,
    description: 'Value of the readable rift_csrf cookie.',
  })
  @ApiCreatedResponse({ type: IncidentResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid incident data.' })
  @ApiUnauthorizedResponse({
    description: 'Access token is missing or invalid.',
  })
  @ApiForbiddenResponse({ description: 'CSRF token or Origin is invalid.' })
  async create(
    @Body() dto: CreateIncidentDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const incident = await this.service.create(dto, request.user.sub);

    return { incident: this.present(incident) };
  }

  @Patch(':id')
  @UseGuards(AccessTokenGuard, CsrfGuard)
  @ApiOperation({ summary: 'Update an incident' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiHeader({
    name: 'X-CSRF-Token',
    required: true,
    description: 'Value of the readable rift_csrf cookie.',
  })
  @ApiOkResponse({ type: IncidentResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid incident data.' })
  @ApiNotFoundResponse({ description: 'Incident not found.' })
  @ApiUnauthorizedResponse({
    description: 'Access token is missing or invalid.',
  })
  @ApiForbiddenResponse({ description: 'CSRF token or Origin is invalid.' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateIncidentDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const incident = await this.service.update(id, dto, request.user.sub);

    return { incident: this.present(incident) };
  }

  private present(incident: IncidentRow) {
    return {
      id: incident.id,
      title: incident.title,
      description: incident.description,
      status: incident.status,
      severity: incident.severity,
      createdBy: incident.created_by,
      assignedTo: incident.assigned_to,
      createdAt: incident.created_at,
      updatedAt: incident.updated_at,
      resolvedAt: incident.resolved_at,
    };
  }
}
