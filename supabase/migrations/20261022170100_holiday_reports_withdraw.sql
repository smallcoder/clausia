-- An office can withdraw its OWN report while it is still pending (and the RLS test can clean up the reports it makes).
-- A decided report (approved / rejected) can never be deleted from the app. Additive: one policy.
create policy holiday_reports_withdraw on holiday_reports for delete to authenticated using (office_id = current_office_id() and status = 'pending');
