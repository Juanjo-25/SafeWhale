import { apiMutation } from '../../../../web/lib/api';
import { policyIdSchema } from '../../../../web/lib/contract';
import { attackCover } from '../../../../web/lib/operations';
export const runtime = 'nodejs';
export function POST(request: Request) { return apiMutation(request, policyIdSchema, attackCover); }

export const maxDuration = 300;
