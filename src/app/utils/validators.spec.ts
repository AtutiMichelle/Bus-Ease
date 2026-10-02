import { FormControl, FormGroup } from '@angular/forms';
import { matchFields, notBlank, passwordStrength } from './validators';

describe('form validators', () => {
  it('accepts a strong password and leaves an empty one to required', () => {
    expect(passwordStrength(new FormControl('abcdefg1'))).toBeNull();
    expect(passwordStrength(new FormControl(''))).toBeNull();
  });

  it('rejects a short password or one missing a letter or a number', () => {
    expect(passwordStrength(new FormControl('abc12'))).toEqual({ passwordStrength: true });
    expect(passwordStrength(new FormControl('abcdefgh'))).toEqual({ passwordStrength: true });
    expect(passwordStrength(new FormControl('12345678'))).toEqual({ passwordStrength: true });
  });

  it('rejects a value made only of spaces', () => {
    expect(notBlank(new FormControl('   '))).toEqual({ notBlank: true });
    expect(notBlank(new FormControl(' Jane '))).toBeNull();
    expect(notBlank(new FormControl(''))).toBeNull();
  });

  it('flags two fields that do not match once both are filled in', () => {
    const group = (a: string, b: string) =>
      new FormGroup({ password: new FormControl(a), confirm: new FormControl(b) });
    const check = matchFields('password', 'confirm');

    expect(check(group('abcdefg1', 'abcdefg1'))).toBeNull();
    expect(check(group('abcdefg1', 'abcdefg2'))).toEqual({ mismatch: true });
    expect(check(group('abcdefg1', ''))).toBeNull();
  });
});
