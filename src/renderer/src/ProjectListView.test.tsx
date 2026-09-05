import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { ProjectListView } from './ProjectListView'

afterEach(cleanup)

test('describes the list using the development project terminology', () => {
  render(<ProjectListView
    projects={[]}
    error={null}
    onAdd={vi.fn()}
    onRemove={vi.fn()}
    onConfigure={vi.fn()}
  />)

  expect(screen.getByText('Development projects')).toBeVisible()
  expect(screen.getByText('Register development projects and keep their development services in view.')).toBeVisible()
  expect(screen.getByText('Add a development project to begin managing its development services.')).toBeVisible()
  expect(screen.queryAllByText(/workspace|repositor(?:y|ies)/i)).toHaveLength(0)
})
