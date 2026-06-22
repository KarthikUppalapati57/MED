/**
 * Utility for generating Zebra Programming Language (ZPL) commands
 * and sending them to networked thermal label printers.
 */

export const generatePrepLabelZPL = ({ itemName, prepDate, useByDate, employeeName }) => {
  // A standard 2x2 label ZPL format
  return `
^XA
^FX Top section with item name
^CF0,40
^FO50,50^FD${itemName}^FS

^FX Dates
^CF0,30
^FO50,120^FDPrep Date: ${prepDate}^FS
^FO50,170^FDUse By: ${useByDate}^FS

^FX Employee Info
^CF0,20
^FO50,230^FDPrepped by: ${employeeName}^FS

^FX Barcode
^BY3,2,50
^FO50,280^BC^FD${itemName.substring(0, 10).toUpperCase().replace(/\s/g, '')}^FS
^XZ
  `.trim();
};

export const sendToNetworkPrinter = async (ipAddress, zplString) => {
  try {
    // In a browser environment, direct raw TCP socket printing to port 9100 isn't possible
    // without a middleware (like a local print agent or specialized web-print API).
    // For demo/MVP, we mock the network transmission.
    console.log(`[PRINT AGENT] Sending to ${ipAddress}:9100...`);
    console.log(zplString);
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 800));
    
    return { success: true, message: 'Label sent to printer successfully' };
  } catch (error) {
    console.error('Print failed:', error);
    return { success: false, error: error.message };
  }
};
