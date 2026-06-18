import Papa from 'papaparse';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Export an array of objects to CSV and trigger a download.
 * @param {Array<Object>} data The data to export
 * @param {String} filename The output filename (without .csv)
 */
export function exportToCSV(data, filename) {
  if (!data || data.length === 0) return;
  const csv = Papa.unparse(data);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

/**
 * Export table data to a PDF and trigger a download.
 * @param {Array<Object>} columns The columns for autotable [{header: 'Name', dataKey: 'name'}]
 * @param {Array<Object>} data The data rows matching dataKeys
 * @param {String} title The title written at the top of the PDF
 * @param {String} filename The output filename (with .pdf)
 */
export function exportToPDF(columns, data, title, filename) {
  if (!data || data.length === 0) return;
  const doc = new jsPDF();
  
  // Title
  doc.setFontSize(18);
  doc.text(title, 14, 22);
  
  // Timestamp
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 30);

  autoTable(doc, {
    startY: 36,
    columns: columns,
    body: data,
    headStyles: { fillColor: [244, 63, 94] }, // Brand color or slate
    styles: { fontSize: 9 },
    alternateRowStyles: { fillColor: [248, 250, 252] }, // Slate 50
  });

  doc.save(filename);
}
