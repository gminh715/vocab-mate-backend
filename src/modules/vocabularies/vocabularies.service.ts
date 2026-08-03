import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  type CefrLevel,
  LearningStatus,
} from '../../../generated/prisma/enums';
import { ReadingService } from '../reading/reading.service';
import type {
  GetVocabulariesQueryDto,
  SaveVocabularyDto,
  UpdateLearningStatusDto,
  UpdatePersonalNoteDto,
} from './dto/vocabulary-request.dto';
import {
  InvalidVocabularyCollectionsError,
  VocabulariesRepository,
} from './vocabularies.repository';

const hasPrismaCode = (error: unknown, code: 'P2002' | 'P2003'): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === code;

@Injectable()
export class VocabulariesService {
  constructor(
    private readonly vocabulariesRepository: VocabulariesRepository,
    private readonly readingService: ReadingService,
  ) {}

  async findAll(userId: string, query: GetVocabulariesQueryDto) {
    const result = await this.vocabulariesRepository.list(
      userId,
      {
        page: query.page,
        limit: query.limit,
        sort: query.sort,
        ...(query.q ? { q: query.q } : {}),
        ...(query.learningStatus
          ? { learningStatus: query.learningStatus }
          : {}),
        ...(query.cefrLevel ? { cefrLevel: query.cefrLevel } : {}),
        ...(query.collectionId ? { collectionId: query.collectionId } : {}),
        ...(query.dueOnly === undefined ? {} : { dueOnly: query.dueOnly }),
      },
      new Date(),
    );

    return {
      items: result.items.map((item) => this.mapListItem(item)),
      meta: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  }

  async findOne(userId: string, userVocabularyId: string) {
    const result = await this.vocabulariesRepository.findOwnedById(
      userId,
      userVocabularyId,
    );
    if (!result) {
      throw new NotFoundException('Saved vocabulary not found');
    }

    const { vocabulary, collections } = this.mapDetail(result);
    return {
      vocabulary,
      collections,
      sourceArticle: result.articleSentenceTerm.sentence.article,
    };
  }

  async updateNote(
    userId: string,
    userVocabularyId: string,
    dto: UpdatePersonalNoteDto,
  ) {
    await this.findOne(userId, userVocabularyId);
    const note = dto.personalNote ? dto.personalNote.trim() : null;
    await this.vocabulariesRepository.updatePersonalNote(
      userId,
      userVocabularyId,
      note || null,
    );
    return this.findOne(userId, userVocabularyId);
  }

  async updateStatus(
    userId: string,
    userVocabularyId: string,
    dto: UpdateLearningStatusDto,
  ) {
    await this.findOne(userId, userVocabularyId);
    await this.vocabulariesRepository.updateLearningStatus(
      userId,
      userVocabularyId,
      dto.learningStatus,
    );
    return this.findOne(userId, userVocabularyId);
  }

  async remove(userId: string, userVocabularyId: string) {
    await this.findOne(userId, userVocabularyId);
    try {
      await this.vocabulariesRepository.deleteOwned(userId, userVocabularyId);
    } catch (error: unknown) {
      if (hasPrismaCode(error, 'P2003')) {
        throw new ConflictException(
          'Saved vocabulary is referenced in review history',
        );
      }
      throw error;
    }
  }

  async save(userId: string, dto: SaveVocabularyDto) {
    if (!dto.collectionIds?.length) {
      throw new BadRequestException(
        'At least one collection is required to save vocabulary',
      );
    }

    const source = await this.readingService.getContextualTermForSave(
      dto.articleSentenceTermId,
    );
    const translation = this.requireSnapshotText(
      'contextTranslationVi',
      source.parentSentence.translationVi,
    );
    const examples = source.term.examples;
    if (!Array.isArray(examples)) {
      this.throwMissingSnapshotField('examples');
    }

    const collectionIds = [
      ...new Set(dto.collectionIds.map((id) => id.toLowerCase())),
    ];
    try {
      const result = await this.vocabulariesRepository.createWithCollections(
        userId,
        {
          articleSentenceTermId: dto.articleSentenceTermId,
          ...(dto.personalNote === undefined
            ? {}
            : { personalNote: dto.personalNote.trim() }),
          learningStatus: LearningStatus.NEW,
          savedWordDisplay: this.requireSnapshotText(
            'wordDisplay',
            source.term.wordDisplay,
          ),
          savedLemma: this.requireSnapshotText('lemma', source.term.lemma),
          savedPartOfSpeech: this.requireSnapshotText(
            'partOfSpeech',
            source.term.partOfSpeech,
          ),
          savedIpa: source.term.ipa,
          savedCefrLevel: this.requireSnapshotCefr(source.term.cefrLevel),
          savedContextSentence: this.requireSnapshotText(
            'contextSentence',
            source.parentSentence.sentenceText,
          ),
          savedContextTranslationVi: translation,
          savedMeaningVi: this.requireSnapshotText(
            'meaningVi',
            source.term.contextualMeaningVi,
          ),
          savedExplanation: source.term.contextualExplanation,
          savedExamples: examples,
          lastReviewedAt: null,
          nextReviewAt: null,
          reviewIntervalDays: null,
        },
        collectionIds,
      );
      const { vocabulary, collections } = this.mapDetail(result);

      return { vocabulary, collections };
    } catch (error: unknown) {
      if (hasPrismaCode(error, 'P2002')) {
        throw new ConflictException('Contextual term is already saved');
      }
      if (
        error instanceof InvalidVocabularyCollectionsError ||
        hasPrismaCode(error, 'P2003')
      ) {
        throw new UnprocessableEntityException(
          'One or more collections are unavailable',
        );
      }
      throw error;
    }
  }

  private mapListItem<
    T extends {
      collectionItems: Array<{
        addedAt: Date;
        collection: {
          id: string;
          name: string;
          description: string | null;
        };
      }>;
    },
  >(record: T) {
    const { collectionItems, ...vocabulary } = record;
    return {
      ...vocabulary,
      collections: this.mapCollections(collectionItems),
    };
  }

  private mapDetail<
    T extends {
      collectionItems: Array<{
        addedAt: Date;
        collection: {
          id: string;
          name: string;
          description: string | null;
        };
      }>;
      articleSentenceTerm: unknown;
    },
  >(record: T) {
    const {
      collectionItems,
      articleSentenceTerm: _articleSentenceTerm,
      ...vocabulary
    } = record;
    void _articleSentenceTerm;
    return {
      vocabulary,
      collections: this.mapCollections(collectionItems),
    };
  }

  private mapCollections(
    items: Array<{
      addedAt: Date;
      collection: {
        id: string;
        name: string;
        description: string | null;
      };
    }>,
  ) {
    return items.map(({ collection, addedAt }) => ({
      ...collection,
      addedAt,
    }));
  }

  private requireSnapshotText(field: string, value: string | null): string {
    if (!value?.trim()) {
      this.throwMissingSnapshotField(field);
    }
    return value.trim();
  }

  private requireSnapshotCefr(value: CefrLevel | null): CefrLevel {
    if (!value) {
      throw new UnprocessableEntityException(
        'Contextual term is not ready to be saved',
      );
    }
    return value;
  }

  private throwMissingSnapshotField(field: string): never {
    throw new UnprocessableEntityException({
      message: 'Contextual term is not ready to be saved',
      issues: [
        {
          code: 'VOCABULARY_SNAPSHOT_FIELD_MISSING',
          message: `Required source field "${field}" is missing.`,
        },
      ],
    });
  }
}
