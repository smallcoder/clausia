-- The way back for 20261027100000_draft_versions.sql: removes the table (and with it EVERY saved version of every draft) and the trigger function.
-- NOT applied; run only on the owner's yes. The drafts themselves keep their current body (the editor wrote it to drafts.body as well).
-- This file sorts after the up file by name, so a migration runner that applies every file would undo it: keep it out of any automatic run.
-- The project applies migrations by hand with scripts/sql.sh -f.
drop table if exists draft_versions;
drop function if exists draft_versions_check_links();
