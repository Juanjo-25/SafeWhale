// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title DowntimeCover
/// @notice MVP: servicio 1 y una sola caída por despliegue.
/// @dev El agente es el oráculo de confianza.
///      evidenciaHash identifica evidencia; no verifica su veracidad.
contract DowntimeCover {
    enum EstadoPoliza {
        Activa,
        Pagada,
        Expirada
    }

    struct Poliza {
        uint256 id;
        address dueno;
        uint256 servicioId;
        uint256 inicio;
        uint256 fin;
        EstadoPoliza estado;
    }

    struct Caida {
        uint256 id;
        uint256 servicioId;
        uint256 inicio;
        uint256 reportadoEn;
        uint256 duracionSegundos;
        bytes32 evidenciaHash;
        uint256 pagosRealizados;
    }

    address public immutable owner;
    address public immutable agent;

    uint256 public constant SERVICIO_DEMO = 1;

    // Incluye pólizas vencidas que todavía conservan una reserva
    // por reportes pendientes o indemnizaciones pendientes.
    uint256 public constant MAX_POLIZAS_CON_RESERVA = 30;

    uint256 public immutable precioHora;
    uint256 public immutable indemnizacion;
    uint256 public immutable stakeMinimo;
    uint256 public immutable carencia;
    uint256 public immutable tiempoReclamo;
    uint256 public immutable umbralSegundos;
    uint256 public immutable topePorEvento;
    uint256 public immutable maxHoras;
    uint256 public immutable plazoReporte;

    uint256 public totalPolizas;
    uint256 public totalCaidas;
    uint256 public exposicionTotal;
    uint256 public bonoAgente;

    uint256 private _fondo;
    bool private _locked;

    mapping(uint256 => Poliza) private _polizas;

    // Un único evento por servicio y despliegue.
    mapping(uint256 => Caida) private _caidasPorServicio;

    // Lista acotada para liberar reservas sin recorrer todo el historial.
    uint256[] private _idsConReserva;

    // Posición en la lista + 1; cero significa que no tiene reserva.
    mapping(uint256 => uint256) private _posicionReserva;

    event FondoDepositado(
        address indexed emisor,
        uint256 monto,
        uint256 fondoTotal
    );

    event BonoDepositado(
        address indexed agente,
        uint256 monto,
        uint256 bonoTotal
    );

    event CoverComprada(
        uint256 indexed polizaId,
        address indexed dueno,
        uint256 indexed servicioId,
        uint256 inicio,
        uint256 fin,
        uint256 prima
    );

    event CaidaReportada(
        uint256 indexed caidaId,
        uint256 indexed servicioId,
        uint256 inicio,
        uint256 reportadoEn,
        uint256 duracionSegundos,
        bytes32 evidenciaHash
    );

    event Pagado(
        uint256 indexed polizaId,
        address indexed dueno,
        uint256 monto,
        uint256 indexed caidaId
    );

    event Reclamado(
        uint256 indexed polizaId,
        address indexed dueno,
        uint256 monto,
        uint256 indexed caidaId
    );

    event PolizaExpirada(uint256 indexed polizaId);
    event FondoRetirado(address indexed destinatario, uint256 monto);
    event BonoRetirado(address indexed destinatario, uint256 monto);

    error SoloOwner();
    error SoloAgent();
    error NoEsDueno();
    error ParametrosInvalidos();
    error ServicioInvalido();
    error DuracionInvalida();
    error PrimaIncorrecta();
    error LimitePolizas();
    error PolizaInvalida();
    error PolizaSinReserva();
    error YaPagada();
    error SinCaida();
    error FueraDeVentana();
    error CaidaBajoUmbral();
    error CaidaYaReportada();
    error ReporteInvalido();
    error ReporteFueraDePlazo();
    error EvidenciaInvalida();
    error EsperaPendiente();
    error TopeEvento();
    error FondoInsuficiente();
    error BonoInsuficiente();
    error PolizaVigente();
    error DerechoPendiente();
    error TransferenciaFallida();
    error Reentrada();

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
        uint256 _umbralSegundos,
        uint256 _topePorEvento,
        uint256 _maxHoras,
        uint256 _plazoReporte
    ) {
        if (
            _agent == address(0) ||
            _precioHora == 0 ||
            _indemnizacion == 0 ||
            // Equivale a stakeMinimo >= indemnizacion * topePorEvento,
            // sin riesgo de overflow en la multiplicación.
            _stakeMinimo / _indemnizacion < _topePorEvento ||
            _tiempoReclamo == 0 ||
            _umbralSegundos == 0 ||
            _topePorEvento == 0 ||
            _topePorEvento > MAX_POLIZAS_CON_RESERVA ||
            _maxHoras == 0 ||
            _plazoReporte < _umbralSegundos
        ) {
            revert ParametrosInvalidos();
        }

        owner = msg.sender;
        agent = _agent;
        precioHora = _precioHora;
        indemnizacion = _indemnizacion;
        stakeMinimo = _stakeMinimo;
        carencia = _carencia;
        tiempoReclamo = _tiempoReclamo;
        umbralSegundos = _umbralSegundos;
        topePorEvento = _topePorEvento;
        maxHoras = _maxHoras;
        plazoReporte = _plazoReporte;
    }

    // ───────────────── Fondeo ─────────────────

    function fund() external payable onlyOwner nonReentrant {
        _fondo += msg.value;

        emit FondoDepositado(msg.sender, msg.value, _fondo);
    }

    function stakeBond() external payable onlyAgent nonReentrant {
        bonoAgente += msg.value;

        emit BonoDepositado(msg.sender, msg.value, bonoAgente);
    }

    // ───────────────── Compra ─────────────────

    function buyCover(
        uint256 servicioId,
        uint256 horas
    ) external payable nonReentrant returns (uint256 id) {
        _validarServicio(servicioId);

        if (horas == 0 || horas > maxHoras) {
            revert DuracionInvalida();
        }

        uint256 prima = precioHora * horas;

        if (msg.value != prima) revert PrimaIncorrecta();

        // Este MVP no admite nuevas compras después del reporte.
        if (_caidasPorServicio[servicioId].id != 0) {
            revert CaidaYaReportada();
        }

        if (bonoAgente < stakeMinimo) revert BonoInsuficiente();

        _limpiarExpiradas();

        if (_idsConReserva.length >= topePorEvento) {
            revert LimitePolizas();
        }

        if (_fondo + prima < exposicionTotal + indemnizacion) {
            revert FondoInsuficiente();
        }

        uint256 inicio = block.timestamp + carencia;
        uint256 fin = inicio + horas * 1 hours;

        id = ++totalPolizas;

        _polizas[id] = Poliza({
            id: id,
            dueno: msg.sender,
            servicioId: servicioId,
            inicio: inicio,
            fin: fin,
            estado: EstadoPoliza.Activa
        });

        _fondo += prima;
        exposicionTotal += indemnizacion;

        _idsConReserva.push(id);
        _posicionReserva[id] = _idsConReserva.length;

        emit CoverComprada(
            id,
            msg.sender,
            servicioId,
            inicio,
            fin,
            prima
        );
    }

    // ───────────────── Reporte ─────────────────

    /// @notice El agente declara el inicio y la duración observada.
    /// @dev La demora máxima se mide desde inicioCaida.
    function reportOutage(
        uint256 servicioId,
        uint256 inicioCaida,
        uint256 duracionSegundos,
        bytes32 evidenciaHash
    ) external onlyAgent nonReentrant returns (uint256 caidaId) {
        _validarServicio(servicioId);

        if (_caidasPorServicio[servicioId].id != 0) {
            revert CaidaYaReportada();
        }

        if (duracionSegundos < umbralSegundos) {
            revert CaidaBajoUmbral();
        }

        if (inicioCaida > block.timestamp) {
            revert ReporteInvalido();
        }

        uint256 transcurrido = block.timestamp - inicioCaida;

        if (transcurrido > plazoReporte) {
            revert ReporteFueraDePlazo();
        }

        // No puede declarar más duración que el tiempo transcurrido.
        if (duracionSegundos > transcurrido) {
            revert ReporteInvalido();
        }

        if (evidenciaHash == bytes32(0)) revert EvidenciaInvalida();

        caidaId = ++totalCaidas;

        _caidasPorServicio[servicioId] = Caida({
            id: caidaId,
            servicioId: servicioId,
            inicio: inicioCaida,
            reportadoEn: block.timestamp,
            duracionSegundos: duracionSegundos,
            evidenciaHash: evidenciaHash,
            pagosRealizados: 0
        });

        emit CaidaReportada(
            caidaId,
            servicioId,
            inicioCaida,
            block.timestamp,
            duracionSegundos,
            evidenciaHash
        );
    }

    // ───────────────── Pago desde el fondo ─────────────────

    function payout(
        uint256 polizaId
    ) external onlyAgent nonReentrant {
        (
            Poliza storage pol,
            Caida storage caida
        ) = _validarSiniestro(polizaId);

        if (_fondo < indemnizacion) revert FondoInsuficiente();

        // Actualiza el estado antes de transferir.
        caida.pagosRealizados++;
        _fondo -= indemnizacion;
        _cerrarPoliza(polizaId, EstadoPoliza.Pagada);

        emit Pagado(
            polizaId,
            pol.dueno,
            indemnizacion,
            caida.id
        );

        _enviar(pol.dueno, indemnizacion);
    }

    // ───────────────── Reclamo desde el bono ─────────────────

    function claimAgentFailure(
        uint256 polizaId
    ) external nonReentrant {
        (
            Poliza storage pol,
            Caida storage caida
        ) = _validarSiniestro(polizaId);

        if (msg.sender != pol.dueno) revert NoEsDueno();

        // La espera empieza cuando el reporte queda registrado.
        if (
            block.timestamp - caida.reportadoEn < tiempoReclamo
        ) {
            revert EsperaPendiente();
        }

        // El reclamo se paga exclusivamente desde el bono.
        if (bonoAgente < indemnizacion) {
            revert BonoInsuficiente();
        }

        caida.pagosRealizados++;
        bonoAgente -= indemnizacion;
        _cerrarPoliza(polizaId, EstadoPoliza.Pagada);

        emit Reclamado(
            polizaId,
            pol.dueno,
            indemnizacion,
            caida.id
        );

        _enviar(pol.dueno, indemnizacion);
    }

    // ───────────────── Mantenimiento ─────────────────

    function expirar(uint256 polizaId) external nonReentrant {
        Poliza storage pol = _polizas[polizaId];

        if (pol.id == 0) revert PolizaInvalida();
        if (pol.estado == EstadoPoliza.Pagada) revert YaPagada();
        if (_posicionReserva[polizaId] == 0) {
            revert PolizaSinReserva();
        }

        if (block.timestamp < pol.fin) revert PolizaVigente();

        // Conserva la reserva si todavía puede llegar un reporte
        // o existe un siniestro elegible con cupo.
        if (!_puedeLiberarReserva(pol)) revert DerechoPendiente();

        _cerrarPoliza(polizaId, EstadoPoliza.Expirada);

        emit PolizaExpirada(polizaId);
    }

    function retirar(
        uint256 monto
    ) external onlyOwner nonReentrant {
        _limpiarExpiradas();

        if (monto > _fondo) revert FondoInsuficiente();

        if (_fondo - monto < exposicionTotal) {
            revert FondoInsuficiente();
        }

        _fondo -= monto;

        emit FondoRetirado(owner, monto);

        _enviar(owner, monto);
    }

    function retirarBono(
        uint256 monto
    ) external onlyAgent nonReentrant {
        _limpiarExpiradas();

        if (monto > bonoAgente) revert BonoInsuficiente();

        uint256 restante = bonoAgente - monto;

        // Las reservas incluyen derechos de cobro posteriores al vencimiento.
        // Mientras existan, no permite retirar el mínimo garantizado.
        if (exposicionTotal > 0 && restante < stakeMinimo) {
            revert BonoInsuficiente();
        }

        bonoAgente = restante;

        emit BonoRetirado(agent, monto);

        _enviar(agent, monto);
    }

    // ───────────────── Lecturas ─────────────────

    function fundBalance() external view returns (uint256) {
        return _fondo;
    }

    function bondBalance() external view returns (uint256) {
        return bonoAgente;
    }

    function obtenerBalanceContrato()
        external
        view
        returns (uint256)
    {
        return address(this).balance;
    }

    function getOutage(
        uint256 servicioId
    ) external view returns (Caida memory) {
        _validarServicio(servicioId);

        return _caidasPorServicio[servicioId];
    }

    function getPolicy(
        uint256 polizaId
    ) external view returns (Poliza memory) {
        if (_polizas[polizaId].id == 0) {
            revert PolizaInvalida();
        }

        return _polizaVisible(polizaId);
    }

    /// @notice Lectura completa para la demo.
    /// @dev Para historiales grandes, usar listarPolizas.
    function getPolicies()
        external
        view
        returns (Poliza[] memory lista)
    {
        lista = new Poliza[](totalPolizas);

        for (uint256 i = 0; i < totalPolizas; i++) {
            lista[i] = _polizaVisible(i + 1);
        }
    }

    function listarPolizas(
        uint256 desde,
        uint256 cantidad
    ) external view returns (Poliza[] memory lista) {
        if (desde == 0) desde = 1;

        if (cantidad == 0 || desde > totalPolizas) {
            return new Poliza[](0);
        }

        uint256 disponibles = totalPolizas - desde + 1;

        if (cantidad > disponibles) cantidad = disponibles;

        lista = new Poliza[](cantidad);

        for (uint256 i = 0; i < cantidad; i++) {
            lista[i] = _polizaVisible(desde + i);
        }
    }

    function caidaPagable(
        uint256 polizaId
    ) external view returns (uint256) {
        Poliza storage pol = _polizas[polizaId];

        if (
            pol.id == 0 ||
            pol.estado != EstadoPoliza.Activa ||
            _posicionReserva[polizaId] == 0
        ) {
            return 0;
        }

        Caida storage caida = _caidasPorServicio[pol.servicioId];

        if (
            !_esElegible(pol, caida) ||
            caida.pagosRealizados >= topePorEvento
        ) {
            return 0;
        }

        return caida.id;
    }

    // ───────────────── Internas ─────────────────

    function _validarServicio(uint256 servicioId) private pure {
        if (servicioId != SERVICIO_DEMO) {
            revert ServicioInvalido();
        }
    }

    function _validarSiniestro(
        uint256 polizaId
    )
        private
        view
        returns (
            Poliza storage pol,
            Caida storage caida
        )
    {
        pol = _polizas[polizaId];

        if (pol.id == 0) revert PolizaInvalida();
        if (pol.estado == EstadoPoliza.Pagada) revert YaPagada();

        if (_posicionReserva[polizaId] == 0) {
            revert PolizaSinReserva();
        }

        caida = _caidasPorServicio[pol.servicioId];

        if (caida.id == 0) revert SinCaida();

        if (!_esElegible(pol, caida)) revert FueraDeVentana();

        if (caida.pagosRealizados >= topePorEvento) {
            revert TopeEvento();
        }
    }

    function _esElegible(
        Poliza storage pol,
        Caida storage caida
    ) private view returns (bool) {
        return (
            caida.id != 0 &&
            caida.servicioId == pol.servicioId &&
            pol.inicio <= caida.inicio &&
            caida.inicio < pol.fin
        );
    }

    function _puedeLiberarReserva(
        Poliza storage pol
    ) private view returns (bool) {
        if (block.timestamp < pol.fin) return false;

        Caida storage caida = _caidasPorServicio[pol.servicioId];

        if (caida.id != 0) {
            // No habrá otro evento en este despliegue.
            // Mantiene la reserva si todavía existe derecho a pago.
            return (
                !_esElegible(pol, caida) ||
                caida.pagosRealizados >= topePorEvento
            );
        }

        // Sin reporte: espera hasta que ya no pueda registrarse
        // una caída iniciada durante la cobertura.
        return block.timestamp - pol.fin >= plazoReporte;
    }

    function _limpiarExpiradas() private {
        uint256 i;

        while (i < _idsConReserva.length) {
            uint256 id = _idsConReserva[i];

            if (_puedeLiberarReserva(_polizas[id])) {
                _cerrarPoliza(id, EstadoPoliza.Expirada);

                emit PolizaExpirada(id);

                // La eliminación mueve el último ID a esta posición.
            } else {
                i++;
            }
        }
    }

    function _cerrarPoliza(
        uint256 polizaId,
        EstadoPoliza estado
    ) private {
        uint256 posicion = _posicionReserva[polizaId];

        if (posicion == 0) revert PolizaSinReserva();

        _polizas[polizaId].estado = estado;
        exposicionTotal -= indemnizacion;

        uint256 indice = posicion - 1;
        uint256 ultimoIndice = _idsConReserva.length - 1;

        if (indice != ultimoIndice) {
            uint256 ultimoId = _idsConReserva[ultimoIndice];

            _idsConReserva[indice] = ultimoId;
            _posicionReserva[ultimoId] = posicion;
        }

        _idsConReserva.pop();
        delete _posicionReserva[polizaId];
    }

    function _polizaVisible(
        uint256 polizaId
    ) private view returns (Poliza memory pol) {
        pol = _polizas[polizaId];

        // Refleja el vencimiento sin exigir una transacción.
        // Vencer la cobertura no elimina un derecho pendiente.
        if (
            pol.estado == EstadoPoliza.Activa &&
            block.timestamp >= pol.fin
        ) {
            pol.estado = EstadoPoliza.Expirada;
        }
    }

    function _enviar(address destinatario, uint256 monto) private {
        (bool ok, ) = payable(destinatario).call{value: monto}("");

        if (!ok) revert TransferenciaFallida();
    }
}
