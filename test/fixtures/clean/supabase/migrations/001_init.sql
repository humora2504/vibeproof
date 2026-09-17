create table public.profiles (id uuid primary key, user_id uuid not null, full_name text);
alter table public.profiles enable row level security;
create policy "own profile" on public.profiles for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create table public.invoices (id uuid primary key, user_id uuid not null, amount numeric);
alter table public.invoices enable row level security;
create policy "own invoices" on public.invoices for select to authenticated using (auth.uid() = user_id);
insert into storage.buckets (id, name, public) values ('receipts','receipts', false);
