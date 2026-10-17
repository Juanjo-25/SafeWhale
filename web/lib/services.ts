import { z } from 'zod';

export const DEMO_SERVICES = [
  { id: 1, nombre: 'Exchange Demo', tipo: 'Exchange' },
  { id: 2, nombre: 'Stripe', tipo: 'Pagos' },
] as const;

export const serviceIdSchema = z.union([z.literal(1), z.literal(2)]);
export const serviceName = (id: number) => DEMO_SERVICES.find((service) => service.id === id)?.nombre ?? 'Servicio';
