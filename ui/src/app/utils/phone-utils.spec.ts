import { getCountryByPhone } from './phone-utils';

describe('PhoneUtils', () => {
  it('should recognize USA from +1', () => {
    const { country } = getCountryByPhone('+1 1234567890');
    expect(country?.name).toBe('United States');
    expect(country?.flag).toBe('🇺🇸');
  });

  it('should prefer Canada for +1 if hint is provided', () => {
    const { country, isAmbiguous } = getCountryByPhone('+1 1234567890', 'Canada');
    expect(country?.name).toBe('Canada');
    expect(country?.flag).toBe('🇨🇦');
    expect(isAmbiguous).toBeTrue();
  });

  it('should recognize United Kingdom from +44', () => {
    const { country, isAmbiguous } = getCountryByPhone('+44 7700 900077');
    expect(country?.name).toBe('United Kingdom');
    expect(country?.flag).toBe('🇬🇧');
    expect(isAmbiguous).toBeFalse();
  });

  it('should recognize Israel from +972', () => {
    const { country } = getCountryByPhone('+972 50 123 4567');
    expect(country?.name).toBe('Israel');
    expect(country?.flag).toBe('🇮🇱');
  });

  it('should handle longer dial codes first (e.g., +351 vs +3)', () => {
    const { country } = getCountryByPhone('+351 912345678');
    expect(country?.name).toBe('Portugal');
    expect(country?.flag).toBe('🇵🇹');
  });

  it('should return null for unknown codes', () => {
    const { country } = getCountryByPhone('+000 123');
    expect(country).toBeNull();
  });

  it('should return null for empty or non-plus strings', () => {
    expect(getCountryByPhone('').country).toBeNull();
    expect(getCountryByPhone('123').country).toBeNull();
  });
});
