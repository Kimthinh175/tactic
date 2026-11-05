const XLSX = require('xlsx');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const { isValidRow } = require('./analysis');

function normalizeStr(str) {
  if (!str) return '';
  return str
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function parseNumber(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return isFinite(val) ? val : null;
  let str = val.toString().trim().replace(/[^\d.,-]/g, '');
  if (!str) return null;

  // Handle Vietnamese/European thousands separator: 1.250.000 or 1.250.000,50
  if (str.includes('.') && str.includes(',')) {
    if (str.indexOf('.') < str.indexOf(',')) {
      // 1.250.000,50
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      // 1,250,000.50
      str = str.replace(/,/g, '');
    }
  } else if (str.includes('.')) {
    // If multiple dots, or dot followed by exactly 3 digits at end -> thousand separator
    if ((str.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(str)) {
      str = str.replace(/\./g, '');
    }
  } else if (str.includes(',')) {
    if ((str.match(/,/g) || []).length > 1 || /,\d{3}$/.test(str)) {
      str = str.replace(/,/g, '');
    } else {
      str = str.replace(',', '.');
    }
  }
  const n = parseFloat(str);
  return isFinite(n) ? n : null;
}

function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val)) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof val === 'number') {
    // Excel serial date (e.g. 45566 = 2024-09-30)
    try {
      const parsed = XLSX.SSF.parse_date_code(val);
      if (parsed) {
        const y = parsed.y;
        const m = String(parsed.m).padStart(2, '0');
        const d = String(parsed.d).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    } catch {}
  }
  const str = val.toString().trim();

  // Match YYYY-MM-DD or YYYY/MM/DD
  const mIso = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (mIso) {
    const y = mIso[1];
    const m = mIso[2].padStart(2, '0');
    const d = mIso[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Match DD/MM/YYYY or DD-MM-YYYY
  const mVn = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (mVn) {
    const d = mVn[1].padStart(2, '0');
    const m = mVn[2].padStart(2, '0');
    const y = mVn[3];
    return `${y}-${m}-${d}`;
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return null;
}

function matchColumnIndex(headers) {
  let dateIdx = -1, reachIdx = -1, clicksIdx = -1, costIdx = -1, ordersIdx = -1;

  headers.forEach((h, idx) => {
    const norm = normalizeStr(h);
    if (dateIdx === -1 && (norm.includes('ngay') || norm.includes('date') || norm.includes('time') || norm === 'd')) {
      dateIdx = idx;
    } else if (reachIdx === -1 && (norm.includes('reach') || norm.includes('tiep can') || norm.includes('hien thi') || norm.includes('impression'))) {
      reachIdx = idx;
    } else if (clicksIdx === -1 && (norm.includes('click') || norm.includes('nhap') || norm.includes('bam'))) {
      clicksIdx = idx;
    } else if (costIdx === -1 && (norm.includes('cost') || norm.includes('chi phi') || norm.includes('tien') || norm.includes('ngan sach') || norm.includes('spend'))) {
      costIdx = idx;
    } else if (ordersIdx === -1 && (norm.includes('order') || norm.includes('don') || norm.includes('chuyen doi') || norm.includes('conversion') || norm.includes('purchase'))) {
      ordersIdx = idx;
    }
  });

  return { dateIdx, reachIdx, clicksIdx, costIdx, ordersIdx };
}

function parseExcelBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });
  if (!rows || rows.length < 2) return [];

  // Find header row (usually row 0 or row 1)
  let headerRowIdx = 0;
  let colMap = matchColumnIndex(rows[0]);
  if (colMap.dateIdx === -1 && rows.length > 1) {
    const tryRow1 = matchColumnIndex(rows[1]);
    if (tryRow1.dateIdx !== -1) {
      headerRowIdx = 1;
      colMap = tryRow1;
    }
  }

  // If column names didn't match, default to 0..4
  if (colMap.dateIdx === -1) colMap.dateIdx = 0;
  if (colMap.reachIdx === -1) colMap.reachIdx = 1;
  if (colMap.clicksIdx === -1) colMap.clicksIdx = 2;
  if (colMap.costIdx === -1) colMap.costIdx = 3;
  if (colMap.ordersIdx === -1) colMap.ordersIdx = 4;

  const results = [];
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r.length) continue;
    const date = parseDate(r[colMap.dateIdx]);
    const reach = Math.round(parseNumber(r[colMap.reachIdx]) || 0);
    const clicks = Math.round(parseNumber(r[colMap.clicksIdx]) || 0);
    const cost = Math.round(parseNumber(r[colMap.costIdx]) || 0);
    const orders = Math.round(parseNumber(r[colMap.ordersIdx]) || 0);

    const obj = { date, reach, clicks, cost, orders };
    if (isValidRow(obj)) {
      results.push(obj);
    }
  }
  return results;
}

