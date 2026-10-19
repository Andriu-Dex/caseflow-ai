-- EXPRESS route (DEC-116, DEC-119): a run pauses for the bulk human review.
ALTER TYPE "workflow_run_status" ADD VALUE 'AWAITING_REVIEW' BEFORE 'COMPLETED';
