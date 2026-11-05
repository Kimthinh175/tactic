const http = require('node:http');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {analyze, isValidRow, extractAllowedNumbers} = require('./analysis');
const {parseCampaignFile} = require('./file-parser');

// Load .env automatically if present
try {
  const envPath = path.join(__dirname, '.env');
  if (fsSync.existsSync(envPath)) {
    const lines = fsSync.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2]?.trim().replace(/^['"](.*)['"]$/, '$1') || '';
      }
    }
  }
} catch {}

const publicFiles = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/app.js': 'app.js',
  '/analysis.js': 'analysis.js',
  '/styles.css': 'styles.css',
  '/sample-data.js': 'sample-data.js'
};

const BANNED_PATTERNS = [
  /cam kết/i,
  /chắc chắn 100%/i,
  /đảm bảo tăng/i,
  /đảm bảo đạt/i,
  /chắc chắn sẽ/i,
  /chắc chắn do/i,
  /tuyệt đối/i,
  /không thể sai/i
];

function hasBannedPhrases(text) {
  return typeof text === 'string' && BANNED_PATTERNS.some(p => p.test(text));
}

function hasUngroundedNumbers(text, allowedSet) {
  if (!text || !allowedSet) return false;
  const regex = /\b\d{1,3}(?:\.\d{3})+(?:,\d+)?\b|\b\d+(?:[.,]\d+)?\b/g;
  const matches = text.match(regex) || [];
  for (const raw of matches) {
    let normalized = raw;
    if (raw.includes('.') && raw.includes(',')) {
      normalized = raw.replace(/\./g, '').replace(',', '.');
    } else if (raw.includes('.') && /^\d{1,3}(\.\d{3})+$/.test(raw)) {
      normalized = raw.replace(/\./g, '');
    } else {
      normalized = raw.replace(',', '.');
    }
    const num = parseFloat(normalized);
    if ((num >= 2020 && num <= 2030) || (num >= 1 && num <= 31)) continue;
    let matched = false;
    for (const a of allowedSet) {
      if (Math.abs(num - a) <= 0.05 || (a !== 0 && Math.abs(num - a) / Math.abs(a) <= 0.05)) {
        matched = true;
        break;
      }
    }
    if (!matched) return true;
  }
  return false;
}

const contextCache = new Map();

function cleanOldCache() {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000;
  for (const [id, item] of contextCache.entries()) {
    if (now - item.createdAt > maxAge || contextCache.size > 500) {
      contextCache.delete(id);
    }
  }
}

