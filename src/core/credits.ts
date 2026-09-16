export function formatCredits(value: number): string {
  if (!Number.isSafeInteger(value)) return '—';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  const fraction = String(abs % 1000000)
    .padStart(6, '0')
    .replace(/0+$/, '');
  return `${sign}${Math.floor(abs / 1000000)}${fraction ? '.' + fraction : ''}`;
}
