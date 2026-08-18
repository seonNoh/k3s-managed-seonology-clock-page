const path = require('node:path');

const SORT_VALUES = new Set(['name', 'size', 'user', 'group', 'mtime', 'atime', 'ctime', 'crtime', 'posix']);
const DIRECTION_VALUES = new Set(['ASC', 'DESC']);
const FORBIDDEN_INPUT = /[\0\r\n\\]/;
const FORBIDDEN_NAME = /[\0-\x1f\x7f\\"]/;

function invalid(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function createNasPathPolicy({ allowedRoots }) {
  if (!Array.isArray(allowedRoots) || allowedRoots.length === 0) {
    throw new TypeError('At least one NAS allowed root is required');
  }
  const roots = allowedRoots.map(root => {
    if (typeof root !== 'string' || !path.posix.isAbsolute(root) || FORBIDDEN_INPUT.test(root)) {
      throw new TypeError('NAS allowed roots must be absolute paths');
    }
    return path.posix.normalize(root).replace(/\/$/, '') || '/';
  });

  function assertPath(value) {
    if (typeof value !== 'string' || FORBIDDEN_INPUT.test(value)) throw invalid('Invalid NAS path');
    if (!path.posix.isAbsolute(value)) throw invalid('NAS path must be absolute');
    if (value.split('/').some(segment => segment === '..' || segment === '.')) throw invalid('Invalid NAS path');
    const normalized = path.posix.normalize(value).replace(/\/$/, '') || '/';
    const allowed = roots.some(root => root === '/' || normalized === root || normalized.startsWith(`${root}/`));
    if (!allowed) throw invalid('NAS path is outside allowed roots');
    return normalized;
  }

  function assertName(value) {
    if (typeof value !== 'string' || value.length === 0 || value === '.' || value === '..'
      || value.includes('/') || FORBIDDEN_NAME.test(value)) {
      throw invalid('Invalid NAS name');
    }
    return value;
  }

  function assertSort(value = 'name') {
    if (!SORT_VALUES.has(value)) throw invalid('Invalid NAS sort value');
    return value;
  }

  function assertDirection(value = 'ASC') {
    if (!DIRECTION_VALUES.has(value)) throw invalid('Invalid NAS direction value');
    return value;
  }

  return { assertPath, assertName, assertSort, assertDirection };
}

module.exports = { createNasPathPolicy };
