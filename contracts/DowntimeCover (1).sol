// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title DowntimeCover — seguro paramétrico por horas contra caídas de plataformas cripto
/// @notice 3 capas de protección:
///  1. Bóveda: el agente solo puede ejecutar payout; el contrato exige caída reportada en la
///     ventana de la póliza, un pago por póliza, monto fijo, destino = dueño y tope por evento.
///  2. Pago paramétrico: el disparador son los minutos de caída (>= umbral).
///  3. Bono del agente: si reportó la caída y no pagó en `tiempoReclamo`, el dueño cobra del bono.
contract DowntimeCover {
    // ───────────────────────── Tipos ─────────────────────────
    enum EstadoPoliza { Activa, Pagada, Expirada, ReclamadaBono }


    struct Poliza {
        uint256 id;
        address dueno;
        uint256 servicioId;
        uint64 inicio;   // compra + carencia
        uint64 fin;
        EstadoPoliza estado;
    }

    struct Caida {
        uint256 servicioId;
        uint64 timestamp;
        uint32 minutos;
        uint32 pagados;  // pólizas pagadas con este evento (para el tope)
    }

    // ───────────────────────── Parámetros (se fijan al desplegar) ─────────────────────────
    address public immutable owner;
    address public immutable agent;
    uint256 public immutable precioHora;
    uint256 public immutable indemnizacion;
    uint256 public immutable stakeMinimo;
    uint256 public immutable carencia;       // seg. Demo: 0-5. Prod: ~1 h (anti front-running)
    uint256 public immutable tiempoReclamo;  // seg. que tiene el agente para pagar tras reportar
    uint256 public immutable umbralMinutos;  // caída mínima para disparar
    uint256 public immutable topePorEvento;  // máx. pólizas pagadas por una misma caída
    uint256 public immutable maxHoras;

    // ───────────────────────── Estado ─────────────────────────
    uint256 public bonoAgente;       // aislado del pool de pagos
    uint256 public exposicionTotal;  // suma de indemnizaciones de pólizas activas
    uint256 public totalPolizas;
    uint256 public totalCaidas;
    bool private _locked;

    mapping(uint256 => Poliza) public polizas;              // ids desde 1
    mapping(uint256 => Caida) public caidas;                // ids desde 1
    mapping(uint256 => uint256[]) private _caidasServicio;  // servicioId => ids de caídas (orden temporal)

    // ───────────────────────── Eventos ─────────────────────────
    event FondoAdicionado(address indexed emisor, uint256 monto);
    event BonoDepositado(uint256 monto, uint256 bonoTotal);
    event CoverComprada(uint256 indexed polizaId, address indexed dueno, uint256 servicioId, uint256 inicio, uint256 fin);
    event CaidaReportada(uint256 indexed caidaId, uint256 indexed servicioId, uint256 minutos, string evidenciaHash);
    event Pagado(uint256 indexed polizaId, address indexed dueno, uint256 monto, uint256 caidaId);
    event Reclamado(uint256 indexed polizaId, address indexed dueno, uint256 monto, uint256 caidaId);
    event PolizaExpirada(uint256 indexed polizaId);
    event Retiro(address indexed a, uint256 monto);

    // ───────────────────────── Errores ─────────────────────────
    error SoloOwner();
    error SoloAgent();
    error SoloDueno();
    error FondosInsuficientes();
    error SinLiquidez();
    error AgenteSinBono();
    error HorasInvalidas();
    error PolizaInvalida();
    error YaPagada();
    error SinCaida();            // no hay caída reportada en la ventana de la póliza
    error CaidaBajoUmbral();
    error TopeEventoAlcanzado();
    error AunNoExpiradoElPlazo();
    error PolizaVigente();
    error TransferenciaFallida();
    error Reentrada();

    // ───────────────────────── Modifiers ─────────────────────────
    modifier onlyOwner() {
        if (msg.sender != owner) revert SoloOwner();
        _;
    }

    modifier onlyAgent() {
        if (msg.sender != agent) revert SoloAgent();
        _;
    }

    modifier nonReentrant() {
        if (_locked) revert Reentrada();
        _locked = true;
        _;
        _locked = false;
    }

    constructor(
        address _agent,
        uint256 _precioHora,
        uint256 _indemnizacion,
        uint256 _stakeMinimo,
        uint256 _carencia,
        uint256 _tiempoReclamo,
        uint256 _umbralMinutos,
        uint256 _topePorEvento,
        uint256 _maxHoras
    ) {
        owner = msg.sender;
        agent = _agent;
        precioHora = _precioHora;
        indemnizacion = _indemnizacion;
        stakeMinimo = _stakeMinimo;
        carencia = _carencia;
        tiempoReclamo = _tiempoReclamo;
        umbralMinutos = _umbralMinutos;
        topePorEvento = _topePorEvento;
        maxHoras = _maxHoras;
    }

    // ───────────────────────── Fondeo ─────────────────────────
    function fund() external payable onlyOwner {
        emit FondoAdicionado(msg.sender, msg.value);
    }

    function stakeBond() external payable onlyAgent {
        bonoAgente += msg.value;
        emit BonoDepositado(msg.value, bonoAgente);
    }

    // ───────────────────────── Usuario: comprar ─────────────────────────
    function buyCover(uint256 servicioId, uint256 horas) external payable nonReentrant returns (uint256 id) {
        if (horas == 0 || horas > maxHoras) revert HorasInvalidas();
        uint256 costo = precioHora * horas;
        if (msg.value < costo) revert FondosInsuficientes();
        if (bonoAgente < stakeMinimo) revert AgenteSinBono();

        uint256 excedente = msg.value - costo;
        // Solvencia: el pool (sin bono y sin el excedente a devolver) cubre todas las pólizas vivas + esta
        if (poolDisponible() - excedente < exposicionTotal + indemnizacion) revert SinLiquidez();

        id = ++totalPolizas;
        uint64 inicio = uint64(block.timestamp + carencia);
        uint64 fin = uint64(inicio + horas * 1 hours);
        polizas[id] = Poliza(id, msg.sender, servicioId, inicio, fin, EstadoPoliza.Activa);
        exposicionTotal += indemnizacion;

        emit CoverComprada(id, msg.sender, servicioId, inicio, fin);
        if (excedente > 0) _enviar(msg.sender, excedente);
    }

    // ───────────────────────── Agente: reportar y pagar ─────────────────────────
    function reportOutage(uint256 servicioId, uint256 minutos, string calldata evidenciaHash)
        external
        onlyAgent
        returns (uint256 caidaId)
    {
        if (minutos < umbralMinutos) revert CaidaBajoUmbral();
        caidaId = ++totalCaidas;
        caidas[caidaId] = Caida(servicioId, uint64(block.timestamp), uint32(minutos), 0);
        _caidasServicio[servicioId].push(caidaId);
        emit CaidaReportada(caidaId, servicioId, minutos, evidenciaHash);
    }

    /// @notice El agente solo puede pagar: monto fijo, al dueño, una vez, con caída en ventana y bajo el tope.
    function payout(uint256 polizaId) external onlyAgent nonReentrant {
        (Poliza storage pol, uint256 caidaId) = _validarSiniestro(polizaId);

        pol.estado = EstadoPoliza.Pagada;
        caidas[caidaId].pagados++;
        exposicionTotal -= indemnizacion;
        if (poolDisponible() < indemnizacion) revert SinLiquidez();

        emit Pagado(polizaId, pol.dueno, indemnizacion, caidaId);
        _enviar(pol.dueno, indemnizacion);
    }

    // ───────────────────────── Usuario: cobrar del bono si el agente no paga ─────────────────────────
    function claimAgentFailure(uint256 polizaId) external nonReentrant {
        (Poliza storage pol, uint256 caidaId) = _validarSiniestro(polizaId);
        if (msg.sender != pol.dueno) revert SoloDueno();
        if (block.timestamp < caidas[caidaId].timestamp + tiempoReclamo) revert AunNoExpiradoElPlazo();

        pol.estado = EstadoPoliza.ReclamadaBono;
        caidas[caidaId].pagados++;
        exposicionTotal -= indemnizacion;

        if (bonoAgente >= indemnizacion) {
            bonoAgente -= indemnizacion; // slashing: lo paga el agente, no el pool
        } else {
            uint256 resto = indemnizacion - bonoAgente;
            bonoAgente = 0;
            if (poolDisponible() < resto) revert SinLiquidez();
        }

        emit Reclamado(polizaId, pol.dueno, indemnizacion, caidaId);
        _enviar(pol.dueno, indemnizacion);
    }

    // ───────────────────────── Mantenimiento ─────────────────────────
    /// @notice Libera la exposición de una póliza vencida sin siniestro pagable. Cualquiera puede llamarla.
    function expirar(uint256 polizaId) external {
        Poliza storage pol = polizas[polizaId];
        if (pol.dueno == address(0)) revert PolizaInvalida();
        if (pol.estado != EstadoPoliza.Activa) revert YaPagada();
        if (block.timestamp <= pol.fin) revert PolizaVigente();
        uint256 c = _buscarCaida(pol);
        if (c != 0 && caidas[c].pagados < topePorEvento) revert PolizaVigente(); // aún puede cobrar

        pol.estado = EstadoPoliza.Expirada;
        exposicionTotal -= indemnizacion;
        emit PolizaExpirada(polizaId);
    }

    /// @notice El owner solo retira lo que sobra por encima de la exposición.
    function retirar(uint256 monto) external onlyOwner nonReentrant {
        if (poolDisponible() < exposicionTotal + monto) revert SinLiquidez();
        emit Retiro(owner, monto);
        _enviar(owner, monto);
    }

    /// @notice El agente no puede bajar del stake mínimo mientras haya pólizas activas.
    function retirarBono(uint256 monto) external onlyAgent nonReentrant {
        if (monto > bonoAgente) revert FondosInsuficientes();
        uint256 restante = bonoAgente - monto;
        if (exposicionTotal > 0 && restante < stakeMinimo) revert AgenteSinBono();
        bonoAgente = restante;
        emit Retiro(agent, monto);
        _enviar(agent, monto);
    }

    // ───────────────────────── Lecturas ─────────────────────────
    function poolDisponible() public view returns (uint256) {
        uint256 bal = address(this).balance;
        return bal > bonoAgente ? bal - bonoAgente : 0;
    }

    /// @notice Devuelve la caída pagable para la póliza (0 si no hay).
    function caidaPagable(uint256 polizaId) external view returns (uint256) {
        return _buscarCaida(polizas[polizaId]);
    }

    /// @notice Lista paginada de pólizas (desde id 1).
    function listarPolizas(uint256 desde, uint256 cantidad) external view returns (Poliza[] memory lista) {
        if (desde == 0) desde = 1;
        if (desde > totalPolizas) return new Poliza[](0);
        uint256 hasta = desde + cantidad - 1;
        if (hasta > totalPolizas) hasta = totalPolizas;
        lista = new Poliza[](hasta - desde + 1);
        for (uint256 i = desde; i <= hasta; i++) lista[i - desde] = polizas[i];
    }

    function caidasDeServicio(uint256 servicioId) external view returns (uint256[] memory) {
        return _caidasServicio[servicioId];
    }

    function obtenerBalanceContrato() external view returns (uint256) {
        return address(this).balance;
    }

    // ───────────────────────── Internas ─────────────────────────
    function _validarSiniestro(uint256 polizaId) private view returns (Poliza storage pol, uint256 caidaId) {
        pol = polizas[polizaId];
        if (pol.dueno == address(0)) revert PolizaInvalida();
        if (pol.estado != EstadoPoliza.Activa) revert YaPagada();
        caidaId = _buscarCaida(pol);
        if (caidaId == 0) revert SinCaida();
        if (caidas[caidaId].pagados >= topePorEvento) revert TopeEventoAlcanzado();
    }

    /// @dev Caída más reciente del servicio dentro de [inicio, fin] que no haya llegado al tope.
    function _buscarCaida(Poliza storage pol) private view returns (uint256) {
        uint256[] storage ids = _caidasServicio[pol.servicioId];
        uint256 primeraEnVentanaLlena;
        for (uint256 i = ids.length; i > 0; i--) {
            Caida storage c = caidas[ids[i - 1]];
            if (c.timestamp < pol.inicio) break; // orden temporal: no hay más en ventana
            if (c.timestamp > pol.fin) continue;
            if (c.pagados < topePorEvento) return ids[i - 1];
            if (primeraEnVentanaLlena == 0) primeraEnVentanaLlena = ids[i - 1];
        }
        return primeraEnVentanaLlena; // existe caída pero llena -> _validarSiniestro da TopeEventoAlcanzado
    }

    function _enviar(address to, uint256 monto) private {
        (bool ok, ) = payable(to).call{value: monto}("");
        if (!ok) revert TransferenciaFallida();
    }
}
