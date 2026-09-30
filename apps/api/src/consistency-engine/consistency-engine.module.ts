import { Module } from '@nestjs/common';
import { ConsistencyEngineService } from './consistency-engine.service';
import { ConsistencyEngineController } from './consistency-engine.controller';

@Module({
  imports: [],
  controllers: [ConsistencyEngineController],
  providers: [ConsistencyEngineService],
  exports: [ConsistencyEngineService],
})
export class ConsistencyEngineModule {}
