-- The way back for 20261025100000_accounts.sql: removes the two tables, the two trigger functions and the four enums. NOT applied; run only on the owner's yes.
-- It DELETES every fee and movement saved since the up file ran. (This file sorts after the up file by name, so a migration runner that applies every file
-- would undo it: keep it out of any automatic run. The project applies migrations by hand with scripts/sql.sh -f.)
drop table if exists account_movements;
drop table if exists case_fees;
drop function if exists account_movements_check_links();
drop function if exists case_fees_check_links();
drop type if exists money_kind;
drop type if exists money_method;
drop type if exists money_charge;
drop type if exists fee_kind;
