import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('Invoice Upload and Approval Flow', async ({ page }) => {
  test.setTimeout(60000); // 1 minute timeout

  // 1. Navigate to the app
  console.log('Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173');

  // Wait for login to complete (assuming auto-login or session exists)
  await page.waitForTimeout(3000); // Wait for potential auth redirects

  // 2. Go to Invoices page
  console.log('Navigating to Invoices page...');
  await page.goto('http://localhost:5173/Invoices');
  await page.waitForSelector('text="Upload Invoice"', { state: 'visible', timeout: 10000 });

  // 3. Click Upload Invoice
  console.log('Clicking Upload Invoice button...');
  await page.click('text="Upload Invoice"');

  // Wait for the modal and specifically the file input
  console.log('Waiting for file input...');
  const fileInput = await page.waitForSelector('input[type="file"]', { state: 'attached' });

  // 4. Upload the file
  console.log('Uploading usfoods.pdf...');
  const filePath = path.join(__dirname, 'usfoods.pdf');
  await fileInput.setInputFiles(filePath);

  // 5. Wait for extraction (usually takes 5-10 seconds)
  console.log('Waiting for extraction to finish...');
  await page.waitForSelector('text="US Foods, Inc."', { state: 'visible', timeout: 20000 });
  await page.waitForSelector('text="1319040"', { state: 'visible', timeout: 5000 });

  // 6. Click Validate
  console.log('Clicking Validate button...');
  await page.click('button:has-text("Validate")');

  // 7. Wait for validation success and click Continue to Approval / Approve
  console.log('Waiting for validation success...');
  await page.waitForSelector('text="Continue to Approval"', { state: 'visible', timeout: 10000 }).catch(() => null);
  
  const continueBtn = await page.$('button:has-text("Continue to Approval")');
  if (continueBtn) {
    console.log('Clicking Continue to Approval...');
    await continueBtn.click();
    await page.waitForTimeout(1000);
  }

  // 8. Click Final Approve
  console.log('Clicking Approve button...');
  await page.click('button:has-text("Approve Invoice")');

  // 9. Verify success (modal closes, toast appears, or invoice in list)
  console.log('Verifying success...');
  await page.waitForTimeout(3000); // Wait for DB and UI update
  
  // Check if modal is closed
  const approveBtnVisible = await page.isVisible('button:has-text("Approve Invoice")');
  if (approveBtnVisible) {
    console.error('❌ ERROR: Approve modal is still open. Approval failed.');
    
    // Check for toast errors
    const toasts = await page.$$eval('.go3958317564', els => els.map(e => e.textContent)); // Sonner toast class
    console.log('Toasts found:', toasts);
    
    throw new Error('Approval failed. Modal did not close.');
  }

  console.log('✅ Success! Invoice approved.');
  
  // Check if invoice is in the table
  const invoiceCount = await page.locator('table tbody tr').count();
  console.log(`Found ${invoiceCount} invoices in the table.`);
  
  if (invoiceCount > 0) {
    const firstRowText = await page.locator('table tbody tr').first().innerText();
    console.log('First row:', firstRowText);
    expect(firstRowText).toContain('US Foods, Inc.');
  } else {
    console.warn('⚠️ Invoice table is empty, but modal closed successfully.');
  }
});
