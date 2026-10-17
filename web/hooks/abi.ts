// ABI legible de DowntimeCover (copiada de la referencia de diseño).
// TODO: cambiar por `shared/abi.json` cuando P1 publique la ABI compilada (hoy el archivo está vacío).
export const ABI = [
  'function buyCover(uint256 servicioId, uint256 horas) payable returns (uint256)',
  'function claimAgentFailure(uint256 polizaId)',
  'function precioHora() view returns (uint256)',
  'function indemnizacion() view returns (uint256)',
  'function bonoAgente() view returns (uint256)',
  'function poolDisponible() view returns (uint256)',
  'function topePorEvento() view returns (uint256)',
  'function maxHoras() view returns (uint256)',
  'function stakeMinimo() view returns (uint256)',
  'event CoverComprada(uint256 indexed polizaId, address indexed dueno, uint256 servicioId, uint256 inicio, uint256 fin)',
  'error AgenteSinBono()', 'error AunNoExpiradoElPlazo()', 'error CaidaBajoUmbral()', 'error FondosInsuficientes()',
  'error HorasInvalidas()', 'error PolizaInvalida()', 'error PolizaVigente()', 'error Reentrada()', 'error SinCaida()',
  'error SinLiquidez()', 'error SoloAgent()', 'error SoloDueno()', 'error TopeEventoAlcanzado()', 'error TransferenciaFallida()',
  'error YaPagada()'
];
