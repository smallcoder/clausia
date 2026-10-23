-- PR 4 (الموكلين), owner decision 2026-10-24: deleting a client must never delete or detach anything that belongs to it.
-- chat_threads.client_id: ON DELETE CASCADE -> ON DELETE RESTRICT (a client's chats are never deleted with the client).
-- cases.client_id:        ON DELETE SET NULL -> ON DELETE RESTRICT (a client with cases cannot be deleted; no case is left without its client).
-- case_parties.client_id and documents.client_id stay ON DELETE SET NULL (unchanged).
-- Only the two foreign keys change; no row is touched. Constraint names read from pg_constraint (they are the default names).
-- Dry run (read-only), run before this file:
--   select count(*) filter (where client_id is not null) as with_client, count(*) as total from chat_threads;
--   select count(*) filter (where client_id is not null) as with_client, count(*) as total from cases;
-- The way back is 20261024120000_thread_client_restrict_down.sql (restores CASCADE / SET NULL as they are before this file).
alter table chat_threads drop constraint chat_threads_client_id_fkey;
alter table chat_threads add constraint chat_threads_client_id_fkey foreign key (client_id) references clients (id) on delete restrict;

alter table cases drop constraint cases_client_id_fkey;
alter table cases add constraint cases_client_id_fkey foreign key (client_id) references clients (id) on delete restrict;
