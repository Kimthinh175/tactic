const XLSX = require('xlsx');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const { isValidRow } = require('./analysis');

// ==========================================
// 1. Text Normalization & Vector Space Model
// ==========================================

function normalizeStr(str) {
  if (!str) return '';
  return str
    .toString()
    .toLowerCase()
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Tokenizes text into lowercased words and character 3-grams.
 * Character n-grams provide semantic resilience against typos,
 * missing diacritics, and varied abbreviations.
 */
function tokenize(str) {
  if (!str) return [];
  const norm = normalizeStr(str);
  const words = norm.split(/[^a-z0-9]+/).filter(w => w.length > 0);
  const ngrams = [];
  for (const w of words) {
    if (w.length >= 3) {
      for (let i = 0; i <= w.length - 3; i++) {
        ngrams.push(w.slice(i, i + 3));
      }
    }
  }
  return [...words, ...ngrams];
}

/**
 * Builds a Term Frequency (TF) vector Map from a token list.
 */
function buildVector(tokens) {
  const vec = new Map();
  for (const t of tokens) {
    vec.set(t, (vec.get(t) || 0) + 1);
  }
  return vec;
}

/**
 * Computes Cosine Similarity between two term-frequency vectors:
 * cos(theta) = (A . B) / (||A|| * ||B||)
 */
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.size === 0 || vecB.size === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const [k, v] of vecA.entries()) {
    normA += v * v;
    if (vecB.has(k)) {
      dot += v * vecB.get(k);
    }
  }
  for (const [, v] of vecB.entries()) {
    normB += v * v;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Vector Prototype Centroids for the 5 Marketing KPI Dimensions
const PROTOTYPES = {
  date: buildVector(tokenize('ngay date thoi gian time day ngay thang timestamp hom nay ky bao cao period')),
  reach: buildVector(tokenize('reach tiep can luot tiep can nguoi tiep can impressions hien thi luot xem nguoi dung tiep can coverage')),
  clicks: buildVector(tokenize('clicks click nhap luot nhap so click link clicks bam luot bam truy cap click thong qua')),
  cost: buildVector(tokenize('cost chi phi so tien tien quang cao ngan sach spent amount budget vnd dong d vnd tien chi tieu phi')),
  orders: buildVector(tokenize('orders order don don hang so don chuyen doi conversions purchases so luong don ket qua mua hang'))
};

// ==========================================
// 2. Number & Date Parsers
// ==========================================

function parseNumber(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return isFinite(val) ? val : null;
  const rawStr = val.toString().trim();
  const isK = /[0-9]\s*k\b/i.test(rawStr);
  const isM = /[0-9]\s*(?:tr|trieu|m)\b/i.test(rawStr);

  let str = rawStr.replace(/(?:vn[đd]|vnd|[đd]|dong|đồng)$/i, '').trim();
  str = str.replace(/[^\d.,-]/g, '');
  if (!str) return null;

  // Handle Vietnamese/European thousands separator: 1.250.000 or 1.250.000,50
  if (str.includes('.') && str.includes(',')) {
    if (str.indexOf('.') < str.indexOf(',')) {
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (str.includes('.')) {
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

  let n = parseFloat(str);
  if (!isFinite(n)) return null;
  if (isK && n < 100000) n *= 1000;
  if (isM && n < 10000) n *= 1000000;
  return n;
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

// ==========================================
// 3. Vector Column Matcher
// ==========================================

/**
 * Matches table column headers to KPI dimensions using Vector Cosine Similarity.
 * Completely immune to column ordering, naming variations, language (VN/EN), and case.
 */
function vectorMatchColumnIndex(headers) {
  const mapping = { dateIdx: -1, reachIdx: -1, clicksIdx: -1, costIdx: -1, ordersIdx: -1 };
  if (!Array.isArray(headers) || headers.length === 0) return mapping;

  const keys = ['date', 'reach', 'clicks', 'cost', 'orders'];
  const fieldToProp = {
    date: 'dateIdx',
    reach: 'reachIdx',
    clicks: 'clicksIdx',
    cost: 'costIdx',
    orders: 'ordersIdx'
  };

  const scores = [];
  headers.forEach((h, colIdx) => {
    if (h === null || h === undefined) return;
    const colVec = buildVector(tokenize(h.toString()));
    keys.forEach(k => {
      const sim = cosineSimilarity(colVec, PROTOTYPES[k]);
      scores.push({ colIdx, key: k, sim });
    });
  });

  scores.sort((a, b) => b.sim - a.sim);
  const assignedCols = new Set();
  const assignedKeys = new Set();

  for (const item of scores) {
    if (item.sim > 0.05 && !assignedCols.has(item.colIdx) && !assignedKeys.has(item.key)) {
      mapping[fieldToProp[item.key]] = item.colIdx;
      assignedCols.add(item.colIdx);
      assignedKeys.add(item.key);
    }
  }

  // Fallback defaults if columns had no recognizable headers
  if (mapping.dateIdx === -1) mapping.dateIdx = 0;
  if (mapping.reachIdx === -1) mapping.reachIdx = 1;
  if (mapping.clicksIdx === -1) mapping.clicksIdx = 2;
  if (mapping.costIdx === -1) mapping.costIdx = 3;
  if (mapping.ordersIdx === -1) mapping.ordersIdx = 4;

  return mapping;
}

// ==========================================
// 4. Vector Semantic Extractor for Unstructured Text
// ==========================================

/**
 * Extracts marketing KPI records from free-form text, PDF streams,
 * or unstructured Word paragraphs using Vector Proximity & Cosine Similarity.
 * Runs 100% offline with ZERO API key requirement!
 */
function extractRowsWithVectorEngine(text) {
  if (!text || typeof text !== 'string') return [];
  const lines = text.split(/\r?\n/);
  const results = [];

  // Strategy A: Line-based Tabular Matching
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const dateMatch = trimmed.match(/\b(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4})\b/);
    if (!dateMatch) continue;
    const parsedDate = parseDate(dateMatch[1]);
    if (!parsedDate) continue;

    // Remove the date string so its numbers are not extracted
    const rest = trimmed.replace(dateMatch[0], ' ');
    const numMatches = [...rest.matchAll(/\b(\d+(?:[.,]\d+)*)\s*(?:[đd]|vn[đd]|k|tr)?\b/gi)];
    const validNums = [];

    for (const m of numMatches) {
      const val = parseNumber(m[0]);
      if (val !== null && isFinite(val) && val >= 0) {
        validNums.push({ val, raw: m[0], idx: m.index });
      }
    }

    if (validNums.length >= 4) {
      // Evaluate context vector around each number
      const candidates = { reach: null, clicks: null, cost: null, orders: null };
      const numScores = [];

      for (let nIdx = 0; nIdx < validNums.length; nIdx++) {
        const item = validNums[nIdx];
        const prevEnd = nIdx === 0 ? 0 : validNums[nIdx - 1].idx + validNums[nIdx - 1].raw.length;
        const nextStart = nIdx === validNums.length - 1 ? rest.length : validNums[nIdx + 1].idx;

        const leftBound = nIdx === 0 ? 0 : Math.floor((item.idx + prevEnd) / 2);
        const rightBound = nIdx === validNums.length - 1 ? rest.length : Math.floor(((item.idx + item.raw.length) + nextStart) / 2);

        const cellText = rest.slice(leftBound, rightBound);
        const ctxVec = buildVector(tokenize(cellText));

        for (const k of ['reach', 'clicks', 'cost', 'orders']) {
          const sim = cosineSimilarity(ctxVec, PROTOTYPES[k]);
          if (sim > 0.05) numScores.push({ val: item.val, nIdx, key: k, sim });
        }
      }

      numScores.sort((a, b) => b.sim - a.sim);
      const usedIndices = new Set();
      for (const sc of numScores) {
        if (candidates[sc.key] === null && !usedIndices.has(sc.nIdx)) {
          candidates[sc.key] = sc.val;
          usedIndices.add(sc.nIdx);
        }
      }

      if (candidates.reach !== null && candidates.clicks !== null && candidates.cost !== null && candidates.orders !== null) {
        const row = {
          date: parsedDate,
          reach: Math.round(candidates.reach),
          clicks: Math.round(candidates.clicks),
          cost: Math.round(candidates.cost),
          orders: Math.round(candidates.orders)
        };
        if (isValidRow(row)) {
          results.push(row);
          continue;
        }
      }

      // Default positional: reach, clicks, cost, orders
      const [reach, clicks, cost, orders] = validNums.map(n => n.val).slice(0, 4);
      const row = {
        date: parsedDate,
        reach: Math.round(reach),
        clicks: Math.round(clicks),
        cost: Math.round(cost),
        orders: Math.round(orders)
      };
      if (isValidRow(row)) results.push(row);
    }
  }

  if (results.length > 0) return results;

  // Strategy B: Date Anchor & Clause/Segment Vector Matching
  const dateRegex = /\b(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4})\b/g;
  const dateMatches = [];
  let dMatch;
  while ((dMatch = dateRegex.exec(text)) !== null) {
    const dStr = parseDate(dMatch[1]);
    if (dStr) {
      dateMatches.push({ date: dStr, raw: dMatch[0], index: dMatch.index });
    }
  }

  if (dateMatches.length === 0) return [];

  for (let i = 0; i < dateMatches.length; i++) {
    const cur = dateMatches[i];
    const nextIdx = (i + 1 < dateMatches.length) ? dateMatches[i + 1].index : text.length;
    let block = text.slice(cur.index, nextIdx);
    block = block.replace(cur.raw, ' ');

    // Split block into individual clauses/segments
    const segments = block.split(/(?:\r?\n|[-•*|;,]+)/).map(s => s.trim()).filter(Boolean);
    const assigned = { reach: null, clicks: null, cost: null, orders: null };
    const candidates = [];

    for (const seg of segments) {
      const numMatches = [...seg.matchAll(/\b(\d+(?:[.,]\d+)*)\s*(?:[đd]|vn[đd]|k|tr)?\b/gi)];
      const numsInSeg = [];
      for (const m of numMatches) {
        const val = parseNumber(m[0]);
        if (val !== null && isFinite(val) && val >= 0) {
          numsInSeg.push({ val, raw: m[0], idx: m.index });
        }
      }

      if (numsInSeg.length === 1) {
        // Single number in clause: vector of the whole clause identifies the metric!
        const segVec = buildVector(tokenize(seg));
        for (const k of ['reach', 'clicks', 'cost', 'orders']) {
          const sim = cosineSimilarity(segVec, PROTOTYPES[k]);
          if (sim > 0.05) {
            candidates.push({ val: numsInSeg[0].val, key: k, sim });
          }
        }
      } else if (numsInSeg.length > 1) {
        // Multiple numbers in clause: use local token window
        for (const item of numsInSeg) {
          const start = Math.max(0, item.idx - 25);
          const end = Math.min(seg.length, item.idx + item.raw.length + 25);
          const ctxVec = buildVector(tokenize(seg.slice(start, end)));
          for (const k of ['reach', 'clicks', 'cost', 'orders']) {
            const sim = cosineSimilarity(ctxVec, PROTOTYPES[k]);
            if (sim > 0.05) {
              candidates.push({ val: item.val, key: k, sim });
            }
          }
        }
      }
    }

    candidates.sort((a, b) => b.sim - a.sim);
    const usedVals = new Set();
    for (const c of candidates) {
      if (assigned[c.key] === null && !usedVals.has(c.val)) {
        assigned[c.key] = c.val;
        usedVals.add(c.val);
      }
    }

    if (assigned.reach !== null && assigned.clicks !== null && assigned.cost !== null && assigned.orders !== null) {
      const row = {
        date: cur.date,
        reach: Math.round(assigned.reach),
        clicks: Math.round(assigned.clicks),
        cost: Math.round(assigned.cost),
        orders: Math.round(assigned.orders)
      };
      if (isValidRow(row)) results.push(row);
    }
  }

  return results;
}

// ==========================================
// 5. High-Level File Format Handlers
// ==========================================

function parseExcelBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return [];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });
  if (!rows || rows.length < 2) return [];

  // Find header row (usually row 0 or row 1)
  let headerRowIdx = 0;
  let colMap = vectorMatchColumnIndex(rows[0]);
  if (colMap.dateIdx === -1 && rows.length > 1) {
    const tryRow1 = vectorMatchColumnIndex(rows[1]);
    if (tryRow1.dateIdx !== -1) {
      headerRowIdx = 1;
      colMap = tryRow1;
    }
  }

  const results = [];
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;
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

