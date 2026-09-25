-- DropForeignKey
ALTER TABLE "data_model_attributes" DROP CONSTRAINT "data_model_attributes_entity_id_fkey";

-- DropForeignKey
ALTER TABLE "data_model_candidates" DROP CONSTRAINT "data_model_candidates_accepted_artifact_id_fkey";

-- DropForeignKey
ALTER TABLE "data_model_candidates" DROP CONSTRAINT "data_model_candidates_generation_id_fkey";

-- DropForeignKey
ALTER TABLE "data_model_details" DROP CONSTRAINT "data_model_details_ai_run_id_fkey";

-- DropForeignKey
ALTER TABLE "data_model_details" DROP CONSTRAINT "data_model_details_artifact_version_id_fkey";

-- DropForeignKey
ALTER TABLE "data_model_details" DROP CONSTRAINT "data_model_details_generation_candidate_id_fkey";

-- DropForeignKey
ALTER TABLE "data_model_details" DROP CONSTRAINT "data_model_details_generation_id_fkey";

-- DropForeignKey
ALTER TABLE "data_model_entities" DROP CONSTRAINT "data_model_entities_artifact_version_id_fkey";

-- DropForeignKey
ALTER TABLE "data_model_generation_sources" DROP CONSTRAINT "data_model_generation_sources_artifact_version_id_fkey";

-- DropForeignKey
ALTER TABLE "data_model_generation_sources" DROP CONSTRAINT "data_model_generation_sources_generation_id_fkey";

-- DropForeignKey
ALTER TABLE "data_model_generations" DROP CONSTRAINT "data_model_generations_ai_run_id_fkey";

-- DropForeignKey
ALTER TABLE "data_model_generations" DROP CONSTRAINT "data_model_generations_project_id_fkey";

-- DropForeignKey
ALTER TABLE "data_model_relationships" DROP CONSTRAINT "data_model_relationships_artifact_version_id_fkey";

-- DropForeignKey
ALTER TABLE "data_model_relationships" DROP CONSTRAINT "data_model_relationships_source_entity_id_artifact_version_fkey";

-- DropForeignKey
ALTER TABLE "data_model_relationships" DROP CONSTRAINT "data_model_relationships_target_entity_id_artifact_version_fkey";

-- DropForeignKey
ALTER TABLE "diagram_details" DROP CONSTRAINT "diagram_details_artifact_version_id_fkey";

-- DropForeignKey
ALTER TABLE "diagram_source_versions" DROP CONSTRAINT "diagram_source_versions_diagram_version_id_fkey";

-- DropForeignKey
ALTER TABLE "diagram_source_versions" DROP CONSTRAINT "diagram_source_versions_source_artifact_version_id_fkey";

-- DropForeignKey
ALTER TABLE "mockup_details" DROP CONSTRAINT "mockup_details_artifact_version_id_fkey";

-- DropForeignKey
ALTER TABLE "mockup_details" DROP CONSTRAINT "mockup_details_ui_blueprint_version_id_fkey";

-- DropForeignKey
ALTER TABLE "requirement_candidates" DROP CONSTRAINT "requirement_candidates_accepted_artifact_id_fkey";

-- DropForeignKey
ALTER TABLE "requirement_dependencies" DROP CONSTRAINT "requirement_dependencies_depends_on_artifact_id_fkey";

-- DropForeignKey
ALTER TABLE "requirement_generations" DROP CONSTRAINT "requirement_generations_project_id_fkey";

-- DropForeignKey
ALTER TABLE "requirement_generations" DROP CONSTRAINT "requirement_generations_source_context_project_fkey";

-- DropForeignKey
ALTER TABLE "source_details" DROP CONSTRAINT "source_details_artifact_version_id_fkey";

-- DropForeignKey
ALTER TABLE "source_report_candidates" DROP CONSTRAINT "source_report_candidates_ai_run_id_fkey";

-- DropForeignKey
ALTER TABLE "source_report_candidates" DROP CONSTRAINT "source_report_candidates_project_id_fkey";

-- DropForeignKey
ALTER TABLE "source_report_candidates" DROP CONSTRAINT "source_report_candidates_source_version_id_fkey";

-- DropForeignKey
ALTER TABLE "source_report_details" DROP CONSTRAINT "source_report_details_ai_run_id_fkey";

-- DropForeignKey
ALTER TABLE "source_report_details" DROP CONSTRAINT "source_report_details_artifact_version_id_fkey";

-- DropForeignKey
ALTER TABLE "source_report_details" DROP CONSTRAINT "source_report_details_generation_candidate_id_fkey";

-- DropForeignKey
ALTER TABLE "structured_analysis_candidates" DROP CONSTRAINT "structured_analysis_candidates_accepted_artifact_id_fkey";

