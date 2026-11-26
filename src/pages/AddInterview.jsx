import { useOutletContext } from 'react-router-dom'
import InterviewForm from '../components/interviews/InterviewForm.jsx'
import { PageHeading } from '../components/ui/WorkspaceUI.jsx'

export default function AddInterview() {
  const { user } = useOutletContext()

  return <>
    <PageHeading title="Add Interview" description="Configure rounds, record weaknesses and review a preview. Interview storage comes in a later module." />
    <InterviewForm key={user.id} />
  </>
}
