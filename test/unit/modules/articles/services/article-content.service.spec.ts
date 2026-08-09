import { BadRequestException } from '@nestjs/common';
import { ArticleContentService } from '../../../../../src/modules/articles/services/article-content.service';

describe('ArticleContentService', () => {
  const service = new ArticleContentService();

  it('returns sanitized supported HTML', () => {
    expect(service.sanitize('<p onclick="bad()">Safe</p>')).toBe('<p>Safe</p>');
  });

  it.each(['', 'plain text', '<script>alert(1)</script>', '<iframe></iframe>'])(
    'rejects content with no supported HTML: %p',
    (content) => {
      expect(() => service.sanitize(content)).toThrow(BadRequestException);
    },
  );
});
