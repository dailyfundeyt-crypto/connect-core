import { createFileRoute } from '@tanstack/react-router'
import { SearchPage } from '@flux/components/search/search-page'

export const Route = createFileRoute('/app/search')({
  component: SearchPage,
})