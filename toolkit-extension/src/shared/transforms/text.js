export const count = (t) => ({
  chars: t.length,
  words: (t.trim().match(/\S+/g) || []).length,
  lines: t.split(/\r\n|\r|\n/).length,
});
