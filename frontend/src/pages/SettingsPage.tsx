import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useProfiles, useSources } from '../features/search/api';
import {
  useAiStatus, useSaveSetting, useSettings, useWhatsAppConnect, useWhatsAppDisconnect, useWhatsAppQr, useWhatsAppStatus, useWhatsAppTest,
} from '../features/settings/api';
import type { Settings } from '../types';
import { Badge, Button, Card, ErrorState, Field, Input, Loading, PageHeader, Toggle, cx, errMsg, useToast } from '../components/ui';
import { useEmailStatus } from '../features/settings/api';
import { APP_VERSION } from '../version';

function useDraft<K extends keyof Settings>(key: K, server: Settings[K] | undefined) {
  const [local, setLocal] = useState<Settings[K] | null>(null);
  useEffect(() => setLocal(null), [server]); // discard local edits once fresh server data arrives
  const save = useSaveSetting();
  const toast = useToast();
  const v = local ?? server;
  return {
    v, setV: (next: Settings[K]) => setLocal(next), saving: save.isPending,
    save: () => save.mutate({ key, value: v }, { onSuccess: () => toast.success('Settings saved'), onError: (e) => toast.error(errMsg(e)) }),
    /** Saves a specific value right away (used by the on/off switch). */
    saveNow: (value: Settings[K], message: string) => save.mutate({ key, value }, { onSuccess: () => toast.success(message), onError: (e) => { setLocal(null); toast.error(errMsg(e)); } }),
  };
}