async function parseWordBuffer(buffer) {
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
        const colMap = vectorMatchColumnIndex(rows[0]);
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

  // 2. Unstructured text fallback: use Vector Engine (100% offline, NO API KEY)
  const { value: rawText } = await mammoth.extractRawText({ buffer });
  return extractRowsWithVectorEngine(rawText);
}

async function parsePdfBuffer(buffer) {
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

  // Use Vector Engine (100% offline, NO API KEY)
  return extractRowsWithVectorEngine(text);
}

async function parseImageBuffer(buffer, filename, { fetchAI = fetch, env = process.env } = {}) {
  if (!env || !env.GEMINI_API_KEY) {
    throw new Error('Tính năng trích xuất số liệu từ ảnh chụp màn hình (OCR Vision) yêu cầu cấu hình GEMINI_API_KEY trong file .env');
  }

  const ext = (filename.split('.').pop() || 'png').toLowerCase();
  const mimeTypes = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    bmp: 'image/bmp',
    gif: 'image/gif'
  };
  const mimeType = mimeTypes[ext] || 'image/png';
  const base64Data = buffer.toString('base64');
  const model = env.GEMINI_MODEL || 'gemini-3.8-flash';

  const prompt = `Bạn là chuyên gia kế toán và phân tích số liệu quảng cáo hiệu suất (Performance Marketing).
Nhiệm vụ của bạn là đọc và trích xuất dữ liệu báo cáo chiến dịch quảng cáo trong ảnh chụp màn hình này.
Hãy trích xuất tất cả các dòng dữ liệu hợp lệ thành một mảng JSON chuẩn:
[
  {
    "date": "YYYY-MM-DD",
    "reach": 25000,
    "clicks": 650,
    "cost": 1500000,
    "orders": 24
  }
]

Quy tắc bắt buộc:
1. "date": Định dạng YYYY-MM-DD (nếu ảnh ghi DD/MM/YYYY hoặc DD-MM hoặc ngày tháng, hãy quy đổi chính xác về YYYY-MM-DD).
2. "reach", "clicks", "cost", "orders": đều là số nguyên dương >= 0 (loại bỏ ký tự đ, VNĐ, dấu chấm phân cách hàng ngàn).
3. Tự đối soát chéo (Sanity check):
   - Reach (tiếp cận/hiển thị) luôn lớn hơn hoặc bằng Clicks.
   - Clicks luôn lớn hơn hoặc bằng Orders (đơn hàng).
   - Nếu trong ảnh có cột CPA (Cost per Acquisition) hoặc CPC, hãy dùng phép chia CPA = Cost / Orders hoặc CPC = Cost / Clicks để kiểm chứng không bị đọc thiếu số 0 của số tiền!
4. Nếu ảnh chụp màn hình có nhiều ngày, hãy trích xuất tất cả các ngày theo thứ tự.
5. Chỉ trả về JSON thuần duy nhất, không thêm bất kỳ văn bản giải thích nào ngoài JSON.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const response = await fetchAI(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': env.GEMINI_API_KEY
    },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: base64Data } }
        ]
      }],
      generationConfig: {
        responseMimeType: 'application/json'
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Lỗi kết nối Gemini Vision API (${response.status}): ${errText.slice(0, 150)}`);
  }

  const resData = await response.json();
  const jsonStr = resData.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!jsonStr) throw new Error('Không nhận được dữ liệu phản hồi từ mô hình Vision');

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error('Dữ liệu JSON từ AI Vision không hợp lệ');
  }

  const list = Array.isArray(parsed) ? parsed : (parsed.rows || parsed.data || []);
  const validRows = list
    .map(r => ({
      date: parseDate(r.date),
      reach: Math.round(parseNumber(r.reach) || 0),
      clicks: Math.round(parseNumber(r.clicks) || 0),
      cost: Math.round(parseNumber(r.cost) || 0),
      orders: Math.round(parseNumber(r.orders) || 0)
    }))
    .filter(isValidRow);

  return validRows;
}

async function parseCampaignFile(filename, buffer, options = {}) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const imageExts = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'];

  if (['xlsx', 'xls', 'csv'].includes(ext)) {
    return parseExcelBuffer(buffer);
  } else if (['docx', 'doc'].includes(ext)) {
    return await parseWordBuffer(buffer);
  } else if (ext === 'pdf') {
    return await parsePdfBuffer(buffer);
  } else if (imageExts.includes(ext)) {
    return await parseImageBuffer(buffer, filename, options);
  }
  throw new Error(`Định dạng file .${ext} không được hỗ trợ. Hãy chọn file Excel (.xlsx, .csv), Word (.docx), PDF (.pdf), hoặc Ảnh chụp màn hình (.png, .jpg, .webp)`);
}

module.exports = {
  parseCampaignFile,
  parseExcelBuffer,
  parseWordBuffer,
  parsePdfBuffer,
  parseImageBuffer,
  parseDate,
  parseNumber,
  vectorMatchColumnIndex,
  extractRowsWithVectorEngine,
  tokenize,
  buildVector,
  cosineSimilarity,
  PROTOTYPES
};
