# Downtime Cover — interfaz v0.2

El contrato de `contracts/DowntimeCover (1).sol` y su ABI compilado están
publicados localmente. `shared/abi.json` se genera con `pnpm compile:contracts`;
`shared/config.ts` contiene la configuración pública y los valores de referencia;
`shared/types.ts` define estructuras on-chain y JSON.

La API y `/app` operan según `BACKEND_MODE`: simulación o Monad Testnet. El
monitor se inicia con `pnpm dev`. La instancia activa está en
`shared/deployment.json` y las anteriores en `shared/deployments/`. Los hashes
del ensayo completo se conservan en `contracts/testnet-evidence.json`.
Las claves permanecen en `web/.env.local`; los archivos compartidos son públicos.

## Responsables

| Persona | Archivos | Entrega |
| --- | --- | --- |
| P1 | `contracts/`, `shared/` | Contrato, dirección, ABI, constantes y tipos acordados |
| P2 | `web/lib/`, `web/app/api/`, `monitor/` | API, agente Gemini, conexión ethers y monitor |
| P3 | `web/app/page.tsx`, `web/components/`, `web/hooks/` | Interfaz responsive y polling |

Los archivos de configuración y documentos de la raíz se coordinan entre todos.
No modificar las carpetas de otro integrante ni crear commits o pushes sin su
autorización. No guardar claves privadas ni API keys en `shared/` o en variables
`NEXT_PUBLIC_*`.

## Parámetros de referencia para el próximo despliegue

| Parámetro | Referencia |
| --- | --- |
| Red | Monad Testnet, chain ID `10143` |
| Activo | MON nativo de testnet; esta versión no implementa stablecoins |
| Servicio on-chain | Solo `1` = Exchange Demo. Stripe (`2`) existe únicamente en la simulación actual |
| Prima por hora | `0.001 MON` = `1000000000000000 wei` |
| Pago fijo por póliza | `0.01 MON` = `10000000000000000 wei` |
| Duración comprable | Entero entre 1 y 24 horas; 4 horas en el guion |
| Umbral de caída | 10 segundos en demo; no equivale a una prima actuarial |
| Máximo de pólizas con reserva global | 50; incluye vencidas con reportes o pagos pendientes |
| Tope de pagos por evento | 30 pólizas = `0.30 MON`, sumando fondo y bono |
| Fondo inicial sugerido | `1 MON`, separado del bono |
| Bono mínimo del constructor | `0.30 MON` = 30 × `0.01 MON` |
| Bono inicial sugerido | `0.50 MON` |
| Carencia | 0 segundos |
| Plazo máximo de reporte | 120 segundos desde el inicio de la caída |
| Reclamo por falta de pago | Desde 30 segundos después del reporte on-chain |
| Polling del frontend y monitor | Cada 2 segundos, sin solicitudes superpuestas |
| Tormenta | Hasta 30 pólizas ya compradas y elegibles |

Los montos JSON son cadenas decimales en MON. Los montos Solidity son enteros en
wei. Los timestamps JSON y on-chain son Unix en segundos; el cronómetro del
frontend convierte a milisegundos. Los IDs se serializan como cadenas para evitar
pérdida de precisión de `uint256` en JavaScript.

## Interfaz publicada del contrato

La fuente de verdad para firmas, tuplas, eventos y errores es `shared/abi.json`.
La web la importa desde `web/hooks/abi.ts`, sin reconstruir un ABI manual.

