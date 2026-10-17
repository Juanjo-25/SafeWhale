# Downtime Cover — interfaz propuesta v0.1

Propuesta para acordar entre P1, P2 y P3 antes de implementar. No describe un
contrato desplegado ni endpoints implementados. P1 confirma las firmas y publica
el ABI real; P2 adapta `web/lib/contract.ts` a ese ABI. El nombre del repositorio
es SafeWhale y el nombre de la demo es Downtime Cover.

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

## Parámetros de la demo, pendientes de aprobación del equipo

| Parámetro | Propuesta |
| --- | --- |
| Red | Monad Testnet, chain ID `10143` |
| Activo | MON nativo de testnet; esta versión no implementa stablecoins |
| Servicio | `1` = Exchange Demo; `2` = Bridge Demo, reservado para después |
| Prima por hora | `0.001 MON` = `1000000000000000 wei` |
| Pago fijo por póliza | `0.01 MON` = `10000000000000000 wei` |
| Duración comprable | Entero entre 1 y 24 horas; 4 horas en el guion |
| Umbral de caída | 10 segundos en demo; no equivale a una prima actuarial |
| Máximo de pólizas activas global | 50 |
| Tope de pagos por evento | 30 pólizas = `0.30 MON`, sumando fondo y bono |
| Fondo inicial sugerido | `1 MON`, separado del bono |
| Bono inicial sugerido | `0.50 MON` |
| Reclamo por falta de pago | Desde 30 segundos después del reporte on-chain |
| Polling del frontend y monitor | Cada 2 segundos, sin solicitudes superpuestas |
| Tormenta | Hasta 30 pólizas ya compradas y elegibles |

Los montos JSON son cadenas decimales en MON. Los montos Solidity son enteros en
wei. Los timestamps JSON y on-chain son Unix en segundos; el cronómetro del
frontend convierte a milisegundos. Los IDs se serializan como cadenas para evitar
pérdida de precisión de `uint256` en JavaScript.

## Acuerdo con P1: contrato

Firmas propuestas, que P1 debe validar antes de que P2 conecte transacciones:

```solidity
fund() external payable; // onlyOwner
stakeBond() external payable; // onlyAgent
buyCover(uint256 servicioId, uint256 horas) external payable returns (uint256);
reportOutage(uint256 servicioId, uint256 duracionSegundos, bytes32 evidenciaHash) external;
payout(uint256 polizaId) external; // onlyAgent
claimAgentFailure(uint256 polizaId) external; // dueño de la póliza
getPolicies() external view returns (Policy[] memory);
getOutage(uint256 servicioId) external view returns (Outage memory);
fundBalance() external view returns (uint256);
bondBalance() external view returns (uint256);
```

Se propone cambiar el parámetro original `minutos` por `duracionSegundos` para
representar el umbral de 10 segundos. No usar minutos fraccionarios ni unidades
implícitas. Si P1 conserva minutos enteros, el umbral de demo debe pasar a 1 minuto.

`Policy`: `id`, `dueno`, `servicioId`, `inicio`, `fin`, `estado`.
`Outage`: `id`, `servicioId`, `inicio`, `reportadoEn`, `duracionSegundos`,
`evidenciaHash`, `pagosRealizados`.
`Estado`: `Activa=0`, `Pagada=1`, `Expirada=2`; la lectura debe reflejar la
expiración sin exigir que cada usuario envíe una transacción.

Invariantes que contrato y simulación deben respetar:

- Compra: prima exacta, servicio habilitado, duración válida, sin evento de caída
  reportado para ese servicio y sin superar el máximo de pólizas activas.
- Caída elegible: `poliza.inicio <= caida.inicio < poliza.fin`. Comprar durante
  una caída no debe habilitar un pago. Un reporte posterior al fin puede probar
  una caída ocurrida durante la cobertura; expirar no debe borrar ese derecho.
- P1 debe definir cómo obtener `caida.inicio` y acotar reportes antiguos. El agente
  sigue siendo el oráculo de confianza; un hash por sí solo no demuestra la caída.
- Un pago por póliza, ya sea desde el fondo o desde el bono. Siempre al dueño;
  ninguna función de pago recibe un destino o monto arbitrario.
- Fondo y bono tienen contabilidad separada. Fondos insuficientes revierten;
  el contrato no usa silenciosamente el bono para un payout normal.
- Reclamo: dueño, reporte elegible, espera cumplida, póliza sin pagar, bono
  suficiente y tope del evento disponible. Marca pagada antes de transferir.
- El tope por evento incluye payouts y reclamos. No garantiza compensar a todas
  las pólizas si se venden más coberturas que el tope; esto debe mostrarse en demo.
- Proponer un solo evento por servicio y despliegue para el MVP. Repetir un
  reporte del mismo servicio revierte y no reinicia la espera ni el tope.
  Para ensayar otra caída, desplegar otra instancia. Varios incidentes por servicio
  requieren IDs, recuperación y asociación póliza-evento explícitos.

Eventos propuestos: `CoverComprada`, `CaidaReportada`, `Pagado`, `Reclamado`,
`FondoDepositado`, `BonoDepositado`. Deben incluir IDs, dueño y monto cuando
corresponda. Errores: `SinCaida`, `YaPagada`, `FueraDeVentana`, `NoEsDueno`,
`EsperaPendiente`, `TopeEvento`, `FondoInsuficiente`, `BonoInsuficiente`,
`PrimaIncorrecta`, `DuracionInvalida`, `ServicioInvalido`, `CaidaYaReportada`.

P1 entrega también dirección, bloque de despliegue, constructor y las constantes
reales. No construir un ABI ficticio como si proviniera de Remix.

## API que P2 entrega a P3

Todas las rutas usan Node.js. GET de estado con `Cache-Control: no-store`.
Validar bodies, servicio, IDs y límites antes de firmar. Los endpoints de control
de demo deben estar protegidos; acordar el mecanismo antes de exponerlos en Vercel.
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

Un `NonceManager` por proceso no coordina dos procesos con la misma wallet.
Propuesta: el monitor es el único emisor de `reportOutage` y `payout`, incluida
Tormenta; la API solicita trabajo al monitor. Serializar los envíos por wallet,
usar `NonceManager` de ethers v6 y esperar receipts con concurrencia acotada.
No asumir 30 RPC simultáneas ni 30 transacciones minadas en un segundo.

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
`agenteActivo:false` debe significar payouts desactivados en esta demo, sin
confundirlo con una caída completa de toda la API.

## Variables de entorno propuestas

```dotenv
MONAD_RPC_URL=https://testnet-rpc.monad.xyz
MONAD_CHAIN_ID=10143
CONTRACT_ADDRESS=
CONTRACT_DEPLOY_BLOCK=
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

1. P1 confirma firmas, unidades y parámetros; publica contrato mínimo, dirección y ABI.
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
