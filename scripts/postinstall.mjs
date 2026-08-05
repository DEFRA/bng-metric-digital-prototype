import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

// Wire up local dev tooling (husky hooks + bundled gitleaks) only for a
// contributor running `npm install` in a real checkout — never in CI, and
// never in a context without the git metadata the hooks need.
const REPO_ROOT = path.resolve(import.meta.dirname, '..')

if (process.env.CI || !existsSync(path.join(REPO_ROOT, '.git'))) {
  process.exit(0)
}

execSync('npm run setup:husky && npm run install:gitleaks', {
  stdio: 'inherit',
  cwd: REPO_ROOT
})
