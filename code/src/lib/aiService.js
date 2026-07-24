
/**
 * Approved-production AI helper facade.
 *
 * Browser-side Gemini calls are disabled because Google Gemini is not an
 * approved production subprocessor. These helpers provide deterministic local
 * outputs for workflow continuity until each feature is backed by an approved
 * server-side Azure OpenAI Edge Function.
 */

const disabledMessage = 'This AI action is disabled until it is routed through the approved Azure OpenAI backend.';

export async function generateRecipeInsights(recipes = []) {
  const normalized = recipes.map((recipe) => {
    const sellingPrice = Number(recipe.selling_price) || 0;
    const cost = Number(recipe.cost_per_serving) || 0;
    const margin = sellingPrice > 0 ? ((sellingPrice - cost) / sellingPrice) * 100 : 0;
    return { ...recipe, margin };
  });

  const lowMargin = normalized.filter((recipe) => recipe.margin < Number(recipe.target_margin_percent || 0));
  const highMargin = normalized.filter((recipe) => recipe.margin >= Math.max(30, Number(recipe.target_margin_percent || 0))).slice(0, 3);

  return {
    addToMenu: {
      title: 'Add to Menu',
      description: highMargin.length
        ? `High-margin candidates: ${highMargin.map((recipe) => recipe.name).join(', ')}.`
        : 'No high-margin candidates were identified from the current recipe data.',
    },
    marginAlerts: {
      title: 'Margin Alerts',
      description: lowMargin.length
        ? `Review margin drift for ${lowMargin.slice(0, 3).map((recipe) => recipe.name).join(', ')}.`
        : 'No recipes are currently below their target margin based on available fields.',
    },
    remove: {
      title: 'Remove or Audit',
      description: lowMargin.length
        ? 'Audit ingredient costs and menu prices before removing any item.'
        : 'No removal candidates were identified from the current data.',
    },
  };
}

export async function generateVendorCreditRequestEmail(invoice, po, varianceDetails) {
  const vendor = invoice?.vendor_name || 'Vendor';
  const invoiceNumber = invoice?.invoice_number || 'N/A';
  const poNumber = po?.po_number || 'N/A';
  return {
    subject: `Credit memo request for invoice ${invoiceNumber}`,
    body: [
      `Hello ${vendor},`,
      '',
      `We reviewed invoice ${invoiceNumber} against purchase order ${poNumber} and found a variance that needs correction before payment can be finalized.`,
      `Variance amount: $${varianceDetails?.variance_amount ?? 'N/A'}`,
      `Match status: ${varianceDetails?.match_status || 'N/A'}`,
      '',
      'Please review and send a credit memo or corrected invoice when available.',
      '',
      'Thank you,',
      'Restops AP Team',
    ].join('\n'),
  };
}

export async function generateLaborSchedule() {
  return { shifts: [], notice: disabledMessage };
}

export async function generateVendorInsights(vendor, vendorItems = [], recentInvoices = []) {
  const recentTotal = recentInvoices.reduce((sum, invoice) => sum + (Number(invoice.total_amount) || 0), 0);
  const varianceCount = vendorItems.filter((item) => item.price_variance_flag).length;
  return {
    insights: [
      {
        title: 'Recent AP Exposure',
        description: `${vendor?.name || 'This vendor'} has ${recentInvoices.length} recent invoices totaling $${recentTotal.toFixed(2)} in the current view.`,
      },
      {
        title: 'Catalog Review',
        description: varianceCount
          ? `${varianceCount} catalog item(s) are flagged for price variance and should be reviewed.`
          : 'No price variance flags are present in the loaded vendor items.',
      },
    ],
  };
}

export async function chatAboutVendor() {
  return disabledMessage;
}

export async function generateVendorSuggestions(vendors = []) {
  const active = vendors.filter((vendor) => vendor.status === 'active');
  const inactive = vendors.filter((vendor) => vendor.status && vendor.status !== 'active');
  const spendSorted = [...vendors].sort((a, b) => (Number(b.total_spent) || 0) - (Number(a.total_spent) || 0));
  const topVendor = spendSorted[0];

  return {
    suggestions: [
      {
        title: 'Active Vendor Coverage',
        description: `${active.length} active vendor(s) and ${inactive.length} non-active vendor(s) are present in the current list.`,
      },
      {
        title: 'Spend Concentration',
        description: topVendor
          ? `${topVendor.name} has the highest recorded spend in the loaded data. Review concentration risk before renewal or negotiation.`
          : 'No vendor spend data is available for concentration review.',
      },
    ],
  };
}
