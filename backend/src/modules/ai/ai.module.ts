import { Controller, Get, Global, Inject, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AI_PROVIDER, AIProvider } from './ai-provider';
import { OllamaProvider } from './ollama.provider';
import { OpenAiCompatibleProvider } from './openai-compatible.provider';

@Controller('ai')
class AiController {
  constructor(@Inject(AI_PROVIDER) private readonly ai: AIProvider) {}

  @Get('status')
  async status() {
    return { provider: this.ai.name, model: this.ai.model, ...(await this.ai.isAvailable()) };
  }
}

/**
 * Which AI answers questions is picked once, at boot, from AI_PROVIDER in backend/.env:
 *   - "ollama" (default) - a local model via Ollama, free and private, needs a capable machine.
 *   - "openai" - any cloud API that speaks the OpenAI chat-completions format (OpenAI, OpenRouter,
 *     Groq, Together.ai, ...), set with AI_API_BASE_URL / AI_API_KEY / AI_API_MODEL.
 * Business code only ever depends on the AIProvider interface, never on which one is active.
 */
@Global()
@Module({
  controllers: [AiController],
  providers: [
    OllamaProvider,
    OpenAiCompatibleProvider,
    {
      provide: AI_PROVIDER,
      useFactory: (config: ConfigService, ollama: OllamaProvider, openai: OpenAiCompatibleProvider): AIProvider =>
        config.get<string>('AI_PROVIDER', 'ollama').trim().toLowerCase() === 'openai' ? openai : ollama,
      inject: [ConfigService, OllamaProvider, OpenAiCompatibleProvider],
    },
  ],
  exports: [AI_PROVIDER],
})
export class AiModule {}
