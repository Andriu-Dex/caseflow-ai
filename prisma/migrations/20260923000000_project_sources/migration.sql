-- First Deliverable: Project Source intake. PROJECT_SOURCE reuses the
-- generic Artifact/ArtifactVersion core with prefix SRC. The original
-- uploaded file is immutable evidence (StorageProvider reference/hash only,
-- never the binary itself); the optional interpretation/report is a
-- separate, later-attached, equally immutable child.

INSERT INTO "artifact_types" ("code", "default_code_prefix") VALUES ('PROJECT_SOURCE', 'SRC');

CREATE TYPE "project_source_kind" AS ENUM ('PDF','AUDIO','IMAGE','FORM','INVOICE','TEXT','NOTES','OTHER');
CREATE TYPE "source_extraction_state" AS ENUM ('PENDING','EXTRACTED','MANUAL','UNSUPPORTED','FAILED');

CREATE TABLE "source_details" ("artifact_version_id" UUID PRIMARY KEY, "source_kind" "project_source_kind" NOT NULL, "purpose" TEXT NOT NULL, "business_area" TEXT, "description" TEXT, "original_filename" TEXT NOT NULL, "mime_type" TEXT NOT NULL, "size_bytes" INTEGER NOT NULL, "content_hash" TEXT NOT NULL, "storage_key" TEXT NOT NULL, "language" TEXT, "extraction_state" "source_extraction_state" NOT NULL, "extracted_text" TEXT);
CREATE TABLE "source_report_candidates" ("id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "project_id" UUID NOT NULL, "source_version_id" UUID NOT NULL, "ai_run_id" UUID NOT NULL, "content" JSONB NOT NULL, "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "source_report_details" ("artifact_version_id" UUID PRIMARY KEY, "content" JSONB NOT NULL, "generation_candidate_id" UUID, "ai_run_id" UUID);

CREATE UNIQUE INDEX "source_report_candidates_ai_run_id_key" ON "source_report_candidates"("ai_run_id");
CREATE INDEX "source_report_candidates_source_version_id_idx" ON "source_report_candidates"("source_version_id");
CREATE UNIQUE INDEX "source_report_details_generation_candidate_id_key" ON "source_report_details"("generation_candidate_id");

ALTER TABLE "source_details" ADD FOREIGN KEY ("artifact_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "source_report_candidates" ADD FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "source_report_candidates" ADD FOREIGN KEY ("source_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "source_report_candidates" ADD FOREIGN KEY ("ai_run_id") REFERENCES "ai_runs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "source_report_details" ADD FOREIGN KEY ("artifact_version_id") REFERENCES "source_details"("artifact_version_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "source_report_details" ADD FOREIGN KEY ("generation_candidate_id") REFERENCES "source_report_candidates"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "source_report_details" ADD FOREIGN KEY ("ai_run_id") REFERENCES "ai_runs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "source_details" ADD CONSTRAINT "source_details_values" CHECK (
  btrim("purpose")<>'' AND btrim("original_filename")<>'' AND btrim("mime_type")<>'' AND "size_bytes">0
  AND btrim("content_hash")<>'' AND btrim("storage_key")<>''
  AND ("business_area" IS NULL OR btrim("business_area")<>'')
  AND ("description" IS NULL OR btrim("description")<>'')
  AND ("language" IS NULL OR btrim("language")<>'')
  AND (("extraction_state" IN ('EXTRACTED','MANUAL')) = ("extracted_text" IS NOT NULL AND btrim("extracted_text")<>''))
);

CREATE FUNCTION "source_detail_validate"() RETURNS trigger AS $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM artifact_versions av JOIN artifacts a ON a.id=av.artifact_id AND a.project_id=av.project_id WHERE av.id=NEW.artifact_version_id AND a.artifact_type_code='PROJECT_SOURCE') THEN RAISE EXCEPTION 'source detail requires PROJECT_SOURCE artifact' USING ERRCODE='check_violation'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "source_detail_validate" BEFORE INSERT ON "source_details" FOR EACH ROW EXECUTE FUNCTION "source_detail_validate"();

CREATE FUNCTION "source_report_candidate_validate"() RETURNS trigger AS $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM artifact_versions av JOIN artifacts a ON a.id=av.artifact_id AND a.project_id=av.project_id WHERE av.id=NEW.source_version_id AND av.project_id=NEW.project_id AND a.artifact_type_code='PROJECT_SOURCE') THEN RAISE EXCEPTION 'source report candidate requires an exact PROJECT_SOURCE version in the same project' USING ERRCODE='check_violation'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "source_report_candidate_validate" BEFORE INSERT ON "source_report_candidates" FOR EACH ROW EXECUTE FUNCTION "source_report_candidate_validate"();

CREATE FUNCTION "source_report_detail_validate"() RETURNS trigger AS $$ BEGIN
 IF NEW.generation_candidate_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM source_report_candidates c WHERE c.id=NEW.generation_candidate_id AND c.source_version_id=NEW.artifact_version_id AND c.ai_run_id=NEW.ai_run_id) THEN RAISE EXCEPTION 'invalid source report provenance' USING ERRCODE='check_violation'; END IF;
 IF NEW.generation_candidate_id IS NULL AND NEW.ai_run_id IS NOT NULL THEN RAISE EXCEPTION 'partial source report provenance' USING ERRCODE='check_violation'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER "source_report_detail_validate" BEFORE INSERT ON "source_report_details" FOR EACH ROW EXECUTE FUNCTION "source_report_detail_validate"();

CREATE TRIGGER "source_details_enforce_immutability" BEFORE UPDATE OR DELETE ON "source_details" FOR EACH ROW EXECUTE FUNCTION "project_context_rows_enforce_immutability"();
CREATE TRIGGER "source_report_candidates_enforce_immutability" BEFORE UPDATE OR DELETE ON "source_report_candidates" FOR EACH ROW EXECUTE FUNCTION "project_context_rows_enforce_immutability"();
CREATE TRIGGER "source_report_details_enforce_immutability" BEFORE UPDATE OR DELETE ON "source_report_details" FOR EACH ROW EXECUTE FUNCTION "project_context_rows_enforce_immutability"();
