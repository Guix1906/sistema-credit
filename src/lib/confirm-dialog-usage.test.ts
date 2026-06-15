import { describe, expect, it } from 'vitest'

import cashboxesPageSource from '../pages/cashboxes-page.tsx?raw'
import clientDetailPageSource from '../pages/client-detail-page.tsx?raw'
import clientsPageSource from '../pages/clients-page.tsx?raw'
import collectionsPageSource from '../pages/collections-page.tsx?raw'
import expensesPageSource from '../pages/expenses-page.tsx?raw'
import routesPageSource from '../pages/routes-page.tsx?raw'
import teamPageSource from '../pages/team-page.tsx?raw'

const destructivePageSources = [
  cashboxesPageSource,
  clientDetailPageSource,
  clientsPageSource,
  collectionsPageSource,
  expensesPageSource,
  routesPageSource,
  teamPageSource,
]

describe('destructive action confirmation dialogs', () => {
  it('does not use native browser confirmation prompts', () => {
    for (const source of destructivePageSources) {
      expect(source).not.toContain('window.confirm')
    }
  })

  it('routes destructive actions through the shared confirmation dialog', () => {
    for (const source of destructivePageSources) {
      expect(source).toContain('ConfirmDialog')
    }
  })
})
