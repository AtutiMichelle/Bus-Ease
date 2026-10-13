import { City } from '../models/trip.model';

/** A city named in what the user said. */
export interface CityMention {
  city: City;
  /** Where the name starts in the text. */
  index: number;
  /** The word just before the name, when it says which end of the trip the
   * city is. */
  role: 'from' | 'to' | null;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fromIso(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** A real calendar date, or null for something like 31 February. */
function realDate(year: number, month: number, day: number): Date | null {
  const date = new Date(year, month, day);
  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day ? date : null;
}

/** Finds the cities named in the text, in the order they were said. Longer
 * names win, so "Nairobi West" is not read as "Nairobi". */
export function findCities(text: string, cities: City[]): CityMention[] {
  const mentions: CityMention[] = [];
  const taken: [number, number][] = [];
  const longestFirst = [...cities].sort((a, b) => b.name.length - a.name.length);

  for (const city of longestFirst) {
    const name = city.name.trim();
    if (!name) {
      continue;
    }
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, 'giu');
    for (const match of text.matchAll(pattern)) {
      const start = match.index;
      const end = start + match[0].length;
      if (taken.some(([from, to]) => start < to && end > from)) {
        continue;
      }
      taken.push([start, end]);
      const before = text.slice(0, start).toLowerCase().match(/(\p{L}+)\s*$/u)?.[1];
      const role = before === 'from' ? 'from' : before === 'to' ? 'to' : null;
      mentions.push({ city, index: start, role });
    }
  }
  return mentions.sort((a, b) => a.index - b.index);
}

/** Reads a travel date out of the text and returns it as yyyy-mm-dd, or null
 * when no date was said. A date with no year is taken as the next time it
 * comes round, so it is never in the past. */
export function parseDate(text: string, todayIso: string): string | null {
  const today = fromIso(todayIso);
  const lower = text.toLowerCase();

  if (/\bday after (tomorrow|tomorow)\b/.test(lower)) {
    return toIso(addDays(today, 2));
  }
  if (/\b(tomorrow|tomorow)\b/.test(lower)) {
    return toIso(addDays(today, 1));
  }
  if (/\b(today|tonight)\b/.test(lower)) {
    return todayIso;
  }

  // 10/10 or 10/10/2026, day first.
  const numeric = lower.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{4}))?\b/);
  if (numeric) {
    return dayAndMonth(Number(numeric[1]), Number(numeric[2]) - 1, numeric[3], today);
  }

  // "10th of October", "October 10th", with an optional year.
  const monthNames = MONTHS.map((month) => `${month}|${month.slice(0, 3)}`).join('|');
  const dayFirst = lower.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?(?: of)? (${monthNames})\\b(?:,? (\\d{4}))?`));
  if (dayFirst) {
    return dayAndMonth(Number(dayFirst[1]), monthIndex(dayFirst[2]), dayFirst[3], today);
  }
  const monthFirst = lower.match(new RegExp(`\\b(${monthNames}) (?:the )?(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,? (\\d{4}))?`));
  if (monthFirst) {
    return dayAndMonth(Number(monthFirst[2]), monthIndex(monthFirst[1]), monthFirst[3], today);
  }

  // "Friday" or "next Friday": the next one after today.
  const weekday = WEEKDAYS.findIndex((name) => new RegExp(`\\b${name}\\b`).test(lower));
  if (weekday !== -1) {
    const ahead = (weekday - today.getDay() + 7) % 7 || 7;
    return toIso(addDays(today, ahead));
  }

  // "the 15th": this month, or next month once that day has passed.
  const dayOnly = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)\b/);
  if (dayOnly) {
    return dayOfMonth(Number(dayOnly[1]), today);
  }

  // A day number said by itself, with nothing else to take it for: "17",
  // "on the 17", "seventeen", "twenty first".
  const bare = lower.match(/^\W*(?:on\s+)?(?:the\s+)?([a-z0-9 -]+?)\W*$/)?.[1];
  const numbers = bare ? findNumbers(bare) : [];
  const onlyNumbers = !!bare && bare.split(/[\s-]+/).every((word) => findNumbers(word).length > 0);
  if (onlyNumbers && numbers.length >= 1 && numbers.length <= 2) {
    // "twenty first" comes through as 20 and 1.
    const day = numbers.length === 2 && numbers[0] % 10 === 0 && numbers[1] < 10 ? numbers[0] + numbers[1] : numbers.length === 1 ? numbers[0] : 0;
    return day >= 1 && day <= 31 ? dayOfMonth(day, today) : null;
  }

  return null;
}

/** That day in this month, or in the next once it has passed. */
function dayOfMonth(day: number, today: Date): string | null {
  const thisMonth = realDate(today.getFullYear(), today.getMonth(), day);
  if (thisMonth && thisMonth >= today) {
    return toIso(thisMonth);
  }
  const nextMonth = realDate(today.getFullYear(), today.getMonth() + 1, day);
  return nextMonth ? toIso(nextMonth) : null;
}

function monthIndex(name: string): number {
  return MONTHS.findIndex((month) => month.startsWith(name.slice(0, 3)));
}

function dayAndMonth(day: number, month: number, year: string | undefined, today: Date): string | null {
  if (year) {
    const date = realDate(Number(year), month, day);
    return date && date >= today ? toIso(date) : null;
  }
  const thisYear = realDate(today.getFullYear(), month, day);
  if (thisYear && thisYear >= today) {
    return toIso(thisYear);
  }
  const nextYear = realDate(today.getFullYear() + 1, month, day);
  return nextYear ? toIso(nextYear) : null;
}

/** "2026-10-10" -> "Sat, 10 Oct", the way the assistant says a date back. */
export function spokenDate(iso: string): string {
  const date = fromIso(iso);
  const short = (name: string) => name[0].toUpperCase() + name.slice(1, 3);
  return `${short(WEEKDAYS[date.getDay()])}, ${date.getDate()} ${short(MONTHS[date.getMonth()])}`;
}

/** The weekday name of a date, e.g. "Friday". */
export function weekdayName(iso: string): string {
  const name = WEEKDAYS[fromIso(iso).getDay()];
  return name[0].toUpperCase() + name.slice(1);
}

/** The date `days` after the given one. */
export function isoPlusDays(iso: string, days: number): string {
  return toIso(addDays(fromIso(iso), days));
}

export function saysCancel(text: string): boolean {
  return /^\W*(cancel|stop|close|never ?mind|exit|quit)\W*$/i.test(text);
}

export function saysHello(text: string): boolean {
  return /^\W*(hello|hi|hey|hallo|habari|jambo|good (morning|afternoon|evening))\b/i.test(text);
}

export function saysYes(text: string): boolean {
  return /\b(yes|yeah|yep|sure|ok|okay|correct|confirm|go ahead|search|find)\b/i.test(text);
}

export function saysNo(text: string): boolean {
  return /\b(no|nope|edit|change|wrong|back)\b/i.test(text);
}

const SMALL_NUMBERS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS = ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];

/** Every whole number in the text, said as digits, as words up to
 * ninety-nine, or as "first" to "tenth": "seats five and 12" gives [5, 12]. */
export function findNumbers(text: string): number[] {
  const words = text.toLowerCase().match(/[a-z]+|\d+/g) ?? [];
  const numbers: number[] = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (/^\d+$/.test(word)) {
      numbers.push(Number(word));
      continue;
    }
    const tens = TENS.indexOf(word);
    if (tens !== -1) {
      const unit = SMALL_NUMBERS.indexOf(words[i + 1]);
      const hasUnit = unit >= 1 && unit <= 9;
      numbers.push((tens + 2) * 10 + (hasUnit ? unit : 0));
      i += hasUnit ? 1 : 0;
      continue;
    }
    const small = SMALL_NUMBERS.indexOf(word);
    if (small !== -1) {
      numbers.push(small);
      continue;
    }
    const ordinal = ORDINALS.indexOf(word);
    if (ordinal !== -1) {
      numbers.push(ordinal + 1);
    }
  }
  return numbers;
}

/** The hour (0 to 23) of a time said with am or pm, such as "7 am" or
 * "9:30 p.m.", or null when no such time was said. */
export function parseHour(text: string): number | null {
  const match = text.toLowerCase().match(/\b(\d{1,2})(?:[:.]\d{2})?\s*([ap])\.?\s?m\b/);
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  if (hour < 1 || hour > 12) {
    return null;
  }
  return (hour % 12) + (match[2] === 'p' ? 12 : 0);
}

function plain(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** The one item the text names, or undefined when it names none or could
 * mean several. A full name wins, then the item sharing the most words. */
export function findByName<T extends { name: string }>(text: string, items: T[]): T | undefined {
  const said = plain(text);
  if (!said) {
    return undefined;
  }
  const squeezed = said.replace(/ /g, '');
  const full = items.filter((item) => {
    const name = plain(item.name);
    return !!name && (said.includes(name) || squeezed.includes(name.replace(/ /g, '')));
  });
  if (full.length > 0) {
    // "Nairobi West" also contains "Nairobi", so the longest name is meant.
    return full.reduce((best, item) => (item.name.length > best.name.length ? item : best));
  }

  const saidWords = new Set(said.split(' '));
  let best: T | undefined;
  let bestScore = 0;
  let tied = false;
  for (const item of items) {
    const score = plain(item.name)
      .split(' ')
      .filter((word) => word.length >= 3 && saidWords.has(word)).length;
    if (score > bestScore) {
      best = item;
      bestScore = score;
      tied = false;
    } else if (score === bestScore && score > 0) {
      tied = true;
    }
  }
  return tied ? undefined : best;
}

const DIGIT_WORDS: Record<string, string> = {
  zero: '0',
  oh: '0',
  o: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
};
const REPEATS: Record<string, number> = { double: 2, triple: 3 };

/** The digits said in the text, one after another: "zero seven double one
 * 2345" gives "07112345". Anything that is not a digit is left out. */
export function spokenDigits(text: string): string {
  const words = text.toLowerCase().match(/[a-z]+|\d+/g) ?? [];
  let digits = '';
  let repeat = 1;
  for (const word of words) {
    if (REPEATS[word]) {
      repeat = REPEATS[word];
      continue;
    }
    const digit = /^\d+$/.test(word) ? word : DIGIT_WORDS[word];
    if (digit !== undefined) {
      digits += digit.repeat(repeat);
    }
    repeat = 1;
  }
  return digits;
}

const CODE_FILLER = new Set(['my', 'the', 'id', 'national', 'passport', 'number', 'no', 'is', 'it', 'its', 's', 'and']);

/** An ID or passport number as it was said: filler words dropped, digit
 * words turned into digits, spaces removed. "my ID is A 12 34 five" gives
 * "A12345". */
export function spokenCode(text: string): string {
  const words = text.match(/[A-Za-z]+|\d+/g) ?? [];
  return words
    .filter((word) => !CODE_FILLER.has(word.toLowerCase()))
    .map((word) => DIGIT_WORDS[word.toLowerCase()] ?? word)
    .join('')
    .toUpperCase();
}

/** An email address as it was said: "john kamau at gmail dot com" gives
 * "johnkamau@gmail.com". */
export function spokenEmail(text: string): string {
  let email = text
    .toLowerCase()
    .trim()
    .replace(/^(my |the )?(e-?mail)?( address)?( is|'s)?\s+(?=\S+.*(@| at ))/, '')
    .replace(/\s+dot\s+/g, '.')
    .replace(/\s+underscore\s+/g, '_')
    .replace(/\s+(dash|hyphen)\s+/g, '-');
  if (!email.includes('@')) {
    email = email.replace(/\s+at\s+(?!.*\sat\s)/, '@');
  }
  return email.replace(/\s+/g, '').replace(/[.,!?]+$/, '');
}

/** A person's name as it was said, without the words around it: "my name
 * is john kamau" gives "John Kamau". */
export function spokenName(text: string): string {
  const name = text
    .trim()
    .replace(/^(my name is|the name is|name is|it is|it's|its|this is|i am|i'm|call me)\s+/i, '')
    .replace(/[.,!?]+$/, '')
    .replace(/\s+/g, ' ');
  return name === name.toLowerCase() ? name.replace(/(^|[\s'-])(\p{L})/gu, (_, gap: string, letter: string) => gap + letter.toUpperCase()) : name;
}

/** Digits with a gap between each, so they are read out one by one rather
 * than as one huge number. */
export function spellOut(code: string): string {
  return code.replace(/\s+/g, '').split('').join(' ');
}

/** "0712 345 678" from the 2547XXXXXXXX form, the way people write it. */
export function localPhone(phone: string): string {
  const local = `0${phone.slice(3)}`;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}