```solidity
constructor(
    address agent,
    uint256 precioHora, uint256 indemnizacion, uint256 stakeMinimo,
    uint256 carencia, uint256 tiempoReclamo, uint256 umbralSegundos,
    uint256 topePorEvento, uint256 maxHoras, uint256 plazoReporte
);
fund() external payable; // onlyOwner
stakeBond() external payable; // onlyAgent
buyCover(uint256 servicioId, uint256 horas) external payable returns (uint256 id);
reportOutage(uint256 servicioId, uint256 inicioCaida, uint256 duracionSegundos,
             bytes32 evidenciaHash) external returns (uint256 caidaId); // onlyAgent
payout(uint256 polizaId) external; // onlyAgent
claimAgentFailure(uint256 polizaId) external; // dueño de la póliza
getPolicy(uint256 polizaId) external view returns (Poliza memory);
getPolicies() external view returns (Poliza[] memory);
listarPolizas(uint256 desde, uint256 cantidad) external view returns (Poliza[] memory);
getOutage(uint256 servicioId) external view returns (Caida memory);
caidaPagable(uint256 polizaId) external view returns (uint256);
fundBalance() external view returns (uint256);
bondBalance() external view returns (uint256);
expirar(uint256 polizaId) external;
retirar(uint256 monto) external; // onlyOwner
retirarBono(uint256 monto) external; // onlyAgent
```

`demoConstructorArgs(agent)` en `shared/config.ts` devuelve los diez argumentos
en ese orden. Son valores de referencia, no valores leídos de un despliegue.
La dirección del agente debe ser distinta de cero y controlada por su wallet.

`Poliza`: `id`, `dueno`, `servicioId`, `inicio`, `fin`, `estado`.
`Caida`: `id`, `servicioId`, `inicio`, `reportadoEn`, `duracionSegundos`,
`evidenciaHash`, `pagosRealizados`.
`EstadoPoliza`: `Activa=0`, `Pagada=1`, `Expirada=2`. ethers devuelve los enteros
como `bigint`; JSON usa IDs decimales como strings y timestamps en segundos.
Una lectura puede mostrar `Expirada` y conservar un derecho pendiente;
`caidaPagable` permite consultar si sigue existiendo un siniestro cobrable.

Los getters de parámetros son `precioHora`, `indemnizacion`, `stakeMinimo`,
`carencia`, `tiempoReclamo`, `umbralSegundos`, `topePorEvento`, `maxHoras` y
`plazoReporte`. `SERVICIO_DEMO` vale 1 y `MAX_POLIZAS_CON_RESERVA` vale 50.
`poolDisponible()` ya no existe: usar `fundBalance()` para el fondo;
`bondBalance()` para el bono. `obtenerBalanceContrato()` devuelve el saldo físico
total, que no debe usarse como fondo disponible.

Reglas del contrato:

- Constructor: bono mínimo suficiente para todo el tope del evento. No puede
  desplegarse con un mínimo inferior a `indemnizacion × topePorEvento`.
- Compra: prima exacta, solo servicio 1, de 1 a `maxHoras`, bono mínimo depositado,
  fondo solvente, sin caída reportada y máximo de 50 reservas pendientes.
- Elegibilidad: `poliza.inicio <= caida.inicio < poliza.fin`. El inicio de la caída
  es declarado por el agente, el oráculo de confianza. El hash identifica evidencia
  y no demuestra su veracidad. Una compra posterior al inicio no resulta elegible.
- Reporte: duración en segundos al menos igual al umbral, inicio no futuro,
  duración no mayor que el tiempo transcurrido, evidencia no nula y presentación
  dentro de `plazoReporte` desde el inicio. Solo un reporte por despliegue.
- Reportar después del fin de una póliza puede probar una caída iniciada dentro
  de su cobertura. Sin reporte, la reserva se conserva hasta `fin + plazoReporte`;
  con un siniestro elegible y cupo, se conserva hasta pagar o agotar el tope.
- Un pago por póliza desde el fondo o el bono, siempre al dueño y por monto fijo.
  Los payouts no consumen el bono; los reclamos no consumen el fondo.
- Reclamo: dueño, reporte elegible, espera desde `reportadoEn`, póliza sin pagar,
  bono suficiente y cupo. Los reclamos reducen el bono legítimamente; si queda
  bajo el mínimo, los retiros adicionales se bloquean mientras existan reservas.
