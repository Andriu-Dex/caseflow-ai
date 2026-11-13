-- Processes running a generation or validation refresh this, so another
-- process starting up only marks abandoned jobs as interrupted.
ALTER TABLE "generation_runs" ADD COLUMN "heartbeat_at" TIMESTAMPTZ(6);
ALTER TABLE "sandbox_runs" ADD COLUMN "heartbeat_at" TIMESTAMPTZ(6);
