import { searchApi } from './api.mjs';

export const search = queryText => searchApi({ q: queryText });
