# Conectar SafeWhale con Supabase

La API y el monitor pueden guardar su estado en PostgreSQL. Se conservan los
formatos y garantías actuales usando documentos JSONB en la tabla privada
`safewhale.state_documents`: `simulation`, `chain` y `monitor`. Las pólizas de
testnet y sus saldos siguen teniendo al contrato de Monad como fuente de verdad.
El journal de despliegue de `pnpm deploy:testnet` sigue siendo un archivo local.

## 1. Preparar la base de datos

En el proyecto de Supabase, abre **SQL Editor** y ejecuta
`migrations/202610170001_state_documents.sql`. Este paso crea el esquema y la tabla;
no borra registros. No expongas el esquema `safewhale` en Data API. RLS está
activado y no hay acceso para `anon` ni `authenticated`.

Ejecuta también `migrations/202610170002_audit_runtime.sql`: crea el historial de
eventos, la vista de operaciones y las políticas del usuario restringido. En el
equipo administrativo, `pnpm db:migrate` aplica ambas migraciones en orden.

## 2. Configurar la conexión del servidor

En **Connect → Session pooler**, copia la cadena PostgreSQL del puerto **5432**,
sustituye la contraseña y agrega `?sslmode=verify-full` (o `&sslmode=verify-full`
si ya tiene parámetros). Si la contraseña contiene caracteres especiales,
codifícalos como parte de la URL. Guarda en `web/.env.local`:

```dotenv
DATABASE_URL=postgresql://postgres.TU_REFERENCIA:TU_PASSWORD@TU_HOST:5432/postgres?sslmode=verify-full
STORAGE_BACKEND=file
STATE_NAMESPACE=demo
```

Usa la cadena real del panel. La URL HTTPS del proyecto y la clave pública de
Supabase no sustituyen esta conexión. No uses `NEXT_PUBLIC_DATABASE_URL`.
También se admite conexión directa si tu red soporta el host de Supabase.
**Transaction pooler (6543) no es compatible**: el journal requiere bloqueos de
sesión. La conexión valida el certificado TLS; no se desactiva su verificación.
Si tu sistema necesita el certificado raíz de Supabase, descárgalo desde el
panel y configura `NODE_EXTRA_CA_CERTS=/ruta/absoluta/prod-supabase.cer` al arrancar
Node; no cambies `sslmode` para omitir la validación.

El certificado público oficial también está en `supabase/certs/prod-ca-2021.crt`.
Puedes agregar `&sslrootcert=/ruta/absoluta/SafeWhale/supabase/certs/prod-ca-2021.crt`
a `DATABASE_URL` para que el cliente PostgreSQL lo utilice directamente.
Usa una ruta que exista en el servidor donde se ejecutan API y monitor.
Fuente: [configuración oficial de Supabase Studio](https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json).

Desde la raíz:

```bash
pnpm check:db
```

Esta comprobación solo hace consultas de lectura y confirma la conexión y la
presencia de la tabla. No cambia datos ni muestra credenciales.

## 3. Importar el estado existente

Detén `pnpm dev` y cualquier monitor independiente antes de importar. Mantén
`STORAGE_BACKEND=file` hasta completar la importación. `STATE_FILE` debe apuntar
al archivo actual; el importador usa esa ruta y sus archivos `.chain.json` y
`.monitor.json`, y omite solamente los que no existen.

```bash
pnpm db:import
```

El comando anterior valida archivos y lista los documentos a importar, sin
escribir en Supabase. Para copiarlos:

```bash
pnpm db:import --apply
```

Este segundo comando **inserta registros**. Todos se importan o ninguno; si ya
existe cualquiera de esos documentos en el namespace, aborta sin reemplazarlo.
Los archivos originales se conservan. No cambies a otro namespace para eludir
un conflicto sin revisar qué historial debe usar la aplicación.

## 4. Activar Supabase

Una vez importado, cambia en `web/.env.local`:

```dotenv
STORAGE_BACKEND=supabase
```

Reinicia `pnpm dev`. `/api/health` comprueba conexión y esquema cuando Supabase
está seleccionado. Si la base falla, las operaciones fallan explícitamente;
no vuelven a los archivos ni inicializan saldos locales como alternativa.
`STATE_NAMESPACE` debe ser el mismo para la API y el monitor y mantenerse
estable entre reinicios. Cambiarlo selecciona un estado independiente.

