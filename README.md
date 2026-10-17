# SafeWhale

Para publicar el sitio, la API y el monitor en un solo proyecto de Vercel,
consulta [DEPLOY_VERCEL.md](DEPLOY_VERCEL.md) y la propuesta de `vercel.json`.
El backend canónico está en `api/app/api/`; `web/app/api/` conserva las rutas
públicas y las delega por binding en Vercel o al mismo handler en ejecución local.

Cobertura por horas con Next.js, contrato DowntimeCover, monitor local y
cotizaciones mediante Gemini. La API usa `BACKEND_MODE=simulado` o `testnet`;
la pantalla muestra el modo y solo enlaza hashes reales en testnet.

## Ejecutar

```bash
pnpm install
pnpm check:env
pnpm dev
```

Abre [la app local](http://127.0.0.1:3001/app). `pnpm dev` inicia Next.js y el
monitor juntos, usando el puerto de `APP_BASE_URL`. Al cerrar el servidor se
cierra también el monitor. `pnpm monitor:once` permite una revisión de diagnóstico.

En simulación local no hace falta login. En testnet, introduce el
`DEMO_API_TOKEN` del servidor para habilitar transacciones desde las wallets de
demo. La sesión usa una cookie HttpOnly; los webviews que no la conservan usan
el token únicamente en memoria. Nunca se guardan claves privadas en el navegador.

## Instancia de testnet

La dirección y el bloque activos están en [shared/deployment.json](shared/deployment.json).
El historial público se conserva en `shared/deployments/`. La configuración privada
está exclusivamente en `web/.env.local`, fuera de Git.

```bash
pnpm check:env:testnet
pnpm check:chain
pnpm wallets:balances
```

`check:chain` verifica red 10143, bytecode de la versión actual, wallet del agente,
bono mínimo y saldos. La configuración publicada no sustituye esa comprobación.
El contrato solo cubre Exchange Demo (servicio 1); Stripe (2) está disponible en
simulación. La caída siempre se activa en un mock local de demostración.

## Recorrido de demo

1. Compra una o más pólizas y espera la confirmación.
2. En **Modo demo**, usa **Atacar al agente** antes de la caída: verifica el revert
   con `eth_call`, sin gastar gas ni inventar una transacción.
3. Para pago automático, deja habilitados los pagos y pulsa **Tumbar servicio**.
   El monitor exige 10 segundos de observación continua, reporta y paga.
4. Para reclamar del bono, apaga los pagos antes de tumbar. El monitor sigue
   reportando. Tras 30 segundos desde el reporte, el dueño puede reclamar.
5. Tormenta paga hasta 30 pólizas elegibles, con resultados individuales y tiempo
   medido hasta sus receipts. El monitor y la API serializan las firmas mediante
   el mismo journal y bloqueo, incluyendo los nonces.

Las pólizas con un derecho pendiente pueden reclamar después de vencer. El
fondo y el bono se muestran separados. El bono mínimo es `0.30 MON` para hasta
30 indemnizaciones de `0.01 MON`; las pólizas adicionales no aumentan ese tope.
El agente necesita también MON en su wallet para pagar gas.

El contrato admite **una sola caída por despliegue**. Restaurar el mock no reinicia
el contrato. Para ensayar otra caída, crea una instancia nueva con otra STATE_FILE.

## Preparar otra instancia

Detén `pnpm dev` antes de desplegar para que ningún proceso utilice esas wallets
mientras cambia la instancia.

```bash
pnpm wallets:init
pnpm compile:contracts
pnpm deploy:testnet --new-state-file=/ruta/absoluta/state.json.otro-ensayo
pnpm check:chain
pnpm dev
```

`wallets:init` conserva las claves existentes y solo crea las que faltan.
El deploy registra cada transacción firmada antes de enviarla; repetir el comando
con **la misma ruta** recupera el mismo despliegue. Deposita 1 MON en el fondo,
0.50 MON en el bono y prepara un presupuesto estimado de gas para el agente.
Solo opera en testnet y usa wallets de demo. Usa el
[faucet oficial](https://faucet.monad.xyz/) si faltan tokens de desarrollo.

El estado simulado original, los journals y los despliegues anteriores se conservan.
La nueva instancia se activa en `web/.env.local` después de confirmar el fondeo.
Los archivos de estado requieren un servidor persistente; esta versión rechaza
el almacenamiento local dentro de funciones de Vercel.

## Evidencia y verificaciones

La persistencia de la demo usa Supabase con TLS, un usuario restringido,
historial de eventos y respaldos verificables. La configuración está en
[supabase/README.md](supabase/README.md). Antes de presentar, ejecuta
`pnpm check:demo` y consulta [la guía del hackathon](docs/HACKATHON.md).

[contracts/testnet-evidence.json](contracts/testnet-evidence.json) conserva los
hashes del ensayo real: compra, caída reportada, reclamo del bono y payout.
La instancia activa posterior al ensayo queda nueva y lista para comprar.

```bash
pnpm typecheck:backend
pnpm test:backend
pnpm check:web
pnpm test:contracts
pnpm build
```

`pnpm smoke:testnet` ejecuta el recorrido completo contra la API local y consume
el único evento de la instancia actual. No lo ejecutes si quieres reservar ese
evento para una presentación. Las pruebas unitarias usan una EVM temporal local.

El ABI se genera en `shared/abi.json`; la web y el servidor importan el mismo
archivo. `INTERFAZ.md` documenta firmas, unidades, restricciones y respuestas.
Las consultas de eventos se paginan en 100 bloques según los
[límites del RPC de Monad](https://docs.monad.xyz/reference/json-rpc/overview#eth-getlogs),
y las transacciones se muestran confirmadas al alcanzar el bloque finalizado.

Gemini cotiza con los parámetros del contrato y exige confirmación para comprar.
Si no tiene cuota o configuración válida, muestra el error y conserva la compra
manual; nunca sustituye una inferencia fallida por una respuesta pregrabada.
