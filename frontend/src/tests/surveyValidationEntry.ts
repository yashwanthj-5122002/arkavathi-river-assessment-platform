import { runSurveyValidation } from './surveyValidation'

declare global {
  interface Window {
    __SURVEY_VALIDATION__?: { results: { name: string; pass: boolean; detail: string }[]; passed: number; failed: number }
  }
}

async function main(): Promise<void> {
  const out = document.getElementById('out')
  const report = await runSurveyValidation()
  window.__SURVEY_VALIDATION__ = report
  if (out) {
    out.textContent = `${report.failed === 0 ? 'ALL PASSED' : 'FAILURES'} — ${report.passed}/${report.results.length}\n\n` +
      report.results.map(result => `${result.pass ? 'PASS' : 'FAIL'}  ${result.name}${result.pass ? '' : ` — ${result.detail}`}`).join('\n')
    out.dataset.done = 'true'
    document.title = report.failed === 0 ? 'SURVEY VALIDATION PASSED' : `SURVEY VALIDATION FAILED (${report.failed})`
  }
}

main().catch(error => {
  const out = document.getElementById('out')
  if (out) {
    out.textContent = `FATAL — ${error instanceof Error ? error.stack ?? error.message : String(error)}`
    out.dataset.done = 'true'
  }
  document.title = 'SURVEY VALIDATION FAILED'
})
