import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { request } from 'undici';
import { nexriskApi } from '../services/nexrisk-api.js';
import { sessionStore } from '../services/session-store.js';

// Cluster feed is owned by the C++ service. The GET here is a plain proxy.
// The Taiga host node is assembled by C++ from metrics the BFF POSTs (only this
// box can read its own CPU/RAM/disk/sessions); C++ geolocates the egress IP.

// -- Local host metrics -------------------------------------------------------
// CPU and DISK sampled on background timers and cached; RAM read live. Any value
// that can't be read is reported as null -- never a fake number.

let cpuPct: number | null = null;
let diskPct: number | null = null;

function cpuSnapshot(): { idle: number; total: number } {
  let idle = 0;
  let total = 0;
  for (const c of os.cpus()) {
    for (const v of Object.values(c.times)) total += v;
    idle += c.times.idle;
  }
  return { idle, total };
}
let prevCpu = cpuSnapshot();
function sampleCpu(): void {
  const cur = cpuSnapshot();
  const idleD = cur.idle - prevCpu.idle;
  const totalD = cur.total - prevCpu.total;
  prevCpu = cur;
  if (totalD > 0) cpuPct = Math.max(0, Math.min(100, Math.round((1 - idleD / totalD) * 100)));
}
setInterval(sampleCpu, 5_000).unref();

function sampleDisk(): void {
  try {
    const out = execSync('df -P /', { encoding: 'utf8', timeout: 2_000 });
    const line = out.trim().split('\n')[1] ?? '';
    const cap = line.trim().split(/\s+/)[4] ?? '';
    const n = parseInt(cap, 10);
    diskPct = Number.isFinite(n) ? n : null;
  } catch {
    diskPct = null;
  }
}
sampleDisk();
setInterval(sampleDisk, 30_000).unref();

// -- Public egress IP (discovered once, cached; C++ geolocates it) ------------
let publicIp: string | null = null;
async function discoverPublicIp(): Promise<void> {
  if (publicIp) return;
  try {
    const res = await request('https://api.ipify.org', {
      method: 'GET',
      headersTimeout: 5_000,
      bodyTimeout: 5_000,
    });
    const txt = (await res.body.text()).trim();
    if (txt && (/^\d{1,3}(\.\d{1,3}){3}$/.test(txt) || txt.includes(':'))) {
      publicIp = txt;
    }
  } catch {
    // leave null; retried on the next cycle
  }
}

// -- Metrics reporter: POST to C++ every ~30s ---------------------------------
async function postTaigaMetrics(): Promise<void> {
  if (!publicIp) await discoverPublicIp();
  const ramPct = Math.round((1 - os.freemem() / os.totalmem()) * 100);
  const body = {
    ip: publicIp, // null until resolved -> C++ ships the node without geo (no pin)
    metrics: { cpu_pct: cpuPct, ram_pct: ramPct, disk_pct: diskPct },
    users_connected: sessionStore.size(), // live BFF frontend sessions only
  };
  try {
    await nexriskApi.post('/api/v1/cluster/taiga-metrics', body);
  } catch {
    // C++ unreachable / not ready -- retried next cycle
  }
}

let reporterStarted = false;
function startTaigaMetricsReporter(): void {
  if (reporterStarted) return;
  reporterStarted = true;
  void discoverPublicIp();
  void postTaigaMetrics();
  setInterval(() => { void postTaigaMetrics(); }, 30_000).unref();
}

/**
 * GET /api/v1/cluster/nodes -- plain proxy of the C++ feed (nodes + lps + the
 * C++-assembled taiga node). nexriskApi attaches the internal secret.
 */
export async function clusterRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/cluster/nodes',
    {
      // Authenticated only for now -- matches the still-ungated nav item.
      // TODO: add fastify.requirePermission('infra_monitor', 'VIEW') once the
      // C++ RBAC grants that module, so route + nav gate flip together.
      preHandler: [fastify.authenticate],
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const response = await nexriskApi.get('/api/v1/cluster/nodes');
      if (!response.ok) {
        return reply.code(response.status).send(response.error);
      }
      return reply.send(response.data ?? {});
    },
  );

  // Start pushing this box's metrics to C++ (fire-and-forget, unref'd timers).
  startTaigaMetricsReporter();
}