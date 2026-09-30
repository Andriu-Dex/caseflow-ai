import { Module } from '@nestjs/common';
import { BaselinesController } from './baselines.controller';
import { BaselinesService } from './baselines.service';
import { ExportModule } from '../export/export.module';

@Module({
  imports: [ExportModule],
  controllers: [BaselinesController],
  providers: [BaselinesService],
  exports: [BaselinesService],
})
export class BaselinesModule {}
