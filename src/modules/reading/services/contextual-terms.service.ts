import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { AiGenerationStatus } from '../../../../generated/prisma/enums';
import type { TermEnrichmentResult } from '../../ai/ai.contracts';
import { AiService } from '../../ai/services/ai.service';
import {
  type ContextualTermEnrichmentClaimRecord,
  ContextualTermEnrichmentStateConflictError,
  type ContextualTermLookupRecord,
  type SavableContextualTermRecord,
  ContextualTermsRepository,
} from '../repositories/contextual-terms.repository';

const isUnknownRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

@Injectable()
export class ContextualTermsService {
  constructor(
    private readonly contextualTermsRepository: ContextualTermsRepository,
    private readonly aiService: AiService,
  ) {}

  async getContextualTerm(userId: string, articleId: string, termId: string) {
    const cached = await this.contextualTermsRepository.findContextualTerm(
      userId,
      articleId,
      termId,
    );
    this.requireLookupAccessible(cached);

    if (cached.term.explanationStatus === AiGenerationStatus.READY) {
      return this.mapContextualTerm(cached);
    }
    if (cached.term.explanationStatus === AiGenerationStatus.PROCESSING) {
      this.throwEnrichmentUnavailable();
    }

    const claim =
      await this.contextualTermsRepository.claimContextualTermEnrichment(
        articleId,
        termId,
      );
    if (!claim) {
      const refreshed = await this.contextualTermsRepository.findContextualTerm(
        userId,
        articleId,
        termId,
      );
      this.requireLookupAccessible(refreshed);
      if (refreshed.term.explanationStatus === AiGenerationStatus.READY) {
        return this.mapContextualTerm(refreshed);
      }
      this.throwEnrichmentUnavailable();
    }

    let enrichment: TermEnrichmentResult;
    try {
      enrichment = await this.aiService.enrichContextualTerm({
        articleId: claim.article.id,
        articleTitle: claim.article.title,
        termId: claim.term.id,
        value: claim.term.value,
        lemma: claim.term.lemma,
        parentSentenceText: claim.parentSentence.sentenceText,
        surroundingSentenceContext: this.buildSurroundingContext(claim),
      });
    } catch {
      await this.contextualTermsRepository.failContextualTermEnrichment(
        claim.article.id,
        claim.article.contentVersion,
        claim.term.id,
        this.sanitizeEnrichmentError(
          'AI contextual-term enrichment failed safely',
        ),
      );
      throw new ServiceUnavailableException(
        'Contextual term enrichment is temporarily unavailable; retry later',
      );
    }

    try {
      await this.contextualTermsRepository.completeContextualTermEnrichment({
        articleId: claim.article.id,
        contentVersion: claim.article.contentVersion,
        termId: claim.term.id,
        parentSentenceId: claim.parentSentence.id,
        generatedAt: new Date(),
        enrichment,
      });
    } catch (error: unknown) {
      await this.contextualTermsRepository.failContextualTermEnrichment(
        claim.article.id,
        claim.article.contentVersion,
        claim.term.id,
        this.sanitizeEnrichmentError(
          'Contextual term source changed during enrichment',
        ),
      );
      if (error instanceof ContextualTermEnrichmentStateConflictError) {
        throw new ConflictException(
          'Article or contextual term changed during enrichment; retry the lookup',
        );
      }
      throw error;
    }

    const enriched = await this.contextualTermsRepository.findContextualTerm(
      userId,
      articleId,
      termId,
    );
    this.requireLookupAccessible(enriched);
    if (enriched.term.explanationStatus !== AiGenerationStatus.READY) {
      throw new ConflictException(
        'Contextual term enrichment did not reach a ready state; retry the lookup',
      );
    }
    return this.mapContextualTerm(enriched);
  }

