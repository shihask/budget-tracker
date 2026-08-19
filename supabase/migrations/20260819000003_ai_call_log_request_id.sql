-- Correlate the upstream Groq calls that belong to ONE user question.
--
-- ai_call_log records one row per upstream call, which answers "what does a
-- feature cost on average" but not "how many calls does a single question
-- make, and which of them are expensive". A chat question can fan out to four
-- upstream calls (up to 3 tool rounds plus the final answer), and without
-- correlation those are indistinguishable from four separate questions —
-- so per-question cost, the number the daily budget is actually set from,
-- cannot be computed at all.
--
-- Immediate use: a tool-calling question is logging two byte-identical rows
-- (same prompt_tokens AND completion_tokens, within the same request). Two
-- independent model calls essentially never agree on completion count, so this
-- looks like one response recorded twice. `stage` names which capture site
-- produced each row, which localises it in one query rather than by guesswork.
ALTER TABLE ai_call_log ADD COLUMN IF NOT EXISTS request_id uuid;

-- Which capture site wrote this row: tool-round | final | final-stream |
-- stream-usage | stream-nousage | parse | receipt | statement |
-- statement-retry | categorize.
--
-- Beyond debugging this, it is what tells you whether the tool loop or the
-- final answer dominates a question's cost — i.e. whether to trim the tool
-- definitions or the system prompt. Nullable: rows written before this
-- migration have no stage, and backfilling a guess would be worse than null.
ALTER TABLE ai_call_log ADD COLUMN IF NOT EXISTS stage text;

-- Per-question rollup: group by request_id, order within by created_at.
CREATE INDEX IF NOT EXISTS idx_ai_call_log_request ON ai_call_log (request_id, created_at);
