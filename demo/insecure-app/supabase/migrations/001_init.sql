-- A schema written the way an AI coding tool usually produces it: correct SQL,
-- no Row Level Security. Every one of these tables is served over a public REST
-- endpoint, and the key that reaches it ships inside the frontend bundle.
create table public.profiles (id uuid primary key, user_id uuid, email text, full_name text);
create table public.orders (id uuid primary key, user_id uuid, total numeric, status text);
create table public.invoices (id uuid primary key, user_id uuid, amount numeric, pdf_url text);

-- This one has the shield on and no protection behind it.
create table public.posts (id uuid primary key, user_id uuid, body text);
alter table public.posts enable row level security;
create policy "enable read for all" on public.posts for all using (true);

-- Privileges are checked before policies, so this alone opens the table.
grant all on public.invoices to anon;

-- Every uploaded receipt readable by URL, no login.
insert into storage.buckets (id, name, public) values ('receipts', 'receipts', true);
