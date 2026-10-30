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
