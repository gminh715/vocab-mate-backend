import { Module } from '@nestjs/common';
import type { AiConfig } from '../../config/ai.config';
import { AI_CONFIG } from '../../config/config.module';
import {
  GEMINI_AI_PROVIDER,
  GROQ_AI_PROVIDER,
} from './providers/ai-provider.contract';
import { GeminiAiProvider } from './providers/gemini.provider';
import { GroqAiProvider } from './providers/groq.provider';
import { AiService } from './services/ai.service';

@Module({
  providers: [
    {
      provide: GEMINI_AI_PROVIDER,
      inject: [AI_CONFIG],
      useFactory: (config: AiConfig) => new GeminiAiProvider(config),
    },
    {
      provide: GROQ_AI_PROVIDER,
      inject: [AI_CONFIG],
      useFactory: (config: AiConfig) => new GroqAiProvider(config),
    },
    AiService,
  ],
  exports: [AiService],
})
export class AiModule {}
