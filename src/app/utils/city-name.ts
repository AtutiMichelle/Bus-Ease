import { Pipe, PipeTransform } from '@angular/core';

/** Short forms that stay in capitals, e.g. "Nairobi CBD". */
const ACRONYMS = new Set(['CBD', 'JKIA', 'SGR', 'KCB', 'DRC', 'MSA']);

/** Joining words kept lowercase inside a name, e.g. "Dar es Salaam". */
const JOINING_WORDS = new Set(['es']);

/** A word, with any apostrophe parts kept on it ("Murang'a"). */
const WORD = /\p{L}+(?:'\p{L}+)*/gu;

/** A city name for display in Title Case: "MOMBASA" -> "Mombasa",
 * "NAIROBI CBD" -> "Nairobi CBD", "DAR-ES-SALAAM" -> "Dar-es-Salaam".
 * The booking API sends names in capitals while BusEase's own links use
 * Title Case, so screens format them here instead of showing either as-is.
 * Words already in mixed case ("McKinnon") are left alone. Display only:
 * lookups and stored values keep the original name. */
export function cityName(name: string | null | undefined): string {
  if (!name) {
    return '';
  }
  let first = true;
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(WORD, (word) => {
      const isFirst = first;
      first = false;
      const upper = word.toUpperCase();
      const lower = word.toLowerCase();
      if (word !== upper && word !== lower) {
        return word;
      }
      if (ACRONYMS.has(upper)) {
        return upper;
      }
      if (!isFirst && JOINING_WORDS.has(lower)) {
        return lower;
      }
      return upper[0] + lower.slice(1);
    });
}

/** `{{ trip.from | cityName }}`, see cityName(). */
@Pipe({ name: 'cityName' })
export class CityNamePipe implements PipeTransform {
  transform(name: string | null | undefined): string {
    return cityName(name);
  }
}
