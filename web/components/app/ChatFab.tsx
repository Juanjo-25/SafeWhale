interface Props { abierto: boolean; noLeidos: number; onClick: () => void }

/** Botón flotante "IA". En mobile sube por encima de la barra de pestañas y se oculta con el chat abierto. */
export function ChatFab({ abierto, noLeidos, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={abierto ? 'Cerrar chat con el agente' : 'Abrir chat con el agente'}
      aria-expanded={abierto}
      className={`fixed bottom-[28px] right-[28px] z-[61] flex h-[62px] w-[62px] cursor-pointer items-center justify-center rounded-full border-0 text-white shadow-fab hover:scale-105 active:scale-[0.94] max-[759px]:bottom-[calc(96px_+_env(safe-area-inset-bottom))] max-[759px]:right-4 ${abierto ? 'bg-ink max-[759px]:hidden' : 'bg-brand'}`}
      style={{ transition: 'transform 200ms cubic-bezier(.3,1.3,.5,1), background 200ms ease' }}
    >
      <span
        className="font-semibold leading-none transition-transform duration-[260ms] ease-[ease]"
        style={{ fontSize: abierto ? '26px' : '17px', transform: abierto ? 'rotate(90deg)' : 'rotate(0deg)' }}
      >
        {abierto ? '×' : 'IA'}
      </span>
      {noLeidos > 0 && (
        <span className="absolute -right-[2px] -top-[2px] flex h-[22px] min-w-[22px] items-center justify-center rounded-full border-2 border-white bg-bad px-[6px] text-[12px] font-semibold text-white">
          {noLeidos}
        </span>
      )}
    </button>
  );
}
