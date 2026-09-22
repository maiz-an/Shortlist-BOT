import { isNewer, SystemService } from '../modules/system/system.module';

describe('isNewer', () => {
  it('compares semver correctly', () => {
    expect(isNewer('1.7.0', '1.6.0')).toBe(true);
    expect(isNewer('1.6.1', '1.6.0')).toBe(true);
    expect(isNewer('2.0.0', '1.9.9')).toBe(true);
    expect(isNewer('1.6.0', '1.6.0')).toBe(false);
    expect(isNewer('1.5.9', '1.6.0')).toBe(false);
  });
  it('tolerates a leading v and ignores anything unparsable', () => {
    expect(isNewer('v1.7.0', '1.6.0')).toBe(true);
    expect(isNewer('garbage', '1.6.0')).toBe(false);
  });
});

describe('SystemService.updateCheck', () => {
  it('reports checked:false without throwing when GitHub is unreachable', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('fetch failed'));
    const svc = new SystemService();
    const r = await svc.updateCheck();
    expect(r.checked).toBe(false);
    expect(r.current).toBe(svc.currentVersion);
    expect(r.error).toBeTruthy();
    fetchSpy.mockRestore();
  });

  it('reports an update when the release tag is newer, and caches the result', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ tag_name: 'v99.0.0', html_url: 'https://example.com/releases/v99.0.0', published_at: '2026-01-01' }),
    } as Response);
    const svc = new SystemService();
    const r = await svc.updateCheck();
    expect(r).toMatchObject({ checked: true, latest: '99.0.0', updateAvailable: true, releaseUrl: 'https://example.com/releases/v99.0.0' });
    await svc.updateCheck();
    expect(fetchSpy).toHaveBeenCalledTimes(1); // second call served from cache
    fetchSpy.mockRestore();
  });

  it('reports no update available when already on the latest tag', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ tag_name: `v${new SystemService().currentVersion}` }),
    } as Response);
    const svc = new SystemService();
    const r = await svc.updateCheck();
    expect(r.updateAvailable).toBe(false);
    fetchSpy.mockRestore();
  });

  it('handles a non-200 response without throwing', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 403 } as Response);
    const svc = new SystemService();
    const r = await svc.updateCheck();
    expect(r.checked).toBe(false);
    expect(r.error).toContain('403');
    fetchSpy.mockRestore();
  });
});
