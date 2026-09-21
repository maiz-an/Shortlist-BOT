import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import type { ApplicationBase, ApplicationDetail, ApplicationListItem, EmailDraft, EmailMessage, JobStatus, Page } from '../../types';
import { qs, useInvalidate } from '../jobs/api';

export interface AppFilters {
  q?: string;
  status?: JobStatus | '';
  page: number;
  pageSize: number;
}

export const useApplications = (f: AppFilters) =>
  useQuery({
    queryKey: ['applications', f],
    queryFn: () => apiClient.get<Page<ApplicationListItem>>(`/applications${qs({ ...f })}`),
    placeholderData: keepPreviousData,
  });

export const useApplication = (id: string) =>
  useQuery({ queryKey: ['applications', 'detail', id], queryFn: () => apiClient.get<ApplicationDetail>(`/applications/${id}`) });

export function useEnsureApplication() {
  const inv = useInvalidate();
  return useMutation({ mutationFn: (jobId: string) => apiClient.post<ApplicationBase>(`/applications/from-job/${jobId}`), onSuccess: inv });
}

export function useSetStatus() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (v: { id: string; status: JobStatus; note?: string }) => apiClient.post(`/applications/${v.id}/status`, { status: v.status, note: v.note }),
    onSuccess: inv,
  });
}

export function useSetJobStatus() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (v: { jobId: string; status: JobStatus; note?: string }) => apiClient.post(`/applications/by-job/${v.jobId}/status`, { status: v.status, note: v.note }),
    onSuccess: inv,
  });
}

export function useUpdateApplication() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (v: { id: string; data: Partial<{ notes: string; followUpDate: string | null; interviewDate: string | null; selectedCvId: string | null }> }) =>
      apiClient.patch(`/applications/${v.id}`, v.data),
    onSuccess: inv,
  });
}

export function useGenerateDraft() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => apiClient.post<{ draft: EmailDraft; generatedBy: 'ai' | 'template' }>(`/applications/${id}/draft/generate`),
    onSuccess: inv,
  });
}

export function useSaveDraft() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (v: { id: string; recipient: string; subject: string; body: string }) =>
      apiClient.put<EmailDraft>(`/applications/${v.id}/draft`, { recipient: v.recipient, subject: v.subject, body: v.body }),
    onSuccess: inv,
  });
}

export function useSendApplication() {
  const inv = useInvalidate();
  return useMutation({
    mutationFn: (v: { id: string; recipient: string; subject: string; body: string }) =>
      apiClient.post<EmailMessage>(`/applications/${v.id}/send`, { confirm: true, recipient: v.recipient, subject: v.subject, body: v.body }),
    onSettled: inv,
  });
}
