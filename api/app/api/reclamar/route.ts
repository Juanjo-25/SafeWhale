import { apiMutation } from '../../../../web/lib/api';
import { policyIdSchema } from '../../../../web/lib/contract';
import { claimCover } from '../../../../web/lib/operations';
export const runtime = 'nodejs';
export function POST(request: Request) { return apiMutation(request, policyIdSchema, claimCover); }

export const maxDuration = 300;
