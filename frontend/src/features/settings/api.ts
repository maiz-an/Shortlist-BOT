import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import type { AiStatus, DashboardData, EmailMessage, EmailStatus, Settings } from '../../types';

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
