-- Acceptance criteria results per validation (ADR-025).
CREATE TABLE "acceptance_results" (
    "sandbox_run_id" UUID NOT NULL,
    "criterion_key" TEXT NOT NULL,
    "use_case_code" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "acceptance_results_pkey" PRIMARY KEY ("sandbox_run_id", "criterion_key")
);
ALTER TABLE "acceptance_results" ADD CONSTRAINT "acceptance_results_sandbox_run_id_fkey" FOREIGN KEY ("sandbox_run_id") REFERENCES "sandbox_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
