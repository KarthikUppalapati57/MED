// Payout-initiation adapter for Checkbook.io. One API (POST /v3/check) issues either a digital
// check (emailed) or a physical mailed check -- payoutMethod picks the payload shape. Stateless
// per-check, no persisted customer/funding-source object like account-based payout rails have.

export const refColumn = 'checkbook_check_id'

// Checkbook has nothing to check before release_invoice_funds runs (no persisted destination to
// validate) -- vendor-info validation happens in initiate() instead, same as it always has, so it
// goes through the same revert-on-failure path as an actual API failure.
export async function preflight(_ctx: any) {
  return {}
}

export async function initiate(ctx: any) {
  const vendor = ctx.vendor
  if (!vendor?.name) {
    throw new Error('Missing Vendor Information.')
  }
  if (ctx.payoutMethod === 'checkbook_digital' && !vendor.email) {
    throw new Error('Vendor email is required for Digital Checks.')
  }
  if (ctx.payoutMethod === 'checkbook_physical' && (!vendor.mailing_address_line1 || !vendor.mailing_city || !vendor.mailing_state || !vendor.mailing_zip_code)) {
    throw new Error('Vendor mailing address is required for Physical Checks.')
  }

  const checkbookEnv = (Deno.env.get('CHECKBOOK_ENV') || 'sandbox').toLowerCase()
  const checkbookBaseUrl = Deno.env.get('CHECKBOOK_BASE_URL')
    || (checkbookEnv === 'production'
      ? 'https://api.checkbook.io'
      : checkbookEnv === 'demo'
        ? 'https://demo.checkbook.io'
        : 'https://api.sandbox.checkbook.io')
  const checkbookUrl = `${checkbookBaseUrl.replace(/\/$/, '')}/v3/check`

  const apiKey = Deno.env.get('CHECKBOOK_API_KEY')
  const apiSecret = Deno.env.get('CHECKBOOK_API_SECRET')
  if (!apiKey || !apiSecret) {
    throw new Error('Checkbook.io credentials not configured')
  }

  const checkPayload: any = {
    name: vendor.name,
    amount: Number(ctx.transferAmount.toFixed(2)),
    description: `Payment for Invoice ${ctx.invoiceNumber}`,
  }

  if (ctx.payoutMethod === 'checkbook_physical') {
    checkPayload.recipient_address = {
      line_1: vendor.mailing_address_line1,
      line_2: '',
      city: vendor.mailing_city,
      state: vendor.mailing_state,
      zip: vendor.mailing_zip_code,
    }
  } else {
    checkPayload.recipient = vendor.email
  }

  const checkbookResponse = await fetch(checkbookUrl, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `${apiKey}:${apiSecret}`,
    },
    body: JSON.stringify(checkPayload),
  })

  const checkData = await checkbookResponse.json()

  if (!checkbookResponse.ok) {
    console.error('Checkbook.io Error:', checkData)
    throw new Error(checkData.error || 'Failed to issue check via Checkbook.io')
  }

  return { providerRef: checkData.id }
}
