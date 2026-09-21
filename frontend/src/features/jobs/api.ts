import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import type { JobDetail, JobListItem, JobStatus, Page } from '../../types';

export interface JobFilters {
  q?: string;
  status?: JobStatus | '';
  minScore?: number | '';
  recommendation?: string;
  sort?: string;
  order?: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

export function qs(params: Record<string, string | number | undefined | null>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const useJobs = (f: JobFilters) =>
  useQuery({
    queryKey: ['jobs', f],
    queryFn: () => apiClient.get<Page<JobListItem>>(`/jobs${qs({ ...f })}`),
    placeholderData: keepPreviousData,
  });

export const useJob = (id: string) =>
  useQuery({
    queryKey: ['jobs', 'detail', id],
    queryFn: () => apiClient.get<JobDetail>(`/jobs/${id}`),
    // Poll while the local model is still working on this job.
    refetchInterval: (q) => (q.state.data && ['NEW', 'ANALYZING'].includes(q.state.data.status) && !q.state.data.analysisError ? 3000 : false),
  });

export function useInvalidate() {
  const qc = useQueryClient();
  return () => Promise.all(['jobs', 'applications', 'dashboard'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

export function useReanalyze() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (id: string) => apiClient.post(`/jobs/${id}/analyze`), onSuccess: inv });
}

export function useAnalyzePending() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: () => apiClient.post<{ queued: number }>('/jobs/analyze-pending'), onSuccess: inv });
}

export interface ManualJobInput {
  company: string;
  title: string;
  location?: string;
  jobUrl?: string;
  description: string;
  applicationEmail?: string;
}

export function useCreateManualJob() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (d: ManualJobInput) => apiClient.post<{ jobId: string; created: boolean; duplicateReason?: string }>('/jobs/manual', d),
    onSuccess: inv,
  });
}

export function useDeleteJob() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (id: string) => apiClient.delete(`/jobs/${id}`), onSuccess: inv });
}

export const useQueue = () =>
  useQuery({
    queryKey: ['queue'],
    queryFn: () => apiClient.get<{ pending: number; running: boolean; current: string | null; lastError: string | null }>('/analysis/queue'),
    refetchInterval: 4000,
  });
