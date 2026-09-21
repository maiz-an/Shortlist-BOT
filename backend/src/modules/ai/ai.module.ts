import { Controller, Get, Global, Inject, Module } from '@nestjs/common';
import { AI_PROVIDER, AIProvider } from './ai-provider';
import { OllamaProvider } from './ollama.provider';

@Controller('ai')
class AiController {
  constructor(@Inject(AI_PROVIDER) private readonly ai: AIProvider) {}

  @Get('status')
  async status() {
    return { provider: this.ai.name, model: this.ai.model, ...(await this.ai.isAvailable()) };
  }
}

/** Swap `useClass` to change provider (OpenAI, Anthropic, ...) without touching business code. */
@Global()
@Module({
  controllers: [AiController],
  providers: [OllamaProvider, { provide: AI_PROVIDER, useExisting: OllamaProvider }],
  exports: [AI_PROVIDER],
})
export class AiModule {}
