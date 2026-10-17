# SafeWhale: guía de presentación

## Preparar la demo

```bash
pnpm check:env:testnet
pnpm check:db
pnpm check:demo
pnpm dev
```

`check:demo` verifica Supabase, permisos, contrato, disponibilidad para comprar,
evento disponible, pagos habilitados, gas del agente y transacciones pendientes.
No envía transacciones. `geminiConfigurado` indica presencia de la clave; no
certifica disponibilidad ni cuota del proveedor.

Antes de la presentación crea una copia del estado:

```bash
pnpm db:backup
pnpm db:verify-backup supabase/backups/ARCHIVO_GENERADO.json
```

El segundo comando recupera la copia en un espacio temporal, compara su contenido
y lo elimina. La conexión administrativa se utiliza únicamente para esa limpieza.

## Recorrido sugerido

1. Explica el problema: una caída de un servicio puede interrumpir ingresos.
2. Muestra la cobertura por horas, la prima y la indemnización antes de comprar.
3. Compra y muestra el hash confirmado en el explorador de Monad.
4. Usa el intento de pago inválido antes de la caída para mostrar la protección del contrato.
5. Activa la caída de demostración. El monitor observa la continuidad, reporta y paga.
6. Muestra la póliza pagada, el cambio del fondo y el evento confirmado.

Presenta la caída como **un mock de demostración**. Las transacciones de testnet
son verificables; la observación del mock no equivale a un oráculo de producción.
Supabase conserva el journal y el historial; el contrato determina pagos y saldos.

Para mostrar el reclamo del bono, prepara otra instancia y apaga los pagos antes
de la caída. Tras el tiempo de espera, el dueño reclama. El contrato admite una
sola caída por despliegue, por lo que ambos recorridos requieren instancias distintas.

## Preparar otro ensayo

Detén el servidor y el monitor antes de cambiar el contrato. Usa una nueva ruta
de journal y conserva la misma ruta si necesitas reintentar el despliegue:

```bash
pnpm deploy:testnet --new-state-file=/ruta/absoluta/state.json.ensayo2
pnpm check:demo
pnpm dev
```

Cuando se usa Supabase, un contrato nuevo recibe automáticamente un
`STATE_NAMESPACE` independiente. Los registros de la instancia anterior se conservan.
Repetir el mismo despliegue mantiene su destino; restaurar el mock no reinicia el contrato.

## Si algo falla durante la presentación

- Una respuesta perdida se reintenta con la misma clave; no recargues para generar otra compra.
- Si Gemini devuelve un error, continúa con la compra manual y describe claramente qué parte falló.
- Si Supabase o el RPC no responde, conserva la operación pendiente y vuelve a consultar el estado.
- Si la instancia ya consumió su caída, utiliza otra instancia preparada. No borres el historial.

## Alcance actual

La demo usa wallets de servidor y acceso de demostración. Las cuentas individuales,
la firma con wallets de usuarios finales y un oráculo externo son trabajo posterior.
Los respaldos creados aquí son copias locales privadas de SafeWhale; conserva otra
copia fuera del equipo si necesitas protección frente a la pérdida del ordenador.
Esta guía y las comprobaciones de DB no certifican un despliegue público en la nube.
