# Bono garantizado

El constructor exige `stakeMinimo >= indemnizacion × topePorEvento`.
Con una indemnización de `0.01 MON` y un tope de 30 pagos, el mínimo es
`0.30 MON` (`300000000000000000 wei`). El bono inicial sugerido sigue siendo
`0.50 MON`.

La compra exige depositar ese mínimo. Mientras existan pólizas con reserva,
incluidos derechos pendientes después del vencimiento, el agente solo puede
retirar el excedente sobre ese mínimo. Los reclamos sí descuentan indemnizaciones
del bono; si queda por debajo del mínimo, los retiros permanecen bloqueados
hasta cerrar o liberar las reservas.

El máximo de pólizas con reserva es 30, igual al tope predeterminado del evento.
El constructor rechaza topes mayores a ese máximo. La garantía cubre hasta el
tope compartido entre payouts y reclamos y no garantiza un reclamo cuando la
caída no fue reportada por el agente.

## Verificación local

Desde la raíz del repositorio:

```bash
pnpm compile:contracts
pnpm test:contracts
```

Las pruebas compilan el contrato, lo ejecutan en una EVM local y verifican:

- Rechazo de un mínimo insuficiente y aceptación del mínimo exacto.
- Rechazo de topes mayores al máximo de pólizas con reserva.
- Rechazo de parámetros extremos sin overflow o división por cero.
- Bloqueo de compras antes de completar el bono.
- Retiros con reservas vigentes y derechos posteriores al vencimiento.
- Reclamos consecutivos y liberación del bono sobrante al cerrar las reservas.
- Treinta reclamos completos desde un bono de `0.30 MON`, sin tocar el fondo.
- Tope compartido, doble cobro y correspondencia del artefacto con el código.

`compile:contracts` conserva Solidity 0.8.34 y optimización de 200 runs del
artefacto original y también genera `shared/abi.json`. Las pruebas usan Shanghai
por compatibilidad con la EVM local. El ensayo de interfaz despliega los valores
de `shared/config.ts` y ejecuta compra, reporte y pago usando el ABI compartido.
Para un contrato ya desplegado, el cambio requiere desplegar una nueva instancia.
