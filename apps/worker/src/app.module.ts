import { Module } from '@nestjs/common';
import { MockupJobsModule } from './mockup-jobs/mockup-jobs.module';

@Module({ imports: [MockupJobsModule] })
export class AppModule {}
