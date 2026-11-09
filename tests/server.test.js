const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createServer} = require('../server');
const input = {rows:[{date:'2026-10-01',reach:100,clicks:10,cost:100,orders:10},{date:'2026-10-02',reach:100,clicks:10,cost:200,orders:5}],days:1,threshold:5};
async function withServer(t, fetchAI, env={GEMINI_API_KEY:'test-only',GEMINI_MODEL:'test-model'}) {
 const server=createServer({fetchAI,env}); await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 return data=>fetch(`http://127.0.0.1:${server.address().port}/api/recommendations`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
}
const reply = recommendations => ({ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({conclusion:'Fake conclusion',recommendations})}]}}]})});
test('server computes evidence and discards model verdict and invented rationale',async t=>{
 const post=await withServer(t, async(url,options)=>{
  assert.ok(options.body.includes('cùng suy giảm'));
  return reply(Array.from({length:3},()=>({title:'Thử nghiệm',measure:'Theo dõi',evidenceId:'cpa',why:'Invented'})));
 });
 const response=await post(input);assert.equal(response.status,200);
 const data=await response.json();assert.equal(data.conclusion,undefined);assert.equal(data.recommendations.length,3);
 assert.equal(data.recommendations[0].why,'CPA: 10 → 40; 300%');
});
test('invalid AI schema and ungrounded evidence are rejected',async t=>{
 for(const recs of [[],Array.from({length:3},()=>({title:'test',measure:'test',evidenceId:'made-up'})),Array.from({length:3},()=>({title:'test',measure:'test',evidenceId:'toString'}))]) {
  const post=await withServer(t,async()=>reply(recs));assert.equal((await post(input)).status,502);
 }
});
test('upstream failure and missing config produce usable fallback statuses',async t=>{
 const post=await withServer(t,async()=>{throw new Error('offline');});assert.equal((await post(input)).status,502);
 const noKey=await withServer(t,async()=>{throw new Error('must not call');},{});assert.equal((await noKey(input)).status,503);
 assert.equal((await post({...input,rows:[{...input.rows[0],cost:-1}]})).status,400);
});
test('chat endpoint answers grounded question and utilizes RAM context cache',async t=>{
 let callCount = 0;
 const server = createServer({
  fetchAI: async (url, options) => {
   callCount++;
   return {
    ok: true,
    json: async () => ({
     candidates: [{ content: { parts: [{ text: 'CPA tăng 300% do chi phí tăng lên 200.' }] } }]
    })
   };
  },
  env: {GEMINI_API_KEY:'test-key', GEMINI_MODEL:'gemini-3.8-flash'}
 });
 await new Promise(r => server.listen(0, '127.0.0.1', r));
 t.after(() => new Promise(r => server.close(r)));
 const port = server.address().port;

 const res1 = await fetch(`http://127.0.0.1:${port}/api/chat`, {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({...input, question: 'Vì sao CPA tăng?'})
 });
 assert.equal(res1.status, 200);
 const data1 = await res1.json();
 assert.ok(data1.contextId);
 assert.equal(data1.cached, false);
 assert.equal(callCount, 1);

 // Second call with same question & contextId -> hits RAM cache!
 const res2 = await fetch(`http://127.0.0.1:${port}/api/chat`, {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({contextId: data1.contextId, question: 'Vì sao CPA tăng?'})
 });
 assert.equal(res2.status, 200);
 const data2 = await res2.json();
 assert.equal(data2.cached, true);
 assert.equal(data2.why, 'hit_ram_cache');
 assert.equal(callCount, 1); // No new AI call!
});
test('chat endpoint rejects banned phrases and ungrounded numbers',async t=>{
 const server = createServer({
  fetchAI: async () => ({
   ok: true,
   json: async () => ({
    candidates: [{ content: { parts: [{ text: 'Chúng tôi cam kết 100% doanh thu sẽ tăng 999999 tỷ.' }] } }]
   })
  }),
  env: {GEMINI_API_KEY:'test-key', GEMINI_MODEL:'gemini-3.8-flash'}
 });
 await new Promise(r => server.listen(0, '127.0.0.1', r));
 t.after(() => new Promise(r => server.close(r)));
 const port = server.address().port;

 const res = await fetch(`http://127.0.0.1:${port}/api/chat`, {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({...input, question: 'Có cam kết không?'})
 });
 assert.equal(res.status, 502);
});

test('source ZIP download endpoints and HEAD request support', async t => {
  const server = createServer();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => server.close(r)));
  const port = server.address().port;

  // GET /tactic-submission.zip
  const resZip = await fetch(`http://127.0.0.1:${port}/tactic-submission.zip`);
  assert.equal(resZip.status, 200);
  assert.equal(resZip.headers.get('content-type'), 'application/zip');
  assert.ok(resZip.headers.get('content-disposition').includes('attachment; filename="tactic-submission.zip"'));
  const buf = await resZip.arrayBuffer();
  assert.ok(buf.byteLength > 10000);

  // HEAD /download-source
  const resHead = await fetch(`http://127.0.0.1:${port}/download-source`, { method: 'HEAD' });
  assert.equal(resHead.status, 200);
  assert.equal(resHead.headers.get('content-type'), 'application/zip');
  assert.equal(Number(resHead.headers.get('content-length')), buf.byteLength);

  // HEAD / (index.html)
  const resHeadIndex = await fetch(`http://127.0.0.1:${port}/`, { method: 'HEAD' });
  assert.equal(resHeadIndex.status, 200);
  assert.equal(resHeadIndex.headers.get('content-type'), 'text/html');

  // HEAD /demo-video.mp4
  const resVideo = await fetch(`http://127.0.0.1:${port}/demo-video.mp4`, { method: 'HEAD' });
  assert.equal(resVideo.status, 200);
  assert.equal(resVideo.headers.get('content-type'), 'video/mp4');
  assert.equal(resVideo.headers.get('accept-ranges'), 'bytes');
});


