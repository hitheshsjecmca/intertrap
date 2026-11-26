import { useOutletContext } from 'react-router-dom'
import InterviewForm from '../components/interviews/InterviewForm.jsx'
import { PageHeading } from '../components/ui/WorkspaceUI.jsx'

export default function AddInterview() {
  const { user } = useOutletContext()

  return <>
    <PageHeading title="Add Interview" description="Configure rounds, record weaknesses and review the interview before saving." />
    <InterviewForm key={user.id} />
  </>
}
