-- P7 index verification (backend.md §11, schema.md §17):
-- V1 indexed the transaction/loan/goal hot paths. Every category and contact
-- query in the API filters by user_id first, but those two tables had no
-- user index — added here. V1 is immutable once applied, so changes only
-- ever arrive as new migrations (backend.md §7).

create index idx_categories_user on categories (user_id);
create index idx_contacts_user   on contacts (user_id);