-- DropForeignKey
ALTER TABLE "structured_analysis_candidates" DROP CONSTRAINT "structured_analysis_candidates_generation_id_fkey";

-- DropForeignKey
ALTER TABLE "structured_analysis_details" DROP CONSTRAINT "structured_analysis_details_ai_run_id_fkey";

-- DropForeignKey
ALTER TABLE "structured_analysis_details" DROP CONSTRAINT "structured_analysis_details_artifact_version_id_fkey";

-- DropForeignKey
ALTER TABLE "structured_analysis_details" DROP CONSTRAINT "structured_analysis_details_generation_candidate_id_fkey";

-- DropForeignKey
ALTER TABLE "structured_analysis_details" DROP CONSTRAINT "structured_analysis_details_generation_id_fkey";

-- DropForeignKey
ALTER TABLE "structured_analysis_generation_sources" DROP CONSTRAINT "structured_analysis_generation_sources_artifact_version_id_fkey";

-- DropForeignKey
ALTER TABLE "structured_analysis_generation_sources" DROP CONSTRAINT "structured_analysis_generation_sources_generation_id_fkey";

-- DropForeignKey
ALTER TABLE "structured_analysis_generations" DROP CONSTRAINT "structured_analysis_generations_ai_run_id_fkey";

-- DropForeignKey
ALTER TABLE "structured_analysis_generations" DROP CONSTRAINT "structured_analysis_generations_project_id_fkey";

-- DropForeignKey
ALTER TABLE "use_case_alternative_flow_steps" DROP CONSTRAINT "use_case_alternative_flow_steps_alternative_flow_id_fkey";

-- DropForeignKey
ALTER TABLE "use_case_alternative_flows" DROP CONSTRAINT "use_case_alternative_flows_artifact_version_id_fkey";

-- DropForeignKey
ALTER TABLE "use_case_candidate_sources" DROP CONSTRAINT "use_case_candidate_sources_candidate_id_fkey";

-- DropForeignKey
ALTER TABLE "use_case_candidate_sources" DROP CONSTRAINT "use_case_candidate_sources_source_fkey";

-- DropForeignKey
ALTER TABLE "use_case_candidates" DROP CONSTRAINT "use_case_candidates_accepted_artifact_id_fkey";

-- DropForeignKey
ALTER TABLE "use_case_candidates" DROP CONSTRAINT "use_case_candidates_generation_id_fkey";

-- DropForeignKey
ALTER TABLE "use_case_details" DROP CONSTRAINT "use_case_details_ai_run_id_fkey";

-- DropForeignKey
ALTER TABLE "use_case_details" DROP CONSTRAINT "use_case_details_artifact_version_id_fkey";

-- DropForeignKey
ALTER TABLE "use_case_details" DROP CONSTRAINT "use_case_details_generation_candidate_id_fkey";

-- DropForeignKey
ALTER TABLE "use_case_details" DROP CONSTRAINT "use_case_details_generation_id_fkey";

-- DropForeignKey
ALTER TABLE "use_case_generation_sources" DROP CONSTRAINT "use_case_generation_sources_generation_id_fkey";

-- DropForeignKey
ALTER TABLE "use_case_generation_sources" DROP CONSTRAINT "use_case_generation_sources_requirement_version_id_fkey";

-- DropForeignKey
ALTER TABLE "use_case_generations" DROP CONSTRAINT "use_case_generations_ai_run_id_fkey";

-- DropForeignKey
ALTER TABLE "use_case_generations" DROP CONSTRAINT "use_case_generations_project_id_fkey";

-- DropForeignKey
ALTER TABLE "use_case_main_flow_steps" DROP CONSTRAINT "use_case_main_flow_steps_artifact_version_id_fkey";

-- DropForeignKey
ALTER TABLE "use_case_postconditions" DROP CONSTRAINT "use_case_postconditions_artifact_version_id_fkey";

-- DropForeignKey
ALTER TABLE "use_case_preconditions" DROP CONSTRAINT "use_case_preconditions_artifact_version_id_fkey";

-- DropForeignKey
ALTER TABLE "use_case_requirement_links" DROP CONSTRAINT "use_case_requirement_links_artifact_version_id_fkey";

-- DropForeignKey
ALTER TABLE "use_case_requirement_links" DROP CONSTRAINT "use_case_requirement_links_requirement_version_id_fkey";

-- DropForeignKey
ALTER TABLE "use_case_secondary_actors" DROP CONSTRAINT "use_case_secondary_actors_artifact_version_id_fkey";

-- DropIndex
DROP INDEX "source_report_candidates_source_version_id_idx";

-- CreateTable
CREATE TABLE "project_context_candidates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "ai_run_id" UUID NOT NULL,
    "content" JSONB NOT NULL,
    "source_version_ids" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_context_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_context_candidates_ai_run_id_key" ON "project_context_candidates"("ai_run_id");

