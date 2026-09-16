import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';

import { DatabaseService } from './infrastructure/database/database.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly databaseService: DatabaseService) {}

  @Get()
  @ApiOperation({ summary: 'Check database connectivity' })
  @ApiOkResponse({
    schema: { example: { database: 'ok' } },
  })
  @ApiServiceUnavailableResponse({ description: 'Database connection failed.' })
  async checkHealth() {
    try {
      await this.databaseService.query('SELECT 1');
      return { database: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Database connection failed');
    }
  }
}
