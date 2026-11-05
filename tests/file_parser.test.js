const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseCampaignFile, parseDate, parseNumber } = require('../file-parser');

test('parseDate handles ISO, VN formats, Excel serials and dates correctly', () => {
  assert.equal(parseDate('2026-10-01'), '2026-10-01');
  assert.equal(parseDate('01/10/2026'), '2026-10-01');
  assert.equal(parseDate('2026/10/01'), '2026-10-01');
  assert.equal(parseDate(new Date(2026, 9, 1)), '2026-10-01');
});

test('parseNumber handles dots, commas, currency strings', () => {
  assert.equal(parseNumber('1.250.000'), 1250000);
  assert.equal(parseNumber('1,250,000'), 1250000);
  assert.equal(parseNumber('1.500.000 đ'), 1500000);
  assert.equal(parseNumber(450), 450);
});

test('parseCampaignFile parses Excel .xlsx with 100% precision', async () => {
  const xlsxPath = path.join(__dirname, '..', 'templates', 'mau_kpi_chien_dich.xlsx');
  const buf = fs.readFileSync(xlsxPath);
  const rows = await parseCampaignFile('mau_kpi_chien_dich.xlsx', buf);
  assert.equal(rows.length, 7);
  assert.equal(rows[0].date, '2026-10-01');
  assert.equal(rows[0].reach, 18500);
  assert.equal(rows[0].clicks, 520);
  assert.equal(rows[0].cost, 1250000);
  assert.equal(rows[0].orders, 19);
});

test('parseCampaignFile parses Word .docx with 100% precision', async () => {
  const docxPath = path.join(__dirname, '..', 'templates', 'mau_kpi_chien_dich.docx');
  const buf = fs.readFileSync(docxPath);
  const rows = await parseCampaignFile('mau_kpi_chien_dich.docx', buf);
  assert.equal(rows.length, 7);
  assert.equal(rows[0].date, '2026-10-01');
  assert.equal(rows[0].reach, 18500);
});

test('parseCampaignFile parses PDF .pdf with 100% precision', async () => {
  const pdfPath = path.join(__dirname, '..', 'templates', 'mau_kpi_chien_dich.pdf');
  const buf = fs.readFileSync(pdfPath);
  const rows = await parseCampaignFile('mau_kpi_chien_dich.pdf', buf);
  assert.equal(rows.length, 7);
  assert.equal(rows[0].date, '2026-10-01');
  assert.equal(rows[0].reach, 18500);
});

test('parseCampaignFile parses CSV .csv with 100% precision', async () => {
  const csvPath = path.join(__dirname, '..', 'templates', 'mau_kpi_chien_dich.csv');
  const buf = fs.readFileSync(csvPath);
  const rows = await parseCampaignFile('mau_kpi_chien_dich.csv', buf);
  assert.equal(rows.length, 7);
  assert.equal(rows[0].date, '2026-10-01');
});
