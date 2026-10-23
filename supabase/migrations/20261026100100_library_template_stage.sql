-- PR 6 (المكتبة), small follow-up to 20261026100000_library.sql, found while writing the fill code (before any draft existed):
-- the appeal and the cassation templates describe the NEXT proceeding (its court, circuit and number are the appeal's own, not the first-instance case's).
-- So they carry "for_stage": the fill code puts the court / circuit / number of the case into them ONLY when the case is already at that stage,
-- and reads the judgment from the earlier case otherwise. Never a guess.
--
-- Touches ONLY two rows of the NEW templates table (the base rows this PR seeded). No other table, column, row or policy.
-- Way back: update templates set body = body - 'for_stage' where office_id is null and slug in ('appeal-sheet', 'cassation-report');  (or the library_down file)
update templates set body = body || '{"for_stage":"appeal"}'::jsonb where office_id is null and slug = 'appeal-sheet';
update templates set body = body || '{"for_stage":"cassation"}'::jsonb where office_id is null and slug = 'cassation-report';
