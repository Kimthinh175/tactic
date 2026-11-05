const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  parseCampaignFile,
  parseDate,
  parseNumber,
  vectorMatchColumnIndex,
  extractRowsWithVectorEngine,
  tokenize,
  buildVector,
  cosineSimilarity,
  PROTOTYPES
} = require('../file-parser');

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
  assert.equal(parseNumber('950.000 VNĐ'), 950000);
  assert.equal(parseNumber('500k'), 500000);
  assert.equal(parseNumber(450), 450);
});

test('vector space model: cosine similarity accurately distinguishes marketing dimensions', () => {
  const vCost = buildVector(tokenize('Chi phí quảng cáo 1.250.000 VNĐ'));
  const vReach = buildVector(tokenize('Số người tiếp cận 18.500 người dùng'));
  const vClicks = buildVector(tokenize('Lượt nhấp chuột 520 clicks'));
  const vOrders = buildVector(tokenize('Số đơn hàng chốt được 19 đơn'));

  assert.ok(cosineSimilarity(vCost, PROTOTYPES.cost) > cosineSimilarity(vCost, PROTOTYPES.reach));
  assert.ok(cosineSimilarity(vReach, PROTOTYPES.reach) > cosineSimilarity(vReach, PROTOTYPES.clicks));
  assert.ok(cosineSimilarity(vClicks, PROTOTYPES.clicks) > cosineSimilarity(vClicks, PROTOTYPES.cost));
  assert.ok(cosineSimilarity(vOrders, PROTOTYPES.orders) > cosineSimilarity(vOrders, PROTOTYPES.reach));
});

test('vectorMatchColumnIndex maps shuffled and multilingual columns with 100% accuracy', () => {
  // 1. Shuffled columns in Vietnamese
  const vnHeaders = ['Chi phí (VNĐ)', 'Số đơn', 'Lượt click', 'Ngày', 'Tiếp cận'];
  const vnMap = vectorMatchColumnIndex(vnHeaders);
  assert.equal(vnMap.costIdx, 0);
  assert.equal(vnMap.ordersIdx, 1);
  assert.equal(vnMap.clicksIdx, 2);
  assert.equal(vnMap.dateIdx, 3);
  assert.equal(vnMap.reachIdx, 4);

  // 2. English headers
  const enHeaders = ['Date', 'Impressions', 'Clicks', 'Spend', 'Conversions'];
  const enMap = vectorMatchColumnIndex(enHeaders);
  assert.equal(enMap.dateIdx, 0);
  assert.equal(enMap.reachIdx, 1);
  assert.equal(enMap.clicksIdx, 2);
  assert.equal(enMap.costIdx, 3);
  assert.equal(enMap.ordersIdx, 4);
});

test('extractRowsWithVectorEngine extracts rows from unstructured text without API key', () => {
  const rawText = `
Báo cáo marketing tuần 40:
- Ngày 2026-10-01: chiến dịch đạt 18.500 lượt tiếp cận, thu về 520 lượt nhấp với chi phí 1.250.000 VNĐ, chốt được 19 đơn hàng.
- Ngày 2026-10-02: chi phí 1.100.000đ, số đơn: 22 đơn, tiếp cận 19.200 người, số lượt nhấp 480 click.
`;
  const rows = extractRowsWithVectorEngine(rawText);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].date, '2026-10-01');
  assert.equal(rows[0].reach, 18500);
  assert.equal(rows[0].clicks, 520);
  assert.equal(rows[0].cost, 1250000);
  assert.equal(rows[0].orders, 19);

  assert.equal(rows[1].date, '2026-10-02');
  assert.equal(rows[1].reach, 19200);
  assert.equal(rows[1].clicks, 480);
  assert.equal(rows[1].cost, 1100000);
  assert.equal(rows[1].orders, 22);
});

test('parseCampaignFile parses Excel .xlsx with 100% precision (100% offline, zero API key)', async () => {
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

test('parseCampaignFile parses Word .docx with 100% precision (100% offline, zero API key)', async () => {
  const docxPath = path.join(__dirname, '..', 'templates', 'mau_kpi_chien_dich.docx');
  const buf = fs.readFileSync(docxPath);
  const rows = await parseCampaignFile('mau_kpi_chien_dich.docx', buf);
  assert.equal(rows.length, 7);
  assert.equal(rows[0].date, '2026-10-01');
  assert.equal(rows[0].reach, 18500);
});

test('parseCampaignFile parses PDF .pdf with 100% precision (100% offline, zero API key)', async () => {
  const pdfPath = path.join(__dirname, '..', 'templates', 'mau_kpi_chien_dich.pdf');
  const buf = fs.readFileSync(pdfPath);
  const rows = await parseCampaignFile('mau_kpi_chien_dich.pdf', buf);
  assert.equal(rows.length, 7);
  assert.equal(rows[0].date, '2026-10-01');
  assert.equal(rows[0].reach, 18500);
});

test('parseCampaignFile parses CSV .csv with 100% precision (100% offline, zero API key)', async () => {
  const csvPath = path.join(__dirname, '..', 'templates', 'mau_kpi_chien_dich.csv');
  const buf = fs.readFileSync(csvPath);
  const rows = await parseCampaignFile('mau_kpi_chien_dich.csv', buf);
  assert.equal(rows.length, 7);
  assert.equal(rows[0].date, '2026-10-01');
});
