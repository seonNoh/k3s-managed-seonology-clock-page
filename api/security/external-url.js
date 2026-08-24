const MAX_EXTERNAL_URL_LENGTH = 2048;

function normalizeExternalUrl(value) {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  if (!candidate || candidate.length > MAX_EXTERNAL_URL_LENGTH) return null;

  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (parsed.username || parsed.password) return null;
    return candidate;
  } catch {
    return null;
  }
}

function isValidBookmarkCollection(value) {
  return Boolean(
    value
    && Array.isArray(value.categories)
    && value.categories.every(category => (
      category
      && typeof category === 'object'
      && Array.isArray(category.bookmarks)
      && category.bookmarks.every(bookmark => normalizeExternalUrl(bookmark?.url))
    )),
  );
}

function sanitizeBookmarkCollection(value) {
  if (!value || !Array.isArray(value.categories)) return { categories: [] };
  return {
    ...value,
    categories: value.categories
      .filter(category => category && typeof category === 'object')
      .map(category => ({
        ...category,
        bookmarks: Array.isArray(category.bookmarks)
          ? category.bookmarks.filter(bookmark => normalizeExternalUrl(bookmark?.url))
          : [],
      })),
  };
}

module.exports = {
  isValidBookmarkCollection,
  normalizeExternalUrl,
  sanitizeBookmarkCollection,
};
