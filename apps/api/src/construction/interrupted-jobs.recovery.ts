import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { UserManualsService } from '../user-manuals/user-manuals.service';
import { MockupsService } from '../mockups/mockups.service';
import { GenerationRunsService } from './generation-runs.service';
import { SandboxRunsService } from './sandbox-runs.service';
import { WorkflowRunsService } from './workflow-runs.service';
import { DeploymentsService } from './deployments.service';
import { HEARTBEAT_INTERVAL_MS, HEARTBEAT_STALE_MS } from '../common/interrupted';

const logger = new Logger('InterruptedJobsRecovery');

// Jobs run inside this API process, so on startup anything still marked as
// running was cut off by a restart (sources recover themselves, see
// SourcesService). What is safe to repeat resumes; what has a cost or leaves
// audited history is marked as interrupted for the person to retry.
// ponytail: assumes one API process; with several, a booting one would also
// mark jobs another instance is still running.
@Injectable()
export class InterruptedJobsRecovery implements OnApplicationBootstrap {
  constructor(
    private readonly mockups: MockupsService,
    private readonly generationRuns: GenerationRunsService,
    private readonly sandboxRuns: SandboxRunsService,
    private readonly workflowRuns: WorkflowRunsService,
    private readonly userManuals: UserManualsService,
    private readonly deployments: DeploymentsService,
  ) {}

  async onApplicationBootstrap() {
    const bootedAt = new Date();
    // Order matters: a resumed workflow must find its interrupted generation
    // or mockup already marked, so it retries that stage instead of waiting.
    const steps: [string, () => Promise<number>][] = [
      ['mockup job', () => this.mockups.markInterrupted(bootedAt)],
      ['queued mockup job', () => this.mockups.requeuePending()],
      ['generation run', () => this.generationRuns.markInterrupted(bootedAt)],
      ['sandbox run', () => this.sandboxRuns.markInterrupted(bootedAt)],
      ['deployment', () => this.deployments.markInterrupted(bootedAt)],
      ['user manual job', () => this.userManuals.recover(bootedAt)],
      ['workflow run', () => this.workflowRuns.resumeInterrupted(bootedAt)],
    ];
    // A job started just before this boot may still have a fresh heartbeat
    // from a process that already died; look again once it would be stale.
    const recheck = setTimeout(() => {
      const now = new Date();
      void Promise.all([
        this.generationRuns.markInterrupted(now),
        this.sandboxRuns.markInterrupted(now),
      ]).catch(() => undefined);
    }, HEARTBEAT_STALE_MS + HEARTBEAT_INTERVAL_MS);
    recheck.unref?.();
    for (const [label, step] of steps) {
      try {
        const count = await step();
        if (count) logger.warn(`Recovered ${count} interrupted ${label}(s).`);
      } catch (error) {
        logger.warn(
          `Could not recover interrupted ${label}s: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }
  }
}
