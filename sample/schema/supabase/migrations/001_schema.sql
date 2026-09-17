-- A representative multi-tenant SaaS schema, written the way these usually look.
-- This is a sample we wrote, not anyone's real project. It exists so you can see
-- exactly what the Fix Pack produces before you decide whether it is worth $19.

create table public.profiles (
  id uuid primary key references auth.users(id),
  full_name text,
  avatar_url text,
  created_at timestamptz default now()
);

create table public.organizations (
  id uuid primary key,
  name text not null,
  plan text not null default 'free',
  created_at timestamptz default now()
);

create table public.org_members (
  id uuid primary key,
  org_id uuid not null references organizations(id),
  user_id uuid not null references auth.users(id),
  role text not null default 'member'
);

create table public.projects (
  id uuid primary key,
  org_id uuid not null references organizations(id),
  name text not null,
  archived boolean not null default false
);

create table public.api_keys (
  id uuid primary key,
  org_id uuid not null references organizations(id),
  hashed_key text not null,
  last_used_at timestamptz
);

create table public.invoices (
  id uuid primary key,
  org_id uuid not null references organizations(id),
  amount_cents integer not null,
  pdf_url text,
  paid_at timestamptz
);

create table public.notes (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  body text not null
);

create table public.plans (
  code text primary key,
  monthly_cents integer not null,
  seats integer not null
);

-- One table already protected, and one policy that looks protective and is not.
create table public.events (
  id bigserial primary key,
  user_id uuid,
  kind text not null,
  payload jsonb
);
alter table public.events enable row level security;
create policy "read all events" on public.events for select using (true);
