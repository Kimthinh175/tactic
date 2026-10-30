const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const {analyze,isValidRow} = require('./analysis');
const publicFiles = {'/':'index.html','/index.html':'index.html','/app.js':'app.js','/analysis.js':'analysis.js','/styles.css':'styles.css','/sample-data.js':'sample-data.js'};
function createServer({fetchAI = fetch, env = process.env} = {}) {
return http.createServer(async (req,res) => {
  const json = (status,data) => {res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  if (req.url === '/api/recommendations' && req.method === 'POST') {
    try {
      let body = ''; for await (const chunk of req) {body += chunk; if (body.length > 500000) return json(413,{error:'Dữ liệu quá lớn'});}
      let input; try {input = JSON.parse(body);} catch {return json(400,{error:'JSON không hợp lệ'});}
      if (!input || !Array.isArray(input.rows) || input.rows.some(r=>!isValidRow(r)) || ![1,7,14].includes(input.days) || ![0,5,10].includes(input.threshold)) return json(400,{error:'Dữ liệu không hợp lệ'});
      const snapshot = analyze(input.rows,input.days,input.threshold);
      if (!env.GEMINI_API_KEY || !env.GEMINI_MODEL) return json(503,{error:'Chưa cấu hình AI'});
      const upstream = await fetchAI(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent`, {
        method:'POST', headers:{'Content-Type':'application/json','x-goog-api-key':env.GEMINI_API_KEY}, signal:AbortSignal.timeout(20000),
        body:JSON.stringify({contents:[{parts:[{text:`Chỉ hỗ trợ cải thiện, không tự kết luận hoặc tính lại số liệu. Trả JSON {"recommendations":[{"title":"hành động","measure":"cách đo và điều kiện đánh giá","evidenceId":"mã luận cứ"}]} đúng 3 gợi ý tiếng Việt. Không khẳng định nguyên nhân, không hứa kết quả, không bịa số liệu. Dữ liệu thiếu: chỉ gợi ý bổ sung dữ liệu và đo lường, evidenceId=coverage. Dữ liệu đủ: evidenceId phải nằm trong evidence. Mọi nguyên nhân là giả thuyết cần kiểm chứng. Dữ liệu tính sẵn: ${JSON.stringify(snapshot)}`}]}],generationConfig:{responseMimeType:'application/json'}})
      });
      if (!upstream.ok) throw new Error('upstream');
      const data = await upstream.json();
      const result = JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text);
      const evidence = Object.fromEntries(snapshot.evidence.map(e=>[e.id,e.text]));
      evidence.coverage = `Độ phủ: ${snapshot.coverage.current}/${snapshot.days} và ${snapshot.coverage.previous}/${snapshot.days} ngày.`;
      if (!Array.isArray(result.recommendations) || result.recommendations.length !== 3 || !result.recommendations.every(r => r && ['title','measure'].every(k => typeof r[k] === 'string' && r[k].trim() && r[k].length <= 1800) && (snapshot.complete ? Object.hasOwn(evidence,r.evidenceId) : r.evidenceId === 'coverage'))) throw new Error('schema');
      return json(200,{recommendations:result.recommendations.map(r=>({title:r.title,measure:r.measure,why:evidence[r.evidenceId],evidenceId:r.evidenceId}))});
    } catch {return json(502,{error:'AI chưa khả dụng'});}
  }
  const file = publicFiles[req.url?.split('?')[0]];
  if (!file || req.method !== 'GET') {res.writeHead(404);return res.end();}
  try {const content = await fs.readFile(path.join(__dirname,file));res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});res.end(content);} catch {res.writeHead(500);res.end();}
});
}
if (require.main === module) createServer().listen(Number(process.env.PORT || 8080),'127.0.0.1',()=>console.log('Dashboard: http://127.0.0.1:'+(process.env.PORT || 8080)));
module.exports = {createServer};
