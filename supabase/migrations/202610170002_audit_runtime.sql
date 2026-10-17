begin;

-- Credenciales separadas para la aplicación. La contraseña la genera db:secure.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'safewhale_runtime') then
    create role safewhale_runtime nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
end $$;
grant safewhale_runtime to current_user;

create table if not exists safewhale.event_history (
  namespace text not null,
  source_kind text not null,
  id text not null,
  tipo text not null,
  poliza_id text,
  servicio_id integer,
  tx_hash text,
  occurred_at bigint not null,
  ok boolean not null,
  motivo text,
  origen text not null check (origen in ('simulado', 'testnet')),
  bloque bigint,
  primary key (namespace, source_kind, id),
  foreign key (namespace, source_kind) references safewhale.state_documents(namespace, kind) on delete cascade
);
create index if not exists event_history_timeline on safewhale.event_history(namespace, occurred_at desc);
create index if not exists event_history_policy on safewhale.event_history(namespace, poliza_id) where poliza_id is not null;
alter table safewhale.event_history enable row level security;
revoke all on safewhale.event_history from public;

create or replace function safewhale.capture_events() returns trigger
language plpgsql set search_path = pg_catalog, safewhale as $$
begin
  insert into safewhale.event_history
    (namespace, source_kind, id, tipo, poliza_id, servicio_id, tx_hash, occurred_at, ok, motivo, origen, bloque)
  select new.namespace, new.kind, e->>'id', e->>'tipo', e->>'polizaId',
    (e->>'servicioId')::integer, e->>'txHash', (e->>'timestamp')::bigint,
    (e->>'ok')::boolean, e->>'motivo', e->>'origen', (e->>'bloque')::bigint
  from jsonb_array_elements(coalesce(new.payload->'eventos', '[]'::jsonb)) as e
  on conflict (namespace, source_kind, id) do nothing;
  return new;
end $$;
revoke all on function safewhale.capture_events() from public;
drop trigger if exists capture_events on safewhale.state_documents;
create trigger capture_events after insert or update of payload on safewhale.state_documents
  for each row execute function safewhale.capture_events();

-- Incorporar los eventos existentes sin reemplazar el journal ni sus datos.
update safewhale.state_documents set payload = payload where kind in ('chain', 'simulation');

create or replace view safewhale.operaciones with (security_invoker = true) as
select d.namespace, o.key as clave, o.value->>'action' as accion,
  o.value->>'actor' as actor, o.value->>'status' as estado,
  o.value->>'hash' as tx_hash, (o.value->>'started')::bigint as iniciado_en,
  o.value->>'error' as error, o.value->'result' as resultado
from safewhale.state_documents d
cross join lateral jsonb_each(coalesce(d.payload->'operations', '{}'::jsonb)) o
where d.kind = 'chain';

grant usage on schema safewhale to safewhale_runtime;
grant select, insert, update on safewhale.state_documents to safewhale_runtime;
grant select, insert on safewhale.event_history to safewhale_runtime;
grant select on safewhale.operaciones to safewhale_runtime;
drop policy if exists runtime_access on safewhale.state_documents;
create policy runtime_access on safewhale.state_documents to safewhale_runtime using (true) with check (true);
drop policy if exists runtime_access on safewhale.event_history;
create policy runtime_access on safewhale.event_history to safewhale_runtime using (true) with check (true);

do $$ declare role_name text;
begin
  for role_name in select rolname from pg_roles where rolname in ('anon', 'authenticated') loop
    execute format('revoke all on safewhale.event_history from %I', role_name);
    execute format('revoke all on safewhale.operaciones from %I', role_name);
  end loop;
end $$;
comment on table safewhale.event_history is 'Historial persistente; conserva eventos aunque salgan de la ventana de 2000 del estado.';
comment on view safewhale.operaciones is 'Resumen de operaciones de testnet; excluye transacciones firmadas en bruto.';
commit;
