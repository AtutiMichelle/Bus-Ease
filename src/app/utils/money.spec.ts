import { compactAmount, formatKsh, formatKshCompact } from './money';

describe('money formatting', () => {
  it('groups digits in the full amount', () => {
    expect(formatKsh(389000)).toBe('KSh 389,000');
    expect(formatKsh(3520)).toBe('KSh 3,520');
  });

  it('shortens large amounts so they fit small spaces', () => {
    expect(compactAmount(950)).toBe('950');
    expect(compactAmount(3500)).toBe('3.5k');
    expect(compactAmount(3000)).toBe('3k');
    expect(compactAmount(389000)).toBe('389k');
    expect(compactAmount(1250000)).toBe('1.3M');
    expect(formatKshCompact(389000)).toBe('KSh 389k');
  });

  it('handles zero', () => {
    expect(compactAmount(0)).toBe('0');
  });
});
