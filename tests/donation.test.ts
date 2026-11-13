import { describe, expect, it } from 'vitest'
import {
  DONATION_CURRENCIES,
  DonationValidationError,
  MAX_DONATION_MINOR_UNITS,
  parseDonationAmount,
} from '../src/lib/donation'

describe('exact donation amount conversion', () => {
  it.each([
    ['1.10', 110],
    ['2.30', 230],
    ['19.99', 1999],
    ['10', 1000],
    ['10.1', 1010],
    ['100000.00', MAX_DONATION_MINOR_UNITS],
  ])('converts %s into integer minor units', (amount, expected) => {
    expect(parseDonationAmount(amount, 'USD')).toBe(expected)
  })

  it.each(['', '-1', '0', '0.50', '01', '1e3', 'NaN', 'Infinity', '1.001', '1.', '.5', ' 10 ', '100000.01', '999999999999'])(
    'rejects unsupported or out of policy input %j',
    (amount) => expect(() => parseDonationAmount(amount, 'USD')).toThrow(DonationValidationError),
  )

  it.each([null, undefined, 1999, {}, []])('rejects non-string amounts %j', (amount) => {
    expect(() => parseDonationAmount(amount, 'USD')).toThrow(DonationValidationError)
  })

  it.each(['JPY', 'usd', '', null, {}])('rejects unsupported currency %j', (currency) => {
    expect(() => parseDonationAmount('10', currency)).toThrow('请选择支持的币种')
  })

  it('enforces the same per-currency minimum used by the UI', () => {
    for (const config of DONATION_CURRENCIES) {
      expect(parseDonationAmount((config.minMinorUnits / 100).toFixed(2), config.code)).toBe(config.minMinorUnits)
      expect(() => parseDonationAmount(((config.minMinorUnits - 1) / 100).toFixed(2), config.code)).toThrow()
      for (const preset of config.presets) {
        expect(parseDonationAmount(preset, config.code)).toBeGreaterThanOrEqual(config.minMinorUnits)
      }
    }
  })
})
