import { useState } from 'react';
import { ManualJobForm } from '../features/jobs/ManualJobForm';
import { useProfileMutations, useProfiles, useRunSearch, useSearchRuns, useSources } from '../features/search/api';
import type { ProfileInput } from '../features/search/api';
import type { DatePosted, JobType, RemotePreference, SearchProfile } from '../types';
import {
  Badge, Button, Card, Chips, ConfirmDialog, EmptyState, ErrorState, Field, Input, ListInput, Loading, Modal, PageHeader, Select, TableShell, Td, Th, errMsg, fmtDateTime, useToast,
} from '../components/ui';

const JOB_TYPES: JobType[] = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'TEMPORARY'];
const blank: ProfileInput = {
  name: '', keywords: [], location: 'Qatar', minMatchScore: 50, excludedKeywords: [], preferredJobTypes: ['FULL_TIME'], preferredLocations: [],
  remotePreference: 'ANY', datePosted: 'PAST_WEEK', experienceLevel: null, sortBy: 'recent', maxPages: 1, enabled: true, sourceIds: [],
};

function ProfileForm({ initial, busy, onSave }: { initial: ProfileInput; busy: boolean; onSave: (v: ProfileInput) => void }) {
  const [v, setV] = useState(initial);
  const sources = useSources();
  const toggle = <T,>(list: T[], x: T) => (list.includes(x) ? list.filter((i) => i !== x) : [...list, x]);
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onSave({ ...v, location: v.location || null, experienceLevel: v.experienceLevel || null }); }}>
      <Field label="Profile name"><Input required maxLength={100} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="Developer" /></Field>
      <Field label="Keywords" hint="Each keyword is searched separately."><ListInput value={v.keywords} onChange={(keywords) => setV({ ...v, keywords })} placeholder="Full Stack Developer, React Developer" /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Search location"><Input value={v.location ?? ''} onChange={(e) => setV({ ...v, location: e.target.value })} placeholder="Qatar" /></Field>
        <Field label="Preferred locations" hint="Used for location scoring."><ListInput value={v.preferredLocations} onChange={(preferredLocations) => setV({ ...v, preferredLocations })} placeholder="Doha, Qatar" /></Field>
        <Field label="Minimum match score"><Input type="number" min={0} max={100} value={v.minMatchScore} onChange={(e) => setV({ ...v, minMatchScore: Number(e.target.value) })} /></Field>
        <Field label="Date posted"><Select value={v.datePosted} onChange={(e) => setV({ ...v, datePosted: e.target.value as DatePosted })}>{['PAST_24_HOURS', 'PAST_WEEK', 'PAST_MONTH', 'ANY_TIME'].map((d) => <option key={d}>{d}</option>)}</Select></Field>
        <Field label="Remote / on-site"><Select value={v.remotePreference} onChange={(e) => setV({ ...v, remotePreference: e.target.value as RemotePreference })}>{['ANY', 'ON_SITE', 'REMOTE', 'HYBRID'].map((d) => <option key={d}>{d}</option>)}</Select></Field>
        <Field label="Experience level"><Select value={v.experienceLevel ?? ''} onChange={(e) => setV({ ...v, experienceLevel: e.target.value || null })}><option value="">Any</option>{['internship', 'entry level', 'associate', 'senior', 'director', 'executive'].map((d) => <option key={d}>{d}</option>)}</Select></Field>
        <Field label="Sort by"><Select value={v.sortBy} onChange={(e) => setV({ ...v, sortBy: e.target.value })}><option value="recent">Most recent</option><option value="relevant">Most relevant</option></Select></Field>
        <Field label="Pages per keyword" hint="25 results per page. Higher = slower."><Input type="number" min={1} max={5} value={v.maxPages} onChange={(e) => setV({ ...v, maxPages: Number(e.target.value) })} /></Field>
      </div>
      <Field label="Excluded keywords" hint="Jobs with these in the title are skipped; elsewhere they lower the score."><ListInput value={v.excludedKeywords} onChange={(excludedKeywords) => setV({ ...v, excludedKeywords })} /></Field>
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-slate-700">Preferred job types</legend>
        <div className="flex flex-wrap gap-3 text-sm">{JOB_TYPES.map((t) => <label key={t} className="flex items-center gap-1.5"><input type="checkbox" checked={v.preferredJobTypes.includes(t)} onChange={() => setV({ ...v, preferredJobTypes: toggle(v.preferredJobTypes, t) })} />{t.replace('_', ' ')}</label>)}</div>
      </fieldset>
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-slate-700">Sources</legend>
        <div className="flex flex-wrap gap-3 text-sm">
          {sources.data?.filter((s) => s.implemented).map((s) => <label key={s.id} className="flex items-center gap-1.5"><input type="checkbox" checked={v.sourceIds.includes(s.id)} onChange={() => setV({ ...v, sourceIds: toggle(v.sourceIds, s.id) })} />{s.name}</label>)}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.enabled} onChange={(e) => setV({ ...v, enabled: e.target.checked })} />Enabled</label>
      <Button type="submit" variant="primary" loading={busy}>Save profile</Button>
    </form>
  );
}

