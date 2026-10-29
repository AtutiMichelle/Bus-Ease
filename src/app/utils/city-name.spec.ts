import { cityName } from './city-name';

describe('cityName', () => {
  it('puts capitals and lowercase names in Title Case', () => {
    expect(cityName('MOMBASA')).toBe('Mombasa');
    expect(cityName('KISII')).toBe('Kisii');
    expect(cityName('nairobi')).toBe('Nairobi');
    expect(cityName('Nairobi')).toBe('Nairobi');
  });

  it('handles names with more than one word', () => {
    expect(cityName('MTITO ANDEI')).toBe('Mtito Andei');
    expect(cityName('MACHAKOS JUNCTION')).toBe('Machakos Junction');
    expect(cityName('NAIROBI CBD')).toBe('Nairobi CBD');
    expect(cityName('Nairobi CBD')).toBe('Nairobi CBD');
  });

  it('keeps joining words and apostrophes readable', () => {
    expect(cityName('DAR ES SALAAM')).toBe('Dar es Salaam');
    expect(cityName('DAR-ES-SALAAM')).toBe('Dar-es-Salaam');
    expect(cityName("MURANG'A")).toBe("Murang'a");
    expect(cityName('AIRTEL TOTAL (MSA RD)')).toBe('Airtel Total (MSA Rd)');
  });

  it('leaves mixed case words alone and tidies spacing', () => {
    expect(cityName('McKinnon')).toBe('McKinnon');
    expect(cityName('  NAIROBI   CBD ')).toBe('Nairobi CBD');
  });

  it('returns an empty string for a missing name', () => {
    expect(cityName('')).toBe('');
    expect(cityName(undefined)).toBe('');
    expect(cityName(null)).toBe('');
  });
});
