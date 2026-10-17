import { apiMutation } from '../../../../web/lib/api';
import { agentControlSchema } from '../../../../web/lib/contract';
import { controlAgent } from '../../../../web/lib/operations';
export const runtime = 'nodejs';
export function POST(request: Request) { return apiMutation(request, agentControlSchema, controlAgent); }

export const maxDuration = 300;
