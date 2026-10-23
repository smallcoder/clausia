-- The way back for 20261026100000_library.sql: removes the three tables (and the base templates in them), the trigger function and the enum. NOT applied; run only on the owner's yes.
-- It DELETES every draft, every office template and the office style saved since the up file ran. (Uploaded Word files stay in the «documents» bucket; remove them by hand.)
-- This file sorts after the up file by name, so a migration runner that applies every file would undo it: keep it out of any automatic run.
-- The project applies migrations by hand with scripts/sql.sh -f.
drop table if exists drafts;
drop table if exists office_style;
drop table if exists templates;
drop function if exists drafts_check_links();
drop type if exists template_category;