  async getContextualTermForSave(
    termId: string,
  ): Promise<SavableContextualTermRecord> {
    const result =
      await this.contextualTermsRepository.findContextualTermForSave(termId);
    if (
      !result ||
      result.parentSentence.contentVersion !==
        result.sourceArticle.contentVersion
    ) {
      throw new NotFoundException('Published contextual term not found');
    }
    if (!result.isLookupEnabled) {
      throw new ForbiddenException('Contextual term lookup is disabled');
    }
    if (result.term.explanationStatus !== AiGenerationStatus.READY) {
      throw new UnprocessableEntityException(
        'Contextual term is not ready to be saved',
      );
    }
    this.requireSavableText(result.term.value);
    this.requireSavableText(result.term.lemma);
    this.requireSavableText(result.term.partOfSpeech);
    this.requireSavableText(result.term.contextualMeaningVi);
    this.requireSavableText(result.term.definitionEn);
    if (!this.hasCanonicalExamples(result.term.examples)) {
      throw new UnprocessableEntityException(
        'Contextual term is not ready to be saved',
      );
    }

    return result;
  }

  private mapSaveState(result: ContextualTermLookupRecord) {
    return result.save
      ? {
          isSaved: true,
          userVocabularyId: result.save.id,
        }
      : {
          isSaved: false,
          userVocabularyId: null,
        };
  }

  private mapContextualTerm(result: ContextualTermLookupRecord) {
    this.requireEnrichedLexicalMetadata(result.term);
    return {
      term: result.term,
      parentSentence: result.parentSentence,
      saveState: this.mapSaveState(result),
    };
  }

  private requireEnrichedLexicalMetadata(
    term: ContextualTermLookupRecord['term'],
  ): asserts term is ContextualTermLookupRecord['term'] & {
    partOfSpeech: string;
    cefrLevel: NonNullable<ContextualTermLookupRecord['term']['cefrLevel']>;
  } {
    if (!term.value.trim() || !term.partOfSpeech?.trim() || !term.cefrLevel) {
      throw new ConflictException(
        'Contextual term enrichment did not produce required lexical metadata; retry the lookup',
      );
    }
  }

  private requireLookupAccessible(
    result: ContextualTermLookupRecord | null,
  ): asserts result is ContextualTermLookupRecord {
    if (!result) {
      throw new NotFoundException('Published contextual term not found');
    }
    if (!result.isLookupEnabled) {
      throw new ForbiddenException('Contextual term lookup is disabled');
    }
  }

  private throwEnrichmentUnavailable(): never {
    throw new ServiceUnavailableException(
      'Contextual term enrichment is already processing; retry later',
    );
  }

  private buildSurroundingContext(
    claim: ContextualTermEnrichmentClaimRecord,
  ): string {
    const context = claim.neighboringSentences
      .filter(({ id }) => id !== claim.parentSentence.id)
      .map(
        ({ sentenceOrder, sentenceText }) =>
          `[${sentenceOrder}] ${sentenceText.slice(0, 1000)}`,
      )
      .join('\n')
      .slice(0, 4000)
      .trim();

    return context || claim.parentSentence.sentenceText.slice(0, 4000).trim();
  }

  private sanitizeEnrichmentError(message: string): string {
    return message
      .replace(/\s+/gu, ' ')
      .replace(/[^\p{L}\p{N}\p{P}\p{Zs}]/gu, '')
      .trim()
      .slice(0, 500);
  }

  private requireSavableText(value: string | null): void {
    if (!value?.trim()) {
      throw new UnprocessableEntityException(
        'Contextual term is not ready to be saved',
      );
    }
  }

  private hasCanonicalExamples(value: unknown): boolean {
    if (!Array.isArray(value) || value.length > 2) return false;
    const examples: unknown[] = value;

    return examples.every(
      (example) =>
        isUnknownRecord(example) &&
        Object.keys(example).length === 2 &&
        typeof example.sentence === 'string' &&
        example.sentence.trim().length > 0 &&
        typeof example.translationVi === 'string' &&
        example.translationVi.trim().length > 0,
    );
  }
}