const TABS = [
  { id: 'profile', label: 'Profile' },
  { id: 'auto-apply', label: 'Auto-apply' },
  { id: 'matching', label: 'Matching' },
  { id: 'search', label: 'Automatic search' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'system', label: 'System' },
] as const;
type TabId = (typeof TABS)[number]['id'];

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
  const autoApply = useDraft('auto_apply', data?.auto_apply);
  const waNotify = useDraft('whatsapp_notify', data?.whatsapp_notify);
  const gmail = useEmailStatus();
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab: TabId = TABS.some((t) => t.id === requested) ? (requested as TabId) : 'profile';
  const openTab = (id: TabId) => setParams(id === 'profile' ? {} : { tab: id }, { replace: true });

  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorState error={error} onRetry={() => refetch()} />;
  const c = candidate.v!, t = thresholds.v!, s = scheduler.v!, p = pipeline.v!, aa = autoApply.v!;
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
    <div>
      <PageHeader title="Settings" />

      <div role="tablist" aria-label="Settings sections" className="sticky top-0 z-20 -mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-slate-200 bg-canvas/95 px-4 backdrop-blur sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12">
        {TABS.map((t) => (
          <button
            key={t.id} role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls="settings-panel" onClick={() => openTab(t.id)}
            className={cx('relative shrink-0 whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors', tab === t.id ? 'text-slate-900' : 'text-slate-500 hover:text-slate-800')}
          >
            <span className="flex items-center gap-2">
              {t.label}
              {t.id === 'auto-apply' && aa.enabled && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">On</span>}
            </span>
            {tab === t.id && <motion.span layoutId="settings-tab-underline" className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-brand-600" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
          </button>
        ))}
      </div>

              <motion.div
          key={tab} id="settings-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="space-y-6"
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}
        >
          {tab === 'profile' && (
            <>
                    <Card title="Your details (used to sign emails)">
                      <p className="mb-4 text-sm text-slate-500">Only your contact details live here. Your experience, years and skills are read from your CV files, so scoring and emails always match the CV they use.</p>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Field label="Name"><Input value={c.name} onChange={(e) => candidate.setV({ ...c, name: e.target.value })} /></Field>
                        <Field label="Email"><Input value={c.email} onChange={(e) => candidate.setV({ ...c, email: e.target.value })} /></Field>
                        <Field label="Phone"><Input value={c.phone} onChange={(e) => candidate.setV({ ...c, phone: e.target.value })} /></Field>
                      </div>
                      <Button className="mt-4" variant="primary" loading={candidate.saving} onClick={candidate.save}>Save profile</Button>
                    </Card>
            </>
          )}

          {tab === 'auto-apply' && (
            <>
                    <Card title="Auto-apply">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900">Send applications by itself</p>
                          <p className="mt-0.5 text-sm text-slate-600">
                            {aa.enabled
                              ? `ON: a new job that matches ${aa.minScore}% or more is emailed without asking you.`
                              : `OFF: nothing is ever sent automatically, even for a ${aa.minScore}%+ match. Every application waits for your click.`}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className={aa.enabled ? 'text-sm font-semibold text-emerald-700' : 'text-sm font-semibold text-slate-500'}>{aa.enabled ? 'On' : 'Off'}</span>
                          <Toggle
                            label="Auto-apply"
                            checked={aa.enabled}
                            disabled={autoApply.saving}
                            onChange={(enabled) => autoApply.saveNow({ ...aa, enabled }, enabled ? 'Auto-apply is ON' : 'Auto-apply is OFF')}
                          />
                        </div>
                      </div>

                      {aa.enabled && !gmail.data?.connected && (
                        <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-800">Gmail is not connected, so nothing can be sent yet. Connect it on the Email page.</p>
                      )}

                      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Field label="Minimum match score" hint="Only jobs at or above this score are applied to.">
                          <Input type="number" min={50} max={100} value={aa.minScore} onChange={(e) => autoApply.setV({ ...aa, minScore: Math.max(50, Math.min(100, Number(e.target.value))) })} />
                        </Field>
                        <Field label="Most applications per day" hint="A safety limit, counted from midnight.">
                          <Input type="number" min={1} max={50} value={aa.dailyLimit} onChange={(e) => autoApply.setV({ ...aa, dailyLimit: Math.max(1, Math.min(50, Number(e.target.value))) })} />
                        </Field>
                      </div>
                      <Button className="mt-4" variant="primary" loading={autoApply.saving} onClick={autoApply.save}>Save auto-apply settings</Button>

                      <details className="mt-4 text-sm text-slate-600">
                        <summary className="font-medium text-slate-700">Safety rules (always applied)</summary>
                        <ul className="mt-2 list-disc space-y-1 pl-5">
                          <li>The job must reach the Review stage with an APPLY recommendation.</li>
                          <li>It needs an application email address, a CV file for the chosen CV, and a connected Gmail.</li>
                          <li>The email must be written by the AI. If it falls back to the plain template, the job stays in Review for you.</li>
                          <li>Nothing is sent when the switch is off, and jobs you already handle are never re-sent.</li>
                          <li>Every automatic send is marked in the application's notes and history.</li>
                        </ul>
                      </details>
                    </Card>
            </>
          )}

          {tab === 'matching' && (
            <>
                    <Card title="Match score bands">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
                        {LABELS.map((l, i) => (
                          <Field key={l} label={`${l[0].toUpperCase()}${l.slice(1)} from`} hint={`up to ${t[l][1]}`}>
                            <Input type="number" min={0} max={100} disabled={i === 0} value={t[l][0]} onChange={(e) => setLower(l, Math.max(0, Math.min(100, Number(e.target.value))))} />
                          </Field>
                        ))}
                      </div>
                      <p className="mt-2 text-xs text-slate-500">"Good" and above are recommended as APPLY; "Possible" as MAYBE.</p>
                      <Button className="mt-4" variant="primary" loading={thresholds.saving} onClick={thresholds.save}>Save bands</Button>
                    </Card>

                    <Card title="Pipeline">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Field label="Default minimum score for review" hint="Used when no search profile sets one."><Input type="number" min={0} max={100} value={p.defaultMinScore} onChange={(e) => pipeline.setV({ ...p, defaultMinScore: Number(e.target.value) })} /></Field>
                        <Field label="Max description fetches per query" hint="Extra requests to load full job text. Lower is gentler on the source."><Input type="number" min={0} max={200} value={p.maxDescriptionFetches} onChange={(e) => pipeline.setV({ ...p, maxDescriptionFetches: Number(e.target.value) })} /></Field>
                        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={p.fetchDescriptions} onChange={(e) => pipeline.setV({ ...p, fetchDescriptions: e.target.checked })} />Fetch full job descriptions (needed for good analysis)</label>
                      </div>
                      <Button className="mt-4" variant="primary" loading={pipeline.saving} onClick={pipeline.save}>Save pipeline</Button>
                    </Card>
            </>
          )}

          {tab === 'search' && (
            <>
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
            </>
          )}

          {tab === 'whatsapp' && (
            <>
                    <WhatsAppSection notify={waNotify} />
            </>
          )}

          {tab === 'system' && (
            <>
                    <Card title="Local AI">
                      <p className="flex items-center gap-2 text-sm">
                        <Badge className={ai.data?.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}>{ai.data?.ok ? 'Ready' : 'Unavailable'}</Badge>
                        <span>{ai.data ? `${ai.data.provider} · ${ai.data.model}` : 'Checking…'}</span>
                      </p>
                      {ai.data && !ai.data.ok && <p className="mt-2 text-sm text-rose-700">{ai.data.detail}</p>}
                      <p className="mt-2 text-xs text-slate-500">Model and URL are set with OLLAMA_MODEL / OLLAMA_BASE_URL in backend/.env.</p>
                    </Card>

                    <Card title="About">
                      <dl className="divide-y divide-slate-100 text-sm">
                        <div className="flex justify-between gap-4 py-2"><dt className="text-slate-500">App</dt><dd className="font-medium text-slate-900">Shortlist BOT</dd></div>
                        <div className="flex justify-between gap-4 py-2"><dt className="text-slate-500">Version</dt><dd className="font-medium tabular-nums text-slate-900">{APP_VERSION}</dd></div>
                        <div className="flex justify-between gap-4 py-2"><dt className="text-slate-500">Changes</dt><dd><a className="text-brand-600 hover:underline" href="https://github.com/maiz-an/Shortlist-BOT/blob/main/CHANGELOG.md" target="_blank" rel="noreferrer noopener">Changelog</a></dd></div>
                      </dl>
                    </Card>
            </>
          )}
        </motion.div>
    </div>
  );
}