La API ya no necesita disco persistente con Supabase. `vercel.json` declara
un daemon separado para el monitor continuo; consulta `../DEPLOY_VERCEL.md`.
Para Vercel, usa la URL sin rutas locales en `sslrootcert`: el cliente empaqueta
la CA pública para los hosts oficiales de Supabase y mantiene TLS estricto.

## Pruebas de integración

Las pruebas requieren una base PostgreSQL de pruebas con la migración aplicada:

```bash
SAFEWHALE_TEST_DATABASE_URL='postgresql://USUARIO@127.0.0.1:PUERTO/BASE_DE_PRUEBAS' pnpm test:database
```

Cada prueba usa y elimina un namespace aleatorio. No uses credenciales de
producción. Sin la variable, estas pruebas se omiten explícitamente.

## Usuario restringido y consultas

`pnpm db:secure` prepara `safewhale_runtime`, genera una contraseña y comprueba
sus permisos antes de cambiar `DATABASE_URL` en `web/.env.local`. Después,
reinicia API y monitor. El usuario tiene SELECT, INSERT y UPDATE sobre el estado;
puede añadir y consultar eventos, pero no borrar registros ni crear tablas,
roles o bases de datos. RLS está activo. Las políticas autorizan al servicio de
backend; no son políticas de aislamiento por usuario final.

La conexión administrativa queda en `supabase/.admin-connection.json` y la
credencial de recuperación del runtime en `supabase/.runtime-connection.json`,
ambas con permisos 600, fuera de Git, Docker y Vercel. No las distribuyas con la
aplicación. Conserva esos archivos en un lugar privado y seguro si vas a mover
el equipo de administración. El runtime necesita únicamente su `DATABASE_URL`.
Si el proceso se interrumpe, repetir `db:secure` recupera la credencial guardada;
no cambia la contraseña de un usuario existente sin esa credencial.

Los datos críticos permanecen en `state_documents` para conservar los saves del
journal antes de enviar transacciones. `event_history` archiva eventos en la misma
transacción SQL, aunque salgan de los 2000 eventos de la pantalla. `operaciones`
ofrece una vista de testnet con acción, estado, hash y resultado; excluye el envío
firmado en bruto. Ejemplos para el SQL Editor, usando el namespace activo:

```sql
select tipo, poliza_id, tx_hash, occurred_at, origen
from safewhale.event_history
where namespace = 'demo'
order by occurred_at desc;

select accion, estado, tx_hash, error
from safewhale.operaciones
where namespace = 'demo'
order by iniciado_en desc;
```

## Respaldo y recuperación

```bash
pnpm db:backup
pnpm db:verify-backup supabase/backups/ARCHIVO_GENERADO.json
```

El respaldo incluye los documentos y el historial del namespace activo, desde
una lectura consistente de PostgreSQL. Se guarda con permisos 600, fuera de Git
y de los despliegues. SHA-256 detecta corrupción accidental; no sustituye una
firma criptográfica ni cifra el archivo. Puede contener transacciones pendientes
firmadas: mantenlo privado. No incluye contraseñas, wallets privadas ni tablas
ajenas a SafeWhale. Esta copia local no configura respaldos externos del proveedor.

La verificación restaura en un namespace aleatorio, compara los documentos y
eventos, y elimina únicamente ese espacio de ensayo. No cambia la instancia activa.
Para preparar una recuperación manual, primero revisa el resumen:

```bash
pnpm db:restore supabase/backups/ARCHIVO_GENERADO.json --namespace=recuperacion
pnpm db:restore supabase/backups/ARCHIVO_GENERADO.json --namespace=recuperacion --apply
```

Solo la segunda orden inserta datos. El destino debe estar vacío y ser distinto
al namespace activo; si hay conflicto, toda la restauración se revierte. Para
activar una recuperación, detén API y monitor, confirma que el contrato y las
wallets siguen siendo los del respaldo, cambia `STATE_NAMESPACE` y reinicia.
Consulta y reconcilia las transacciones pendientes por sus hashes antes de
generar otra operación. Restaurar la DB no revierte transacciones en Monad.
