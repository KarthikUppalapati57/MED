import { chromium } from 'playwright';
import path from 'path';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    console.log('Navigating to login as Ground Staff...');
    await page.goto('http://localhost:5173/login');
    
    // Login as ground staff
    await page.fill('input[type="email"]', 'qa.staff.northfork@restops.test');
    await page.fill('input[type="password"]', 'your_qa_account_password');
    await page.click('button:has-text("Sign In")');
    await page.waitForTimeout(5000); 
    
    console.log('Navigating to Invoices...');
    await page.goto('http://localhost:5173/invoices');
    await page.waitForTimeout(5000);
    
    console.log('Opening upload modal...');
    await page.locator('button:has-text("Upload")').first().click({ force: true });
    await page.waitForTimeout(1000);
    
    console.log('Uploading file...');
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('text=Select File');
    const fileChooser = await fileChooserPromise;
    const filePath = 'c:\\Users\\ukart\\OneDrive - University of Tennessee\\M\\INtern\\MECURSOR\\MEVS\\invoices\\usfoods.pdf';
    await fileChooser.setFiles(filePath);
    
    console.log('Waiting for AI extraction... (this may take up to 30 seconds)');
    await page.waitForSelector('text=Vendor Item ID', { timeout: 45000 });
    await page.waitForTimeout(2000);
    
    console.log('Taking screenshot of extraction...');
    await page.screenshot({ path: 'C:\\Users\\ukart\\.gemini\\antigravity-ide\\brain\\6aa682d6-407c-45ab-b5ee-00cf61db9d02\\artifacts\\invoice_extraction_result.png', fullPage: true });
    
    console.log('Saving invoice...');
    await page.click('button:has-text("Save")');
    await page.waitForTimeout(4000); 
    
    console.log('Logging out...');
    await page.evaluate(() => localStorage.clear());
    await page.context().clearCookies();
    await page.goto('http://localhost:5173/login');
    await page.waitForTimeout(2000);

    console.log('Logging in as Manager...');
    await page.fill('input[type="email"]', 'qa.location.northfork@restops.test');
    await page.fill('input[type="password"]', 'your_qa_account_password');
    await page.click('button:has-text("Sign In")');
    await page.waitForTimeout(5000);
    
    console.log('Navigating to Invoices as Manager...');
    await page.goto('http://localhost:5173/invoices');
    await page.waitForTimeout(5000);

    console.log('Opening the first invoice to review...');
    // The table might be empty if filter is wrong, let's wait
    await page.waitForSelector('tbody tr', { timeout: 15000 });
    await page.click('tbody tr:first-child');
    await page.waitForTimeout(3000); 
    
    console.log('Clicking Validate...');
    await page.click('button:has-text("Validate")');
    await page.waitForTimeout(2000); 
    
    console.log('Taking screenshot of Validation Dialog...');
    await page.screenshot({ path: 'C:\\Users\\ukart\\.gemini\\antigravity-ide\\brain\\6aa682d6-407c-45ab-b5ee-00cf61db9d02\\artifacts\\invoice_validation_dialog.png', fullPage: true });

    console.log('Clicking Continue to Approval...');
    const continueBtn = await page.$('button:has-text("Continue to Approval")');
    if (continueBtn) {
        await continueBtn.click();
    } else {
        const forceBtn = await page.$('button:has-text("Force Validate")');
        if (forceBtn) await forceBtn.click();
    }
    await page.waitForTimeout(1000);

    console.log('Clicking Approve Invoice...');
    await page.click('button:has-text("Approve Invoice")');
    await page.waitForTimeout(3000);
    
    console.log('Taking final screenshot...');
    await page.screenshot({ path: 'C:\\Users\\ukart\\.gemini\\antigravity-ide\\brain\\6aa682d6-407c-45ab-b5ee-00cf61db9d02\\artifacts\\invoice_final_approval.png', fullPage: true });
    
    console.log('Success! Saved and Approved invoice.');
  } catch (err) {
    console.error('Error during testing:', err);
    await page.screenshot({ path: 'C:\\Users\\ukart\\.gemini\\antigravity-ide\\brain\\6aa682d6-407c-45ab-b5ee-00cf61db9d02\\artifacts\\invoice_error.png', fullPage: true });
  } finally {
    await browser.close();
  }
})();
