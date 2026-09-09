import { normalizeName } from './normalize-name.mjs';

export const searchNames = (names, query) =>
  names.filter(name => normalizeName(name).startsWith(normalizeName(query)));
