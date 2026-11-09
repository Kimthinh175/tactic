/**
 * Automated Real-Action Screen Recording for Vibe Coding 2026
 * Topic 08 - Tactic AdPulse Dashboard
 * Records all 5 core features with realistic cursor, clicks, and HUD banner.
 */
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');

const RECORDINGS_DIR = path.join(__dirname, '..', 'recordings');
if (!fs.existsSync(RECORDINGS_DIR)) fs.mkdirSync(RECORDINGS_DIR, { recursive: true });

async function smoothMove(page, targetSelectorOrCoords, durationMs = 600) {
  let targetX, targetY;
  if (typeof targetSelectorOrCoords === 'string') {
    const el = await page.$(targetSelectorOrCoords);
    if (!el) return;
    const box = await el.boundingBox();
    if (!box) return;
    targetX = box.x + box.width / 2;
    targetY = box.y + box.height / 2;
  } else {
    targetX = targetSelectorOrCoords.x;
    targetY = targetSelectorOrCoords.y;
  }

  await page.evaluate(({ x, y, duration }) => {
    const cursor = document.getElementById('demo-virtual-cursor');
    if (!cursor) return;
    cursor.style.transition = `left ${duration}ms cubic-bezier(0.25, 1, 0.5, 1), top ${duration}ms cubic-bezier(0.25, 1, 0.5, 1)`;
    cursor.style.left = `${x}px`;
    cursor.style.top = `${y}px`;
  }, { x: targetX, y: targetY, duration: durationMs });

  await page.waitForTimeout(durationMs + 50);
}

async function smoothClick(page, selector, durationMove = 500) {
  await smoothMove(page, selector, durationMove);
  await page.evaluate(() => {
    const cursor = document.getElementById('demo-virtual-cursor');
    if (!cursor) return;
    cursor.classList.add('cursor-clicked');
    setTimeout(() => cursor.classList.remove('cursor-clicked'), 250);

    const x = parseFloat(cursor.style.left) || 0;
    const y = parseFloat(cursor.style.top) || 0;
    const ripple = document.createElement('div');
    ripple.className = 'demo-click-ripple';
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  });
  await page.waitForTimeout(100);
  await page.locator(selector).click({ force: true });
  await page.waitForTimeout(200);
}

async function updateHUD(page, { featIndex, featBadge, featTitle, featDesc }) {
  await page.evaluate(({ featIndex, featBadge, featTitle, featDesc }) => {
    const badgeEl = document.getElementById('hud-feat-badge');
    const titleEl = document.getElementById('hud-feat-title');
    const descEl = document.getElementById('hud-feat-desc');
    const hud = document.getElementById('demo-hud-banner');
    if (!hud) return;

    hud.style.opacity = '0';
    hud.style.transform = 'translate(-50%, 15px)';

    setTimeout(() => {
      if (badgeEl) badgeEl.textContent = featBadge;
      if (titleEl) titleEl.textContent = featTitle;
      if (descEl) descEl.textContent = featDesc;
      hud.style.opacity = '1';
      hud.style.transform = 'translate(-50%, 0)';
    }, 200);
  }, { featIndex, featBadge, featTitle, featDesc });
}

