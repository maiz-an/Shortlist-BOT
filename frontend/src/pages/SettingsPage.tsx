import { useEffect, useState } from 'react';
import { useProfiles, useSources } from '../features/search/api';
import { useAiStatus, useSaveSetting, useSettings } from '../features/settings/api';
import type { Settings } from '../types';
import { Badge, Button, Card, ErrorState, Field, Input, Loading, PageHeader, Textarea, errMsg, useToast } from '../components/ui';

function useDraft<K extends keyof Settings>(key: K, server: Settings[K] | undefined) {
  const [local, setLocal] = useState<Settings[K] | null>(null);
  useEffect(() => setLocal(null), [server]); // discard local edits once fresh server data arrives
  const save = useSaveSetting();
  const toast = useToast();
  const v = local ?? server;
  return {
    v, setV: (next: Settings[K]) => setLocal(next), saving: save.isPending,
    save: () => save.mutate({ key, value: v }, { onSuccess: () => toast.success('Settings saved'), onError: (e) => toast.error(errMsg(e)) }),
  };
}

const LABELS = ['poor', 'possible', 'good', 'strong', 'excellent'] as const;

export function SettingsPage() {
  const { data, isLoading, error, refetch } = useSettings();
  const ai = useAiStatus();
  const profiles = useProfiles();
  const sources = useSources();
  const candidate = useDraft('candidate', data?.candidate);
  const thresholds = useDraft('match_score_thresholds', data?.match_score_thresholds);
  const scheduler = useDraft('scheduler', data?.scheduler);
  const pipeline = useDraft('pipeline', data?.pipeline);

  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;
  const c = candidate.v!, t = thresholds.v!, s = scheduler.v!, p = pipeline.v!;
  const toggle = (list: string[], x: string) => (list.includes(x) ? list.filter((i) => i !== x) : [...list, x]);

  // Keep the five bands contiguous when the lower bound of a band changes.
  const setLower = (label: (typeof LABELS)[number], value: number) => {
    const next = structuredClone(t);
    next[label][0] = value;
    const i = LABELS.indexOf(label);
    if (i > 0) next[LABELS[i - 1]][1] = value - 1;
    thresholds.setV(next);
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" />

      <Card title="Local AI">
        <p className="flex items-center gap-2 text-sm">
          <Badge className={ai.data?.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}>{ai.data?.ok ? 'Ready' : 'Unavailable'}</Badge>
          <span>{ai.data ? `${ai.data.provider} · ${ai.data.model}` : 'Checking…'}</span>
        </p>
        {ai.data && !ai.data.ok && <p className="mt-2 text-sm text-rose-700">{ai.data.detail}</p>}
        <p className="mt-2 text-xs text-slate-500">Model and URL are set with OLLAMA_MODEL / OLLAMA_BASE_URL in backend/.env.</p>
      </Card>

      <Card title="Your profile (used for emails and scoring)">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name"><Input value={c.name} onChange={(e) => candidate.setV({ ...c, name: e.target.value })} /></Field>
          <Field label="Years of experience" hint="Used to check job experience requirements."><Input type="number" min={0} max={60} value={c.yearsExperience ?? ''} onChange={(e) => candidate.setV({ ...c, yearsExperience: e.target.value === '' ? null : Number(e.target.value) })} /></Field>
          <Field label="Email"><Input value={c.email} onChange={(e) => candidate.setV({ ...c, email: e.target.value })} /></Field>
          <Field label="Phone"><Input value={c.phone} onChange={(e) => candidate.setV({ ...c, phone: e.target.value })} /></Field>
          <div className="sm:col-span-2"><Field label="Summary"><Textarea rows={2} maxLength={2000} value={c.summary} onChange={(e) => candidate.setV({ ...c, summary: e.target.value })} /></Field></div>
          <div className="sm:col-span-2"><Field label="Experience notes" hint="Only facts written here (and on your CV skills) will be used in emails."><Textarea rows={5} maxLength={6000} value={c.experience} onChange={(e) => candidate.setV({ ...c, experience: e.target.value })} /></Field></div>
        </div>
        <Button className="mt-4" variant="primary" loading={candidate.saving} onClick={candidate.save}>Save profile</Button>
      </Card>

      <Card title="Match score bands">
        <div className="grid gap-3 sm:grid-cols-5">
          {LABELS.map((l, i) => (
            <Field key={l} label={`${l[0].toUpperCase()}${l.slice(1)} from`} hint={`up to ${t[l][1]}`}>
              <Input type="number" min={0} max={100} disabled={i === 0} value={t[l][0]} onChange={(e) => setLower(l, Math.max(0, Math.min(100, Number(e.target.value))))} />
            </Field>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">"Good" and above are recommended as APPLY; "Possible" as MAYBE.</p>
        <Button className="mt-4" variant="primary" loading={thresholds.saving} onClick={thresholds.save}>Save bands</Button>
      </Card>

      <Card title="Automatic search">
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={s.enabled} onChange={(e) => scheduler.setV({ ...s, enabled: e.target.checked })} />Run searches automatically (applications are never sent automatically)</label>
          <div className="max-w-xs"><Field label="Every (hours)"><Input type="number" min={0.25} step={0.25} max={168} value={s.intervalHours} onChange={(e) => scheduler.setV({ ...s, intervalHours: Number(e.target.value) })} /></Field></div>
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-slate-700">Profiles (none selected = all enabled)</legend>
            <div className="flex flex-wrap gap-3 text-sm">{profiles.data?.map((pr) => <label key={pr.id} className="flex items-center gap-1.5"><input type="checkbox" checked={s.profileIds.includes(pr.id)} onChange={() => scheduler.setV({ ...s, profileIds: toggle(s.profileIds, pr.id) })} />{pr.name}</label>)}</div>
          </fieldset>
          <fieldset>
            <legend className="mb-1 text-sm font-medium text-slate-700">Sources (none selected = each profile's sources)</legend>
            <div className="flex flex-wrap gap-3 text-sm">{sources.data?.filter((x) => x.implemented).map((x) => <label key={x.id} className="flex items-center gap-1.5"><input type="checkbox" checked={s.sourceKeys.includes(x.key)} onChange={() => scheduler.setV({ ...s, sourceKeys: toggle(s.sourceKeys, x.key) })} />{x.name}</label>)}</div>
          </fieldset>
        </div>
        <Button className="mt-4" variant="primary" loading={scheduler.saving} onClick={scheduler.save}>Save schedule</Button>
      </Card>

      <Card title="Pipeline">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Default minimum score for review" hint="Used when no search profile sets one."><Input type="number" min={0} max={100} value={p.defaultMinScore} onChange={(e) => pipeline.setV({ ...p, defaultMinScore: Number(e.target.value) })} /></Field>
          <Field label="Max description fetches per query" hint="Extra requests to load full job text. Lower is gentler on the source."><Input type="number" min={0} max={200} value={p.maxDescriptionFetches} onChange={(e) => pipeline.setV({ ...p, maxDescriptionFetches: Number(e.target.value) })} /></Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={p.fetchDescriptions} onChange={(e) => pipeline.setV({ ...p, fetchDescriptions: e.target.checked })} />Fetch full job descriptions (needed for good analysis)</label>
        </div>
        <Button className="mt-4" variant="primary" loading={pipeline.saving} onClick={pipeline.save}>Save pipeline</Button>
      </Card>
    </div>
  );
}
