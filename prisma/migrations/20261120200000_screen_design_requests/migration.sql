-- A person's requests about how one generated screen looks (ADR-030).
CREATE TABLE "screen_design_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "route_path" TEXT NOT NULL,
    "instructions" TEXT[],
    "note" TEXT NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "screen_design_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "screen_design_requests_route_path_check" CHECK (left("route_path", 1) = '/' AND length("route_path") <= 200),
    CONSTRAINT "screen_design_requests_instructions_check" CHECK (coalesce(array_length("instructions", 1), 0) <= 20)
);

CREATE INDEX "screen_design_requests_project_id_route_path_created_at_idx"
    ON "screen_design_requests"("project_id", "route_path", "created_at");

ALTER TABLE "screen_design_requests" ADD CONSTRAINT "screen_design_requests_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "screen_design_requests" ADD CONSTRAINT "screen_design_requests_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
