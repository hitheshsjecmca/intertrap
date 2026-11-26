export function dashboardMessage(data) {
  if (!data) return 'Welcome back. I can help you navigate the career workspace.'
  if (!data.summary.total_interviews) return 'Record your first interview to initialize your performance profile.'
  if (data.recent[0]?.overall_status === 'selected') return 'Your latest interview was marked selected. Congratulations on your selection.'
  const recurring = data.weaknesses.find((item) => item.interviews >= 2)
  if (recurring) return `${recurring.topic} was reported across ${recurring.interviews} interviews. Review the supporting rounds before your next assessment.`
  if (data.summary.first_rejected) return 'First-round rejection recorded. Review the associated topics for your next preparation priorities.'
  return 'Your performance profile is available. Review the sample sizes alongside each rate.'
}
