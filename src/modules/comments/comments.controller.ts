import { AccessTokenGuard } from '@modules/auth/guards/access-token.guard';
import { CsrfGuard } from '@modules/auth/guards/csrf.guard';
import { AuthenticatedRequest } from '@modules/auth/types';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CommentsService } from './comments.service';
import { CommentResponseDto } from './dto/comment.dto';
import { CreateCommentDto } from './dto/create-comment.dto';
import { ListCommentsQueryDto } from './dto/list-comments-query.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

@ApiTags('Comments')
@ApiCookieAuth('accessCookie')
@UseGuards(AccessTokenGuard)
@Controller('incidents/:id/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get()
  @ApiOperation({ summary: 'List comments for an incident' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: { $ref: '#/components/schemas/CommentDto' },
        },
        hasMore: { type: 'boolean' },
        nextCursor: { type: 'string', format: 'uuid', nullable: true },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Incident not found.' })
  @ApiUnauthorizedResponse({
    description: 'Access token is missing or invalid.',
  })
  list(
    @Param('id', ParseUUIDPipe) incidentId: string,
    @Query() query: ListCommentsQueryDto,
  ) {
    return this.commentsService.list(incidentId, query);
  }

  @Post()
  @UseGuards(AccessTokenGuard, CsrfGuard)
  @ApiOperation({ summary: 'Create a comment' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiCreatedResponse({ type: CommentResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid or empty comment.' })
  @ApiNotFoundResponse({ description: 'Incident not found.' })
  @ApiUnauthorizedResponse({
    description: 'Access token is missing or invalid.',
  })
  @ApiForbiddenResponse({ description: 'CSRF token or Origin is invalid.' })
  async create(
    @Param('id', ParseUUIDPipe) incidentId: string,
    @Body() dto: CreateCommentDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const comment = await this.commentsService.create(
      incidentId,
      dto,
      request.user.sub,
    );
    return { comment };
  }

  @Patch(':commentId')
  @UseGuards(AccessTokenGuard, CsrfGuard)
  @ApiOperation({ summary: 'Edit own comment' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'commentId', format: 'uuid' })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiOkResponse({ type: CommentResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid or empty comment.' })
  @ApiNotFoundResponse({ description: 'Comment not found.' })
  @ApiUnauthorizedResponse({
    description: 'Access token is missing or invalid.',
  })
  @ApiForbiddenResponse({
    description: 'Only the author can edit this comment.',
  })
  async update(
    @Param('id', ParseUUIDPipe) incidentId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Body() dto: UpdateCommentDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const comment = await this.commentsService.update(
      incidentId,
      commentId,
      dto,
      request.user.sub,
    );
    return { comment };
  }

  @Delete(':commentId')
  @UseGuards(AccessTokenGuard, CsrfGuard)
  @HttpCode(204)
  @ApiOperation({ summary: 'Soft delete own comment' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiParam({ name: 'commentId', format: 'uuid' })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiNotFoundResponse({ description: 'Comment not found.' })
  @ApiUnauthorizedResponse({
    description: 'Access token is missing or invalid.',
  })
  @ApiForbiddenResponse({
    description: 'Only the author can delete this comment.',
  })
  @ApiNoContentResponse({ description: 'Comment deleted.' })
  delete(
    @Param('id', ParseUUIDPipe) incidentId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.commentsService.delete(incidentId, commentId, request.user.sub);
  }
}
