# Desplegar SafeWhale en Vercel

La configuración propuesta está en `vercel.json`. Hay dos servicios Next.js,
con una sola interfaz: `web` publica el sitio; `api` contiene los handlers del
backend y queda interno. Los handlers en `web/app/api/` son proxies. El navegador
conserva `/api/...` en el mismo dominio, con cookies, autorización y claves de
idempotencia. El proxy usa el binding `web → api`, inyectado como `API_URL` durante
la ejecución de las funciones. No se consulta ese binding durante builds ni desde
middleware, y **no debes configurar API_URL manualmente**.

El daemon `monitor` es un contenedor continuo, con una instancia en `iad1`.
Observa directamente el mock guardado en Supabase y reporta/paga en Monad.
No tiene rutas públicas ni necesita el dominio del frontend. Supabase, Gemini y
Monad son servicios externos: no son destinos de bindings de Vercel.

## Configuración del proyecto

Importa el repositorio con **Root Directory = `.`** y Node.js **24.x**.
Mantén los comandos definidos por servicio en `vercel.json`; los builds son
`pnpm build:web` y `pnpm build:api`, usando las dependencias y lockfile de la raíz.
`pnpm-workspace.yaml` une `web` y `api`; el único lockfile de instalación es el
`pnpm-lock.yaml` de la raíz. No generes un package-lock de npm dentro de `web`.
No selecciones `web/` como raíz del proyecto, porque ocultaría la configuración
de servicios, `shared/`, `api/` y el Dockerfile del monitor.

Services y Daemons están en beta. El proyecto debe admitir esas capacidades.
El daemon se ejecuta solamente en **Production**; Preview no inicia monitor.
El contenedor instala pnpm 10.17.1 y no copia archivos `.env`, wallets ni estado
local. Las variables privadas se suministran en runtime desde Vercel.

## Variables de Production

En Project Settings → Environment Variables, configura estas variables privadas
para Production. Usa los valores existentes de `web/.env.local` sin pegarlos en
Git ni usar prefijos `NEXT_PUBLIC_`:

| Variable | Valor / propósito |
| --- | --- |
| `BACKEND_MODE` | `testnet` |
| `STORAGE_BACKEND` | `supabase` |
| `STATE_NAMESPACE` | El namespace ya importado; actualmente `demo` |
| `DATABASE_URL` | Session pooler PostgreSQL en 5432, con `sslmode=verify-full` |
| `MONAD_CHAIN_ID` | `10143` |
| `MONAD_RPC_URL` | `https://testnet-rpc.monad.xyz` o tu RPC de testnet |
| `CONTRACT_ADDRESS` | Dirección activa de `shared/deployment.json` |
| `CONTRACT_DEPLOY_BLOCK` | Bloque activo de `shared/deployment.json` |
| `AGENT_PRIVATE_KEY` | Wallet del agente configurado en el contrato |
| `DEMO_USER_PRIVATE_KEY` | Wallet que compra y reclama |
| `DEMO_API_TOKEN` | Mismo token secreto en `web` y `api`; mínimo 32 caracteres |
| `GEMINI_API_KEY` | Clave del proveedor para cotizar |
| `GEMINI_MODEL` | Modelo configurado; actualmente `gemini-3.5-flash-lite` |
| `APP_BASE_URL` | Dominio público HTTPS de la app; se usa en herramientas HTTP |
| `MONITOR_INTERVAL_MS` | `2000` |

No copies `OWNER_PRIVATE_KEY`: solo hace falta en el despliegue local del contrato.
`STATE_FILE` no almacena datos de API/monitor con Supabase. `API_URL` es el binding
automático y no es una variable pública del navegador.

En `DATABASE_URL`, elimina el parámetro `sslrootcert` si contiene una ruta del Mac.
Para hosts oficiales `*.supabase.com` y `*.supabase.co`, el cliente incluye la CA
pública de `supabase/certs/` en el bundle y valida el certificado y el hostname.
Se mantienen certificados explícitos para otros despliegues; la ruta indicada
debe existir allí. No uses Transaction pooler 6543: se requieren bloqueos de sesión.

No compartas claves ni namespace de testnet entre Preview y Production. Para una
preview de interfaz, usa `BACKEND_MODE=simulado`, otra `STATE_NAMESPACE`, Supabase
y su propio `DEMO_API_TOKEN`. Para ensayar testnet en Preview, prepara contrato,
wallets y namespace independientes; no tendrá monitor automático.

## Persistencia y transición

La migración está en `supabase/migrations/202610170001_state_documents.sql`.
Consulta `supabase/README.md` si aún no está aplicada o debes importar estado.
`pnpm check:db` hace una comprobación de lectura; no importa ni migra datos.

Antes de activar el monitor en Production, detén los monitores locales que usen
las mismas wallets. Si conservas una instancia local después, debe compartir el
mismo estado de Supabase y namespace, o usar otras wallets y contrato. Un proceso
con un journal local independiente no comparte el bloqueo de firma de Supabase.

El contrato activo solo permite una caída. Publicar el sitio no reinicia ese
evento ni crea otro contrato. Comprueba `pnpm check:chain` antes de la presentación.

## Verificación local

```bash
pnpm typecheck:backend
pnpm test:backend
pnpm check:web
pnpm build
pnpm dlx vercel@latest dev -L --listen 3005
```

`vercel dev -L` levanta los dos servicios e inyecta el binding sin publicar ni
necesitar vincular un proyecto. Configura las variables de desarrollo en el
entorno del proceso o mediante Vercel al vincularlo; no dupliques secretos en
archivos nuevos. Para el flujo completo usa Supabase también en vercel dev.
`/api/health` debe responder desde la API interna a través del proxy de `web`.

`vercel dev` no arranca daemons. Puedes probar su empaquetado con:

```bash
docker build -t safewhale-monitor .
docker run --rm --env-file web/.env.local safewhale-monitor
```

Esos comandos arrancan un monitor que puede firmar transacciones: detén antes
otro monitor con las mismas wallets y utiliza el namespace correcto. El daemon
requiere Supabase y rechaza el almacenamiento en archivos.

## Verificación después de tu despliegue

1. Abre `/api/health`: debe devolver `almacenamiento: "supabase"`, conexión y
   esquema disponibles. Esta ruta no expone claves, conexión ni URLs internas.
2. Abre `/app`: debe mostrar Monad Testnet y los saldos reales del contrato.
3. Habilita las acciones con el token de demo y comprueba la cotización.
4. En los logs de Vercel, comprueba `Monitor cloud iniciado` y revisiones sin error.
5. Cuando quieras consumir el evento de demo, compra antes de tumbar el servicio
   y verifica los hashes de reporte/pago. Esto escribe en testnet.

Un build correcto prueba el empaquetado de la aplicación; no demuestra por sí
solo que el daemon ya esté activo o que una transacción de Production se haya
confirmado. Esta preparación no publica el proyecto ni modifica Git remoto.

Referencias: [Services](https://vercel.com/docs/services),
[bindings](https://vercel.com/docs/services/bindings),
[Daemons](https://vercel.com/docs/daemons),
[configuración de Daemons](https://vercel.com/docs/daemons/config-reference).