function createServer({fetchAI = fetch, env = process.env} = {}) {
  const resolvedModel = env.GEMINI_MODEL || 'gemini-3.8-flash';
  return http.createServer(async (req, res) => {
    const json = (status, data) => {
      res.writeHead(status, {'Content-Type': 'application/json'});
      res.end(JSON.stringify(data));
    };

    if (req.url === '/api/recommendations' && req.method === 'POST') {
      try {
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 500000) return json(413, {error: 'Dữ liệu quá lớn'});
        }
        let input;
        try { input = JSON.parse(body); } catch { return json(400, {error: 'JSON không hợp lệ'}); }
        if (!input || !Array.isArray(input.rows) || input.rows.some(r => !isValidRow(r)) || ![1, 7, 14].includes(input.days) || ![0, 5, 10].includes(input.threshold)) {
          return json(400, {error: 'Dữ liệu không hợp lệ'});
        }
        const snapshot = analyze(input.rows, input.days, input.threshold);
        if (!env.GEMINI_API_KEY) return json(503, {error: 'Chưa cấu hình AI'});

        const upstream = await fetchAI(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(resolvedModel)}:generateContent`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY},
          signal: AbortSignal.timeout(20000),
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `Chỉ hỗ trợ cải thiện, không tự kết luận hoặc tính lại số liệu. Trả JSON {"recommendations":[{"title":"hành động","measure":"cách đo và điều kiện đánh giá","evidenceId":"mã luận cứ"}]} đúng 3 gợi ý tiếng Việt. Không khẳng định nguyên nhân, không hứa kết quả, không bịa số liệu. Dữ liệu thiếu: chỉ gợi ý bổ sung dữ liệu và đo lường, evidenceId=coverage. Dữ liệu đủ: evidenceId phải nằm trong evidence. Mọi nguyên nhân là giả thuyết cần kiểm chứng. Dữ liệu tính sẵn: ${JSON.stringify(snapshot)}`
              }]
            }],
            generationConfig: {responseMimeType: 'application/json'}
          })
        });
        if (!upstream.ok) throw new Error('upstream');
        const data = await upstream.json();
        const result = JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text);
        const evidence = Object.fromEntries(snapshot.evidence.map(e => [e.id, e.text]));
        evidence.coverage = `Độ phủ: ${snapshot.coverage.current}/${snapshot.days} và ${snapshot.coverage.previous}/${snapshot.days} ngày.`;

        if (!Array.isArray(result.recommendations) || result.recommendations.length !== 3 || !result.recommendations.every(r => r && ['title', 'measure'].every(k => typeof r[k] === 'string' && r[k].trim() && r[k].length <= 1800) && (snapshot.complete ? Object.hasOwn(evidence, r.evidenceId) : r.evidenceId === 'coverage'))) {
          throw new Error('schema');
        }
        if (result.recommendations.some(r => hasBannedPhrases(r.title) || hasBannedPhrases(r.measure))) {
          throw new Error('banned_phrases');
        }

        const allowedNumbers = extractAllowedNumbers(snapshot, input.rows);
        if (result.recommendations.some(r => hasUngroundedNumbers(r.title, allowedNumbers) || hasUngroundedNumbers(r.measure, allowedNumbers))) {
          throw new Error('ungrounded_numbers');
        }

        const hash = crypto.createHash('sha256').update(JSON.stringify({rows: input.rows, days: input.days, threshold: input.threshold})).digest('hex').slice(0, 16);
        cleanOldCache();
        contextCache.set(hash, {
          createdAt: Date.now(),
          snapshot,
          allowedNumbers,
          facts: {
            conclusion: snapshot.conclusion,
            current: snapshot.current,
            previous: snapshot.previous,
            delta: snapshot.delta,
            driver: snapshot.driver,
            extrema: snapshot.extrema,
            evidence: snapshot.evidence
          },
          answers: new Map()
        });

        return json(200, {
          contextId: hash,
          driver: snapshot.driver,
          recommendations: result.recommendations.map(r => ({
            title: r.title,
            measure: r.measure,
            why: evidence[r.evidenceId],
            evidenceId: r.evidenceId
          }))
        });
      } catch {
        return json(502, {error: 'AI chưa khả dụng'});
      }
    }

    if (req.url === '/api/chat' && req.method === 'POST') {
      try {
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 500000) return json(413, {error: 'Dữ liệu quá lớn'});
        }
        let input;
        try { input = JSON.parse(body); } catch { return json(400, {error: 'JSON không hợp lệ'}); }
        if (!input || typeof input.question !== 'string' || !input.question.trim() || input.question.length > 500) {
          return json(400, {error: 'Câu hỏi không hợp lệ'});
        }

        cleanOldCache();
        let entry = input.contextId ? contextCache.get(input.contextId) : null;
        if (!entry) {
          if (!input.rows || !Array.isArray(input.rows) || input.rows.some(r => !isValidRow(r)) || ![1, 7, 14].includes(input.days) || ![0, 5, 10].includes(input.threshold)) {
            return json(400, {error: 'Dữ liệu chiến dịch không hợp lệ'});
          }
          const snapshot = analyze(input.rows, input.days, input.threshold);
          const allowedNumbers = extractAllowedNumbers(snapshot, input.rows);
          const facts = {
            conclusion: snapshot.conclusion,
            current: snapshot.current,
            previous: snapshot.previous,
            delta: snapshot.delta,
            driver: snapshot.driver,
            extrema: snapshot.extrema,
            evidence: snapshot.evidence
          };
          const hash = crypto.createHash('sha256').update(JSON.stringify({rows: input.rows, days: input.days, threshold: input.threshold})).digest('hex').slice(0, 16);
          entry = { createdAt: Date.now(), snapshot, allowedNumbers, facts, answers: new Map() };
          contextCache.set(hash, entry);
          input.contextId = hash;
        }

        const normQ = input.question.trim().toLowerCase();
        if (entry.answers.has(normQ)) {
          const hit = entry.answers.get(normQ);
          return json(200, { answer: hit.answer, contextId: input.contextId, cached: true, cachedTokens: hit.cachedTokens, why: 'hit_ram_cache' });
        }

        if (!env.GEMINI_API_KEY) return json(503, {error: 'Chưa cấu hình AI'});

        const prompt = `Bạn là trợ lý dữ liệu KPI chiến dịch quảng cáo. Trả lời ngắn gọn (dưới 150 từ), trực diện, bằng tiếng Việt. Dựa HOÀN TOÀN vào dữ liệu sự thật đã được tính sẵn dưới đây. Không khẳng định nguyên nhân chủ quan, không bịa số liệu, không hứa hẹn kết quả hay cam kết. Mọi con số bạn đưa ra bắt buộc phải có trong dữ liệu sự thật. Nếu câu hỏi hỏi ngoài phạm vi dữ liệu đã có (như thương hiệu đối thủ, lợi nhuận ròng, CTR hiển thị), hãy trả lời rõ ràng là chưa có dữ liệu.\nDữ liệu sự thật: ${JSON.stringify(entry.facts)}\n\nCâu hỏi: ${input.question.trim()}`;

        const upstream = await fetchAI(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(resolvedModel)}:generateContent`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY},
          signal: AbortSignal.timeout(20000),
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }]
          })
        });
        if (!upstream.ok) throw new Error('upstream');
        const data = await upstream.json();
        const answer = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (!answer || answer.length > 2000) throw new Error('invalid_answer');

        if (hasBannedPhrases(answer)) throw new Error('banned_phrases');
        if (hasUngroundedNumbers(answer, entry.allowedNumbers)) throw new Error('ungrounded_numbers');

        const cachedTokens = data.usageMetadata?.cachedContentTokenCount || 0;
        entry.answers.set(normQ, { answer, cachedTokens });
        return json(200, { answer, contextId: input.contextId, cached: false, cachedTokens });
      } catch {
        return json(502, {error: 'AI chưa khả dụng hoặc câu trả lời không vượt qua kiểm soát'});
      }
    }

    if (req.url === '/api/import-file' && req.method === 'POST') {
      try {
        let body = '';
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 25000000) return json(413, { error: 'File quá lớn (tối đa 25MB)' });
        }
        let input;
        try { input = JSON.parse(body); } catch { return json(400, { error: 'JSON không hợp lệ' }); }
        if (!input || !input.filename || !input.dataBase64) {
          return json(400, { error: 'Thiếu thông tin file (filename hoặc dataBase64)' });
        }
        const buffer = Buffer.from(input.dataBase64, 'base64');
        const rows = await parseCampaignFile(input.filename, buffer);
        if (!rows || rows.length === 0) {
          return json(422, { error: 'Không tìm thấy dòng dữ liệu chiến dịch hợp lệ trong file. Vui lòng kiểm tra định dạng hoặc tải file mẫu để xem ví dụ.' });
        }
        return json(200, {
          success: true,
          filename: input.filename,
          count: rows.length,
          rows
        });
      } catch (err) {
        return json(400, { error: err.message || 'Lỗi khi xử lý file' });
      }
    }

    const urlObj = new URL(req.url, 'http://localhost');
    if (urlObj.pathname === '/api/template' && req.method === 'GET') {
      const type = (urlObj.searchParams.get('type') || 'xlsx').toLowerCase();
      const filenames = {
        xlsx: 'mau_kpi_chien_dich.xlsx',
        csv: 'mau_kpi_chien_dich.csv',
        docx: 'mau_kpi_chien_dich.docx',
        pdf: 'mau_kpi_chien_dich.pdf'
      };
      const fname = filenames[type] || filenames.xlsx;
      const fpath = path.join(__dirname, 'templates', fname);
      try {
        const data = await fs.readFile(fpath);
        const mimes = {
          xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          csv: 'text/csv; charset=utf-8',
          docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          pdf: 'application/pdf'
        };
        res.writeHead(200, {
          'Content-Type': mimes[type] || 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${fname}"`,
          'Content-Length': data.length
        });
        return res.end(data);
      } catch (err) {
        return json(404, { error: 'Không tìm thấy file mẫu' });
      }
    }

    if (urlObj.pathname.startsWith('/templates/') && req.method === 'GET') {
      const safeFname = path.basename(urlObj.pathname);
      const fpath = path.join(__dirname, 'templates', safeFname);
      try {
        const data = await fs.readFile(fpath);
        const ext = safeFname.split('.').pop().toLowerCase();
        const mimes = {
          xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          csv: 'text/csv; charset=utf-8',
          docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          pdf: 'application/pdf'
        };
        res.writeHead(200, {
          'Content-Type': mimes[ext] || 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${safeFname}"`,
          'Content-Length': data.length
        });
        return res.end(data);
      } catch {
        res.writeHead(404);
        return res.end();
      }
    }

    const file = publicFiles[req.url?.split('?')[0]];
    if (!file || req.method !== 'GET') {
      res.writeHead(404);
      return res.end();
    }
    try {
      const content = await fs.readFile(path.join(__dirname, file));
      res.writeHead(200, {
        'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html'
      });
      res.end(content);
    } catch {
      res.writeHead(500);
      res.end();
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 8082);
  createServer().listen(port, '127.0.0.1', () => console.log('Dashboard: http://127.0.0.1:' + port));
}

module.exports = {createServer, hasBannedPhrases, hasUngroundedNumbers};