- El owner solo retira fondo que exceda las reservas. El agente solo retira bono
  conservando `stakeMinimo` mientras existan reservas, también después del vencimiento.
- El tope comparte payouts y reclamos; no garantiza pagar las 50 pólizas si el
  evento permite solo 30 pagos. Repetir el ensayo requiere una nueva instancia.

Eventos y campos publicados, en orden:

- `CoverComprada(polizaId, dueno, servicioId, inicio, fin, prima)`; los tres
  primeros campos son indexed.
- `CaidaReportada(caidaId, servicioId, inicio, reportadoEn, duracionSegundos, evidenciaHash)`;
  los dos primeros campos son indexed.
- `Pagado(polizaId, dueno, monto, caidaId)` y `Reclamado(...)`;
  `polizaId`, `dueno` y `caidaId` son indexed.
- `FondoDepositado(emisor, monto, fondoTotal)`, `BonoDepositado(agente, monto, bonoTotal)`,
  `PolizaExpirada(polizaId)`, `FondoRetirado(destinatario, monto)` y
  `BonoRetirado(destinatario, monto)`.

Los errores reales están incluidos en el ABI, entre ellos `SinCaida`, `YaPagada`,
`FueraDeVentana`, `NoEsDueno`, `EsperaPendiente`, `TopeEvento`,
`FondoInsuficiente`, `BonoInsuficiente`, `PrimaIncorrecta`, `DuracionInvalida`,
`ServicioInvalido`, `CaidaYaReportada`, `ReporteFueraDePlazo` y `DerechoPendiente`.

Verificar antes de entregar o desplegar:

```bash
pnpm compile:contracts
pnpm test:contracts
pnpm check:web
pnpm typecheck:backend
pnpm test:backend
```

La simulación comparte precios, reservas pendientes, topes y reglas de pago,
pero nunca produce hashes ni representa movimientos de MON. En testnet, las
compras y los reclamos los firma la wallet de usuario de demo; reportes y payouts
usan la wallet del agente. Las respuestas exitosas requieren receipt y bloque
finalizado. Una respuesta incierta conserva hash y clave para reconciliarla.

## API que P2 entrega a P3

Todas las rutas usan Node.js. GET de estado con `Cache-Control: no-store`.
Validar bodies, servicio, IDs y límites antes de firmar. Los endpoints mutantes de testnet requieren `DEMO_API_TOKEN` por Bearer o una
sesión HttpOnly del mismo origen. `/api/demo-session` establece esa sesión. El
navegador no recibe claves privadas. El estado de archivos requiere un proceso
local persistente; esta versión no permite desplegar la API en Vercel.
La API usa únicamente wallets de demo configuradas en servidor: recibir una
dirección en el body no autoriza firmar en nombre de esa dirección.

| Método y ruta | Body JSON | Resultado |
| --- | --- | --- |
| `GET /api/estado` | — | Estado completo indicado abajo |
| `POST /api/comprar` | `{servicioId:1,horas:4}` | Póliza, tx confirmada y tiempo observado |
| `POST /api/tumbar` | `{servicioId:1}` | Activa caída simulada; no adelanta el umbral ni paga directamente |
| `POST /api/atacar` | `{polizaId:"1"}` | Intenta payout sin caída; rechazo con motivo legible |
| `POST /api/apagar-agente` | `{}` | Deshabilita payouts del agente en el estado compartido |
| `POST /api/reclamar` | `{polizaId:"1"}` | Reclamo firmado por wallet de usuario de demo |
| `POST /api/tormenta` | `{polizaIds:["1","2"]}` | Máximo 30, una salida por ID y duración total |
| `POST /api/chat` | `{mensaje:"Cubre el exchange por 4 horas"}` | Texto y propuesta de compra; no compra por sí sola |
| `GET /api/exchange-mock` | — | `200` si disponible; `503` si caído |

