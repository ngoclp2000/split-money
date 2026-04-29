const fractionDigits = new Map<string, number>([
  ["VND", 0],
  ["JPY", 0],
  ["KRW", 0],
  ["USD", 2],
  ["EUR", 2],
  ["GBP", 2],
  ["SGD", 2],
  ["THB", 2]
]);

export function getFractionDigits(currency: string): number {
  return fractionDigits.get(currency.toUpperCase()) ?? 2;
}

export function toMinorUnits(value: number, currency: string): number {
  return Math.round(value * 10 ** getFractionDigits(currency));
}

export function fromMinorUnits(amountMinor: number, currency: string): number {
  return amountMinor / 10 ** getFractionDigits(currency);
}

export function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency,
    maximumFractionDigits: getFractionDigits(currency)
  }).format(fromMinorUnits(amountMinor, currency));
}
