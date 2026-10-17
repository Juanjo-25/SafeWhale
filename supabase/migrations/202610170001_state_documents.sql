-- Ejecutar una vez en el SQL Editor de Supabase. No borra datos existentes.
begin;
create schema if not exists safewhale;
revoke all on schema safewhale from public;
create table if not exists safewhale.state_documents (
  namespace text not null check (namespace ~ '^[a-zA-Z0-9_-]{1,64}$'),
  kind text not null check (kind in ('simulation', 'chain', 'monitor')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now(),
  primary key (namespace, kind)
);
-- Acceso exclusivo desde el servidor usando PostgreSQL; sin políticas públicas.
alter table safewhale.state_documents enable row level security;
revoke all on safewhale.state_documents from public;
do $$
declare role_name text;
begin
  for role_name in select rolname from pg_roles where rolname in ('anon', 'authenticated') loop
    execute format('revoke all on schema safewhale from %I', role_name);
    execute format('revoke all on safewhale.state_documents from %I', role_name);
  end loop;
end $$;
comment on table safewhale.state_documents is
  'Estado privado de SafeWhale: simulación, controles, observaciones y journal de transacciones. No exponer por Data API.';
commit;
