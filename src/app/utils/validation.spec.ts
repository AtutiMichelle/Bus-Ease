import { isValidEmail, isValidIdNumber, normalizeKenyanPhone } from './validation';

describe('normalizeKenyanPhone', () => {
  it('accepts the common Kenyan forms', () => {
    expect(normalizeKenyanPhone('0712345678')).toBe('254712345678');
    expect(normalizeKenyanPhone('712345678')).toBe('254712345678');
    expect(normalizeKenyanPhone('254712345678')).toBe('254712345678');
    expect(normalizeKenyanPhone('+254 712 345 678')).toBe('254712345678');
    expect(normalizeKenyanPhone('0112-345-678')).toBe('254112345678');
  });

  it('rejects numbers that are not Kenyan mobiles', () => {
    expect(normalizeKenyanPhone('')).toBeNull();
    expect(normalizeKenyanPhone('0212345678')).toBeNull();
    expect(normalizeKenyanPhone('07123456')).toBeNull();
    expect(normalizeKenyanPhone('2557123456789')).toBeNull();
    expect(normalizeKenyanPhone('07123abc78')).toBeNull();
  });
});

describe('isValidEmail', () => {
  it('checks the basic shape', () => {
    expect(isValidEmail('jane@example.com')).toBe(true);
    expect(isValidEmail('jane@example')).toBe(false);
    expect(isValidEmail('jane example.com')).toBe(false);
  });
});

describe('isValidIdNumber', () => {
  it('accepts IDs and passport numbers', () => {
    expect(isValidIdNumber('12345678')).toBe(true);
    expect(isValidIdNumber('AK123456')).toBe(true);
    expect(isValidIdNumber('12')).toBe(false);
    expect(isValidIdNumber('12 34 56')).toBe(false);
  });
});