/**
 * Optional WhatsApp alerts through a self-hosted OpenWA instance (see SETUP.md, services/openwa).
 * Off this machine, or on anyone else's, `configured`/`reachable` are simply false and this renders
 * one calm, skippable line - never an error.
 */
function WhatsAppSection({ notify }: { notify: ReturnType<typeof useDraft<'whatsapp_notify'>> }) {
  const status = useWhatsAppStatus();
  const connect = useWhatsAppConnect();
  const disconnect = useWhatsAppDisconnect();
  const toast = useToast();
  const s = status.data;
  const showQr = s?.session?.status === 'qr_ready';
  const qr = useWhatsAppQr(showQr);
  const connectedPhone = s?.session?.phone;
  // Once we learn the connected number, default the alert phone to it (only while the field is still empty).
  useEffect(() => {
    if (notify.v && !notify.v.phone && connectedPhone) notify.setV({ ...notify.v, phone: connectedPhone });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedPhone, notify.v?.phone]);

  if (status.isLoading) return <Card title="WhatsApp"><Loading rows={2} /></Card>;

  if (!s?.configured) {
    return (
      <Card title="WhatsApp alerts (optional)">
        <p className="text-sm text-slate-600">
          Not set up on this machine. This is entirely optional - skip it if you don't want WhatsApp alerts.
          To enable it, set up a local OpenWA instance and add its address and key to <code>backend/.env</code>; see SETUP.md.
        </p>
      </Card>
    );
  }

  if (!s.reachable) {
    return (
      <Card title="WhatsApp alerts">
        <p className="flex items-center gap-2 text-sm"><Badge className="bg-slate-100 text-slate-600">Not running</Badge><span>OpenWA is configured but not reachable right now.</span></p>
        <p className="mt-2 text-xs text-slate-500">Start it (see SETUP.md), then reopen this tab.</p>
      </Card>
    );
  }

  const connected = s.session?.status === 'ready';
  const connecting = s.session && ['created', 'initializing', 'authenticating'].includes(s.session.status);

  return (
    <>
    <Card title="WhatsApp alerts">
      {connected ? (
        <>
          <p className="flex items-center gap-2 text-sm">
            <Badge className="bg-emerald-100 text-emerald-700">Connected</Badge>
            <span>Sending from <strong className="font-semibold text-slate-900">+{s.session?.phone}</strong>{s.session?.pushName ? ` (${s.session.pushName})` : ''}</span>
          </p>
          <Button className="mt-4" loading={disconnect.isPending} onClick={() => disconnect.mutate(undefined, { onSuccess: () => toast.success('Disconnected'), onError: (e) => toast.error(errMsg(e)) })}>
            Disconnect
          </Button>
        </>
      ) : showQr ? (
        <>
          <p className="mb-3 text-sm text-slate-600">Scan this with WhatsApp on your phone: Settings → Linked devices → Link a device.</p>
          {qr.data?.qrCode ? (
            <img src={qr.data.qrCode} alt="WhatsApp QR code" className="h-56 w-56 rounded-md border border-slate-200 bg-white p-2" />
          ) : (
            <Loading rows={2} />
          )}
          <p className="mt-2 text-xs text-slate-500">This updates itself - no need to refresh.</p>
        </>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            {connecting ? 'Starting up…' : 'Not connected yet. Link your WhatsApp to receive alerts for strong matches.'}
          </p>
          <Button
            className="mt-4" variant="primary" loading={connect.isPending || !!connecting}
            onClick={() => connect.mutate(undefined, { onError: (e) => toast.error(errMsg(e)) })}
          >
            Connect WhatsApp
          </Button>
        </>
      )}
    </Card>

      {(connected || showQr || connecting) && notify.v && <AlertSettingsCard notify={notify} connected={connected} />}
    </>
  );
}

