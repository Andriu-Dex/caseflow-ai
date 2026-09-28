-- Reuses the existing shared diagram_details/diagram_source_versions tables
-- (already generic across ER/Use Case) for Navigation/Software/System
-- Architecture deterministic diagrams, instead of a parallel mechanism.

ALTER TYPE "diagram_kind" ADD VALUE 'NAVIGATION_TREE';
ALTER TYPE "diagram_kind" ADD VALUE 'SOFTWARE_ARCHITECTURE';
ALTER TYPE "diagram_kind" ADD VALUE 'SYSTEM_ARCHITECTURE';
ALTER TYPE "diagram_source_format" ADD VALUE 'MERMAID_FLOWCHART';
ALTER TYPE "diagram_source_format" ADD VALUE 'PLANTUML_COMPONENT';
ALTER TYPE "diagram_source_format" ADD VALUE 'PLANTUML_DEPLOYMENT';
