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
    const day = Number(dayOnly[1]);
    const thisMonth = realDate(today.getFullYear(), today.getMonth(), day);
    if (thisMonth && thisMonth >= today) {
      return toIso(thisMonth);
    }
    const nextMonth = realDate(today.getFullYear(), today.getMonth() + 1, day);
    return nextMonth ? toIso(nextMonth) : null;
  }

  return null;
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