async function parseWordBuffer(buffer, { fetchAI, env } = {}) {
  // 1. Try HTML conversion with Mammoth to parse table
  try {
    const { value: html } = await mammoth.convertToHtml({ buffer });
    if (html && html.includes('<table')) {
      const rows = [];
      const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
      let trMatch;
      while ((trMatch = trRegex.exec(html)) !== null) {
        const rowCells = [];
        const cellRegex = /<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;
        let cellMatch;
        while ((cellMatch = cellRegex.exec(trMatch[1])) !== null) {
          const text = cellMatch[1].replace(/<[^>]+>/g, '').trim();
          rowCells.push(text);
        }
        if (rowCells.length >= 4) {
          rows.push(rowCells);
        }
      }

      if (rows.length >= 2) {
        let colMap = matchColumnIndex(rows[0]);
        if (colMap.dateIdx === -1) colMap.dateIdx = 0;
        if (colMap.reachIdx === -1) colMap.reachIdx = 1;
        if (colMap.clicksIdx === -1) colMap.clicksIdx = 2;
        if (colMap.costIdx === -1) colMap.costIdx = 3;
        if (colMap.ordersIdx === -1) colMap.ordersIdx = 4;

        const results = [];
        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          const date = parseDate(r[colMap.dateIdx]);
          const reach = Math.round(parseNumber(r[colMap.reachIdx]) || 0);
          const clicks = Math.round(parseNumber(r[colMap.clicksIdx]) || 0);
          const cost = Math.round(parseNumber(r[colMap.costIdx]) || 0);
          const orders = Math.round(parseNumber(r[colMap.ordersIdx]) || 0);

          const obj = { date, reach, clicks, cost, orders };
          if (isValidRow(obj)) {
            results.push(obj);
          }
        }
        if (results.length > 0) return results;
      }
    }
  } catch (err) {
    console.error('Word HTML parsing error:', err);
  }

  // 2. Fallback to raw text extraction + regex or AI
  const { value: rawText } = await mammoth.extractRawText({ buffer });
  const regexResults = parseTextTabularRows(rawText);
  if (regexResults.length > 0) return regexResults;

  if (fetchAI && env && env.GEMINI_API_KEY && rawText.length > 20) {
    return await extractRowsWithAi(rawText, { fetchAI, env });
  }

  return [];
}

function parseTextTabularRows(text) {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const results = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check if line contains a date (YYYY-MM-DD or DD/MM/YYYY)
    const dateMatch = trimmed.match(/\b(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4})\b/);
    if (!dateMatch) continue;

    const parsedDate = parseDate(dateMatch[1]);
    if (!parsedDate) continue;

    // Remove the date from the line to find remaining numbers
    const rest = trimmed.replace(dateMatch[0], ' ');
    // Match numbers: handles 1,250,000 or 1.250.000 or 1250000
    const numbers = rest.match(/[\d.,]+/g);
    if (!numbers || numbers.length < 4) continue;

    const parsedNums = numbers
      .map(n => parseNumber(n))
      .filter(n => n !== null && isFinite(n));

    if (parsedNums.length >= 4) {
      const [reach, clicks, cost, orders] = parsedNums.slice(0, 4);
      const row = {
        date: parsedDate,
        reach: Math.round(reach),
        clicks: Math.round(clicks),
        cost: Math.round(cost),
        orders: Math.round(orders)
      };
      if (isValidRow(row)) {
        results.push(row);
      }
    }
  }

  return results;
}

async function parsePdfBuffer(buffer, { fetchAI, env } = {}) {
  let text = '';
  try {
    if (typeof pdfParse === 'function') {
      const data = await pdfParse(buffer);
      text = data?.text || '';
    } else if (pdfParse && pdfParse.PDFParse) {
      const parser = new pdfParse.PDFParse({ data: buffer });
      const res = await parser.getText();
      text = res?.text || '';
      if (typeof parser.destroy === 'function') {
        try { await parser.destroy(); } catch {}
      }
    }
  } catch (err) {
    console.error('PDF parsing error:', err);
  }

  // 1. Try regex extraction first
  const regexResults = parseTextTabularRows(text);
  if (regexResults.length > 0) return regexResults;

  // 2. If regex didn't extract rows, use Gemini AI
  if (fetchAI && env && env.GEMINI_API_KEY && text.length > 20) {
    return await extractRowsWithAi(text, { fetchAI, env });
  }

  return [];
}

async function extractRowsWithAi(rawText, { fetchAI, env }) {
  try {
    const model = env.GEMINI_MODEL || 'gemini-3.8-flash';
    const prompt = `Bạn là chuyên gia trích xuất dữ liệu số liệu quảng cáo marketing.
Hãy trích xuất tất cả các dòng dữ liệu chiến dịch trong văn bản sau thành một mảng JSON chuẩn:
[
  {
    "date": "YYYY-MM-DD",
    "reach": 25000,
    "clicks": 650,
    "cost": 1500000,
    "orders": 24
  }
]
Quy tắc:
1. "date" phải ở định dạng chuẩn "YYYY-MM-DD" (nếu có DD/MM/YYYY hãy chuyển đổi sang YYYY-MM-DD).
2. "reach", "clicks", "cost", "orders" đều là số nguyên dương (không có đơn vị đ hay VNĐ hay dấu phẩy ngăn cách).
3. Chỉ trả về JSON duy nhất, không giải thích gì thêm.

Văn bản nguồn:
${rawText.slice(0, 8000)}`;

    const response = await fetchAI(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });

    if (!response.ok) return [];
    const resData = await response.json();
    const jsonStr = resData.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = JSON.parse(jsonStr);
    const list = Array.isArray(parsed) ? parsed : (parsed.rows || parsed.data || []);
    return list.filter(isValidRow);
  } catch (err) {
    console.error('AI extraction error:', err);
    return [];
  }
}

async function parseCampaignFile(filename, buffer, options = {}) {
  const ext = (filename.split('.').pop() || '').toLowerCase();

  if (['xlsx', 'xls', 'csv'].includes(ext)) {
    return parseExcelBuffer(buffer);
  } else if (['docx', 'doc'].includes(ext)) {
    return await parseWordBuffer(buffer, options);
  } else if (ext === 'pdf') {
    return await parsePdfBuffer(buffer, options);
  }
  throw new Error(`Định dạng file .${ext} không được hỗ trợ. Hãy chọn file Excel (.xlsx, .csv), Word (.docx), hoặc PDF (.pdf)`);
}

module.exports = {
  parseCampaignFile,
  parseExcelBuffer,
  parseWordBuffer,
  parsePdfBuffer,
  parseDate,
  parseNumber
};
