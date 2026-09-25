import { DatabaseModule } from '@infrastructure/database/database.module';
import { AuthModule } from '@modules/auth/auth.module';
import { IncidentsModule } from '@modules/incidents/incidents.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

import { HealthController } from './health.controller';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: process.env.NODE_ENV === 'test' ? '.env.test' : '.env',
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),
    DatabaseModule,
    AuthModule,
    IncidentsModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
