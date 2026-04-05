/**
 * src/lib/validation.ts
 *
 * Reusable field and form validators.
 * Returns an error string on failure, or undefined on success.
 */

export type Validator<T = string> = (value: T) => string | undefined;

/** Compose multiple validators – returns the first error found */
export function compose<T>(...validators: Validator<T>[]): Validator<T> {
  return (value: T) => {
    for (const v of validators) {
      const err = v(value);
      if (err) return err;
    }
    return undefined;
  };
}

// ─── String validators ──────────────────────────────────────────────────────

export const required: Validator = v =>
  !v?.trim() ? 'This field is required.' : undefined;

export const minLength = (n: number): Validator => v =>
  (v?.length ?? 0) < n ? `Must be at least ${n} characters.` : undefined;

export const maxLength = (n: number): Validator => v =>
  (v?.length ?? 0) > n ? `Must be at most ${n} characters.` : undefined;

export const noSpaces: Validator = v =>
  /\s/.test(v ?? '') ? 'Must not contain spaces.' : undefined;

export const alphanumericUnder: Validator = v =>
  /[^a-z0-9_]/i.test(v ?? '') ? 'Only letters, numbers and underscores allowed.' : undefined;

// ─── Numeric validators ─────────────────────────────────────────────────────

export const isPositiveNumber: Validator = v => {
  const n = Number(v);
  return isNaN(n) || n <= 0 ? 'Must be a positive number.' : undefined;
};

export const isNonNegativeNumber: Validator = v => {
  const n = Number(v);
  return isNaN(n) || n < 0 ? 'Must be zero or a positive number.' : undefined;
};

export const isPercentage: Validator = v => {
  const n = Number(v);
  return isNaN(n) || n < 0 || n > 100 ? 'Must be a number between 0 and 100.' : undefined;
};

// ─── Password validators ────────────────────────────────────────────────────

export const passwordMinLength = minLength(8);

export const passwordsMatch = (other: string): Validator => v =>
  v !== other ? 'Passwords do not match.' : undefined;

// ─── Form validation helper ─────────────────────────────────────────────────

export type FormErrors<T> = Partial<Record<keyof T, string>>;

/**
 * Run a map of field-name → validator against a values object.
 * Returns an errors map; empty object means valid.
 */
export function validateForm<T extends Record<string, unknown>>(
  values: T,
  rules: Partial<Record<keyof T, Validator<unknown>>>
): FormErrors<T> {
  const errors: FormErrors<T> = {};
  for (const [key, validator] of Object.entries(rules) as [keyof T, Validator<unknown>][]) {
    const err = validator?.(values[key]);
    if (err) errors[key] = err;
  }
  return errors;
}

/** True when the FormErrors object contains no entries */
export function isFormValid<T>(errors: FormErrors<T>): boolean {
  return Object.keys(errors).length === 0;
}
