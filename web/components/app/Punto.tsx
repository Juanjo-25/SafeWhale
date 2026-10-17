/** Punto de estado de 7px. */
export function Punto({ color }: { color: string }) {
  return <span className="h-[7px] w-[7px] flex-none rounded-full" style={{ background: color }} />;
}
