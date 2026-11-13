export const DONATION_CURRENCIES = [
  { code: 'CNY', label: '人民币', symbol: '¥', minMinorUnits: 500, presets: ['10', '20', '50', '100'] },
  { code: 'USD', label: '美元', symbol: '$', minMinorUnits: 100, presets: ['5', '10', '20', '50'] },
  { code: 'HKD', label: '港币', symbol: 'HK$', minMinorUnits: 500, presets: ['10', '20', '50', '100'] },
  { code: 'EUR', label: '欧元', symbol: '€', minMinorUnits: 100, presets: ['5', '10', '20', '50'] },
  { code: 'CAD', label: '加元', symbol: 'CA$', minMinorUnits: 100, presets: ['5', '10', '20', '50'] },
  { code: 'GBP', label: '英镑', symbol: '£', minMinorUnits: 100, presets: ['5', '10', '20', '50'] },
  { code: 'SGD', label: '新加坡元', symbol: 'S$', minMinorUnits: 100, presets: ['5', '10', '20', '50'] },
] as const

export type DonationCurrency = (typeof DONATION_CURRENCIES)[number]['code']
export const DEFAULT_CURRENCY: DonationCurrency = 'CNY'
export const MAX_DONATION_MINOR_UNITS = 10_000_000

export class DonationValidationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'DonationValidationError'
  }
}

export function isDonationCurrency(value: unknown): value is DonationCurrency {
  return DONATION_CURRENCIES.some((item) => item.code === value)
}

export function getCurrencyConfig(code: DonationCurrency) {
  // The public type and runtime check keep configuration lookup total.
  return DONATION_CURRENCIES.find((item) => item.code === code) ?? DONATION_CURRENCIES[0]
}

export function parseDonationAmount(amount: unknown, currency: unknown): number {
  if (!isDonationCurrency(currency)) {
    throw new DonationValidationError('INVALID_CURRENCY', '请选择支持的币种。')
  }
  if (typeof amount !== 'string' || !/^(?:0|[1-9]\d{0,5})(?:\.\d{1,2})?$/.test(amount)) {
    throw new DonationValidationError('INVALID_AMOUNT', '请输入有效金额，最多保留两位小数。')
  }

  const [whole, fraction = ''] = amount.split('.')
  const minorUnits = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  const config = getCurrencyConfig(currency)
  if (minorUnits < config.minMinorUnits) {
    throw new DonationValidationError(
      'AMOUNT_TOO_SMALL',
      `最低支持金额为 ${(config.minMinorUnits / 100).toFixed(2)} ${currency}。`,
    )
  }
  if (minorUnits > MAX_DONATION_MINOR_UNITS) {
    throw new DonationValidationError(
      'AMOUNT_TOO_LARGE',
      `单次支持金额不能超过 ${(MAX_DONATION_MINOR_UNITS / 100).toFixed(2)} ${currency}。`,
    )
  }
  return minorUnits
}
