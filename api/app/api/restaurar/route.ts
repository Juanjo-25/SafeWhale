import { apiMutation } from '../../../../web/lib/api';
import { serviceSchema } from '../../../../web/lib/contract';
import { restoreService } from '../../../../web/lib/operations';
export const runtime = 'nodejs';
export function POST(request: Request) { return apiMutation(request, serviceSchema, restoreService); }

export const maxDuration = 300;
