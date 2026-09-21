import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import type { JobSourceRow, SearchProfile, SearchRun } from '../../types';

export type ProfileInput = Omit<SearchProfile, 'id' | 'sources'> & { sourceIds: string[] };

export const useProfiles = () => useQuery({ queryKey: ['search', 'profiles'], queryFn: () => apiClient.get<SearchProfile[]>('/search/profiles') });
export const useSources = () => useQuery({ queryKey: ['sources'], queryFn: () => apiClient.get<JobSourceRow[]>('/sources') });

export const useSearchRuns = () =>
  useQuery({
    queryKey: ['search', 'runs'],
    queryFn: () => apiClient.get<SearchRun[]>('/search/runs'),
    refetchInterval: (q) => (q.state.data?.some((r) => r.status === 'RUNNING') ? 3000 : false),
  });

export const useSearchStatus = () =>
  useQuery({ queryKey: ['search', 'status'], queryFn: () => apiClient.get<{ running: boolean }>('/search/status'), refetchInterval: 4000 });

export function useProfileMutations() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ['search'] });
  return {
    create: useMutation({ mutationFn: (d: ProfileInput) => apiClient.post<SearchProfile>('/search/profiles', d), onSuccess: done }),
    update: useMutation({ mutationFn: (v: { id: string; data: Partial<ProfileInput> }) => apiClient.patch<SearchProfile>(`/search/profiles/${v.id}`, v.data), onSuccess: done }),
    remove: useMutation({ mutationFn: (id: string) => apiClient.delete(`/search/profiles/${id}`), onSuccess: done }),
  };
}

export function useRunSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v?: { profileIds?: string[] }) => apiClient.post<{ started: boolean }>('/search/run', v ?? {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['search'] });
      // New jobs and analysis results trickle in while the run proceeds.
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function useSourceMutations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; data: Partial<Pick<JobSourceRow, 'enabled' | 'rateLimitMs'>> }) => apiClient.patch(`/sources/${v.id}`, v.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sources'] }),
  });
}
