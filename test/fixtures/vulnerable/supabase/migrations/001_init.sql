create table public.profiles (id uuid primary key, user_id uuid, email text, full_name text);
create table public.invoices (id uuid primary key, user_id uuid, amount numeric, pdf_url text);
create table public.posts (id uuid primary key, user_id uuid, body text);
alter table public.posts enable row level security;
create policy "anyone" on public.posts for all using (true);
grant all on public.invoices to anon;
insert into storage.buckets (id, name, public) values ('receipts','receipts', true);
