import { DatabaseModule } from '@infrastructure/database/database.module';
import { AuthModule } from '@modules/auth/auth.module';
import { AccessTokenGuard } from '@modules/auth/guards/access-token.guard';
import { CsrfGuard } from '@modules/auth/guards/csrf.guard';
import { Module } from '@nestjs/common';

import { IncidentsController } from './incidents.controller';
import { IncidentsRepository } from './incidents.repository';
import { IncidentsService } from './incidents.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [IncidentsController],
  providers: [
    IncidentsRepository,
    IncidentsService,
    AccessTokenGuard,
    CsrfGuard,
  ],
})
export class IncidentsModule {}
