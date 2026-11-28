// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { LAUNCH_CATEGORIES, PAIN_POINTS, PROBLEM_SOLUTION, USE_CASES } from './audience'
import { PainPoints, ProblemToSolution, UseCases } from './sections/Audience'

afterEach(cleanup)

// SP-BRAND-003 follow-up (Nov 28), BR-003 to BR-005: layout only, founder copy to come.
describe('creator and supporter detail (layout ready, words pending founder approval)', () => {
  it('ships with no copy at all: every list is empty until the founder approves the wording', () => {
    expect(PAIN_POINTS).toEqual([])
    expect(USE_CASES).toEqual([])
    expect(PROBLEM_SOLUTION).toEqual([])
    expect(LAUNCH_CATEGORIES).toEqual(['Faith & Spirituality', 'Personal Development', 'Business & Entrepreneurship'])
  })

  it('renders nothing while empty, so the live site never shows placeholder text', () => {
    const { container } = render(
      <>
        <PainPoints />
        <UseCases />
        <ProblemToSolution />
      </>,
    )
    expect(container.innerHTML).toBe('')
  })

  it('once filled, lists pain points, use cases by launch category in order, and each problem with its solution (test data only)', () => {
    const { getByTestId } = render(
      <>
        <PainPoints items={[{ id: 'a', audience: 'creator', text: 'T1' }]} heading="H1" />
        <UseCases
          items={[
            { id: 'u2', category: 'Business & Entrepreneurship', title: 'B', body: 'b' },
            { id: 'u1', category: 'Faith & Spirituality', title: 'F', body: 'f' },
          ]}
        />
        <ProblemToSolution items={[{ id: 'p', problem: 'P', solution: 'S' }]} />
      </>,
    )
    expect(getByTestId('pain-points').textContent).toBe('H1T1')
    expect([...getByTestId('use-cases').querySelectorAll('[data-category]')].map((d) => d.getAttribute('data-category'))).toEqual([
      'Faith & Spirituality',
      'Business & Entrepreneurship',
    ])
    expect(getByTestId('problem-solution').textContent).toBe('PS')
  })
})
