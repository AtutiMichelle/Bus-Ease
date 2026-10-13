import { tidyWords } from './voice-assistant.service';

describe('tidyWords', () => {
  it('writes amounts and punctuation the plain way', () => {
    expect(tidyWords('A VIP seat costs 3\u202f520 KES, which is 1 330 more.')).toBe('A VIP seat costs 3,520 KES, which is 1,330 more.');
    expect(tidyWords('drop\u2011off, we\u2019ll')).toBe("drop-off, we'll");
  });

  it('leaves seat lists and times alone', () => {
    expect(tidyWords('Seats 1, 2 and 14 leave at 06:30 AM on 23 November 2026.')).toBe('Seats 1, 2 and 14 leave at 06:30 AM on 23 November 2026.');
  });
});
