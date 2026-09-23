import { Module } from '@nestjs/common';
import { MockupRenderer } from './mockup-renderer';
import { MockupsController } from './mockups.controller';
import { MockupsService } from './mockups.service';

@Module({
  controllers: [MockupsController],
  providers: [MockupsService, MockupRenderer],
  exports: [MockupsService],
})
export class MockupsModule {}
