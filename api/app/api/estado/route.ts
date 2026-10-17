import { backendEnvironment, apiErrorResponse } from '../../../../web/lib/api';
import { demoUserAddress, simulationParameters, simulationPayable, simulationReserved } from '../../../../web/lib/contract';
import { publicSimulationState, readSimulationSnapshot } from '../../../../web/lib/state';
import { readChainState } from '../../../../web/lib/chain';
import { readAccessAuthorized } from '../../../../web/lib/session';
import { formatEther } from 'ethers';
import { DEMO_CONTRACT_PARAMETERS } from '../../../../shared/config';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const env = backendEnvironment();
    if (env.BACKEND_MODE === 'testnet') return Response.json({ ...await readChainState(env), autorizado: readAccessAuthorized(request, env) }, { headers: { 'Cache-Control': 'no-store' } });
    const snapshot = await readSimulationSnapshot(env.STATE_FILE, env);
    const activeOutages = Object.keys(snapshot.caidas).length > 0;
    const payable: Record<string, string> = {};
    for (const policy of snapshot.polizas) { try { payable[policy.id] = simulationPayable(snapshot, policy.id).outage.id; } catch { payable[policy.id] = '0'; } }
    return Response.json({ ...publicSimulationState(snapshot), autorizado: readAccessAuthorized(request, env), parametros: simulationParameters(), cuentaDemo: demoUserAddress(env), caidaIniciadaEn: snapshot.caidaIniciadaEn,
      ...(activeOutages ? { caida: snapshot.caidas['1'] ?? null, caidasPagables: payable,
        exposicionTotal: formatEther(BigInt(simulationReserved(snapshot, Math.floor(Date.now() / 1000)).length) * DEMO_CONTRACT_PARAMETERS.indemnizacion),
        compraHabilitada: !snapshot.caidas['1'] && !snapshot.exchangeCaido } : {}),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return apiErrorResponse(error); }
}

export const maxDuration = 300;
