import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface Thresholds {
  poor: [number, number];
  possible: [number, number];
  good: [number, number];
  strong: [number, number];
  excellent: [number, number];
}

export interface SchedulerSettings {
  enabled: boolean;
  intervalHours: number;
  profileIds: string[];
  sourceKeys: string[];
}

export interface CandidateSettings {
  name: string;
  email: string;
  phone: string;
}

export interface AutoApplySettings {
  enabled: boolean;
  minScore: number;
  dailyLimit: number;
}

export const SETTING_DEFAULTS = {
  match_score_thresholds: {
    poor: [0, 49],
    possible: [50, 69],
    good: [70, 79],
    strong: [80, 89],
    excellent: [90, 100],
  } as Thresholds,
  scheduler: { enabled: false, intervalHours: 6, profileIds: [], sourceKeys: [] } as SchedulerSettings,
  candidate: { name: '', email: '', phone: '' } as CandidateSettings,
  auto_apply: { enabled: false, minScore: 80, dailyLimit: 10 } as AutoApplySettings,
  pipeline: { defaultMinScore: 50, fetchDescriptions: true, maxDescriptionFetches: 25 },
};

export type SettingKey = keyof typeof SETTING_DEFAULTS;

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get<K extends SettingKey>(key: K): Promise<(typeof SETTING_DEFAULTS)[K]> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    const def = SETTING_DEFAULTS[key];
    if (!row) return def;
    return typeof def === 'object' && !Array.isArray(def) ? { ...def, ...(row.value as object) } : (row.value as never);
  }

  async set<K extends SettingKey>(key: K, value: unknown) {
    await this.prisma.systemSetting.upsert({
      where: { key },
      update: { value: value as never },
      create: { key, value: value as never },
    });
    return this.get(key);
  }

  async all() {
    const keys = Object.keys(SETTING_DEFAULTS) as SettingKey[];
    const values = await Promise.all(keys.map((k) => this.get(k)));
    return Object.fromEntries(keys.map((k, i) => [k, values[i]]));
  }
}
