export const normalizeCategorySlug = (value: string): string =>
  value.trim().toLowerCase();

export const transformCategorySlug = ({
  value,
}: {
  value: unknown;
}): unknown =>
  typeof value === 'string' ? normalizeCategorySlug(value) : value;
