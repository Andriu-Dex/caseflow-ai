-- Construction by deliveries (ADR-024): a plan of deliveries per approved
-- implementation plan version, the modules of each delivery, append-only
-- approvals, and the delivery a generation run builds.
CREATE TABLE "delivery_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "implementation_plan_version_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "delivery_plans_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "delivery_plans_implementation_plan_version_id_key" ON "delivery_plans"("implementation_plan_version_id");
CREATE INDEX "delivery_plans_project_id_created_at_idx" ON "delivery_plans"("project_id", "created_at");
ALTER TABLE "delivery_plans" ADD CONSTRAINT "delivery_plans_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_plans" ADD CONSTRAINT "delivery_plans_implementation_plan_version_id_fkey" FOREIGN KEY ("implementation_plan_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_plans" ADD CONSTRAINT "delivery_plans_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "delivery_plan_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "deliveries_position_check" CHECK ("position" >= 0)
);
CREATE UNIQUE INDEX "deliveries_delivery_plan_id_position_key" ON "deliveries"("delivery_plan_id", "position");
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_delivery_plan_id_fkey" FOREIGN KEY ("delivery_plan_id") REFERENCES "delivery_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "delivery_modules" (
    "delivery_plan_id" UUID NOT NULL,
    "delivery_id" UUID NOT NULL,
    "module_local_id" TEXT NOT NULL,
    CONSTRAINT "delivery_modules_pkey" PRIMARY KEY ("delivery_plan_id", "module_local_id")
);
CREATE INDEX "delivery_modules_delivery_id_idx" ON "delivery_modules"("delivery_id");
ALTER TABLE "delivery_modules" ADD CONSTRAINT "delivery_modules_delivery_plan_id_fkey" FOREIGN KEY ("delivery_plan_id") REFERENCES "delivery_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_modules" ADD CONSTRAINT "delivery_modules_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "delivery_approvals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "delivery_id" UUID NOT NULL,
    "generation_run_id" UUID NOT NULL,
    "approved_by_user_id" UUID NOT NULL,
    "note" TEXT,
    "approved_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "delivery_approvals_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "delivery_approvals_delivery_id_approved_at_idx" ON "delivery_approvals"("delivery_id", "approved_at");
ALTER TABLE "delivery_approvals" ADD CONSTRAINT "delivery_approvals_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_approvals" ADD CONSTRAINT "delivery_approvals_generation_run_id_fkey" FOREIGN KEY ("generation_run_id") REFERENCES "generation_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "delivery_approvals" ADD CONSTRAINT "delivery_approvals_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- An approval is history: it is never changed, and removed only when the
-- whole project is deleted (DEC-134).
CREATE FUNCTION "delivery_approvals_append_only"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' AND current_setting('caseflow.project_purge', true) = 'on' THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'delivery approvals are append-only' USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "delivery_approvals_append_only"
    BEFORE UPDATE OR DELETE ON "delivery_approvals"
    FOR EACH ROW EXECUTE FUNCTION "delivery_approvals_append_only"();

ALTER TABLE "generation_runs" ADD COLUMN "delivery_id" UUID;
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
