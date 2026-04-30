/**
 * Restaurant Chart of Accounts (COA) Configuration
 * Based on standard hospitality auditing practices.
 */

export const ACCOUNTING_GROUPS = {
  ASSETS: {
    range: [1000, 1999],
    label: 'Assets (Balance Sheet)',
    color: 'sky'
  },
  LIABILITIES: {
    range: [2000, 2999],
    label: 'Liabilities',
    color: 'rose'
  },
  EQUITY: {
    range: [3000, 3999],
    label: 'Equity',
    color: 'violet'
  },
  REVENUE: {
    range: [4000, 4999],
    label: 'Income / Revenue',
    color: 'emerald'
  },
  COGS: {
    range: [5000, 5999],
    label: 'Cost of Goods Sold',
    color: 'orange'
  },
  EXPENSES: {
    range: [6000, 7999],
    label: 'Expenses',
    color: 'slate'
  }
};

export const CHART_OF_ACCOUNTS = {
  // --- INVENTORY ASSETS ---
  INVENTORY: {
    code: '1200',
    label: 'Inventory',
    group: 'ASSETS',
    subAccounts: {
      FOOD: { code: '1210', label: 'Food Inventory' },
      BEVERAGE: { code: '1220', label: 'Beverage Inventory' },
      BAR_CONSUMABLE: { code: '1230', label: 'Bar & Consumable Inventory' }
    }
  },

  // --- COST OF GOODS SOLD ---
  FOOD_COST: {
    code: '5100',
    label: 'Food Cost',
    group: 'COGS',
    subAccounts: {
      MEAT: { code: '5110', label: 'Meat Cost' },
      POULTRY: { code: '5120', label: 'Poultry Cost' },
      SEAFOOD: { code: '5130', label: 'Seafood Cost' },
      DAIRY: { code: '5140', label: 'Dairy Cost' },
      PRODUCE: { code: '5150', label: 'Produce Cost' },
      FROZEN: { code: '5160', label: 'Frozen Cost' },
      GROCERY: { code: '5170', label: 'Grocery Cost' },
      CHANGE_IN_INV: { code: '5190', label: 'Change in Food Inventory' }
    }
  },
  BEVERAGE_COST: {
    code: '5200',
    label: 'Beverage Cost',
    group: 'COGS',
    subAccounts: {
      NON_ALCOHOLIC: { code: '5210', label: 'N/A Beverage Cost' },
      LIQUOR: { code: '5220', label: 'Liquor Cost' },
      BEER: { code: '5230', label: 'Beer Cost' },
      WINE: { code: '5240', label: 'Wine Cost' },
      CHANGE_IN_INV: { code: '5290', label: 'Change in Beverage Inventory' }
    }
  },
  MERCHANDISE_COST: {
    code: '5300',
    label: 'Merchandise Cost',
    group: 'COGS'
  }
};

/**
 * Flattens the COA for use in select components
 */
export const getFlattenedCOA = () => {
  const flattened = [];
  Object.values(CHART_OF_ACCOUNTS).forEach(account => {
    // Add the main account
    flattened.push({
      code: account.code,
      label: account.label,
      group: account.group,
      isHeader: true
    });

    // Add sub-accounts if they exist
    if (account.subAccounts) {
      Object.values(account.subAccounts).forEach(sub => {
        flattened.push({
          code: sub.code,
          label: sub.label,
          group: account.group,
          isHeader: false
        });
      });
    }
  });
  return flattened;
};

export const getCOALabel = (code) => {
  const flattened = getFlattenedCOA();
  const found = flattened.find(item => item.code === code);
  return found ? `${found.code} - ${found.label}` : code;
};
