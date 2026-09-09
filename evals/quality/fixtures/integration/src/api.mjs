const NAMES = ['Alpha Beta', 'Charlie Delta'];

export const searchApi = ({ query } = {}) => {
  if (typeof query !== 'string' || query.trim() === '') {
    return [...NAMES];
  }
  const normalized = query.trim().toLowerCase();
  return NAMES.filter(name => name.toLowerCase().includes(normalized));
};
