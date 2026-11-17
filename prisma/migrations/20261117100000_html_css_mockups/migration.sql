-- Mockups the AI draws as HTML and CSS, and the generator each job uses (DEC-167).
ALTER TYPE "mockup_generator_kind" ADD VALUE 'HTML_CSS';
ALTER TABLE "mockup_generation_jobs" ADD COLUMN "generator_kind" "mockup_generator_kind";
