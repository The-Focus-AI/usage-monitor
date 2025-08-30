export function formatUsd(amount: number): string {
  const value = Number.isFinite(amount) ? amount : 0;
  return `$${value.toFixed(2)}`;
}

export function getCurrentUtc() {
  const now = new Date();
  return {
    now,
    year: now.getUTCFullYear(),
    month: now.getUTCMonth(),
    day: now.getUTCDate(),
    hour: now.getUTCHours(),
    minute: now.getUTCMinutes(),
  };
}

export function shouldSendDaily(currentHour: number, targetHour: number): boolean {
  return currentHour === targetHour;
}

export function createDayKey(prefix = 'daily'): string {
  const { year, month, day } = getCurrentUtc();
  return `${prefix}:${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function safeParseFloat(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export function safeParseInt(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}