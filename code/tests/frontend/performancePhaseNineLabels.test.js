import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.resolve(root, relativePath), 'utf8');

const sources = {
  category: read('src/modules/performance/tabs/CategoryReport/CategoryReportPage.jsx'),
  usage: read('src/modules/performance/tabs/UsageReport/UsageReportPage.jsx'),
  priceMovers: read('src/modules/performance/tabs/PriceMovers/PriceMoversPage.jsx'),
  recipes: read('src/modules/performance/tabs/InventoryRecipes/InventoryRecipesPage.jsx'),
  overview: read('src/modules/performance/components/PhaseOneOverview.jsx'),
  performance: read('src/modules/performance/pages/Performance.jsx'),
};

const combined = Object.values(sources).join('\n');

describe('Phase 9 Performance labels and disclosures', () => {
  it('labels invoice counts as allocated-spend contributors', () => {
    expect(sources.category).toContain('invoices contributing allocated spend');
    expect(sources.overview).toContain('invoices contributing allocated spend');
    expect(combined).not.toContain('categorized invoices');
  });

  it('keeps payment attempt exposure separate from invoice obligations', () => {
    expect(sources.overview).toContain('Separate payment status exposure');
    expect(sources.overview).toContain('Invoice obligations and payment attempts are displayed separately');
    expect(sources.overview).toContain('scheduled, processing, failed, cancelled, or refunded payment attempts');
    expect(sources.performance).toContain('Separate payment status exposure');
    expect(combined).not.toContain('open payment exposure');
    expect(combined).not.toContain('Partially paid invoices');
  });

  it('marks current-state inventory and recipe metrics explicitly', () => {
    expect(sources.usage).toContain('Current Inventory Value (Current State)');
    expect(sources.usage).toContain('current inventory value remains current-state');
    expect(sources.recipes).toContain('Median current recipe margin');
    expect(sources.recipes).toContain('Average current recipe cost');
    expect(sources.recipes).toContain('current-state recipe margin pressure');
    expect(sources.overview).toContain('current-state value');
    expect(sources.overview).toContain('current avg margin');
  });

  it('describes price impact with its normalized quantity basis', () => {
    expect(sources.priceMovers).toContain('unit price difference x normalized purchased quantity = estimated impact');
    expect(sources.priceMovers).toContain('normalized quantity basis');
    expect(sources.priceMovers).toContain('Impact basis');
  });

  it('distinguishes loaded, empty, partial, and failed data states', () => {
    expect(sources.overview).toContain('Source loaded successfully; empty and failed sources are shown separately.');
    expect(sources.usage).toContain('Source empty: no inventory rows');
    expect(sources.usage).toContain('Source partially complete');
    expect(sources.recipes).toContain('Source partially complete: recipe margin coverage is partial');
    expect(sources.recipes).toContain('not failed or complete');
    expect(combined).not.toContain('No data-quality gaps');
  });
});