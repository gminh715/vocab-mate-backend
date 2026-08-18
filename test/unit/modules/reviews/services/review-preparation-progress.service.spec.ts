import { ReviewPreparationProgressService } from '../../../../../src/modules/reviews/services/review-preparation-progress.service';

describe('ReviewPreparationProgressService', () => {
  let service: ReviewPreparationProgressService;

  beforeEach(() => {
    service = new ReviewPreparationProgressService();
  });

  it('keeps progress monotonic and scopes reads to the owning user', () => {
    service.begin('user-1', 'preparation');
    service.update('user-1', 'preparation', {
      stage: 'GENERATING_QUESTIONS',
      progressPercent: 60,
      completedItems: 6,
      totalItems: 10,
    });
    service.update('user-1', 'preparation', {
      stage: 'GENERATING_QUESTIONS',
      progressPercent: 40,
      completedItems: 4,
      totalItems: 10,
    });

    expect(service.get('user-1', 'preparation')).toEqual({
      preparationId: 'preparation',
      status: 'PREPARING',
      stage: 'GENERATING_QUESTIONS',
      progressPercent: 60,
      completedItems: 6,
      totalItems: 10,
    });
    expect(service.get('user-2', 'preparation')).toBeNull();
  });

  it('marks a preparation ready at one hundred percent', () => {
    service.begin('user', 'preparation');
    service.update('user', 'preparation', {
      stage: 'CREATING_SESSION',
      progressPercent: 85,
      completedItems: 8,
      totalItems: 8,
    });
    service.complete('user', 'preparation');

    expect(service.get('user', 'preparation')).toMatchObject({
      status: 'READY',
      stage: 'READY',
      progressPercent: 100,
      completedItems: 8,
      totalItems: 8,
    });
  });
});