const toInput = (p: SearchProfile): ProfileInput => ({
  name: p.name, keywords: p.keywords, location: p.location, minMatchScore: p.minMatchScore, excludedKeywords: p.excludedKeywords,
  preferredJobTypes: p.preferredJobTypes, preferredLocations: p.preferredLocations, remotePreference: p.remotePreference, datePosted: p.datePosted,
  experienceLevel: p.experienceLevel, sortBy: p.sortBy, maxPages: p.maxPages, enabled: p.enabled, sourceIds: p.sources.map((s) => s.id),
});

export function SearchPage() {
  const profiles = useProfiles();
  const runs = useSearchRuns();
  const { create, update, remove } = useProfileMutations();
  const run = useRunSearch();
  const toast = useToast();
  const [editing, setEditing] = useState<SearchProfile | 'new' | null>(null);
  const [deleting, setDeleting] = useState<SearchProfile | null>(null);
  const [manual, setManual] = useState(false);
  const running = runs.data?.some((r) => r.status === 'RUNNING');

  const start = (ids?: string[]) =>
    run.mutate({ profileIds: ids }, { onSuccess: () => toast.success('Search started'), onError: (e) => toast.error(errMsg(e)) });

  const save = (v: ProfileInput) => {
    const opts = { onSuccess: () => { setEditing(null); toast.success('Profile saved'); }, onError: (e: unknown) => toast.error(errMsg(e)) };
    if (editing === 'new') create.mutate(v, opts);
    else if (editing) update.mutate({ id: editing.id, data: v }, opts);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Search"
        subtitle="Search profiles decide what to look for. Runs collect, deduplicate and analyze jobs; nothing is ever sent automatically."
        actions={<><Button onClick={() => setManual(true)}>Add job manually</Button><Button onClick={() => setEditing('new')}>New profile</Button><Button variant="primary" loading={run.isPending || running} onClick={() => start()}>{running ? 'Searching…' : 'Find new jobs'}</Button></>}
      />

      {profiles.isLoading ? <Loading /> : profiles.error ? <ErrorState error={profiles.error} onRetry={() => profiles.refetch()} /> : !profiles.data?.length ? (
        <EmptyState title="No search profiles" hint="Create one with keywords and a location to start collecting jobs." action={<Button variant="primary" onClick={() => setEditing('new')}>New profile</Button>} />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {profiles.data.map((p) => (
            <Card key={p.id} title={<span className="flex items-center gap-2">{p.name}{!p.enabled && <Badge>Disabled</Badge>}</span>}
              actions={<><Button disabled={!p.enabled || running} onClick={() => start([p.id])}>Run</Button><Button onClick={() => setEditing(p)}>Edit</Button><Button variant="ghost" onClick={() => setDeleting(p)}>Delete</Button></>}>
              <div className="space-y-2 text-sm">
                <Chips items={p.keywords} />
                <p className="text-slate-500">{p.location ?? 'Anywhere'} · {p.datePosted.replace(/_/g, ' ').toLowerCase()} · {p.remotePreference.replace('_', '-').toLowerCase()} · min score {p.minMatchScore}% · sources: {p.sources.map((s) => s.name).join(', ') || 'none selected'}</p>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Recent runs</h3>
        {!runs.data?.length ? <p className="text-sm text-slate-500">No runs yet.</p> : (
          <TableShell>
            <thead><tr><Th>Started</Th><Th>Profile</Th><Th>Status</Th><Th>Found</Th><Th>New</Th><Th>Duplicates</Th><Th>Issues</Th></tr></thead>
            <tbody>
              {runs.data.map((r) => (
                <tr key={r.id}>
                  <Td className="whitespace-nowrap">{fmtDateTime(r.startedAt)}</Td><Td>{r.jobSearchProfile?.name ?? '—'}</Td>
                  <Td><Badge className={r.status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-700' : r.status === 'RUNNING' ? 'bg-sky-100 text-sky-700' : 'bg-amber-100 text-amber-800'}>{r.status}</Badge></Td>
                  <Td>{r.jobsFound}</Td><Td>{r.jobsNew}</Td><Td>{r.duplicatesSkipped}</Td>
                  <Td className="max-w-xs truncate text-xs text-amber-700" >{r.errors?.map((e) => `${e.source}: ${e.error}`).join('; ')}</Td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        )}
      </div>

      <Modal open={!!editing} title={editing === 'new' ? 'New search profile' : 'Edit search profile'} onClose={() => setEditing(null)}>
        {editing && <ProfileForm key={editing === 'new' ? 'new' : editing.id} busy={create.isPending || update.isPending} onSave={save} initial={editing === 'new' ? blank : toInput(editing)} />}
      </Modal>
      <Modal open={manual} title="Add job manually" onClose={() => setManual(false)}><ManualJobForm onDone={() => setManual(false)} /></Modal>
      <ConfirmDialog
        open={!!deleting} danger title="Delete search profile?" confirmLabel="Delete" loading={remove.isPending} onClose={() => setDeleting(null)}
        message={`"${deleting?.name}" will be removed. Jobs already collected are kept.`}
        onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => { setDeleting(null); toast.success('Deleted'); }, onError: (e) => toast.error(errMsg(e)) })}
      />
    </div>
  );
}
