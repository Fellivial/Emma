-- Remove SMB intake leads table and client columns added for the SMB feature.
drop table if exists leads;
alter table clients drop column if exists form_steps;
alter table clients drop column if exists owner_email;
alter table clients drop column if exists sheets_id;
