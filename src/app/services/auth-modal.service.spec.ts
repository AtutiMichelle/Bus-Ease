import { AuthModalService } from './auth-modal.service';

describe('AuthModalService', () => {
  it('starts closed', () => {
    const service = new AuthModalService();
    expect(service.mode()).toBeNull();
    expect(service.returnUrl()).toBeNull();
  });

  it('open() defaults to login mode with no returnUrl', () => {
    const service = new AuthModalService();
    service.open();
    expect(service.mode()).toBe('login');
    expect(service.returnUrl()).toBeNull();
  });

  it('open() accepts an explicit mode and returnUrl', () => {
    const service = new AuthModalService();
    service.open('signup', '/my-bookings');
    expect(service.mode()).toBe('signup');
    expect(service.returnUrl()).toBe('/my-bookings');
  });

  it('close() resets mode and returnUrl', () => {
    const service = new AuthModalService();
    service.open('login', '/confirmation');
    service.close();
    expect(service.mode()).toBeNull();
    expect(service.returnUrl()).toBeNull();
  });

  it('switching mode while open preserves the existing returnUrl by default', () => {
    const service = new AuthModalService();
    service.open('login', '/my-bookings');
    service.open('signup');
    expect(service.mode()).toBe('signup');
    expect(service.returnUrl()).toBe('/my-bookings');
  });
});
