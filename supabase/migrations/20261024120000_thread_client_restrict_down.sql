-- The way back for 20261024120000_thread_client_restrict.sql: restores the foreign keys as they were before it. NOT applied; run only on the owner's yes.
-- (This file sorts after the up file by name, so a migration runner that applies every file would undo it: keep it out of any automatic run. The project applies migrations by hand with scripts/sql.sh -f.)
alter table chat_threads drop constraint chat_threads_client_id_fkey;
alter table chat_threads add constraint chat_threads_client_id_fkey foreign key (client_id) references clients (id) on delete cascade;

alter table cases drop constraint cases_client_id_fkey;
alter table cases add constraint cases_client_id_fkey foreign key (client_id) references clients (id) on delete set null;
