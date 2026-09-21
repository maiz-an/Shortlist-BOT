import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiClient } from '../../services/api-client';
import { qs } from '../jobs/api';

export interface DbColumn { name: string; type: string; nullable: boolean; default: string | null }
export interface DbOverview {
  version: string;
  sizeBytes: number | null;
  totalRows: number;
  tables: { name: string; rows: number }[];
}
export interface DbRows {
  table: string;
  columns: DbColumn[];
  sort: string;
  order: 'asc' | 'desc';
  total: number;
  page: number;
  pageSize: number;
  rows: Record<string, unknown>[];
}
export interface DbParams { q: string; sort: string; order: 'asc' | 'desc'; page: number; pageSize: number }

export const useDbOverview = () => useQuery({ queryKey: ['db', 'overview'], queryFn: () => apiClient.get<DbOverview>('/database/overview'), refetchInterval: 15000 });

export const useDbRows = (table: string | null, p: DbParams) =>
  useQuery({
    queryKey: ['db', 'rows', table, p],
    queryFn: () => apiClient.get<DbRows>(`/database/tables/${table}${qs({ ...p })}`),
    enabled: !!table,
    placeholderData: keepPreviousData,
  });

export const useDbRow = (table: string | null, id: string | null) =>
  useQuery({
    queryKey: ['db', 'row', table, id],
    queryFn: () => apiClient.get<Record<string, unknown>>(`/database/tables/${table}/rows/${encodeURIComponent(id!)}`),
    enabled: !!table && !!id,
  });

export const exportUrl = (table: string, format: 'csv' | 'json') => apiClient.url(`/database/tables/${table}/export?format=${format}`);

export function fmtBytes(n: number | null) {
  if (n === null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1073741824) return `${(n / 1048576).toFixed(1)} MB`;
  return `${(n / 1073741824).toFixed(2)} GB`;
}
