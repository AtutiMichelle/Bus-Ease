import {
  findByName,
  findCities,
  findNumbers,
  localPhone,
  parseDate,
  parseHour,
  saysCancel,
  saysHello,
  saysNo,
  saysYes,
  spellOut,
  spokenCode,
  spokenDate,
  spokenDigits,
  spokenEmail,
  spokenName,
} from './voice-parse';

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

describe('findNumbers', () => {
  it('reads digits, words and ordinals', () => {
    expect(findNumbers('seats five and 12')).toEqual([5, 12]);
    expect(findNumbers('number twenty one')).toEqual([21]);
    expect(findNumbers('the second one')).toEqual([2, 1]);
    expect(findNumbers('thirty')).toEqual([30]);
  });

  it('finds nothing in plain words', () => {
    expect(findNumbers('the cheapest bus please')).toEqual([]);
  });
});

describe('parseHour', () => {
  it('reads a time said with am or pm', () => {
    expect(parseHour('the 7 am one')).toBe(7);
    expect(parseHour('9:30 p.m.')).toBe(21);
    expect(parseHour('12 AM')).toBe(0);
    expect(parseHour('12pm')).toBe(12);
  });

  it('ignores a number with no am or pm', () => {
    expect(parseHour('number 7')).toBeNull();
  });
});

describe('findByName', () => {
  const STOPS = [{ name: 'Nairobi CBD, Accra Road' }, { name: 'Westlands Stage' }, { name: 'Nairobi West' }];

  it('finds a full name, or the one sharing the most words', () => {
    expect(findByName('westlands stage please', STOPS)?.name).toBe('Westlands Stage');
    expect(findByName('accra road', STOPS)?.name).toBe('Nairobi CBD, Accra Road');
    expect(findByName('dreamline', [{ name: 'Dream Line' }])?.name).toBe('Dream Line');
  });

  it('gives nothing when the words could mean several', () => {
    expect(findByName('nairobi', STOPS)).toBeUndefined();
    expect(findByName('somewhere else', STOPS)).toBeUndefined();
  });
});

describe('spoken details', () => {
  it('reads digits said one by one', () => {
    expect(spokenDigits('zero seven double one 2345 six seven')).toBe('0711234567');
    expect(spokenDigits('my number is 0712 345 678')).toBe('0712345678');
  });

  it('reads an ID or passport number', () => {
    expect(spokenCode('my ID number is 12 34 56 78')).toBe('12345678');
    expect(spokenCode('passport A 12 three 45')).toBe('A12345');
  });

  it('reads an email address', () => {
    expect(spokenEmail('john kamau at gmail dot com')).toBe('johnkamau@gmail.com');
    expect(spokenEmail('my email is Jane_W@Example.co.ke.')).toBe('jane_w@example.co.ke');
  });

  it('reads a name', () => {
    expect(spokenName('my name is john kamau')).toBe('John Kamau');
    expect(spokenName("Wanjiru Ng'ang'a.")).toBe("Wanjiru Ng'ang'a");
  });

  it('writes and spells a phone number', () => {
    expect(localPhone('254712345678')).toBe('0712 345 678');
    expect(spellOut('0712 345 678')).toBe('0 7 1 2 3 4 5 6 7 8');
  });
});

describe('a day number said by itself', () => {
  it('is taken as that day of this month, or the next once it has passed', () => {
    expect(parseDate('17', '2026-10-13')).toBe('2026-10-17');
    expect(parseDate('on the 18', '2026-10-13')).toBe('2026-10-18');
    expect(parseDate('seventeen', '2026-10-13')).toBe('2026-10-17');
    expect(parseDate('twenty first', '2026-10-13')).toBe('2026-10-21');
    expect(parseDate('5', '2026-10-13')).toBe('2026-11-05');
  });

  it('is not read into a longer sentence or an impossible day', () => {
    expect(parseDate('I need 2 seats', '2026-10-13')).toBeNull();
    expect(parseDate('40', '2026-10-13')).toBeNull();
    expect(parseDate('Nairobi', '2026-10-13')).toBeNull();
  });
});
