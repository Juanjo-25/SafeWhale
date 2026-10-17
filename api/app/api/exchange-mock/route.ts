import { ApiError, apiErrorResponse, backendEnvironment } from '../../../../web/lib/api';
import { readExchangeAvailability } from '../../../../web/lib/exchange-state';
import { serviceIdSchema } from '../../../../web/lib/services';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  try {
    const parsed = serviceIdSchema.safeParse(Number(new URL(request.url).searchParams.get('servicioId') ?? '1'));
    if (!parsed.success) throw new ApiError('SERVICE_INVALID', 'Elige un servicio de demo válido.');
    const result = await readExchangeAvailability(backendEnvironment(), parsed.data);
    return Response.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return apiErrorResponse(error); }
}
