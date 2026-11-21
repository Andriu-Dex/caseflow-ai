-- Starting points saved from a project for another one to copy (DEC-176).
CREATE TABLE "starting_points" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "content" JSONB NOT NULL,
    "source_project_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "starting_points_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "starting_points_workspace_id_created_at_idx" ON "starting_points"("workspace_id", "created_at");
ALTER TABLE "starting_points" ADD CONSTRAINT "starting_points_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "starting_points" ADD CONSTRAINT "starting_points_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
