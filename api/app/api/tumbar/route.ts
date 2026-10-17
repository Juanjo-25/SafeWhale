import { apiMutation } from '../../../../web/lib/api';
import { serviceSchema } from '../../../../web/lib/contract';
import { dropService } from '../../../../web/lib/operations';
export const runtime = 'nodejs';
export function POST(request: Request) { return apiMutation(request, serviceSchema, dropService); }

export const maxDuration = 300;
