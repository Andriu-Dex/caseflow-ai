-- ADR-019: deployments of READY snapshots (local Docker + Cloudflare Tunnel).
CREATE TYPE "deployment_status" AS ENUM ('STARTING', 'RUNNING', 'STOPPED', 'FAILED');
CREATE TYPE "deployment_tunnel_mode" AS ENUM ('QUICK', 'NAMED');

CREATE TABLE "generated_project_deployments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "snapshot_id" UUID NOT NULL,
    "status" "deployment_status" NOT NULL DEFAULT 'STARTING',
    "tunnel_mode" "deployment_tunnel_mode" NOT NULL,
    "public_url" TEXT,
    "accounts" JSONB NOT NULL DEFAULT '[]',
    "error_message" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "generated_project_deployments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "generated_project_deployments_project_id_created_at_idx"
    ON "generated_project_deployments"("project_id", "created_at");

ALTER TABLE "generated_project_deployments" ADD CONSTRAINT "generated_project_deployments_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "generated_project_deployments" ADD CONSTRAINT "generated_project_deployments_snapshot_id_fkey"
    FOREIGN KEY ("snapshot_id") REFERENCES "generated_project_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "generated_project_deployments" ADD CONSTRAINT "generated_project_deployments_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
