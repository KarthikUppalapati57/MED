import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { preparePriceMoverRows } from '@/modules/performance/services/spendProductsCalculations';

const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260727070000_expose_price_mover_impact_evidence.sql'
);

describe('Phase 7 price impact evidence', () => {
  it('exposes normalized quantity evidence from the price movers report migration', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    expect(sql).toContain("'normalizedPurchasedQuantity'");
    expect(sql).toContain("'normalizedQuantityUnit'");
    expect(sql).toContain("'unitPriceDifference'");
    expect(sql).toContain("'mappingConfidence'");
    expect(sql).toContain("'impactFormula', 'unitPriceDifference * normalizedPurchasedQuantity'");
    expect(sql).toContain('c.current_qty IS NULL OR c.current_qty = 0');
    expect(sql).toContain('REVOKE EXECUTE ON FUNCTION public.get_price_movers_report');
  });

  it('keeps each impact component available for verified comparable rows', () => {
    const [row] = preparePriceMoverRows([
      {
        product: 'Chicken Breast',
        currentPrice: 12,
        previousPrice: 10,
        estimatedImpact: 40,
        normalizedPurchasedQuantity: 20,
        normalizedQuantityUnit: 'Pound',
        unitPriceDifference: 2,
        mappingStatus: 'verified',
        mappingConfidence: 'verified',
        impactEvidenceComplete: true,
        comparabilityStatus: 'comparable',
      },
    ]);

    expect(row).toMatchObject({
      estimatedImpact: 40,
      normalizedPurchasedQuantity: 20,
      normalizedQuantityUnit: 'Pound',
      currentWeightedUnitPrice: 12,
      comparisonWeightedUnitPrice: 10,
      unitPriceDifference: 2,
      impactReliable: true,
      confidence: 'complete',
    });
  });

  it('does not treat unverified unit mappings as complete impact evidence', () => {
    const [row] = preparePriceMoverRows([
      {
        product: 'Mapped but unverified',
        currentPrice: 12,
        previousPrice: 10,
        estimatedImpact: 40,
        normalizedPurchasedQuantity: 20,
        normalizedQuantityUnit: 'Pound',
        unitPriceDifference: 2,
        mappingStatus: 'mapped',
        mappingConfidence: 'mapped_unverified',
        impactEvidenceComplete: false,
        comparabilityStatus: 'comparable',
      },
    ]);

    expect(row.estimatedImpact).toBe(40);
    expect(row.impactReliable).toBe(false);
    expect(row.impactEvidenceComplete).toBe(false);
    expect(row.confidence).toBe('unit_mapping_unverified');
  });
});