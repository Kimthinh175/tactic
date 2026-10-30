/**
 * Dữ liệu mẫu chiến dịch quảng cáo Marketing (14 ngày gần nhất)
 * Đầy đủ các kịch bản thực tế: tăng trưởng, biến động chi phí, bão hoà creative và tối ưu hóa lại.
 */
const DEFAULT_SAMPLE_DATA = [
  {
    id: "sample-1",
    date: "2026-10-10",
    reach: 12500,
    clicks: 340,
    cost: 850000,
    orders: 14
  },
  {
    id: "sample-2",
    date: "2026-10-11",
    reach: 14200,
    clicks: 410,
    cost: 950000,
    orders: 18
  },
  {
    id: "sample-3",
    date: "2026-10-12",
    reach: 16800,
    clicks: 490,
    cost: 1100000,
    orders: 22
  },
  {
    id: "sample-4",
    date: "2026-10-13",
    reach: 19500,
    clicks: 520,
    cost: 1350000,
    orders: 20
  },
  {
    id: "sample-5",
    date: "2026-10-14",
    reach: 22000,
    clicks: 530,
    cost: 1600000,
    orders: 19
  },
  {
    id: "sample-6",
    date: "2026-10-15",
    reach: 21500,
    clicks: 480,
    cost: 1550000,
    orders: 16
  },
  {
    id: "sample-7",
    date: "2026-10-16",
    reach: 24000,
    clicks: 650,
    cost: 1700000,
    orders: 26
  },
  {
    id: "sample-8",
    date: "2026-10-17",
    reach: 28500,
    clicks: 790,
    cost: 1950000,
    orders: 34
  },
  {
    id: "sample-9",
    date: "2026-10-18",
    reach: 31000,
    clicks: 860,
    cost: 2100000,
    orders: 38
  },
  {
    id: "sample-10",
    date: "2026-10-19",
    reach: 29000,
    clicks: 740,
    cost: 1900000,
    orders: 31
  },
  {
    id: "sample-11",
    date: "2026-10-20",
    reach: 33500,
    clicks: 920,
    cost: 2250000,
    orders: 42
  },
  {
    id: "sample-12",
    date: "2026-10-21",
    reach: 36000,
    clicks: 990,
    cost: 2400000,
    orders: 45
  },
  {
    id: "sample-13",
    date: "2026-10-22",
    reach: 38500,
    clicks: 1080,
    cost: 2500000,
    orders: 50
  },
  {
    id: "sample-14",
    date: "2026-10-23",
    reach: 41200,
    clicks: 1190,
    cost: 2650000,
    orders: 56
  }
];


/**
 * Sinh 14 ngày dữ liệu MÔ PHỎNG ngẫu nhiên (không phải số liệu thật).
 * Mỗi lần gọi chọn một kịch bản khác nhau (tăng trưởng, nội dung nhàm, mở rộng đắt, rò rỉ phễu, ổn định)
 * để phần phân tích cho kết luận khác nhau. Luôn đảm bảo: số nguyên, đơn <= click <= reach.
 */
const SAMPLE_SCENARIOS = [
  { id: "growth", reach: [0.6, 1.1], ctr: [0.03, 0.15], cvr: [0.1, 0.25], cpc: [-0.06, 0.04] },
  { id: "fatigue", reach: [0.05, 0.25], ctr: [-0.4, -0.22], cvr: [-0.06, 0.04], cpc: [0.15, 0.3] },
  { id: "costly", reach: [0.5, 0.9], ctr: [-0.08, 0], cvr: [-0.18, -0.06], cpc: [0.18, 0.38] },
  { id: "funnel", reach: [0.2, 0.5], ctr: [0, 0.1], cvr: [-0.42, -0.28], cpc: [-0.03, 0.05] },
  { id: "stable", reach: [-0.04, 0.04], ctr: [-0.03, 0.03], cvr: [-0.03, 0.03], cpc: [-0.03, 0.03] },
];

function generateRandomSample(days = 14) {
  const rnd = (a, b) => a + Math.random() * (b - a);
  const noise = (p) => 1 + rnd(-p, p);
  const sc = SAMPLE_SCENARIOS[Math.floor(Math.random() * SAMPLE_SCENARIOS.length)];
  const trend = (r) => rnd(r[0], r[1]);
  const t = { reach: trend(sc.reach), ctr: trend(sc.ctr), cvr: trend(sc.cvr), cpc: trend(sc.cpc) };
  const reach0 = rnd(9000, 30000), ctr0 = rnd(0.018, 0.032), cvr0 = rnd(0.025, 0.06), cpc0 = rnd(1800, 3500);

  const pad = (n) => String(n).padStart(2, "0");
  const end = new Date();
  const stamp = Date.now();
  const rows = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(end);
    d.setDate(end.getDate() - (days - 1 - i));
    const k = days > 1 ? i / (days - 1) : 0;
    const reach = Math.max(500, Math.round(reach0 * (1 + t.reach * k) * noise(0.08)));
    const clicks = Math.min(reach, Math.max(20, Math.round(reach * ctr0 * (1 + t.ctr * k) * noise(0.07))));
    const orders = Math.min(clicks, Math.max(1, Math.round(clicks * cvr0 * (1 + t.cvr * k) * noise(0.12))));
    const cost = Math.max(1000, Math.round((clicks * cpc0 * (1 + t.cpc * k) * noise(0.06)) / 1000) * 1000);
    rows.push({
      id: "smp-" + stamp + "-" + (i + 1),
      date: d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()),
      reach, clicks, cost, orders,
    });
  }
  return {
    rows,
    scenario: sc.id,
    campaignName: "Chiến dịch mẫu (mô phỏng) #" + Math.floor(rnd(100, 999)),
  };
}
