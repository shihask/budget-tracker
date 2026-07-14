// Step 1a/1b of the AA Discovery Spike — creates a consent request against
// the Setu sandbox and prints the hosted consent URL. Have 02-webhook-server.mjs
// running first so the resulting CONSENT_STATUS_UPDATE notification is caught.
//
// Body shape verified live against docs.setu.co's product-specific "Create
// consent" v2 reference (POST /v2/consents) on 2026-07-13 — do not trust the
// older unversioned /consents docs, they're for a different (legacy) route.
//
// Usage: npm run aa:consent

import { setuRequest } from './lib/setu-client.mjs'

const { AA_TEST_VUA, AA_REDIRECT_URL } = process.env
if (!AA_TEST_VUA) {
  console.error('Missing AA_TEST_VUA — set it to a sandbox test account handle, e.g. 9999999999@setu-fiu-sandbox (see .env.aa.example)')
  process.exit(1)
}
if (!AA_REDIRECT_URL) {
  console.error('Missing AA_REDIRECT_URL — set it to the same tunnel URL registered as Redirect URL in Bridge (see .env.aa.example)')
  process.exit(1)
}

async function main() {
  const to = new Date()
  const from = new Date(to)
  from.setMonth(from.getMonth() - 12)

  const consent = await setuRequest('POST', '/v2/consents', {
    vua: AA_TEST_VUA,
    dataRange: {
      from: from.toISOString(),
      to: to.toISOString(),
    },
    consentDuration: { unit: 'MONTH', value: 12 },
    // Must be 0 for VIEW/STREAM/QUERY consent modes — Setu rejects anything
    // else with "Data life value must be 0 for consent mode".
    dataLife: { unit: 'MONTH', value: 0 },
    fetchType: 'ONETIME',
    consentMode: 'VIEW',
    consentTypes: ['PROFILE', 'SUMMARY', 'TRANSACTIONS'],
    fiTypes: ['DEPOSIT'],
    purpose: {
      code: '102',
      text: 'Customer spending and budget analysis',
      category: { type: 'Personal Finance' },
      refUri: 'https://api.rebit.org.in/aa/purpose/102.xml',
    },
    redirectUrl: AA_REDIRECT_URL,
  })

  console.log('Consent created:', consent.id)
  console.log('Status:', consent.status)
  console.log('\nOpen this URL to approve as the sandbox test user:')
  console.log(consent.url)
  console.log('\nWaiting for a CONSENT_STATUS_UPDATE webhook (see the aa:webhook terminal) to confirm ACTIVE.')
  console.log(`Once ACTIVE, run: npm run aa:fetch -- ${consent.id}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
