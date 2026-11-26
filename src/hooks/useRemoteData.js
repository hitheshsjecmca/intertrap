import { useEffect, useState } from 'react'

export function useRemoteData(load) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState(null)
  useEffect(() => {
    const controller = new AbortController()
    async function run() {
      try {
        const data = await load(controller.signal)
        if (!controller.signal.aborted) setResult({ load, attempt, data })
      } catch (error) {
        if (!controller.signal.aborted) setResult({ load, attempt, error: error.message })
      }
    }
    void run()
    return () => controller.abort()
  }, [load, attempt])
  const current = result?.load === load && result.attempt === attempt ? result : null
  return { data: current?.data, error: current?.error, loading: !current, retry: () => setAttempt((value) => value + 1) }
}
