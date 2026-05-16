-- owner_email: where lead notifications are sent (overrides EMAIL_FROM default)
-- sheets_id: Google Sheets spreadsheet ID for real-time lead appending
alter table clients add column if not exists owner_email text;
alter table clients add column if not exists sheets_id text;