`Idempotency-Key` en compra y acciones mutantes: conservar el resultado por clave
y body; reusar la clave con otro body devuelve conflicto. P3 genera una clave por
acción del usuario y la reutiliza al reintentar. No reintentar automáticamente una
transacción cuyo resultado sea desconocido: buscar primero su receipt/hash.

Estado de referencia para P3:

```json
{
  "modo": "simulado",
  "chainId": 10143,
  "contrato": null,
  "fondo": "1.000",
  "bono": "0.500",
  "agenteActivo": true,
  "exchangeCaido": false,
  "polizas": [
    {"id":"1","dueno":"0x0000000000000000000000000000000000000001","servicioId":1,"inicio":1792252800,"fin":1792267200,"estado":"Activa"}
  ],
  "eventos": [
    {"id":"evt-1","tipo":"CoverComprada","polizaId":"1","txHash":null,"timestamp":1792252800,"ok":true,"motivo":null,"origen":"simulado"}
  ]
}
```

`modo` es `simulado` o `testnet`. Las transacciones simuladas usan `txHash: null`
y nunca enlazan al explorer. En testnet, `txHash` debe ser real y el evento solo
se presenta como confirmado después de un receipt exitoso. Un rechazo detectado
por `estimateGas` puede no tener hash ni transacción minada; decirlo en pantalla.

Éxito mutante: `{ok:true, modo, txHash, duracionMs, poliza?, resultados?}`.
Error: `{ok:false,error:{codigo,mensaje},txHash:null}`; HTTP 400 validación, 401/403
autorización, 409 conflicto de estado, 429 cuota y 503 configuración/proveedor.
No devolver claves, bodies completos de proveedores ni errores crudos del RPC.
Tormenta devuelve `{polizaId,ok,txHash,motivo}` por póliza, incluyendo fallos
parciales. Su cronómetro termina tras las confirmaciones, no al enviar la petición.

## Agente de IA: Gemini

Proveedor propuesto tras la consulta del equipo: Gemini Developer API desde
Google AI Studio, usando un modelo con free tier habilitado en el proyecto.
Modelo configurable en `GEMINI_MODEL`; comprobar disponibilidad y cuota antes
del ensayo. No prometer una cantidad fija de peticiones gratuitas.

- Gemini interpreta la conversación y llama herramientas permitidas:
  `consultarEstado` y `cotizarCobertura(servicioId, horas)`.
- La cotización calcula prima y pago a partir de configuración validada, nunca
  de montos escritos libremente por el modelo.
- `/api/chat` devuelve `compraPropuesta:{servicioId,horas,prima,pagoFijo}`.
  P3 muestra confirmación y después llama `/api/comprar`.
- No exponer herramientas de tumbar, apagar, transferir, escoger destino o
  modificar montos al modelo. No incluir secretos en prompts.
- Timeout y manejo explícito de 429. Si no hay API key o cuota, mostrar
  `iaDisponible:false` y conservar los botones manuales. No llamar IA a un parser
  local ni presentar respuestas pregrabadas como inferencia en vivo.
- El free tier puede utilizar contenido para mejorar productos de Google.
  Usar datos de demo y evitar información sensible en los mensajes.

## Monitor y estado compartido

Para el primer flujo ejecutar Next.js y monitor en local. El monitor consulta
`/api/exchange-mock` cada 2 s, registra el primer fallo, exige caída continua
durante el umbral, reporta una vez y paga pólizas elegibles. Al recuperar el
servicio antes del umbral, reinicia el contador. Un timeout o fallo de red aislado
no debe convertirse inmediatamente en caída demostrada.

API y monitor deben compartir interruptores y seguimiento del evento mediante
`state.json` con ruta absoluta acordada, escrituras atómicas y exclusión de
mutaciones, o una API respaldada por almacenamiento durable. No mantener dos
copias independientes en memoria. Persistir hashes enviados y reconciliar
receipts tras reinicios para evitar reportes y pagos repetidos.

