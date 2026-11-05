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

test('< 7 days evaluates directly from date N to M, >= 7 days gives actionable recommendations', () => {
  const fiveDays = [
    { date: '2026-10-01', reach: 1000, clicks: 50, cost: 500000, orders: 10 },
    { date: '2026-10-02', reach: 1200, clicks: 60, cost: 600000, orders: 12 },
    { date: '2026-10-03', reach: 1100, clicks: 55, cost: 550000, orders: 11 },
    { date: '2026-10-04', reach: 1300, clicks: 65, cost: 650000, orders: 13 },
    { date: '2026-10-05', reach: 1400, clicks: 70, cost: 700000, orders: 14 },
  ];

  // 1. Five days (< 7 days): evaluates N-M, complete = false
  const res5 = analyze(fiveDays, 7);
  assert.equal(res5.complete, false);
  assert.ok(res5.conclusion.includes('Đánh giá từ 01/10 đến 05/10'));
  assert.ok(res5.conclusion.includes('5 ngày'));
  assert.equal(res5.recommendations.length, 3);
  assert.ok(res5.recommendations[0].title.includes('< 7 ngày'));

  // 2. Seven days (>= 7 days): complete = true, gives 3 actionable recommendations!
  const sevenDays = [
    ...fiveDays,
    { date: '2026-10-06', reach: 1500, clicks: 75, cost: 750000, orders: 16 },
    { date: '2026-10-07', reach: 1600, clicks: 80, cost: 800000, orders: 18 },
  ];
  const res7 = analyze(sevenDays, 7);
  assert.equal(res7.complete, true);
  assert.ok(res7.conclusion.length > 5);
  assert.equal(res7.recommendations.length, 3);
  assert.ok(res7.recommendations.every(r => ['cvr', 'clickReach', 'cpa'].includes(r.evidenceId)));
});


