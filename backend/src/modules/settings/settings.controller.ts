import { BadRequestException, Body, Controller, Get, Module, Param, Put } from '@nestjs/common';
import { z } from 'zod';
import { SETTING_DEFAULTS, SettingKey, SettingsService } from './settings.service';

const range = z.tuple([z.number().int().min(0).max(100), z.number().int().min(0).max(100)]);
const schemas: Record<SettingKey, z.ZodTypeAny> = {
  match_score_thresholds: z.object({ poor: range, possible: range, good: range, strong: range, excellent: range }),
  scheduler: z.object({
    enabled: z.boolean(),
    intervalHours: z.number().min(0.25).max(168),
    profileIds: z.array(z.string().uuid()),
    sourceKeys: z.array(z.string().max(50)),
  }),
  candidate: z.object({
    name: z.string().max(120),
    email: z.string().max(200),
    phone: z.string().max(50),
  }),
  auto_apply: z.object({
    enabled: z.boolean(),
    minScore: z.number().int().min(50).max(100),
    dailyLimit: z.number().int().min(1).max(50),
  }),
  whatsapp_notify: z.object({
    enabled: z.boolean(),
    phone: z.string().max(20).regex(/^\d*$/, 'Digits only, with country code, no + or spaces'),
    minScore: z.number().int().min(50).max(100),
  }),
  scoring_version: z.object({ version: z.number().int().min(0) }),
  pipeline: z.object({
    defaultMinScore: z.number().int().min(0).max(100),
    fetchDescriptions: z.boolean(),
    maxDescriptionFetches: z.number().int().min(0).max(200),
  }),
};

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  all() {
    return this.settings.all();
  }

  @Put(':key')
  async update(@Param('key') key: string, @Body() body: unknown) {
    if (!(key in SETTING_DEFAULTS)) throw new BadRequestException(`Unknown setting: ${key}`);
    const parsed = schemas[key as SettingKey].safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
    return this.settings.set(key as SettingKey, parsed.data);
  }
}

@Module({ controllers: [SettingsController], providers: [SettingsService], exports: [SettingsService] })
export class SettingsModule {}
