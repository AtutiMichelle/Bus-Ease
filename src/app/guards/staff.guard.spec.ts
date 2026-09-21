import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { AuthModalService } from '../services/auth-modal.service';
import { AuthService } from '../services/auth.service';
import { StaffService } from '../services/staff.service';
import { sectionGuard, staffGuard } from './auth.guard';

function setup(options: { signedIn: boolean; role?: string | null; roleFails?: boolean }) {
  const modalOpens: string[][] = [];
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { getSession: async () => (options.signedIn ? { user: { id: 'u1' } } : null) } },
      { provide: AuthModalService, useValue: { open: (...args: string[]) => modalOpens.push(args) } },
      {
        provide: StaffService,
        useValue: {
          ensureRole: async () => {
            if (options.roleFails) {
              throw new Error('boom');
            }
            return options.role ?? null;
          },
        },
      },
    ],
  });
  const run = (guard: ReturnType<typeof sectionGuard>) =>
    TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, { url: '/admin' } as RouterStateSnapshot),
    ) as Promise<boolean | UrlTree>;
  return { run, modalOpens };
}

const redirectTarget = (result: boolean | UrlTree) => (result instanceof UrlTree ? result.toString() : result);

describe('staffGuard', () => {
  it('lets staff in', async () => {
    const { run } = setup({ signedIn: true, role: 'customer_care' });
    expect(await run(staffGuard)).toBe(true);
  });

  it('sends signed-out visitors home and opens the login modal', async () => {
    const { run, modalOpens } = setup({ signedIn: false });
    expect(redirectTarget(await run(staffGuard))).toBe('/');
    expect(modalOpens).toEqual([['login', '/admin']]);
  });

  it('sends signed-in customers home', async () => {
    const { run, modalOpens } = setup({ signedIn: true, role: null });
    expect(redirectTarget(await run(staffGuard))).toBe('/');
    expect(modalOpens).toEqual([]);
  });

  it('fails closed when the staff check errors', async () => {
    const { run } = setup({ signedIn: true, roleFails: true });
    expect(redirectTarget(await run(staffGuard))).toBe('/');
  });
});

describe('sectionGuard', () => {
  it('lets a role into a section it includes', async () => {
    const { run } = setup({ signedIn: true, role: 'customer_care' });
    expect(await run(sectionGuard('bookings'))).toBe(true);
  });

  it('sends staff to the no-access page for a section their role lacks', async () => {
    const { run } = setup({ signedIn: true, role: 'customer_care' });
    expect(redirectTarget(await run(sectionGuard('dashboard')))).toBe('/admin/no-access');
  });

  it('sends a role with no entry to the no-access page for every section', async () => {
    const { run } = setup({ signedIn: true, role: 'field_agent' });
    expect(redirectTarget(await run(sectionGuard('bookings')))).toBe('/admin/no-access');
  });

  it('sends non-staff home', async () => {
    const { run } = setup({ signedIn: true, role: null });
    expect(redirectTarget(await run(sectionGuard('bookings')))).toBe('/');
  });
});
