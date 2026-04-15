export interface CurrencyOption {
  code: string;
  name: string;
  symbol: string;
  locale: string;
}

export const CURRENCY_CATALOG: CurrencyOption[] = [
  { code: 'GTQ', name: 'Quetzal guatemalteco', symbol: 'Q', locale: 'es-GT' },
  { code: 'USD', name: 'Dolar estadounidense', symbol: '$', locale: 'en-US' },
  { code: 'EUR', name: 'Euro', symbol: 'EUR', locale: 'es-ES' },
  { code: 'MXN', name: 'Peso mexicano', symbol: '$', locale: 'es-MX' },
  { code: 'COP', name: 'Peso colombiano', symbol: '$', locale: 'es-CO' },
  { code: 'ARS', name: 'Peso argentino', symbol: '$', locale: 'es-AR' },
  { code: 'CLP', name: 'Peso chileno', symbol: '$', locale: 'es-CL' },
  { code: 'PEN', name: 'Sol peruano', symbol: 'S/', locale: 'es-PE' },
  { code: 'CRC', name: 'Colon costarricense', symbol: 'CRC', locale: 'es-CR' },
  { code: 'HNL', name: 'Lempira hondurena', symbol: 'L', locale: 'es-HN' },
];

export const DEFAULT_CURRENCY = CURRENCY_CATALOG[0];

export function getCurrencyOption(code?: string | null): CurrencyOption {
  return CURRENCY_CATALOG.find((item) => item.code === code) ?? DEFAULT_CURRENCY;
}

export function formatMoney(value: number, code?: string | null): string {
  const currency = getCurrencyOption(code);
  return new Intl.NumberFormat(currency.locale, {
    style: 'currency',
    currency: currency.code,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}
