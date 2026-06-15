export const toDate = (v) => {
  const num = Number(String(v).trim());
  if (Number.isNaN(num)) throw new Error('Invalid number');
  const ts = Math.abs(num) > 1e12 ? num : num * 1000;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) throw new Error('Invalid timestamp');
  return d.toISOString();
};
