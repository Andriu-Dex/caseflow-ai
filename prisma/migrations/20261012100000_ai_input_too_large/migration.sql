-- No configured AI provider accepts a request this large: the caller splits
-- the work instead (DEC-127).
ALTER TYPE "ai_error_code" ADD VALUE 'AI_INPUT_TOO_LARGE';
