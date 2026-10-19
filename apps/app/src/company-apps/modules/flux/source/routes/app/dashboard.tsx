import { createFileRoute } from '@tanstack/react-router'
import { DashboardPage } from '@flux/components/dashboard/dashboard-page'

export const Route = createFileRoute('/app/dashboard')({
  component: DashboardPage,
})