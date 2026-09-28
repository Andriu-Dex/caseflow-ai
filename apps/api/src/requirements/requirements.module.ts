import { Module } from '@nestjs/common';
import { AIModule } from '../ai/ai.module';
import { RequirementsController } from './requirements.controller';
import { RequirementsService } from './requirements.service';
import { RequirementDocumentExportService } from './requirement-document-export.service';
@Module({
  imports: [AIModule],
  controllers: [RequirementsController],
  providers: [RequirementsService, RequirementDocumentExportService],
  exports: [RequirementsService],
})
export class RequirementsModule {}
