import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import type { AiStatus, DashboardData, EmailMessage, EmailStatus, Settings, WhatsAppStatus } from '../../types';

export const useSettings = () => useQuery({ queryKey: ['settings'], queryFn: () => apiClient.get<Settings>('/settings') });
export const useAiStatus = () => useQuery({ queryKey: ['ai-status'], queryFn: () => apiClient.get<AiStatus>('/ai/status'), refetchInterval: 30000 });
export const useDashboard = () => useQuery({ queryKey: ['dashboard'], queryFn: () => apiClient.get<DashboardData>('/dashboard'), refetchInterval: 15000 });

export function useSaveSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { key: keyof Settings; value: unknown }) => apiClient.put(`/settings/${v.key}`, v.value),
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['settings'] }), qc.invalidateQueries({ queryKey: ['dashboard'] })]),
  });
}

export const useEmailStatus = () => useQuery({ queryKey: ['email', 'status'], queryFn: () => apiClient.get<EmailStatus>('/email/status') });
export const useEmailMessages = () => useQuery({ queryKey: ['email', 'messages'], queryFn: () => apiClient.get<EmailMessage[]>('/email/messages') });

export function useEmailAccount() {
  const qc = useQueryClient();
  return {
    connect: useMutation({ mutationFn: () => apiClient.get<{ url: string }>('/email/oauth/url') }),
    disconnect: useMutation({ mutationFn: () => apiClient.delete('/email/account'), onSuccess: () => qc.invalidateQueries({ queryKey: ['email'] }) }),
  };
}

/** In-progress states where the QR/session is actively changing and worth polling quickly. */
const WA_LIVE = new Set(['qr_ready', 'initializing', 'authenticating']);

export function useWhatsAppStatus() {
  return useQuery({
    queryKey: ['whatsapp', 'status'],
    queryFn: () => apiClient.get<WhatsAppStatus>('/whatsapp/status'),
    refetchInterval: (q) => (q.state.data?.session && WA_LIVE.has(q.state.data.session.status) ? 3000 : 20000),
  });
}

export function useWhatsAppQr(enabled: boolean) {
  return useQuery({
    queryKey: ['whatsapp', 'qr'],
    queryFn: () => apiClient.get<{ qrCode: string | null }>('/whatsapp/qr'),
    enabled,
    refetchInterval: enabled ? 15000 : false, // the code itself rotates every so often
  });
}

export function useWhatsAppConnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post<WhatsAppStatus>('/whatsapp/connect'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['whatsapp'] }),
  });
}

export function useWhatsAppDisconnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post('/whatsapp/disconnect'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['whatsapp'] }),
  });
}

export function useWhatsAppTest() {
  return useMutation({ mutationFn: (phone: string) => apiClient.post<{ ok: boolean; reason?: string }>('/whatsapp/test', { phone }) });
}
