const {test} = require('node:test');
const assert = require('node:assert/strict');
const {analyze,totals} = require('../analysis');
const rows = (before,after) => [{date:'2026-10-01',reach:100,clicks:10,cost:100,orders:10,...before},{date:'2026-10-02',reach:100,clicks:10,cost:100,orders:10,...after}];
test('four decision quadrants',()=>{
 for(const [cost,orders,match] of [[100,20,'cùng cải thiện'],[200,5,'cùng suy giảm'],[300,20,'Có thêm đơn'],[20,5,'sản lượng giảm']]) assert.ok(analyze(rows({}, {cost,orders}),1).conclusion.includes(match));
});
test('zero, missing, duplicates and invalid values never imply success',()=>{
 assert.equal(analyze(rows({}, {orders:0}),1).current.cpa,null);
 assert.equal(analyze(rows({orders:0}, {}),1).delta.orders,null);
 assert.equal(analyze(rows({},{}),7).complete,false);
 assert.equal(analyze([...rows({},{}),rows({}, {})[0]],1).complete,false);
 assert.equal(analyze(rows({}, {cost:-1}),1).complete,false);
 assert.equal(analyze([],7).recommendations.length,3);
});
test('ratios from totals and inclusive threshold',()=>{
 assert.equal(totals(rows({cost:100,orders:1},{cost:100,orders:9})).cpa,20);
 assert.ok(analyze(rows({orders:100,cost:100}, {orders:105,cost:105}),1,5).conclusion.includes('ít biến động'));
});
test('CPA decomposition correctly attributes CPC and CVR changes',()=>{
 const res = analyze(rows({cost:100,clicks:10,orders:5},{cost:200,clicks:10,orders:2}),1);
 assert.ok(res.driver);
 assert.equal(res.driver.driverType, 'both_worse');
 assert.ok(res.driver.driverSummary.includes('yếu tố tiêu cực'));
});
test('dailyExtrema identifies best and worst days',()=>{
 const res = analyze([
  {date:'2026-10-01',reach:100,clicks:10,cost:100,orders:10},
  {date:'2026-10-02',reach:100,clicks:10,cost:200,orders:5},
  {date:'2026-10-03',reach:100,clicks:10,cost:50,orders:10}
 ], 1);
 assert.ok(res.extrema);
 assert.equal(res.extrema.bestCpaDay.date, '2026-10-03');
 assert.equal(res.extrema.worstCpaDay.date, '2026-10-02');
 assert.equal(res.extrema.maxOrdersDay.orders, 10);
});

