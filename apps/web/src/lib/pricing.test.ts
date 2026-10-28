import { describe, expect, it } from 'vitest'
import { formatUsd, plans, pricingPaths, savePercent, yearlyPerMonthCents } from './pricing.ts'

describe('pricing plans', () => {
  it('keeps the proposals of the canvas: three paid plans, one popular', () => {
    expect(plans.map((plan) => [plan.name, plan.monthlyCents, plan.yearlyCents])).toEqual([
      ['Mochi Starter', 199, 1788],
      ['Mochi Pro', 299, 2388],
      ['Mochi Max', 599, 5388],
    ])
    expect(plans.filter((plan) => plan.popular).map((plan) => plan.id)).toEqual(['pro'])
  })

  it('derives the yearly price per month and the saving the canvas shows', () => {
    expect(plans.map(yearlyPerMonthCents)).toEqual([149, 199, 449])
    expect(plans.map(savePercent)).toEqual([25, 33, 25])
  })

  it('formats US dollars for each language', () => {
    expect(formatUsd(199, 'en')).toBe('$1.99')
    expect(formatUsd(1788, 'en')).toBe('$17.88')
    expect(formatUsd(0, 'en')).toBe('$0')
    expect(formatUsd(199, 'pt').replace(/\s/g, ' ')).toBe('US$ 1,99')
  })

  it('has one page per language', () => {
    expect(pricingPaths).toEqual({ en: '/pricing/', pt: '/pt/precos/' })
  })
})
