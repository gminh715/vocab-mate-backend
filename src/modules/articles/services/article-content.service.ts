import { BadRequestException, Injectable } from '@nestjs/common';
import { HtmlSanitizerHelper } from '../helpers/html-sanitizer.helper';

@Injectable()
export class ArticleContentService {
  sanitize(contentHtml: string): string {
    const sanitized = HtmlSanitizerHelper.sanitize(contentHtml);

    if (!sanitized || !/<[a-z][\s\S]*>/i.test(sanitized)) {
      throw new BadRequestException(
        'Article content must contain supported, non-empty HTML',
      );
    }

    return sanitized;
  }
}
