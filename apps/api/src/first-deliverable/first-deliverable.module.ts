import { Module } from '@nestjs/common';
import { FirstDeliverableSnapshotService } from './first-deliverable-snapshot.service';

@Module({
  providers: [FirstDeliverableSnapshotService],
  exports: [FirstDeliverableSnapshotService],
})
export class FirstDeliverableModule {}
