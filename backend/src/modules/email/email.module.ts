import { BadRequestException, Body, Controller, Delete, Get, Module, Param, ParseUUIDPipe, Post, Put, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Response } from 'express';
import { Public } from '../../common/guards/api-token.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { ApplicationsModule } from '../applications/applications.controller';
import { CvProfilesModule } from '../cv-profiles/cv-profiles.controller';
import { SettingsModule } from '../settings/settings.controller';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { EMAIL_PROVIDER, EmailAuthError, EmailProvider } from './email-provider';
import { AutoApplyService } from './auto-apply.service';
import { EmailGenerationService } from './email-generation.service';
import { EmailSendService } from './email-send.service';
import { GmailProvider } from './gmail.provider';
import { Inject } from '@nestjs/common';

class DraftDto {
  @IsOptional() @IsString() @MaxLength(320) recipient?: string;
  @IsOptional() @IsString() @MaxLength(200) subject?: string;
  @IsOptional() @IsString() @MaxLength(6000) body?: string;
}

class SendDto extends DraftDto {
  @IsBoolean() confirm!: boolean;
}

@Controller()
export class EmailController {
  constructor(
    @Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider,
    private readonly generation: EmailGenerationService,
    private readonly sender: EmailSendService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get('email/status')
  status() {
    return this.provider.status();
  }

  @Get('email/oauth/url')
  oauthUrl() {
    try {
      return { url: this.provider.authUrl() };
    } catch (err) {
      if (err instanceof EmailAuthError) throw new BadRequestException(err.message);
      throw err;
    }
  }

  /** Browser redirect from Google; cannot carry the API token, so it is public and protected by the one-time state value. */
  @Public()
  @Get('email/oauth/callback')
  async callback(@Query('code') code: string, @Query('state') state: string, @Query('error') error: string, @Res() res: Response) {
    const front = this.config.get<string>('FRONTEND_URL', 'http://localhost:5870');
    if (error || !code || !state) return res.redirect(`${front}/email?error=${encodeURIComponent(error || 'missing_code')}`);
    try {
      await this.provider.handleCallback(code, state);
      return res.redirect(`${front}/email?connected=1`);
    } catch (err) {
      return res.redirect(`${front}/email?error=${encodeURIComponent((err as Error).message.slice(0, 200))}`);
    }
  }

  @Delete('email/account')
  async disconnect() {
    await this.provider.disconnect();
    return { connected: false };
  }

  @Get('email/messages')
  messages() {
    return this.prisma.emailMessage.findMany({
      orderBy: { sentAt: 'desc' }, take: 50,
      include: { application: { select: { id: true, company: true, jobTitle: true } } },
    });
  }

  @Post('applications/:id/draft/generate')
  generate(@Param('id', ParseUUIDPipe) id: string) {
    return this.generation.generate(id);
  }

  @Put('applications/:id/draft')
  saveDraft(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DraftDto) {
    return this.sender.saveDraft(id, dto);
  }

  @Post('applications/:id/send')
  send(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SendDto) {
    return this.sender.send(id, dto);
  }
}

@Module({
  imports: [ApplicationsModule, CvProfilesModule, SettingsModule, WhatsAppModule],
  controllers: [EmailController],
  providers: [GmailProvider, { provide: EMAIL_PROVIDER, useExisting: GmailProvider }, EmailGenerationService, EmailSendService, AutoApplyService],
  exports: [AutoApplyService],
})
export class EmailModule {}
