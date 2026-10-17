import { proxyBackend } from '../../../lib/service-proxy';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export function POST(request: Request) { return proxyBackend(request, 'chat'); }
