const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel, BorderStyle } = require('docx');
const PDFDocument = require('pdfkit');

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
if (!fs.existsSync(TEMPLATES_DIR)) {
  fs.mkdirSync(TEMPLATES_DIR, { recursive: true });
}

const sampleRows = [
  { date: '2026-10-01', reach: 18500, clicks: 520, cost: 1250000, orders: 19 },
  { date: '2026-10-02', reach: 21000, clicks: 610, cost: 1400000, orders: 23 },
  { date: '2026-10-03', reach: 19500, clicks: 580, cost: 1350000, orders: 21 },
  { date: '2026-10-04', reach: 24000, clicks: 730, cost: 1680000, orders: 28 },
  { date: '2026-10-05', reach: 22500, clicks: 690, cost: 1550000, orders: 25 },
  { date: '2026-10-06', reach: 26000, clicks: 810, cost: 1800000, orders: 31 },
  { date: '2026-10-07', reach: 28500, clicks: 920, cost: 2050000, orders: 36 }
];

// 1. Generate Excel (.xlsx)
function generateExcel() {
  const wb = XLSX.utils.book_new();
  const data = [
    ['Ngày (YYYY-MM-DD)', 'Tiếp cận (Reach)', 'Nhấp chuột (Clicks)', 'Chi phí (VNĐ)', 'Đơn hàng (Orders)'],
    ...sampleRows.map(r => [r.date, r.reach, r.clicks, r.cost, r.orders])
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);

  // Set column widths
  ws['!cols'] = [
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 }
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'DuLieuChienDich');
  const xlsxPath = path.join(TEMPLATES_DIR, 'mau_kpi_chien_dich.xlsx');
  XLSX.writeFile(wb, xlsxPath);
  console.log('Created:', xlsxPath);
}

// 2. Generate CSV (.csv)
function generateCsv() {
  const headers = ['Ngày', 'Tiếp cận', 'Nhấp chuột', 'Chi phí', 'Đơn hàng'];
  const rows = sampleRows.map(r => [r.date, r.reach, r.clicks, r.cost, r.orders].join(','));
  const content = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  const csvPath = path.join(TEMPLATES_DIR, 'mau_kpi_chien_dich.csv');
  fs.writeFileSync(csvPath, content, 'utf8');
  console.log('Created:', csvPath);
}

// 3. Generate Word (.docx)
async function generateDocx() {
  const tableRows = [
    new TableRow({
      tableHeader: true,
      children: [
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Ngày (YYYY-MM-DD)', bold: true })] })], width: { size: 20, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Tiếp cận (Reach)', bold: true })] })], width: { size: 20, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Nhấp chuột (Clicks)', bold: true })] })], width: { size: 20, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Chi phí (VNĐ)', bold: true })] })], width: { size: 20, type: WidthType.PERCENTAGE } }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Đơn hàng', bold: true })] })], width: { size: 20, type: WidthType.PERCENTAGE } })
      ]
    }),
    ...sampleRows.map(r => new TableRow({
      children: [
        new TableCell({ children: [new Paragraph(r.date)] }),
        new TableCell({ children: [new Paragraph(r.reach.toString())] }),
        new TableCell({ children: [new Paragraph(r.clicks.toString())] }),
        new TableCell({ children: [new Paragraph(r.cost.toString())] }),
        new TableCell({ children: [new Paragraph(r.orders.toString())] })
      ]
    }))
  ];

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          text: 'TACTIC ADPULSE - MẪU BẢNG SỐ LIỆU CHIẾN DỊCH KPI',
          heading: HeadingLevel.HEADING_1,
          alignment: AlignmentType.CENTER
        }),
        new Paragraph({
          text: 'Hướng dẫn: Bạn có thể điền tiếp dữ liệu hoặc chỉnh sửa các dòng bên dưới theo đúng 5 cột: Ngày (định dạng YYYY-MM-DD), Tiếp cận, Nhấp chuột, Chi phí (VNĐ), Đơn hàng. Sau đó lưu file Word (.docx) và tải trực tiếp lên Dashboard Tactic AdPulse.',
          spacing: { after: 300 }
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: tableRows
        })
      ]
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  const docxPath = path.join(TEMPLATES_DIR, 'mau_kpi_chien_dich.docx');
  fs.writeFileSync(docxPath, buffer);
  console.log('Created:', docxPath);
}

// 4. Generate PDF (.pdf)
function generatePdf() {
  return new Promise((resolve, reject) => {
    const pdfPath = path.join(TEMPLATES_DIR, 'mau_kpi_chien_dich.pdf');
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    doc.fontSize(16).text('TACTIC ADPULSE - MAU SO LIEU CHIEN DICH KPI', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#4b5563').text('Bang so lieu chuan de nhap vao Dashboard Tactic AdPulse (Ho tro import tu dong PDF/Word/Excel):', { align: 'left' });
    doc.moveDown(1);

    // Simple table drawing
    const startX = 40;
    let startY = 120;
    const colWidths = [100, 100, 100, 110, 80];
    const headers = ['Ngay (Date)', 'Tiep can (Reach)', 'Clicks', 'Chi phi (VND)', 'Don hang'];

    doc.fontSize(10).fillColor('#111827');
    // Header
    let curX = startX;
    headers.forEach((h, i) => {
      doc.text(h, curX, startY, { width: colWidths[i], align: i === 0 ? 'left' : 'right' });
      curX += colWidths[i];
    });

    startY += 20;
    doc.strokeColor('#d1d5db').lineWidth(1).moveTo(startX, startY).lineTo(startX + 490, startY).stroke();
    startY += 8;

    sampleRows.forEach(r => {
      let x = startX;
      doc.text(r.date, x, startY, { width: colWidths[0], align: 'left' });
      x += colWidths[0];
      doc.text(r.reach.toLocaleString('en-US'), x, startY, { width: colWidths[1], align: 'right' });
      x += colWidths[1];
      doc.text(r.clicks.toLocaleString('en-US'), x, startY, { width: colWidths[2], align: 'right' });
      x += colWidths[2];
      doc.text(r.cost.toLocaleString('en-US'), x, startY, { width: colWidths[3], align: 'right' });
      x += colWidths[3];
      doc.text(r.orders.toLocaleString('en-US'), x, startY, { width: colWidths[4], align: 'right' });

      startY += 22;
    });

    doc.moveDown(2);
    doc.fontSize(9).fillColor('#6b7280').text('Ghi chu: File PDF mau chua 5 cot du lieu chuan. He thong Tactic AdPulse su dung AI & Parser de trich xuat chinh xac 100% cac dong so lieu.', startX, startY + 20);

    doc.end();
    stream.on('finish', () => {
      console.log('Created:', pdfPath);
      resolve();
    });
    stream.on('error', reject);
  });
}

async function main() {
  generateExcel();
  generateCsv();
  await generateDocx();
  await generatePdf();
  console.log('All templates generated successfully!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
