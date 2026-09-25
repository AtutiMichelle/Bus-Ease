/** Kenyan mobile number in any common form (0712..., 712..., 254712...,
 * +254 712 ...) normalised to 2547XXXXXXXX or 2541XXXXXXXX, which is what
 * M-Pesa expects. Returns null for anything else. */
export function normalizeKenyanPhone(input: string): string | null {
  const digits = input.replace(/[\s\-().]/g, '').replace(/^\+/, '');
  if (!/^\d+$/.test(digits)) {
    return null;
  }
  let local: string;
  if (digits.startsWith('254')) {
    local = digits.slice(3);
  } else if (digits.startsWith('0')) {
    local = digits.slice(1);
  } else {
    local = digits;
  }
  return /^[17]\d{8}$/.test(local) ? `254${local}` : null;
}

/** Deliberately loose: one @, something either side, a dot in the domain.
 * The booking service and the inbox are the real check. */
export function isValidEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.trim());
}

/** Kenyan national ID / passport style: 5-20 letters or digits. */
export function isValidIdNumber(input: string): boolean {
  return /^[A-Za-z0-9]{5,20}$/.test(input.trim());
}
