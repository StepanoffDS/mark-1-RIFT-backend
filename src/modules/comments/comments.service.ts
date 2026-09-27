import { DatabaseService } from '@infrastructure/database/database.service';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { CommentsGateway } from './comments.gateway';
import { CommentsRepository } from './comments.repository';
import { CreateCommentDto } from './dto/create-comment.dto';
import { ListCommentsQueryDto } from './dto/list-comments-query.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { presentComment } from './types';

@Injectable()
export class CommentsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly commentsRepository: CommentsRepository,
    private readonly commentsGateway: CommentsGateway,
  ) {}

  async list(incidentId: string, query: ListCommentsQueryDto) {
    if (!(await this.commentsRepository.incidentExists(incidentId))) {
      throw new NotFoundException('Incident not found');
    }

    const rows = await this.commentsRepository.list(
      incidentId,
      query.cursor,
      query.limit,
    );
    const hasMore = rows.length > query.limit;
    const items = rows.slice(0, query.limit).map(presentComment);

    return {
      items,
      hasMore,
      nextCursor: hasMore ? items.at(-1)?.id : null,
    };
  }

  async create(incidentId: string, dto: CreateCommentDto, authorId: string) {
    const content = this.normalizeContent(dto.content);
    const row = await this.databaseService.transaction(async (client) => {
      if (!(await this.commentsRepository.incidentExists(incidentId, client))) {
        throw new NotFoundException('Incident not found');
      }
      return this.commentsRepository.create(
        client,
        incidentId,
        authorId,
        content,
      );
    });
    const comment = presentComment(row);
    this.commentsGateway.emitCreated(incidentId, comment);
    return comment;
  }

  async update(
    incidentId: string,
    commentId: string,
    dto: UpdateCommentDto,
    actorId: string,
  ) {
    const content = this.normalizeContent(dto.content);
    const row = await this.databaseService.transaction(async (client) => {
      const existing = await this.commentsRepository.findById(
        client,
        incidentId,
        commentId,
      );
      this.assertCanModify(existing, actorId);
      return this.commentsRepository.update(client, commentId, content);
    });
    if (!row) throw new NotFoundException('Comment not found');

    const comment = presentComment(row);
    this.commentsGateway.emitUpdated(incidentId, comment);
    return comment;
  }

  async delete(incidentId: string, commentId: string, actorId: string) {
    const row = await this.databaseService.transaction(async (client) => {
      const existing = await this.commentsRepository.findById(
        client,
        incidentId,
        commentId,
      );
      this.assertCanModify(existing, actorId);
      return this.commentsRepository.softDelete(client, commentId);
    });
    if (!row) throw new NotFoundException('Comment not found');

    this.commentsGateway.emitDeleted(incidentId, commentId);
  }

  private normalizeContent(content: string) {
    const normalized = content.trim();
    if (!normalized) throw new BadRequestException('Comment cannot be empty');
    return normalized;
  }

  private assertCanModify(
    comment: Awaited<ReturnType<CommentsRepository['findById']>>,
    actorId: string,
  ) {
    if (!comment || comment.deleted_at) {
      throw new NotFoundException('Comment not found');
    }
    if (comment.author_id !== actorId) {
      throw new ForbiddenException('Only the author can modify this comment');
    }
  }
}
