-- PR 4 (الموكلين): NOT APPLIED YET. Applied by the owner's say-so only: scripts/sql.sh -f <this file>
--
-- Data model check: nothing new is needed. `clients`, `cases.client_id` and `documents.client_id` already exist
-- (base schema), with the usual office RLS on `clients` (office_select / office_insert / office_update / office_delete).
-- No new table and no new column, so there is no new RLS to write.
-- The client page and the clients list read «all cases of this client» and «all documents of this client»,
-- and deleting a client does `on delete set null` on both columns. None of the three client_id columns has an index.
-- This migration only adds those indexes. It changes no data.
create index if not exists cases_client_id_idx on cases (client_id);
create index if not exists documents_client_id_idx on documents (client_id);
create index if not exists case_parties_client_id_idx on case_parties (client_id);