-- AddForeignKey
ALTER TABLE "data_model_details" ADD CONSTRAINT "data_model_details_artifact_version_id_fkey" FOREIGN KEY ("artifact_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_model_details" ADD CONSTRAINT "data_model_details_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "data_model_generations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_model_details" ADD CONSTRAINT "data_model_details_generation_candidate_id_fkey" FOREIGN KEY ("generation_candidate_id") REFERENCES "data_model_candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_model_details" ADD CONSTRAINT "data_model_details_ai_run_id_fkey" FOREIGN KEY ("ai_run_id") REFERENCES "ai_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_model_entities" ADD CONSTRAINT "data_model_entities_artifact_version_id_fkey" FOREIGN KEY ("artifact_version_id") REFERENCES "data_model_details"("artifact_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_model_attributes" ADD CONSTRAINT "data_model_attributes_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "data_model_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_model_relationships" ADD CONSTRAINT "data_model_relationships_artifact_version_id_fkey" FOREIGN KEY ("artifact_version_id") REFERENCES "data_model_details"("artifact_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_model_relationships" ADD CONSTRAINT "data_model_relationships_source_entity_id_artifact_version_fkey" FOREIGN KEY ("source_entity_id", "artifact_version_id") REFERENCES "data_model_entities"("id", "artifact_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_model_relationships" ADD CONSTRAINT "data_model_relationships_target_entity_id_artifact_version_fkey" FOREIGN KEY ("target_entity_id", "artifact_version_id") REFERENCES "data_model_entities"("id", "artifact_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_model_generations" ADD CONSTRAINT "data_model_generations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_model_generations" ADD CONSTRAINT "data_model_generations_ai_run_id_fkey" FOREIGN KEY ("ai_run_id") REFERENCES "ai_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_model_generation_sources" ADD CONSTRAINT "data_model_generation_sources_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "data_model_generations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_model_generation_sources" ADD CONSTRAINT "data_model_generation_sources_artifact_version_id_fkey" FOREIGN KEY ("artifact_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_model_candidates" ADD CONSTRAINT "data_model_candidates_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "data_model_generations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_model_candidates" ADD CONSTRAINT "data_model_candidates_accepted_artifact_id_fkey" FOREIGN KEY ("accepted_artifact_id") REFERENCES "artifacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagram_details" ADD CONSTRAINT "diagram_details_artifact_version_id_fkey" FOREIGN KEY ("artifact_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagram_source_versions" ADD CONSTRAINT "diagram_source_versions_diagram_version_id_fkey" FOREIGN KEY ("diagram_version_id") REFERENCES "diagram_details"("artifact_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diagram_source_versions" ADD CONSTRAINT "diagram_source_versions_source_artifact_version_id_fkey" FOREIGN KEY ("source_artifact_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "use_case_details" ADD CONSTRAINT "use_case_details_artifact_version_id_fkey" FOREIGN KEY ("artifact_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "use_case_details" ADD CONSTRAINT "use_case_details_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "use_case_generations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "use_case_details" ADD CONSTRAINT "use_case_details_generation_candidate_id_fkey" FOREIGN KEY ("generation_candidate_id") REFERENCES "use_case_candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "use_case_secondary_actors" ADD CONSTRAINT "use_case_secondary_actors_artifact_version_id_fkey" FOREIGN KEY ("artifact_version_id") REFERENCES "use_case_details"("artifact_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "use_case_preconditions" ADD CONSTRAINT "use_case_preconditions_artifact_version_id_fkey" FOREIGN KEY ("artifact_version_id") REFERENCES "use_case_details"("artifact_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "use_case_postconditions" ADD CONSTRAINT "use_case_postconditions_artifact_version_id_fkey" FOREIGN KEY ("artifact_version_id") REFERENCES "use_case_details"("artifact_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "use_case_main_flow_steps" ADD CONSTRAINT "use_case_main_flow_steps_artifact_version_id_fkey" FOREIGN KEY ("artifact_version_id") REFERENCES "use_case_details"("artifact_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "use_case_alternative_flows" ADD CONSTRAINT "use_case_alternative_flows_artifact_version_id_fkey" FOREIGN KEY ("artifact_version_id") REFERENCES "use_case_details"("artifact_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "use_case_alternative_flow_steps" ADD CONSTRAINT "use_case_alternative_flow_steps_alternative_flow_id_fkey" FOREIGN KEY ("alternative_flow_id") REFERENCES "use_case_alternative_flows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "use_case_requirement_links" ADD CONSTRAINT "use_case_requirement_links_artifact_version_id_fkey" FOREIGN KEY ("artifact_version_id") REFERENCES "use_case_details"("artifact_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "use_case_requirement_links" ADD CONSTRAINT "use_case_requirement_links_requirement_version_id_fkey" FOREIGN KEY ("requirement_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "use_case_generations" ADD CONSTRAINT "use_case_generations_ai_run_id_fkey" FOREIGN KEY ("ai_run_id") REFERENCES "ai_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "use_case_generation_sources" ADD CONSTRAINT "use_case_generation_sources_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "use_case_generations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "use_case_generation_sources" ADD CONSTRAINT "use_case_generation_sources_requirement_version_id_fkey" FOREIGN KEY ("requirement_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "use_case_candidates" ADD CONSTRAINT "use_case_candidates_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "use_case_generations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "use_case_candidate_sources" ADD CONSTRAINT "use_case_candidate_sources_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "use_case_candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "use_case_candidate_sources" ADD CONSTRAINT "use_case_candidate_sources_generation_id_requirement_versi_fkey" FOREIGN KEY ("generation_id", "requirement_version_id") REFERENCES "use_case_generation_sources"("generation_id", "requirement_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_details" ADD CONSTRAINT "source_details_artifact_version_id_fkey" FOREIGN KEY ("artifact_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_report_candidates" ADD CONSTRAINT "source_report_candidates_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_report_candidates" ADD CONSTRAINT "source_report_candidates_source_version_id_fkey" FOREIGN KEY ("source_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_report_candidates" ADD CONSTRAINT "source_report_candidates_ai_run_id_fkey" FOREIGN KEY ("ai_run_id") REFERENCES "ai_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_context_candidates" ADD CONSTRAINT "project_context_candidates_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_context_candidates" ADD CONSTRAINT "project_context_candidates_ai_run_id_fkey" FOREIGN KEY ("ai_run_id") REFERENCES "ai_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_report_details" ADD CONSTRAINT "source_report_details_artifact_version_id_fkey" FOREIGN KEY ("artifact_version_id") REFERENCES "source_details"("artifact_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_report_details" ADD CONSTRAINT "source_report_details_generation_candidate_id_fkey" FOREIGN KEY ("generation_candidate_id") REFERENCES "source_report_candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_report_details" ADD CONSTRAINT "source_report_details_ai_run_id_fkey" FOREIGN KEY ("ai_run_id") REFERENCES "ai_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "structured_analysis_generations" ADD CONSTRAINT "structured_analysis_generations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "structured_analysis_generations" ADD CONSTRAINT "structured_analysis_generations_ai_run_id_fkey" FOREIGN KEY ("ai_run_id") REFERENCES "ai_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "structured_analysis_generation_sources" ADD CONSTRAINT "structured_analysis_generation_sources_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "structured_analysis_generations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "structured_analysis_generation_sources" ADD CONSTRAINT "structured_analysis_generation_sources_artifact_version_id_fkey" FOREIGN KEY ("artifact_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "structured_analysis_candidates" ADD CONSTRAINT "structured_analysis_candidates_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "structured_analysis_generations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "structured_analysis_candidates" ADD CONSTRAINT "structured_analysis_candidates_accepted_artifact_id_fkey" FOREIGN KEY ("accepted_artifact_id") REFERENCES "artifacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "structured_analysis_details" ADD CONSTRAINT "structured_analysis_details_artifact_version_id_fkey" FOREIGN KEY ("artifact_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "structured_analysis_details" ADD CONSTRAINT "structured_analysis_details_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "structured_analysis_generations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "structured_analysis_details" ADD CONSTRAINT "structured_analysis_details_generation_candidate_id_fkey" FOREIGN KEY ("generation_candidate_id") REFERENCES "structured_analysis_candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "structured_analysis_details" ADD CONSTRAINT "structured_analysis_details_ai_run_id_fkey" FOREIGN KEY ("ai_run_id") REFERENCES "ai_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mockup_details" ADD CONSTRAINT "mockup_details_artifact_version_id_fkey" FOREIGN KEY ("artifact_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mockup_details" ADD CONSTRAINT "mockup_details_ui_blueprint_version_id_fkey" FOREIGN KEY ("ui_blueprint_version_id") REFERENCES "artifact_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "structured_analysis_candidates_generation_candidate_key" RENAME TO "structured_analysis_candidates_generation_id_candidate_id_key";

-- RenameIndex
ALTER INDEX "structured_analysis_generation_sources_source_key" RENAME TO "structured_analysis_generation_sources_generation_id_source_key";

-- RenameIndex
ALTER INDEX "structured_analysis_generations_project_kind_created_idx" RENAME TO "structured_analysis_generations_project_id_kind_created_at_idx";

-- RenameIndex
ALTER INDEX "use_case_alternative_flow_steps_alternative_flow_id_position_ke" RENAME TO "use_case_alternative_flow_steps_alternative_flow_id_positio_key";
