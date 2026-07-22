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
    const printAgentUrl = import.meta.env.VITE_PRINT_AGENT_URL;
    if (!printAgentUrl) {
      return {
        success: false,
        error: 'Print agent is not configured. Set VITE_PRINT_AGENT_URL to enable network label printing.'
      };
    }

    const response = await fetch(`${printAgentUrl.replace(/\/$/, '')}/print/zpl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ipAddress, port: 9100, zpl: zplString })
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(body || `Print agent returned ${response.status}`);
    }

    return { success: true, message: 'Label sent to printer successfully' };
  } catch (error) {
    console.error('Print failed:', error);
    return { success: false, error: error.message };
  }
};