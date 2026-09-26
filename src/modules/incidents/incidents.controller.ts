import { AccessTokenGuard } from '@modules/auth/guards/access-token.guard';
import { CsrfGuard } from '@modules/auth/guards/csrf.guard';
import { AuthenticatedRequest } from '@modules/auth/types';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
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

import { AssignIncidentDto } from './dto/assign-incident.dto';
import { CreateIncidentDto } from './dto/create-incident.dto';
import { ListIncidentsQueryDto } from './dto/list-incidents-query.dto';
import { IncidentResponseDto } from './dto/response.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import { IncidentsService } from './incidents.service';
import type { IncidentRow } from './types';

@ApiTags('Incidents')
@ApiCookieAuth('accessCookie')
@UseGuards(AccessTokenGuard)
@Controller('incidents')
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Get()
  @ApiOperation({ summary: 'List incidents' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: { $ref: '#/components/schemas/IncidentDto' },
        },
        page: { type: 'integer' },
        limit: { type: 'integer' },
        total: { type: 'integer' },
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Access token is missing or invalid.',
  })
  async list(@Query() query: ListIncidentsQueryDto) {
    const result = await this.incidentsService.list(query);

    return {
      ...result,
      items: result.items.map((incident) => this.present(incident)),
      page: query.page,
      limit: query.limit,
    };
  }

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
    const incident = await this.incidentsService.create(dto, request.user.sub);

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
    const incident = await this.incidentsService.update(
      id,
      dto,
      request.user.sub,
    );

    return { incident: this.present(incident) };
  }

  @Put(':id/assignee')
  @UseGuards(AccessTokenGuard, CsrfGuard)
  @ApiOperation({ summary: 'Assign a user to an incident' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiHeader({
    name: 'X-CSRF-Token',
    required: true,
    description: 'Value of the readable rift_csrf cookie.',
  })
  @ApiOkResponse({ type: IncidentResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid user or incident ID.' })
  @ApiNotFoundResponse({ description: 'Incident not found.' })
  @ApiUnauthorizedResponse({
    description: 'Access token is missing or invalid.',
  })
  @ApiForbiddenResponse({ description: 'CSRF token or Origin is invalid.' })
  async assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignIncidentDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const incident = await this.incidentsService.assign(
      id,
      dto.userId,
      request.user.sub,
    );

    return { incident: this.present(incident) };
  }

  @Delete(':id/assignee')
  @UseGuards(AccessTokenGuard, CsrfGuard)
  @ApiOperation({ summary: 'Unassign a user from an incident' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiHeader({
    name: 'X-CSRF-Token',
    required: true,
    description: 'Value of the readable rift_csrf cookie.',
  })
  @ApiOkResponse({ type: IncidentResponseDto })
  @ApiNotFoundResponse({ description: 'Incident not found.' })
  @ApiUnauthorizedResponse({
    description: 'Access token is missing or invalid.',
  })
  @ApiForbiddenResponse({ description: 'CSRF token or Origin is invalid.' })
  async unassign(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const incident = await this.incidentsService.unassign(id, request.user.sub);

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
