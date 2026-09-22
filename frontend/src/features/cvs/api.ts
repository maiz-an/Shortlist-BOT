import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import type { CvProfile } from '../../types';

export type CvInput = Pick<CvProfile, 'name' | 'category' | 'enabled' | 'skills' | 'preferredJobKeywords' | 'excludedKeywords'> & { description?: string };

export const useCvs = () => useQuery({ queryKey: ['cvs'], queryFn: () => apiClient.get<CvProfile[]>('/cv-profiles') });

export function useCvMutations() {
  const qc = useQueryClient();
  const done = () => qc.invalidateQueries({ queryKey: ['cvs'] });
  return {
    create: useMutation({ mutationFn: (d: CvInput) => apiClient.post<CvProfile>('/cv-profiles', d), onSuccess: done }),
    update: useMutation({ mutationFn: (v: { id: string; data: Partial<CvInput> }) => apiClient.patch<CvProfile>(`/cv-profiles/${v.id}`, v.data), onSuccess: done }),
    remove: useMutation({ mutationFn: (id: string) => apiClient.delete(`/cv-profiles/${id}`), onSuccess: done }),
    upload: useMutation({
      mutationFn: (v: { id: string; file: File }) => {
        const f = new FormData();
        f.append('file', v.file);
        return apiClient.upload<CvProfile>(`/cv-profiles/${v.id}/file`, f);
      },
      onSuccess: done,
    }),
    uploadSendPdf: useMutation({
      mutationFn: (v: { id: string; file: File }) => {
        const f = new FormData();
        f.append('file', v.file);
        return apiClient.upload<CvProfile>(`/cv-profiles/${v.id}/send-pdf`, f);
      },
      onSuccess: done,
    }),
  };
}
