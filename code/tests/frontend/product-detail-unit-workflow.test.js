import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const productDetailPath = path.join(root, 'src/modules/products/pages/ProductDetail.jsx');
const inventoryPath = path.join(root, 'src/modules/inventory/pages/Inventory.jsx');
const source = fs.readFileSync(productDetailPath, 'utf8');
const inventorySource = fs.readFileSync(inventoryPath, 'utf8');

describe('product detail inventory unit workflow', () => {
  it('renders inventory units with package contents for report units', () => {
    expect(source).toContain('function buildInventoryUnitLabel(form)');
    expect(source).toContain('function getInitialPackageReportUnit(product, ...packageLabels)');
    expect(source).toContain('function inferPackageUnitFromText(...values)');
    expect(source).not.toContain('function getFallbackPackageUnit()');
    expect(source).not.toContain('PACKAGE_UNIT_OPTIONS[0]');
    expect(source).toContain('buildMasterUnitLabel(reportUnit, form.report_unit_quantity || 1, form.base_unit || reportUnit)');
    expect(source).toContain('buildMasterUnitLabel(packageReportUnit, sourcePackage.quantity, sourcePackage.unit)');
    expect(source).toContain('{inventoryDisplayUnit || item.current_unit || form.base_unit || \'Each\'}');
  });

  it('defaults add-unit counting to the package instead of the inner contents unit', () => {
    expect(source).toContain('targetUnit: packageReportUnit,');
    expect(source).toContain("targetUnit: getProductUnitDefinition(nextForm.report_by_unit).family === 'package'");
    expect(source).not.toContain('targetUnit: current.targetUnit || parsed.unit');
    expect(source).not.toContain('targetUnit: parsed.unit,');
    expect(source).not.toContain("|| 'Case'");
  });

  it('lets users choose the package type instead of relying on a silent case fallback', () => {
    expect(source).toContain('<Label>Package type</Label>');
    expect(source).toContain('setPackageReportUnit(value)');
    expect(source).toContain('PACKAGE_UNIT_OPTIONS.map');
    expect(source).toContain('inferPackageUnitFromText(value)');
    expect(source).toContain('SelectValue placeholder="Select package type"');
    expect(source).toContain('SelectValue placeholder="Select count unit"');
    expect(source).toContain("toast.error('Select a count unit or package type before adding this unit')");
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

  it('shows contents-aware labels in inventory count-sheet selectors', () => {
    expect(inventorySource).toContain('function buildCountUnitDisplayLabel(unit = {})');
    expect(inventorySource).toContain('getProductUnitDefinition(packageUnit).family');
    expect(inventorySource).toContain('buildCountUnitDisplayLabel(unit)');
    expect(inventorySource).toContain('countUnitName: label');
  });
});
