import { Injectable } from '@nestjs/common';

export const REVIEW_PREPARATION_STATUSES = [
  'PREPARING',
  'READY',
  'FAILED',
] as const;

export const REVIEW_PREPARATION_STAGES = [
  'SELECTING_VOCABULARY',
  'CHECKING_CACHE',
  'GENERATING_QUESTIONS',
  'CREATING_SESSION',
  'PLANNING_SESSION',
  'READY',
  'FAILED',
] as const;

export type ReviewPreparationStatus =
  (typeof REVIEW_PREPARATION_STATUSES)[number];
export type ReviewPreparationStage = (typeof REVIEW_PREPARATION_STAGES)[number];

export interface ReviewPreparationProgress {
  preparationId: string;
  status: ReviewPreparationStatus;
  stage: ReviewPreparationStage;
  progressPercent: number;
  completedItems: number;
  totalItems: number;
}

interface StoredReviewPreparationProgress extends ReviewPreparationProgress {
  userId: string;
  updatedAtMs: number;
}

const PROGRESS_TTL_MS = 5 * 60_000;

@Injectable()
export class ReviewPreparationProgressService {
  private readonly progressById = new Map<
    string,
    StoredReviewPreparationProgress
  >();

  begin(userId: string, preparationId: string): void {
    this.deleteExpired();
    this.progressById.set(preparationId, {
      preparationId,
      userId,
      status: 'PREPARING',
      stage: 'SELECTING_VOCABULARY',
      progressPercent: 2,
      completedItems: 0,
      totalItems: 0,
      updatedAtMs: Date.now(),
    });
  }

  update(
    userId: string,
    preparationId: string,
    update: {
      stage: ReviewPreparationStage;
      progressPercent: number;
      completedItems?: number;
      totalItems?: number;
    },
  ): void {
    const current = this.progressById.get(preparationId);
    if (
      !current ||
      current.userId !== userId ||
      current.status !== 'PREPARING'
    ) {
      return;
    }

    this.progressById.set(preparationId, {
      ...current,
      status: 'PREPARING',
      stage: update.stage,
      progressPercent: Math.max(
        current.progressPercent,
        this.clampPercent(update.progressPercent),
      ),
      completedItems:
        update.completedItems === undefined
          ? current.completedItems
          : Math.max(current.completedItems, update.completedItems),
      totalItems:
        update.totalItems === undefined
          ? current.totalItems
          : Math.max(current.totalItems, update.totalItems),
      updatedAtMs: Date.now(),
    });
  }

  complete(userId: string, preparationId: string): void {
    const current = this.progressById.get(preparationId);
    if (!current || current.userId !== userId) return;
    this.progressById.set(preparationId, {
      ...current,
      status: 'READY',
      stage: 'READY',
      progressPercent: 100,
      completedItems: current.totalItems,
      updatedAtMs: Date.now(),
    });
  }

  fail(userId: string, preparationId: string): void {
    const current = this.progressById.get(preparationId);
    if (!current || current.userId !== userId) return;
    this.progressById.set(preparationId, {
      ...current,
      status: 'FAILED',
      stage: 'FAILED',
      updatedAtMs: Date.now(),
    });
  }

  get(userId: string, preparationId: string): ReviewPreparationProgress | null {
    this.deleteExpired();
    const current = this.progressById.get(preparationId);
    if (!current || current.userId !== userId) return null;
    const { userId: _userId, updatedAtMs: _updatedAtMs, ...progress } = current;
    void _userId;
    void _updatedAtMs;
    return progress;
  }

  private deleteExpired(): void {
    const threshold = Date.now() - PROGRESS_TTL_MS;
    for (const [preparationId, progress] of this.progressById) {
      if (progress.updatedAtMs < threshold) {
        this.progressById.delete(preparationId);
      }
    }
  }

  private clampPercent(value: number): number {
    return Math.min(Math.max(Math.round(value), 0), 100);
  }
}