(async () => {
  console.log('🚀 Khởi chạy trình duyệt thu hình video demo thực tế...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    permissions: ['clipboard-read', 'clipboard-write'],
    recordVideo: {
      dir: RECORDINGS_DIR,
      size: { width: 1280, height: 720 }
    }
  });

  const page = await context.newPage();
  await page.goto('http://127.0.0.1:8082', { waitUntil: 'networkidle' });

  // Reset localStorage to clear state
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.reload({ waitUntil: 'networkidle' });

  // Inject Virtual Cursor, HUD Banner, and Intro/Outro overlays
  await page.evaluate(() => {
    // 1. Virtual Cursor Styles
    const style = document.createElement('style');
    style.innerHTML = `
      #demo-virtual-cursor {
        position: fixed;
        width: 22px;
        height: 22px;
        background: rgba(37, 99, 235, 0.85);
        border: 2.5px solid #ffffff;
        border-radius: 50%;
        box-shadow: 0 0 12px rgba(37, 99, 235, 0.9), 0 2px 4px rgba(0,0,0,0.3);
        pointer-events: none;
        z-index: 2147483647;
        left: 640px;
        top: 360px;
        transform: translate(-50%, -50%);
        transition: transform 0.15s ease-out;
      }
      #demo-virtual-cursor.cursor-clicked {
        transform: translate(-50%, -50%) scale(0.7);
        background: #ef4444;
      }
      .demo-click-ripple {
        position: fixed;
        width: 10px;
        height: 10px;
        border: 2px solid #3b82f6;
        border-radius: 50%;
        pointer-events: none;
        z-index: 2147483646;
        transform: translate(-50%, -50%);
        animation: demoRipple 0.6s cubic-bezier(0, 0.2, 0.8, 1) forwards;
      }
      @keyframes demoRipple {
        0% { width: 10px; height: 10px; opacity: 1; }
        100% { width: 50px; height: 50px; opacity: 0; }
      }

      /* HUD Banner Styles */
      #demo-hud-banner {
        position: fixed;
        bottom: 16px;
        left: 50%;
        transform: translate(-50%, 0);
        z-index: 2147483640;
        width: 94%;
        max-width: 960px;
        background: rgba(15, 23, 42, 0.92);
        backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 14px;
        padding: 10px 18px;
        box-shadow: 0 12px 36px rgba(0,0,0,0.55);
        color: white;
        font-family: 'Inter', sans-serif;
        pointer-events: none;
        transition: opacity 0.25s ease, transform 0.25s ease;
      }
      #demo-hud-progress-bar {
        position: absolute;
        bottom: 0;
        left: 0;
        height: 3px;
        background: linear-gradient(90deg, #3b82f6, #10b981);
        border-radius: 0 0 14px 14px;
        width: 0%;
        transition: width 0.5s linear;
      }

      /* Fullscreen Splash Overlays */
      .demo-splash-screen {
        position: fixed;
        inset: 0;
        z-index: 2147483645;
        background: radial-gradient(circle at center, #1e293b 0%, #0f172a 100%);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: white;
        font-family: 'Inter', sans-serif;
        text-align: center;
        padding: 24px;
        transition: opacity 0.6s ease;
      }
    `;
    document.head.appendChild(style);

    // Cursor Element
    const cursor = document.createElement('div');
    cursor.id = 'demo-virtual-cursor';
    document.body.appendChild(cursor);

    // HUD Banner Element
    const hud = document.createElement('div');
    hud.id = 'demo-hud-banner';
    hud.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 12px; min-width: 0;">
          <span id="hud-feat-badge" style="background: linear-gradient(135deg, #2563eb, #7c3aed); font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 6px; letter-spacing: 0.5px; text-transform: uppercase; white-space: nowrap;">
            GIỚI THIỆU
          </span>
          <div style="min-width: 0;">
            <div id="hud-feat-title" style="font-size: 13.5px; font-weight: 700; color: #f8fafc; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              Tactic AdPulse — Dashboard KPI Chiến dịch & Phân tích Phễu CPA
            </div>
            <div id="hud-feat-desc" style="font-size: 11.5px; color: #94a3b8; line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              Cuộc thi Vibe Coding 2026 · Bảng A (Công nghệ) · Đề số 08
            </div>
          </div>
        </div>
        <div style="text-align: right; shrink-0; border-left: 1px solid rgba(255,255,255,0.12); padding-left: 14px;">
          <div style="font-size: 10.5px; font-weight: 600; color: #38bdf8;">ĐỘI THI TACTIC</div>
          <div style="font-size: 10px; color: #64748b;">FPT Polytechnic</div>
        </div>
      </div>
      <div id="demo-hud-progress-bar"></div>
    `;
    document.body.appendChild(hud);

    // Intro Overlay Element
    const intro = document.createElement('div');
    intro.id = 'demo-intro-overlay';
    intro.className = 'demo-splash-screen';
    intro.innerHTML = `
      <div style="max-width: 720px; animation: fadeIn 0.8s ease;">
        <div style="display: inline-flex; align-items: center; gap: 8px; background: rgba(37,99,235,0.2); border: 1px solid #3b82f6; padding: 6px 16px; border-radius: 9999px; margin-bottom: 20px;">
          <span style="width: 8px; height: 8px; border-radius: 50%; background: #38bdf8;"></span>
          <span style="font-size: 12px; font-weight: 600; color: #93c5fd; letter-spacing: 0.5px; text-transform: uppercase;">Cuộc thi Vibe Coding 2026 · Bảng A</span>
        </div>
        <h1 style="font-size: 40px; font-weight: 800; letter-spacing: -1px; margin-bottom: 12px; background: linear-gradient(135deg, #ffffff 40%, #93c5fd 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
          TACTIC ADPULSE
        </h1>
        <p style="font-size: 17px; color: #94a3b8; margin-bottom: 24px; font-weight: 400; line-height: 1.5;">
          Dashboard KPI Chiến Dịch & Phân Tích Phễu CPA = CPC ÷ CVR Chuyên Sâu
        </p>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; margin-top: 10px; text-align: left;">
          <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 12px 14px;">
            <div style="font-size: 11px; color: #38bdf8; font-weight: 600;">ĐỀ BÀI BỐC THĂM</div>
            <div style="font-size: 13px; font-weight: 700; color: #f1f5f9; margin-top: 2px;">Đề 08 · Mini App KPI</div>
          </div>
          <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 12px 14px;">
            <div style="font-size: 11px; color: #10b981; font-weight: 600;">MÔ HÌNH AI</div>
            <div style="font-size: 13px; font-weight: 700; color: #f1f5f9; margin-top: 2px;">Gemini 3.8 Flash</div>
          </div>
          <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 12px 14px;">
            <div style="font-size: 11px; color: #f59e0b; font-weight: 600;">KIỂM THỬ THỰC TẾ</div>
            <div style="font-size: 13px; font-weight: 700; color: #f1f5f9; margin-top: 2px;">Đạt trọn vẹn 6/6 ca</div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(intro);
  });

  const setProgress = async (pct) => {
    await page.evaluate((p) => {
      const bar = document.getElementById('demo-hud-progress-bar');
      if (bar) bar.style.width = `${p}%`;
    }, pct);
  };

  const recordingStartTime = Date.now();
  const waitUntilSecond = async (sec) => {
    const remainingMs = Math.round(sec * 1000 - (Date.now() - recordingStartTime));
    if (remainingMs > 0) {
      await page.waitForTimeout(remainingMs);
    }
  };

  console.log('🎬 00:00 - 00:10.0: Đoạn giới thiệu (Intro Splash)...');
  await setProgress(5);
  await waitUntilSecond(9.4);

  // Fade out Intro overlay
  await page.evaluate(() => {
    const intro = document.getElementById('demo-intro-overlay');
    if (intro) {
      intro.style.opacity = '0';
      setTimeout(() => intro.remove(), 600);
    }
  });
  await waitUntilSecond(10.0);

  // =========================================================================
  // SCENE 1: TÍNH NĂNG 1 - NHẬP LIỆU ĐA PHƯƠNG THỨC (10.0s -> 25.5s, ~15.5s)
  // =========================================================================
  console.log('🎬 00:10 - 00:25.5: TÍNH NĂNG 1 — Nhập liệu đa phương thức...');
  await updateHUD(page, {
    featIndex: 1,
    featBadge: 'TÍNH NĂNG 1 / 5',
    featTitle: 'Nhập liệu đa phương thức & Quản lý dữ liệu',
    featDesc: 'Nhập từng ngày, nạp mẫu 14 ngày, bảng nhập hàng loạt & hỗ trợ file Excel/PDF/ảnh OCR'
  });
  await setProgress(15);

  // Single entry form input
  await smoothClick(page, '#input-date', 400);
  await page.locator('#input-date').fill('2026-10-01');
  await page.waitForTimeout(200);

  await smoothClick(page, '#input-reach', 300);
  await page.locator('#input-reach').fill('15000');
  await page.waitForTimeout(200);

  await smoothClick(page, '#input-clicks', 300);
  await page.locator('#input-clicks').fill('520');
  await page.waitForTimeout(200);

  await smoothClick(page, '#input-cost', 300);
  await page.locator('#input-cost').fill('1800000');
  await page.waitForTimeout(200);

  await smoothClick(page, '#input-orders', 300);
  await page.locator('#input-orders').fill('28');
  await page.waitForTimeout(200);

  // Click Thêm ngày
  await smoothClick(page, '#btn-submit-single', 400);
  await page.waitForTimeout(800);
  await setProgress(20);

  // Click Nạp mẫu 14 ngày
  await smoothClick(page, '#btn-load-sample', 600);
  await page.waitForTimeout(1000);

  // Click Nhập hàng loạt
  await smoothClick(page, '#btn-open-bulk-modal', 600);
  await page.waitForTimeout(1200);
  // Close bulk modal
  await smoothClick(page, '#bulk-modal button:has-text("Hủy bỏ")', 500);
  await page.waitForTimeout(1000);
  await setProgress(27);
  await waitUntilSecond(25.5);

  // =========================================================================
  // SCENE 2: TÍNH NĂNG 2 - TỰ ĐỘNG HÓA KPI & BIỂU ĐỒ (25.5s -> 41.0s, ~15.5s)
  // =========================================================================
  console.log('🎬 00:25.5 - 00:41.0: TÍNH NĂNG 2 — Tự động hóa KPI & Biểu đồ tương tác...');
  await updateHUD(page, {
    featIndex: 2,
    featBadge: 'TÍNH NĂNG 2 / 5',
    featTitle: 'Tự động hóa 4 chỉ số KPI & Biểu đồ đa trục',
    featDesc: 'Tính CTR, CPC, CPA, CVR, tự động đánh dấu Best/Worst CPA và Chart.js tương tác'
  });
  await setProgress(32);

  // Scroll to KPI Strip
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.waitForTimeout(600);

  // Hover 4 KPI cards
  await smoothMove(page, '#section-kpis > div:nth-child(1)', 500);
  await page.waitForTimeout(600);
  await smoothMove(page, '#section-kpis > div:nth-child(2)', 450);
  await page.waitForTimeout(600);
  await smoothMove(page, '#section-kpis > div:nth-child(3)', 450);
  await page.waitForTimeout(700);
  await smoothMove(page, '#section-kpis > div:nth-child(4)', 450);
  await page.waitForTimeout(700);
  await setProgress(38);

  // Scroll to Chart.js section
  await page.evaluate(() => {
    const chart = document.getElementById('campaign-chart');
    if (chart) chart.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await page.waitForTimeout(800);

  // Hover over chart canvas data points
  await smoothMove(page, { x: 450, y: 360 }, 500);
  await page.waitForTimeout(600);
  await smoothMove(page, { x: 620, y: 340 }, 500);
  await page.waitForTimeout(600);
  await smoothMove(page, { x: 780, y: 380 }, 500);
  await page.waitForTimeout(1000);
  await setProgress(45);
  await waitUntilSecond(41.0);

  // =========================================================================
  // SCENE 3: TÍNH NĂNG 3 - CHẨN ĐOÁN PHỄU CPA = CPC ÷ CVR (41.0s -> 55.0s, ~14s)
  // =========================================================================
  console.log('🎬 00:41.0 - 00:55.0: TÍNH NĂNG 3 — Chẩn đoán phễu nhân quả CPA = CPC ÷ CVR...');
  await updateHUD(page, {
    featIndex: 3,
    featBadge: 'TÍNH NĂNG 3 / 5',
    featTitle: 'Chẩn đoán phễu nhân quả CPA = CPC ÷ CVR & So sánh chu kỳ',
    featDesc: 'Phân rã biến động CPA toán học do CPC hay CVR, phân loại vào 4 góc phần tư xu hướng'
  });
  await setProgress(50);

  // Scroll to Comparison controls & Executive verdict
  await page.evaluate(() => {
    const hero = document.getElementById('hero-summary');
    if (hero) hero.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  await page.waitForTimeout(600);

  // Switch comparison period to 7 days
  await smoothClick(page, '#analysis-days', 500);
  await page.locator('#analysis-days').selectOption('7');
  await page.waitForTimeout(1000);

  // Highlight Executive Verdict Banner
  await smoothMove(page, '#hero-status-pill', 500);
  await page.waitForTimeout(700);
  await smoothMove(page, '#hero-headline', 600);
  await page.waitForTimeout(1200);

  // Switch to 14 days
  await smoothClick(page, '#analysis-days', 450);
  await page.locator('#analysis-days').selectOption('14');
  await page.waitForTimeout(1400);
  await setProgress(60);
  await waitUntilSecond(55.0);

  // =========================================================================
  // SCENE 4: TÍNH NĂNG 4 - TRỢ LÝ AI GEMINI 3.8 FLASH (55.0s -> 69.5s, ~14.5s)
  // =========================================================================
  console.log('🎬 00:55.0 - 00:69.5: TÍNH NĂNG 4 — Trợ lý AI Gemini 3.8 Flash & Khuyến nghị...');
  await updateHUD(page, {
    featIndex: 4,
    featBadge: 'TÍNH NĂNG 4 / 5',
    featTitle: 'Trợ lý AI Gemini 3.8 Flash, 3 Khuyến nghị & AI Q&A',
    featDesc: 'Skeleton loading mượt mà, 3 gợi ý thực chiến chia 2 dòng in đậm, hỏi đáp số liệu RAM Cache'
  });
  await setProgress(65);

  // Scroll to AI block
  await page.evaluate(() => {
    const aiSec = document.getElementById('ai-action-card');
    if (aiSec) aiSec.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await page.waitForTimeout(700);

  // Click "Nhận phân tích & 3 khuyến nghị từ AI"
  await smoothClick(page, '#btn-run-gemini-ai', 500);
  // Show skeleton pulsing for ~1.5s then cards appear
  await page.waitForTimeout(2500);
  await setProgress(71);

  // Hover over the 3 recommendation cards
  await smoothMove(page, '#ai-recommendations-list > div:nth-child(1)', 500);
  await page.waitForTimeout(800);
  await smoothMove(page, '#ai-recommendations-list > div:nth-child(2)', 500);
  await page.waitForTimeout(800);

  // Scroll to AI Q&A Chat Assistant
  await page.evaluate(() => {
    const chat = document.getElementById('ai-chat-input');
    if (chat) chat.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  await page.waitForTimeout(500);

  // Ask AI Assistant
  await smoothClick(page, '#ai-chat-input', 400);
  await page.locator('#ai-chat-input').fill('Vì sao CPA tăng trong kỳ này?');
  await page.waitForTimeout(400);
  await smoothClick(page, '#btn-submit-ai-chat', 400);
  await page.waitForTimeout(2000);
  await setProgress(77);
  await waitUntilSecond(69.5);

  // =========================================================================
  // SCENE 5: TÍNH NĂNG 5 - XUẤT BÁO CÁO & TẢI SOURCE ZIP (69.5s -> 82.5s, ~13s)
  // =========================================================================
  console.log('🎬 00:69.5 - 00:82.5: TÍNH NĂNG 5 — Xuất báo cáo đa kênh & Tải tệp...');
  await updateHUD(page, {
    featIndex: 5,
    featBadge: 'TÍNH NĂNG 5 / 5',
    featTitle: 'Xuất báo cáo đa kênh, Tải tệp CSV & Source ZIP',
    featDesc: 'Tự động tổng hợp báo cáo văn bản, sao chép Zalo/Slack và tải trọn gói mã nguồn dự thi'
  });
  await setProgress(82);

  // Scroll to top
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.waitForTimeout(500);

  // Click Xuất báo cáo
  await smoothClick(page, '#btn-open-export-modal', 500);
  await page.waitForTimeout(1000);

  // Switch between Boss & Compact templates
  await smoothClick(page, '#tab-tpl-compact', 500);
  await page.waitForTimeout(700);
  await smoothClick(page, '#tab-tpl-boss', 500);
  await page.waitForTimeout(700);

  // Click Sao chép báo cáo (toast triggers)
  await smoothClick(page, '#btn-do-copy', 500);
  await page.waitForTimeout(1200);

  // Hover over CSV and Source ZIP download buttons in modal
  await smoothMove(page, '#export-modal a[download="tactic-submission.zip"]', 600);
  await page.waitForTimeout(1200);

  // Close modal
  await smoothClick(page, '#export-modal button:has-text("Đóng")', 450);
  await page.waitForTimeout(800);
  await setProgress(91);
  await waitUntilSecond(82.5);

  // =========================================================================
  // SCENE 6: OUTRO CARD (82.5s -> 90.5s, ~8s)
  // =========================================================================
  console.log('🎬 00:82.5 - 00:90.5: Đoạn kết (Outro Splash)...');
  await updateHUD(page, {
    featIndex: 6,
    featBadge: 'KẾT THÚC',
    featTitle: 'Tactic AdPulse — Sẵn sàng triển khai thực chiến',
    featDesc: 'Đầy đủ 5/5 tính năng · 6 ca kiểm thử thực tế · Cam kết bảo mật API Key tuyệt đối'
  });

  await page.evaluate(() => {
    const outro = document.createElement('div');
    outro.id = 'demo-outro-overlay';
    outro.className = 'demo-splash-screen';
    outro.style.opacity = '0';
    outro.innerHTML = `
      <div style="max-width: 740px;">
        <div style="width: 56px; height: 56px; border-radius: 14px; background: #2563eb; display: inline-flex; align-items: center; justify-content: center; font-size: 26px; font-weight: 800; color: white; margin-bottom: 18px; box-shadow: 0 0 20px rgba(37,99,235,0.6);">
          T
        </div>
        <h2 style="font-size: 36px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 10px; background: linear-gradient(135deg, #ffffff 40%, #93c5fd 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
          TACTIC ADPULSE
        </h2>
        <p style="font-size: 16px; color: #94a3b8; margin-bottom: 24px;">
          Bản demo dự thi Vòng loại Cuộc thi Vibe Coding 2026 — FPT Polytechnic
        </p>

        <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 18px 24px; text-align: left; margin-bottom: 22px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.06); pb: 8px;">
            <span style="font-size: 12.5px; color: #94a3b8;">Đường dẫn Demo Online:</span>
            <span style="font-size: 13px; font-weight: 700; color: #38bdf8;">https://tactic.schoolify.top/</span>
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; border-bottom: 1px solid rgba(255,255,255,0.06); pb: 8px;">
            <span style="font-size: 12.5px; color: #94a3b8;">Tải Source ZIP bài nộp:</span>
            <span style="font-size: 13px; font-weight: 700; color: #10b981;">https://tactic.schoolify.top/tactic-submission.zip</span>
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <span style="font-size: 12.5px; color: #94a3b8;">Hồ sơ đính kèm:</span>
            <span style="font-size: 12.5px; color: #f1f5f9;">README.md + 6 Ca Kiểm Thử + Minh Chứng AI</span>
          </div>
        </div>

        <div style="font-size: 13px; color: #64748b;">
          Đội thi: <strong style="color: #cbd5e1;">Tactic Team</strong> · Cảm ơn Ban Giám Khảo đã theo dõi!
        </div>
      </div>
    `;
    document.body.appendChild(outro);
    setTimeout(() => { outro.style.opacity = '1'; }, 50);
  });

  await setProgress(100);
  await waitUntilSecond(90.5);

  // Close page and browser to finalize video
  console.log('🎥 Đang đóng trình duyệt và xuất tệp video thô...');
  const videoPath = await page.video().path();
  await context.close();
  await browser.close();

  console.log('✅ Video thô được lưu tại:', videoPath);
  fs.writeFileSync(path.join(RECORDINGS_DIR, 'latest_raw_video.txt'), videoPath, 'utf8');
})();
