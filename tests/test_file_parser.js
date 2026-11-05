const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { parseCampaignFile } = require('../file-parser');

async function runTests() {
  console.log('--- Testing File Parser ---');

  // 1. Test Excel .xlsx
  const xlsxPath = path.join(__dirname, '..', 'templates', 'mau_kpi_chien_dich.xlsx');
  const xlsxBuf = fs.readFileSync(xlsxPath);
  const xlsxRows = await parseCampaignFile('mau_kpi_chien_dich.xlsx', xlsxBuf);
  console.log(`Excel parsed ${xlsxRows.length} rows:`, xlsxRows[0]);
  assert.strictEqual(xlsxRows.length, 7, 'Excel should have 7 rows');
  assert.strictEqual(xlsxRows[0].date, '2026-10-01');
  assert.strictEqual(xlsxRows[0].reach, 18500);
  assert.strictEqual(xlsxRows[0].clicks, 520);
  assert.strictEqual(xlsxRows[0].cost, 1250000);
  assert.strictEqual(xlsxRows[0].orders, 19);

  // 2. Test CSV .csv
  const csvPath = path.join(__dirname, '..', 'templates', 'mau_kpi_chien_dich.csv');
  const csvBuf = fs.readFileSync(csvPath);
  const csvRows = await parseCampaignFile('mau_kpi_chien_dich.csv', csvBuf);
  console.log(`CSV parsed ${csvRows.length} rows:`, csvRows[0]);
  assert.strictEqual(csvRows.length, 7, 'CSV should have 7 rows');
  assert.strictEqual(csvRows[0].date, '2026-10-01');

  // 3. Test Word .docx
  const docxPath = path.join(__dirname, '..', 'templates', 'mau_kpi_chien_dich.docx');
  const docxBuf = fs.readFileSync(docxPath);
  const docxRows = await parseCampaignFile('mau_kpi_chien_dich.docx', docxBuf);
  console.log(`Word parsed ${docxRows.length} rows:`, docxRows[0]);
  assert.strictEqual(docxRows.length, 7, 'Word should have 7 rows');
  assert.strictEqual(docxRows[0].date, '2026-10-01');
  assert.strictEqual(docxRows[0].reach, 18500);

  // 4. Test PDF .pdf
  const pdfPath = path.join(__dirname, '..', 'templates', 'mau_kpi_chien_dich.pdf');
  const pdfBuf = fs.readFileSync(pdfPath);
  const pdfRows = await parseCampaignFile('mau_kpi_chien_dich.pdf', pdfBuf);
  console.log(`PDF parsed ${pdfRows.length} rows:`, pdfRows[0]);
  assert.strictEqual(pdfRows.length, 7, 'PDF should have 7 rows');
  assert.strictEqual(pdfRows[0].date, '2026-10-01');
  assert.strictEqual(pdfRows[0].reach, 18500);

  console.log('✅ All 4 template format parsing tests passed with 100% precision!');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
