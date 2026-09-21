import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';

export type CheckStatus = 'ok' | 'warn' | 'error';

export interface HealthCheck {
  id: string;
  label: string;
  status: CheckStatus;
  message: string;
  fix?: string;
  href?: string;
}

export interface HealthDetails {
  overall: CheckStatus;
  checkedAt: string;
  backend: {
    startedAt: string;
    uptimeSeconds: number;
    node: string;
    pid: number;
    platform: string;
    memoryMb: { rss: number; heapUsed: number; heapTotal: number };
    cpuPercent: number;
    systemMemoryMb: { total: number; free: number };
    apiProtected: boolean;
  };
  database: { ok: boolean; latencyMs: number | null; error?: string };
  ai: {
    provider: string; model: string; ready: boolean; detail: string | null; reachable: boolean;
    latencyMs: number | null; version: string | null; loaded: { name: string; sizeMb: number; expiresAt?: string }[];
  };
  email: { configured: boolean; connected: boolean; address: string | null };
  queue: { pending: number; running: boolean; current: string | null; lastError: string | null };
  lastSearch: { status: string; startedAt: string; jobsFound: number; jobsNew: number } | null;
  checks: HealthCheck[];
  /** Measured in the browser: full round trip to the API. */
  clientLatencyMs: number;
}

export function useHealthDetails(refetchInterval = 5000) {
  return useQuery({
    queryKey: ['health-details'],
    queryFn: async () => {
      const t = performance.now();
      const d = await apiClient.get<Omit<HealthDetails, 'clientLatencyMs'>>('/health/details');
      return { ...d, clientLatencyMs: Math.round(performance.now() - t) } as HealthDetails;
    },
    refetchInterval,
    retry: false,
  });
}

export function fmtDuration(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${m}m ${String(sec).padStart(2, '0')}s`;
  if (m) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}
