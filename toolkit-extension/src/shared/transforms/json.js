export const format = (t, indent = 2) => JSON.stringify(JSON.parse(t), null, indent);
export const minify = (t) => JSON.stringify(JSON.parse(t));
