export class StateError extends Error {
  constructor(readonly codigo: string, mensaje: string) {
    super(mensaje);
    this.name = 'StateError';
  }
}
