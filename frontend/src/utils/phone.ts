/**
 * Format a raw phone string (digits only after +7) into +7 (XXX) XXX-XX-XX
 */
export function formatPhoneDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^7/, '');
  let result = '';
  if (digits.length > 0) result += `(${digits.slice(0, 3)}`;
  if (digits.length >= 3) result += `) `;
  if (digits.length > 3) result += digits.slice(3, 6);
  if (digits.length > 6) result += `-${digits.slice(6, 8)}`;
  if (digits.length > 8) result += `-${digits.slice(8, 10)}`;
  return result;
}

/**
 * Handle phone input change: strip non-digits, limit to 10 digits, prepend +7
 */
export function handlePhoneChange(value: string, setter: (v: string) => void) {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  setter(`+7${digits}`);
}

/**
 * Get display digits (without +7 prefix) from a full phone string
 */
export function getPhoneDigits(phone: string): string {
  return phone.replace(/\D/g, '').replace(/^7/, '').slice(0, 10);
}
