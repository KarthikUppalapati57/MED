import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const productDetailPath = path.join(root, 'src/modules/products/pages/ProductDetail.jsx');
const source = fs.readFileSync(productDetailPath, 'utf8');

describe('product detail inventory unit workflow', () => {
  it('renders inventory units with package contents for report units', () => {
    expect(source).toContain('function buildInventoryUnitLabel(form)');
    expect(source).toContain('function getInitialPackageReportUnit(product)');
    expect(source).toContain("getProductUnitDefinition(reportUnit).family === 'package' ? reportUnit : 'Case'");
    expect(source).toContain('buildMasterUnitLabel(reportUnit, form.report_unit_quantity || 1, form.base_unit || reportUnit)');
    expect(source).toContain('buildMasterUnitLabel(packageReportUnit, sourcePackage.quantity, sourcePackage.unit)');
    expect(source).toContain('{inventoryDisplayUnit || item.current_unit || form.base_unit || \'Each\'}');
  });

  it('defaults add-unit counting to the package instead of the inner contents unit', () => {
    expect(source).toContain("targetUnit: packageReportUnit || 'Case'");
    expect(source).toContain("targetUnit: getProductUnitDefinition(nextForm.report_by_unit).family === 'package'");
    expect(source).not.toContain('targetUnit: current.targetUnit || parsed.unit');
    expect(source).not.toContain('targetUnit: parsed.unit,');
  });

  it('shows package count units with their contents in the saved table and preview', () => {
    expect(source).toContain('function buildCountUnitLabel({ quantity, unit, sourceQuantity, sourceUnit })');
    expect(source).toContain('return `${label} (${formatQuantity(sourceAmount)} ${compactUnitLabel(sourceUnit)})`;');
    expect(source).toContain('<TableCell>{buildCountUnitLabel(row)}</TableCell>');
  });

  it('syncs inventory using the package-aware unit before the base contents unit', () => {
    expect(source).toContain('const inventorySyncUnit = sourcePackage.quantity > 1 && packageReportUnit');
    expect(source).toContain('current_unit: inventorySyncUnit');
    expect(source).toContain('report_by: inventorySyncUnit');
    expect(source).not.toContain('current_unit: form.base_unit || form.report_by_unit || \'Each\'');
  });

  it('refreshes product, inventory, and count-unit caches after count-unit changes', () => {
    const countUnitMutationIndex = source.indexOf('const countUnitMutation = useMutation');
    const removeCountUnitMutationIndex = source.indexOf('const removeCountUnitMutation = useMutation');
    const countUnitBlock = source.slice(countUnitMutationIndex, removeCountUnitMutationIndex);
    const removeBlock = source.slice(removeCountUnitMutationIndex, source.indexOf('const updateCategory', removeCountUnitMutationIndex));

    for (const block of [countUnitBlock, removeBlock]) {
      expect(block).toContain("['product-detail-count-units', product?.id]");
      expect(block).toContain("['product-detail-inventory', product?.id, product?.product_id]");
      expect(block).toContain("['count-sheet-draft-count-units']");
      expect(block).toContain("['products']");
      expect(block).toContain("['inventory']");
      expect(block).toContain("['inventoryMetrics']");
    }
  });

  it('resets the add-unit draft whenever the dialog opens or closes', () => {
    expect(source).toContain('const resetUnitDraft = () =>');
    expect(source).toContain('onOpenChange={(open) => {');
    expect(source).toContain('resetUnitDraft();');
  });
});
