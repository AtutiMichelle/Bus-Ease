import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { StaffService } from './staff.service';
import { Supabase } from './supabase';

/** Fake database and login: counts staff_role calls and lets a test change
 * who is signed in or make the call fail. */
function setup(initialUserId: string | null, roleByUser: Record<string, string | null>) {
  const state = { userId: initialUserId, rpcCalls: 0, failNext: false };
  let authListener: ((event: string) => void) | undefined;

  const client = {
    rpc: async (fn: string) => {
      state.rpcCalls++;
      if (state.failNext) {
        state.failNext = false;
        return { data: null, error: { message: 'boom' } };
      }
      return { data: fn === 'staff_role' ? (roleByUser[state.userId ?? ''] ?? null) : null, error: null };
    },
    auth: { onAuthStateChange: (listener: (event: string) => void) => (authListener = listener) },
  };
  TestBed.configureTestingModule({
    providers: [
      { provide: Supabase, useValue: { getClient: () => client } },
      { provide: AuthService, useValue: { getSession: async () => (state.userId ? { user: { id: state.userId } } : null) } },
    ],
  });
  return { service: TestBed.inject(StaffService), state, signOut: () => authListener?.('SIGNED_OUT') };
}

describe('StaffService', () => {
  it('loads the role once per login and keeps it in a signal', async () => {
    const { service, state } = setup('u1', { u1: 'customer_care' });

    expect(await service.ensureRole()).toBe('customer_care');
    expect(await service.ensureRole()).toBe('customer_care');

    expect(state.rpcCalls).toBe(1);
    expect(service.role()).toBe('customer_care');
    expect(service.roleLabel()).toBe('Customer care');
    expect(service.sections()).toContain('bookings');
  });

  it('shares one request when called twice at the same time', async () => {
    const { service, state } = setup('u1', { u1: 'admin' });
    const [a, b] = await Promise.all([service.ensureRole(), service.ensureRole()]);
    expect([a, b]).toEqual(['admin', 'admin']);
    expect(state.rpcCalls).toBe(1);
  });

  it('returns null for someone who is not staff, without asking again', async () => {
    const { service, state } = setup('u1', {});
    expect(await service.ensureRole()).toBeNull();
    expect(await service.ensureRole()).toBeNull();
    expect(state.rpcCalls).toBe(1);
    expect(service.sections()).toEqual([]);
  });

  it('returns null and asks nothing when signed out', async () => {
    const { service, state } = setup(null, {});
    expect(await service.ensureRole()).toBeNull();
    expect(state.rpcCalls).toBe(0);
  });

  it('loads again when a different account signs in', async () => {
    const { service, state } = setup('u1', { u1: 'admin', u2: 'customer_care' });
    await service.ensureRole();
    state.userId = 'u2';
    expect(await service.ensureRole()).toBe('customer_care');
    expect(state.rpcCalls).toBe(2);
  });

  it('clears the role on sign-out', async () => {
    const { service, state, signOut } = setup('u1', { u1: 'admin' });
    await service.ensureRole();
    signOut();
    expect(service.role()).toBeNull();
    expect(service.sections()).toEqual([]);

    state.userId = 'u1';
    await service.ensureRole();
    expect(state.rpcCalls).toBe(2);
  });

  it('throws when the check fails, and does not remember the failure', async () => {
    const { service, state } = setup('u1', { u1: 'admin' });
    state.failNext = true;
    await expect(service.ensureRole()).rejects.toMatchObject({ message: 'boom' });
    expect(await service.ensureRole()).toBe('admin');
    expect(state.rpcCalls).toBe(2);
  });

  it('points each role at its own starting page', async () => {
    const admin = setup('u1', { u1: 'admin' });
    await admin.service.ensureRole();
    expect(admin.service.homeLink()).toEqual({ route: '/admin', label: 'Dashboard' });
  });

  it('starts customer care on Bookings, and gives customers no staff link', async () => {
    TestBed.resetTestingModule();
    const care = setup('u1', { u1: 'customer_care' });
    await care.service.ensureRole();
    expect(care.service.homeLink()).toEqual({ route: '/admin/bookings', label: 'Staff area' });

    TestBed.resetTestingModule();
    const customer = setup('u2', {});
    await customer.service.ensureRole();
    expect(customer.service.homeLink()).toBeNull();
  });
});
