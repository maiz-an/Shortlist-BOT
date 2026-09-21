import { useEffect, useState } from 'react';
import type { FormEvent, PropsWithChildren } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LockKeyhole } from 'lucide-react';
import { apiClient } from '../../services/api-client';
import { LogoMark, Watermark, Wordmark } from '../../components/motion';
import { Button, Input, errMsg } from '../../components/ui';

export interface AuthStatus { required: boolean; authenticated: boolean }

export const useAuthStatus = () => useQuery({ queryKey: ['auth'], queryFn: () => apiClient.get<AuthStatus>('/auth/status'), retry: false, staleTime: 60_000 });

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post('/auth/logout'),
    onSuccess: () => { qc.clear(); void qc.invalidateQueries({ queryKey: ['auth'] }); },
  });
}

function LoginScreen() {
  const qc = useQueryClient();
  const [passcode, setPasscode] = useState('');
  const login = useMutation({
    mutationFn: () => apiClient.post('/auth/login', { passcode }),
    onSuccess: () => { setPasscode(''); void qc.invalidateQueries(); },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); if (passcode) login.mutate(); };

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-lg border border-slate-200 bg-card p-6 shadow-card">
        <div className="mb-5 flex items-center gap-2.5"><LogoMark size={30} /><Wordmark /></div>
        <p className="mb-4 flex items-center gap-2 text-sm text-slate-600"><LockKeyhole className="h-4 w-4" />Enter your access passcode to continue.</p>
        <Input type="password" autoFocus autoComplete="current-password" placeholder="Passcode" value={passcode} onChange={(e) => setPasscode(e.target.value)} aria-label="Passcode" />
        {login.isError && <p role="alert" className="mt-2 text-sm text-rose-700">{errMsg(login.error)}</p>}
        <Button type="submit" variant="primary" className="mt-4 w-full" loading={login.isPending} disabled={!passcode}>Unlock</Button>
      </form>
      <Watermark className="absolute bottom-6" />
    </div>
  );
}

/** Shows the login screen when the backend requires a passcode and this browser has no session. */
export function AuthGate({ children }: PropsWithChildren) {
  const { data, refetch } = useAuthStatus();
  useEffect(() => {
    const onUnauthorized = () => void refetch();
    window.addEventListener('shortlist:unauthorized', onUnauthorized);
    return () => window.removeEventListener('shortlist:unauthorized', onUnauthorized);
  }, [refetch]);

  if (!data) return <>{children}</>; // status unknown (e.g. backend down): let pages show their own errors
  if (data.required && !data.authenticated) return <LoginScreen />;
  return <>{children}</>;
}
