export const encode = (t) => btoa(unescape(encodeURIComponent(t)));
export const decode = (t) => decodeURIComponent(escape(atob(t.trim())));
