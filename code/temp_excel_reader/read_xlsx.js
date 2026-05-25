const XLSX = require('xlsx');
const path = require('path');

const filePath = path.resolve('c:/Users/ukart/OneDrive - University of Tennessee/M/INtern/MECURSOR/issues-1.xlsx');
console.log('Reading from path:', filePath);

const workbook = XLSX.readFile(filePath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(worksheet);

console.log(JSON.stringify(data, null, 2));
