import { findCities, parseDate, saysCancel, saysHello, saysNo, saysYes, spokenDate } from './voice-parse';

const CITIES = [
  { id: '1', name: 'Nairobi' },
  { id: '2', name: 'Mombasa' },
  { id: '3', name: 'Nairobi West' },
  { id: '4', name: 'Kisumu' },
];

describe('findCities', () => {
  it('finds both ends of a route and what each one is', () => {
    const mentions = findCities('I want to book a bus from nairobi to Mombasa', CITIES);
    expect(mentions.map((m) => [m.city.name, m.role])).toEqual([
      ['Nairobi', 'from'],
      ['Mombasa', 'to'],
    ]);
  });

  it('keeps the order the cities were said in', () => {
    const mentions = findCities('to Kisumu from Mombasa', CITIES);
    expect(mentions.map((m) => [m.city.name, m.role])).toEqual([
      ['Kisumu', 'to'],
      ['Mombasa', 'from'],
    ]);
  });

  it('prefers the longer name', () => {
    const mentions = findCities('Nairobi West', CITIES);
    expect(mentions.map((m) => m.city.name)).toEqual(['Nairobi West']);
  });

  it('ignores a name inside another word', () => {
    expect(findCities('Kisumuland', CITIES)).toEqual([]);
  });

  it('gives no role to a bare city name', () => {
    expect(findCities('Mombasa', CITIES)[0].role).toBeNull();
  });
});

describe('parseDate', () => {
  // A Monday.
  const today = '2026-10-12';

  it('reads today and tomorrow', () => {
    expect(parseDate('today please', today)).toBe('2026-10-12');
    expect(parseDate('Tomorrow', today)).toBe('2026-10-13');
    expect(parseDate('the day after tomorrow', today)).toBe('2026-10-14');
  });

  it('reads a weekday as the next one after today', () => {
    expect(parseDate('on Friday', today)).toBe('2026-10-16');
    expect(parseDate('next monday', today)).toBe('2026-10-19');
  });

  it('reads a day and month', () => {
    expect(parseDate('20th of October', today)).toBe('2026-10-20');
    expect(parseDate('October 20', today)).toBe('2026-10-20');
    expect(parseDate('3 Nov 2026', today)).toBe('2026-11-03');
    expect(parseDate('20/10', today)).toBe('2026-10-20');
    expect(parseDate('20/10/2026', today)).toBe('2026-10-20');
  });

  it('moves a date that has passed to the next time it comes round', () => {
    expect(parseDate('5th of January', today)).toBe('2027-01-05');
    expect(parseDate('the 3rd', today)).toBe('2026-11-03');
    expect(parseDate('the 15th', today)).toBe('2026-10-15');
  });

  it('turns down dates that are past or do not exist', () => {
    expect(parseDate('01/10/2026', today)).toBeNull();
    expect(parseDate('31/02', today)).toBeNull();
  });

  it('returns null when no date was said', () => {
    expect(parseDate('from Nairobi to Mombasa', today)).toBeNull();
  });
});

describe('short answers', () => {
  it('spots cancel only when it is the whole answer', () => {
    expect(saysCancel('Cancel.')).toBe(true);
    expect(saysCancel('do not cancel my trip to Kisumu')).toBe(false);
  });

  it('spots a greeting', () => {
    expect(saysHello('Hello')).toBe(true);
    expect(saysHello('hi there')).toBe(true);
    expect(saysHello('Kisumu')).toBe(false);
  });

  it('spots yes and no', () => {
    expect(saysYes('Search buses')).toBe(true);
    expect(saysYes('yes please')).toBe(true);
    expect(saysNo('Edit')).toBe(true);
    expect(saysNo('Nairobi')).toBe(false);
  });
});

describe('spokenDate', () => {
  it('says a date the short way', () => {
    expect(spokenDate('2026-10-10')).toBe('Sat, 10 Oct');
  });
});
