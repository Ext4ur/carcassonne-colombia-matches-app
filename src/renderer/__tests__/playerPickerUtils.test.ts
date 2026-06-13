import { describe, it, expect } from 'vitest';
import { filterPlayerOptions } from '@utils/playerPickerUtils';

describe('filterPlayerOptions', () => {
  const options = [
    { value: 1, label: 'Ana García', bga_username: 'ana_bga' },
    { value: 2, label: 'Bob Smith', bga_username: 'bob123' },
    { value: 3, label: 'Carlos López' },
  ];

  it('returns all options when search is empty', () => {
    expect(filterPlayerOptions('', options)).toHaveLength(3);
    expect(filterPlayerOptions('   ', options)).toHaveLength(3);
  });

  it('filters by name case-insensitively', () => {
    expect(filterPlayerOptions('ana', options).map((o) => o.value)).toEqual([1]);
    expect(filterPlayerOptions('SMITH', options).map((o) => o.value)).toEqual([2]);
  });

  it('filters by bga username', () => {
    expect(filterPlayerOptions('bob123', options).map((o) => o.value)).toEqual([2]);
  });

  it('returns empty when no match', () => {
    expect(filterPlayerOptions('xyz', options)).toHaveLength(0);
  });
});
