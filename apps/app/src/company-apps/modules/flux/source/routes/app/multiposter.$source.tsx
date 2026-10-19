import { createFileRoute } from '@tanstack/react-router'
import { MultiposterPage } from '@flux/components/multiposter/multiposter-page'

export const Route = createFileRoute('/app/multiposter/$source')({
  component: function SourceRoute() {
    const { source } = Route.useParams()
    return <MultiposterPage initialSource={source} />
  },
})