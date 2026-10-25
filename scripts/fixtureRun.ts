/*
 * Fixture-mode run (spec "Test 1"): drives real Chrome through the full workflow against a local
 * synthetic site with mocked AI, then writes the required 4-column Excel test file.
 * All records are SYNTHETIC TEST DATA on reserved example.com domains.
 *
 *   npm run fixture-run              -> 1 company, headless
 *   npm run fixture-run -- 3 --show  -> 3 companies, visible browser
 */
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { runFixtureWorkflow } from '../tests/fixture/harness'
import { validateRows } from '../src/main/data/validation'
import { dedupe } from '../src/main/data/dedup'
import { exportProspects } from '../src/main/data/excelExport'

async function main(): Promise<void> {
  const maxCompanies = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 1)
  const headless = !process.argv.includes('--show')
  const run = await runFixtureWorkflow({ workDir: join(tmpdir(), 'vpib-fixture-run'), maxCompanies, headless })
  try {
    const task = run.repos.tasks.get(run.taskId)!
    console.log(`Task status: ${task.status} (stage ${task.stage})`)
    for (const a of run.activity) console.log(`  [${a.level}] ${a.message}`)

    const { rows } = dedupe(validateRows(run.repos.research.prospects(run.taskId)))
    const qualified = rows.filter((r) => r.relevant)
    const out = resolve('output', 'test', 'verilumen_test_output_TEST_DATA.xlsx')
    await exportProspects(qualified, { path: out, auditColumns: [], mandatoryOnly: true, mainSheetName: 'TEST DATA', testData: true })

    const c = run.repos.research.counts(run.taskId)
    console.log(`\nCompanies ${c.companiesDone}/${c.companiesTotal}, employees ${c.employees}, qualified ${c.qualified} (T1 ${c.tier1}, T2 ${c.tier2}, T3 ${c.tier3})`)
    console.log(`Full task export (with Audit sheet): ${run.repos.tasks.lastExport(run.taskId)?.path}`)
    console.log(`Synthetic 4-column test file: ${out}`)
    if (task.status !== 'COMPLETED') process.exitCode = 1
  } finally {
    await run.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
