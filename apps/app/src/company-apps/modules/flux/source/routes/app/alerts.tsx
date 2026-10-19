import { createFileRoute } from '@tanstack/react-router'
import { AlertsPage } from '@flux/components/alerts/alerts-page'

export const Route = createFileRoute('/app/alerts')({
  component: AlertsPage,
})