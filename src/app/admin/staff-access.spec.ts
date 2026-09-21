import { canAccess, roleLabel, sectionsForRole } from './staff-access';

describe('staff role access', () => {
  it('lets admin open every section', () => {
    expect(canAccess('admin', 'dashboard')).toBe(true);
    expect(canAccess('admin', 'settings')).toBe(true);
    expect(sectionsForRole('admin')).toContain('payments');
  });

  it('limits customer_care to bookings, customers and customer care', () => {
    expect([...sectionsForRole('customer_care')].sort()).toEqual(['bookings', 'customer-care', 'customers']);
    expect(canAccess('customer_care', 'bookings')).toBe(true);
    expect(canAccess('customer_care', 'dashboard')).toBe(false);
    expect(canAccess('customer_care', 'payments')).toBe(false);
  });

  it('gives a role with no entry, or no role at all, no sections', () => {
    expect(sectionsForRole('field_agent')).toEqual([]);
    expect(sectionsForRole(null)).toEqual([]);
    expect(canAccess('field_agent', 'bookings')).toBe(false);
    expect(canAccess(null, 'dashboard')).toBe(false);
  });

  it('does not match inherited object keys as roles', () => {
    expect(sectionsForRole('constructor')).toEqual([]);
    expect(sectionsForRole('toString')).toEqual([]);
  });

  it('labels known roles and makes unknown ones readable', () => {
    expect(roleLabel('admin')).toBe('Administrator');
    expect(roleLabel('customer_care')).toBe('Customer care');
    expect(roleLabel('field_agent')).toBe('Field agent');
    expect(roleLabel(null)).toBe('');
  });
});
