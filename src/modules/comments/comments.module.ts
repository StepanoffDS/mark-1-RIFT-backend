import { DatabaseModule } from '@infrastructure/database/database.module';
import { AuthModule } from '@modules/auth/auth.module';
import { AccessTokenGuard } from '@modules/auth/guards/access-token.guard';
import { CsrfGuard } from '@modules/auth/guards/csrf.guard';
import { Module } from '@nestjs/common';

import { CommentsController } from './comments.controller';
import { CommentsGateway } from './comments.gateway';
import { CommentsRepository } from './comments.repository';
import { CommentsService } from './comments.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [CommentsController],
  providers: [
    AccessTokenGuard,
    CsrfGuard,
    CommentsGateway,
    CommentsRepository,
    CommentsService,
  ],
})
export class CommentsModule {}
