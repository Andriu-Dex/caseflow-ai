import { Module } from '@nestjs/common';
import { StalenessController } from './staleness.controller';
import { StalenessService } from './staleness.service';

@Module({
  controllers: [StalenessController],
  providers: [StalenessService],
  exports: [StalenessService],
})
export class StalenessModule {}
