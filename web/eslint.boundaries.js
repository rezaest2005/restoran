// Feature boundaries for the SPA (mirrors dashboard/bizsuite/module_registry.py on the backend).
//
//   src/features/<scope>/<feature>/**  may import
//     - @shared/**, third party, the app shell,
//     - its own folder,
//     - another feature ONLY through that feature's PUBLIC surface (entry page, api module, access helpers ...).
//
// Everything else is a violation. Violations that already exist today are listed in BASELINE_FILES (shrink-only):
// those files get the rule as a *warning* so `npm run lint` keeps its error count and the debt stays visible;
// every other file gets it as an error. Regenerate the list after fixing files: `node scripts/gen-boundary-baseline.mjs`.
import { BASELINE_FILES as RECORDED } from './eslint.boundaries.baseline.js'

const BASELINE_FILES = process.env.BOUNDARY_NO_BASELINE ? [] : RECORDED

// scope -> feature -> public files (import path tails, extension-less) other features may use
export const FEATURES = {
  business: {
    accounting: ['AccountingPage', 'api'],
    activity: ['ActivityPage'],
    auth: ['Login', 'ProtectedRoute'],
    club: ['ClubPage', 'api'],
    dashboard: ['dashboard', 'access', 'api'],
    delivery: ['DispatchPage', 'DriverPage', 'TrackingPage', 'api'],
    dictionary: ['Dictionary', 'StartChecklist', 'api'],
    feedback: ['FeedbackPage', 'FeedbackDialog', 'api'],
    inventory: ['InventoryPage', 'api'],
    layout: ['BusinessLayout', 'SubscriptionGuard'],
    pos: ['Pos', 'api'],
    production: ['ProductionPage', 'api'],
    support: ['SupportPage', 'api'],
  },
  super_admin: {
    auth: ['SuperLogin', 'SuperProtectedRoute'],
    layout: ['SuperAdminLayout'],
    qr: ['QrPanel'],
    support: ['SupportPanel', 'api'],
    users: ['UsersPanel'],
  },
  public: {},
}
// shared infrastructure inside the feature tree: importable by everyone
export const INFRA = {
  business: ['api', 'config'],
  super_admin: ['api', 'common', 'hooks'],
}

const SCOPE_ALIAS = { business: '@business', super_admin: '@super' }

function publicNegations(name, files) {
  return files.flatMap((f) => [`!**/${name}/${f}`, `!**/${name}/${f}.js`, `!**/${name}/${f}.jsx`])
}

function patternsFor(scope, feature) {
  const groups = []
  const msg = (what) =>
    `Feature boundary: ${what}. Import another feature only through its public surface (see docs/MODULES.md) ` +
    'or move the shared piece to @shared.'
  // other features of the same scope
  for (const [name, pub] of Object.entries(FEATURES[scope] || {})) {
    if (name === feature) continue
    groups.push({ group: [`**/${name}/**`, ...publicNegations(name, pub)], message: msg(`"${name}" internals`) })
  }
  // other scopes
  for (const other of Object.keys(SCOPE_ALIAS)) {
    if (other === scope) continue
    groups.push({
      group: [`${SCOPE_ALIAS[other]}/**`, `**/features/${other}/**`, `**/${other}/**`,
        // a business feature may use another scope's infra
        ...(INFRA[other] || []).map((n) => `!**/${other}/${n}/**`).concat((INFRA[other] || []).map((n) => `!${SCOPE_ALIAS[other]}/${n}/**`))],
      message: msg(`the "${other}" area`),
    })
  }
  if (scope !== 'public') {
    groups.push({ group: ['**/features/public/**'], message: msg('the public pages') })
  } else {
    groups.push({ group: ['@business/**', '@super/**', '**/features/business/**', '**/features/super_admin/**'],
      message: msg('private areas from a public page') })
  }
  return groups
}

export function boundaryConfigs() {
  const out = []
  for (const [scope, feats] of Object.entries(FEATURES)) {
    const names = scope === 'public' ? ['*'] : Object.keys(feats)
    for (const feature of names) {
      const dir = scope === 'public' ? 'src/features/public' : `src/features/${scope}/${feature}`
      const patterns = patternsFor(scope, feature)
      out.push({
        files: [`${dir}/**/*.{js,jsx}`],
        ignores: BASELINE_FILES.filter((f) => f.startsWith(dir + '/') || (scope === 'public' && f.startsWith('src/features/public'))),
        rules: { 'no-restricted-imports': ['error', { patterns }] },
      })
      const base = BASELINE_FILES.filter((f) => f.startsWith(dir + '/'))
      if (base.length) {
        out.push({ files: base, rules: { 'no-restricted-imports': ['warn', { patterns }] } })
      }
    }
  }
  return out
}
