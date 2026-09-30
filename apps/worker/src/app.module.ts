import { Module } from '@nestjs/common';
import { MockupJobsModule } from './mockup-jobs/mockup-jobs.module';
import { SourceJobsModule } from './source-jobs/source-jobs.module';

@Module({ imports: [MockupJobsModule, SourceJobsModule] })
export class AppModule {}
