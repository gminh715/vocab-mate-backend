import { Module } from '@nestjs/common';
import type { AiConfig } from '../../config/ai.config';
import { AI_CONFIG } from '../../config/config.module';
import {
  GEMINI_AI_PROVIDER,
  GeminiAiProvider,
  GROQ_AI_PROVIDER,
  GroqAiProvider,
} from './ai.provider';
import { AiService } from './ai.service';

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
