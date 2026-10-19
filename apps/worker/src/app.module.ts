import { Module } from '@nestjs/common';
import { ConstructionJobsModule } from './construction-jobs/construction-jobs.module';
import { MockupJobsModule } from './mockup-jobs/mockup-jobs.module';
import { SourceJobsModule } from './source-jobs/source-jobs.module';

@Module({ imports: [MockupJobsModule, SourceJobsModule, ConstructionJobsModule] })
export class AppModule {}
