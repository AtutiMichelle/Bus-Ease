import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Same rule as the account page's change-password form: at least 8
 * characters, with a letter and a number. An empty value passes, so
 * `Validators.required` stays the one that reports a missing password. */
export const passwordStrength: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const password = String(control.value ?? '');
  if (password.length === 0) {
    return null;
  }
  const strong = password.length >= 8 && /[a-zA-Z]/.test(password) && /[0-9]/.test(password);
  return strong ? null : { passwordStrength: true };
};

/** Fails when a value is only spaces, which `Validators.required` lets
 * through. */
export const notBlank: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = String(control.value ?? '');
  return value.length > 0 && value.trim().length === 0 ? { notBlank: true } : null;
};

/** Group-level check that two fields hold the same value, such as a password
 * and its confirmation. Waits until both are filled in, and sets a
 * `mismatch` error on the group rather than on either field. */
export function matchFields(first: string, second: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const a = group.get(first)?.value ?? '';
    const b = group.get(second)?.value ?? '';
    if (a === '' || b === '') {
      return null;
    }
    return a === b ? null : { mismatch: true };
  };
}
