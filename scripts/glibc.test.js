import { describe, expect, it } from 'vitest'
import { exceedsGlibc, highestGlibc } from './glibc'

describe('highestGlibc', () => {
  it('finds the newest version, comparing the numbers and not the text', () => {
    expect(highestGlibc(Buffer.from('GLIBC_2.9\0GLIBC_2.38\0GLIBC_2.17\0'))).toEqual([2, 38])
  })

  it('reports none for a binary that asks for no glibc symbol', () => {
    expect(highestGlibc(Buffer.from('nothing here'))).toEqual([0, 0])
  })
})

describe('exceedsGlibc', () => {
  it.each([
    [[2, 38], true],
    [[3, 0], true],
    [[2, 35], false],
    [[2, 17], false],
    [[1, 99], false]
  ])('%j against 2.35', (version, expected) => {
    expect(exceedsGlibc(version, [2, 35])).toBe(expected)
  })
})