function AlertSettingsCard({ notify, connected }: { notify: ReturnType<typeof useDraft<'whatsapp_notify'>>; connected: boolean }) {
  const toast = useToast();
  const test = useWhatsAppTest();
  const v = notify.v!;

  return (
    <Card title="Alert settings" className="mt-4">
      <p className="text-sm text-slate-600">
        Alerts are sent to <strong className="font-semibold text-slate-900">{v.phone ? `+${v.phone}` : '(no number set)'}</strong>.
      </p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-900">Message me for strong matches</p>
          <p className="text-xs text-slate-500">Sent once per job, the first time it reaches this score.</p>
        </div>
        <Toggle
          checked={v.enabled}
          disabled={notify.saving}
          label="Message me for strong matches"
          onChange={(enabled) => notify.saveNow({ ...v, enabled }, enabled ? 'WhatsApp alerts are ON' : 'WhatsApp alerts are OFF')}
        />
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Send to (WhatsApp number)" hint="Digits only, with country code, e.g. 97430264760. Defaults to your own connected number.">
          <Input value={v.phone} onChange={(e) => notify.setV({ ...v, phone: e.target.value.replace(/\D/g, '') })} />
        </Field>
        <Field label="Minimum match score" hint="Only jobs at or above this score send an alert.">
          <Input
            type="number" min={50} max={100} value={v.minScore}
            onChange={(e) => notify.setV({ ...v, minScore: Math.max(50, Math.min(100, Number(e.target.value))) })}
          />
        </Field>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" loading={notify.saving} onClick={notify.save}>Save alert settings</Button>
        <Button
          loading={test.isPending} disabled={!connected || !v.phone}
          onClick={() => test.mutate(v.phone, {
            onSuccess: (r) => (r.ok ? toast.success(`Test message sent to +${v.phone}`) : toast.error(r.reason ?? 'Could not send')),
            onError: (e) => toast.error(errMsg(e)),
          })}
        >
          Send test message
        </Button>
      </div>
      {!connected && <p className="mt-2 text-xs text-slate-500">Connect WhatsApp above before sending a test.</p>}
    </Card>
  );
}