API y monitor comparten el journal `STATE_FILE.chain.json` y un bloqueo de
archivo entre procesos. Las transacciones guardan bytes firmados, hash y nonce
antes del broadcast, y reconciliar un envío pendiente bloquea nuevos envíos de
esa wallet. Un reintento no crea otra compra. El navegador conserva únicamente
las claves de idempotencia pendientes en sessionStorage para sobrevivir recargas.

El monitor reporta y paga normalmente; Tormenta usa el mismo bloqueo para
serializar sus payouts y devolver resultados parciales por ID. La firma del
agente no puede enviar importes o destinos arbitrarios a través de estas API.
Detener los procesos antes de cambiar de instancia evita utilizar las mismas
wallets simultáneamente en dos despliegues. No prometer 30 pagos en un segundo.

`state.json` local no es almacenamiento compartido para Vercel. Antes de desplegar,
mover el estado a un almacén durable y alojar el monitor en un proceso persistente,
o mantener toda la demo local. Un monitor local llamando endpoints de Vercel no
soluciona por sí solo la persistencia de las funciones.

## Qué demuestra apagar el agente

Para el guion: comprar, tumbar, esperar **CaidaReportada confirmada**, desactivar
payouts y, tras 30 s desde el reporte, reclamar con la wallet del usuario.
El reclamo no depende de Gemini ni del proceso de payouts.

Si se apaga el único monitor antes de reportar, el contrato no conoce la caída y
el reclamo descrito no puede probarla. No prometer protección frente a ese caso.
Resolverlo requiere un reportero independiente o un mecanismo de prueba adicional.
`agenteActivo:false` significa payouts desactivados en esta demo, sin
confundirlo con una caída completa de toda la API.

## Variables de entorno propuestas

```dotenv
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
MONAD_CHAIN_ID=10143
CONTRACT_ADDRESS=
CONTRACT_DEPLOY_BLOCK=
OWNER_PRIVATE_KEY=
TX_WAIT_MS=45000
AGENT_PRIVATE_KEY=
DEMO_USER_PRIVATE_KEY=
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash-lite
APP_BASE_URL=http://localhost:3000
STATE_FILE=/ruta/absoluta/SafeWhale/state.json
DEMO_API_TOKEN=
```

Los valores privados se configuran fuera de Git. Mantener `.env.example` sin
secretos. Al reiniciar la API, no regenerar wallets ni cambiar de contrato
silenciosamente. El backend debe comprobar red, bytecode y configuración antes de
habilitar firmas.

## Validación por entregas

1. Contrato, ABI y parámetros publicados; dirección y bloque activos en shared/deployment.json.
2. P2 entrega `/api/estado` y compra simulada; P3 conecta polling y estados de error.
3. P2 conecta compra testnet y comprueba receipt, dueño y prima exactos.
4. Monitor: caída continua, reporte único, payout único, reinicio y fallo parcial.
5. Ataque: usar una póliza activa sin caída; mostrar el error real del contrato.
6. Gemini: cotización con function calling y compra solo tras confirmación.
7. Reclamo: reporte previo, espera, pago del bono, rechazo de doble cobro y de otro dueño.
8. Tormenta: hasta 30 pólizas preparadas, resultados individuales y tiempos medidos.

No afirmar integración real por tener un RPC configurado o un link al explorer.
La cifra de pérdidas para el slide sigue pendiente de investigación y fuente;
no sustituirla por una cifra inventada.

## Fuentes técnicas

- [Gemini: precios y nivel gratuito](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini: límites por proyecto](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Gemini: function calling](https://ai.google.dev/gemini-api/docs/function-calling)
- [Gemini: modelos disponibles](https://ai.google.dev/gemini-api/docs/models)
- [ethers v6: documentación y NonceManager](https://docs.ethers.org/v6/single-page/)

Los endpoints de red de Monad provienen del contexto del equipo y deben
comprobarse al conectar el contrato. Este documento no prueba disponibilidad del RPC.
