-- Where a hearing sits (floor / hall / building), e.g. «الدور 4 · قاعة 12» or «العباسية».
-- Only as written in a paper or said by the lawyer, through a confirmation card; never guessed.
alter table hearings add column if not exists location text;
