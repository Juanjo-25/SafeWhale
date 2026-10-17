import { apiMutation } from '../../../../web/lib/api';
import { purchaseSchema } from '../../../../web/lib/contract';
import { buyCover } from '../../../../web/lib/operations';
export const runtime = 'nodejs';
export function POST(request: Request) { return apiMutation(request, purchaseSchema, buyCover); }

export const maxDuration = 300;
