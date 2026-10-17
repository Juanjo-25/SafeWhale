import { apiMutation } from '../../../../web/lib/api';
import { stormSchema } from '../../../../web/lib/contract';
import { storm } from '../../../../web/lib/operations';
export const runtime = 'nodejs';
export function POST(request: Request) { return apiMutation(request, stormSchema, storm); }

export const maxDuration = 300;
