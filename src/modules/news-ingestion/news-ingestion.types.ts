export const GUARDIAN_ORDER_BY = ['newest', 'oldest', 'relevance'] as const;

export type GuardianOrderBy = (typeof GUARDIAN_ORDER_BY)[number];

export interface GuardianSearchInput {
  q?: string;
  section?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
  orderBy?: GuardianOrderBy;
  articleIds?: string[];
}

export interface NormalizedNewsArticle {
  externalId: string;
  title: string;
  description: string;
  url: string;
  imageUrl: string | null;
  sourceName: 'The Guardian';
  publishedAt: Date;
  authorName: string | null;
  sectionId: string | null;
  sectionName: string | null;
}

export interface NormalizedNewsImportArticle extends NormalizedNewsArticle {
  providerContent: string | null;
}

export interface GuardianSearchResult {
  totalArticles: number;
  articles: NormalizedNewsArticle[];
}

export interface GuardianImportResult {
  totalArticles: number;
  articles: NormalizedNewsImportArticle[];
}

export interface ExtractedArticleContent {
  contentHtml: string;
  plainText: string;
  canonicalUrl: string;
}
