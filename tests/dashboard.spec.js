const {test,expect}=require('@playwright/test');
async function enter(page,date,cost,orders){
 for(const [key,value] of Object.entries({date,reach:1000,clicks:100,cost,orders})) await page.locator('#input-'+key).fill(String(value));
 await page.locator('#btn-submit-single').click();
}
test('input → evidence → persistence → export → AI fallback',async({page})=>{
 await page.goto('/');
 page.on('dialog',d=>d.accept());
 await page.locator('#btn-clear-all').click();
 await enter(page,'2026-10-01',1000000,20);
 await enter(page,'2026-10-02',1200000,15);
 await page.locator('#analysis-days').selectOption('1');
 await expect(page.locator('#ai-status-label')).toContainText('cùng suy giảm');
 await expect(page.locator('#ai-trend-summary')).toContainText('50.000 → 80.000; 60%');
 await expect(page.locator('#ai-recommendations-list > div')).toHaveCount(3);
 await page.reload();
 await expect(page.locator('#data-table-body tr')).toHaveCount(2);
 await page.locator('#analysis-days').selectOption('1');
 await page.locator('#btn-open-export-modal').click();
 await expect(page.locator('#export-report-text')).toHaveValue(/50.000 → 80.000; 60%/);
 await page.evaluate(()=>closeExportModal());
 await page.route('**/api/recommendations', route => route.abort());
 await page.locator('#btn-run-gemini-ai').click();
 await expect(page.locator('#toast-container')).toContainText('AI chưa khả dụng');
 await expect(page.locator('#ai-status-label')).toContainText('cùng suy giảm');
 await page.screenshot({path:'tests/dashboard.png',fullPage:true});
});
test('AI response cannot replace conclusion; stale suggestions discarded',async({page})=>{
 await page.goto('/');
 await page.evaluate(()=>loadSampleDataAction()); // app khởi đầu trống; nạp 14 ngày mô phỏng để có đủ hai kỳ
 await page.route('**/api/recommendations',route=>route.fulfill({json:{conclusion:'FAKE',recommendations:Array.from({length:3},()=>({title:'<b>AI thử nghiệm</b>',why:'Luận cứ',measure:'Theo dõi CPA'}))}}));
 const original=await page.locator('#ai-status-label').innerText();
 await page.locator('#btn-run-gemini-ai').click();
 await expect(page.locator('#ai-recommendations-list')).toContainText('<b>AI thử nghiệm</b>');
 await expect(page.locator('#ai-recommendations-list b')).toHaveCount(0);
 await expect(page.locator('#ai-status-label')).toHaveText(original);
 await page.locator('#analysis-days').selectOption('1');
 await expect(page.locator('#ai-recommendations-list')).not.toContainText('AI thử nghiệm');
});
test('zero orders and missing days; backend validation',async({page,request})=>{
 await page.goto('/');page.on('dialog',d=>d.accept());
 await page.locator('#btn-clear-all').click();
 await enter(page,'2026-10-01',100000,0);
 await expect(page.locator('#kpi-avg-cpa')).toHaveText('Chưa xác định');
 await expect(page.locator('#ai-status-label')).toHaveText('Chưa đủ dữ liệu so sánh');
 const response=await request.post('/api/recommendations',{data:{rows:[],days:0,threshold:5}});
 expect(response.status()).toBe(400);
 expect((await request.get('/server.js')).status()).toBe(404);
});

test('copy report to clipboard and narrow screen rendering',async({page,context})=>{
 await context.grantPermissions(['clipboard-read','clipboard-write']);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 await page.locator('#btn-open-export-modal').click();
 const report=await page.locator('#export-report-text').inputValue();
 await page.locator('#btn-do-copy').click();
 expect(await page.evaluate(()=>navigator.clipboard.readText())).toBe(report);
 await page.evaluate(()=>closeExportModal());
 await expect(page.locator('#analysis-days')).toBeVisible();
 await expect(page.locator('#ai-recommendations-list > div')).toHaveCount(3);
 expect(errors).toEqual([]);
 await page.locator('#ai-status-label').scrollIntoViewIfNeeded();
 await page.screenshot({path:'tests/mobile.png'});
});

test('late AI response cannot attach to changed analysis',async({page})=>{
 let release;let received;
 const started=new Promise(resolve=>{received=resolve;});
 await page.route('**/api/recommendations',async route=>{
   received();await new Promise(resolve=>{release=resolve;});
   await route.fulfill({json:{recommendations:Array.from({length:3},()=>({title:'OLD RESULT',why:'old',measure:'old'}))}});
 });
 await page.goto('/');await page.locator('#btn-run-gemini-ai').click();await started;
 await page.locator('#analysis-days').selectOption('1');release();
 await expect(page.locator('#btn-run-gemini-ai')).toBeEnabled();
 await expect(page.locator('#ai-recommendations-list')).not.toContainText('OLD RESULT');
});

test('bulk entry saves several days and ignores negative data',async({page})=>{
 await page.goto('/');page.on('dialog',d=>d.accept());await page.locator('#btn-clear-all').click();
 await page.locator('#btn-open-bulk-modal').click();
 for(let i=0;i<3;i++) {
  const row=page.locator('#bulk-table-body tr').nth(i);
  for(const [key,value] of Object.entries({date:`2026-10-0${i+1}`,reach:1000,clicks:100,cost:i===2?-100:100000,orders:10})) await row.locator('.bulk-'+key).fill(String(value));
 }
 await page.getByRole('button',{name:'Lưu tất cả vào Dashboard'}).click();
 await expect(page.locator('#data-table-body tr')).toHaveCount(2);
 await page.locator('#analysis-days').selectOption('1');
 await expect(page.locator('#ai-status-label')).toContainText('ít biến động');
 await page.reload();await expect(page.locator('#data-table-body tr')).toHaveCount(2);
});

test('AI chat assistant handles question and displays grounded answer', async ({page}) => {
 await page.goto('/');
 await page.evaluate(() => loadSampleDataAction());
 await page.route('**/api/chat', route => route.fulfill({
  json: {
   answer: 'CPA biến động do chi phí CPC thay đổi từ 2.500 lên 2.666.',
   contextId: 'ctx123',
   cached: false
  }
 }));
 await page.locator('#ai-chat-input').fill('Vì sao CPA biến động?');
 await page.locator('#btn-submit-ai-chat').click();
 await expect(page.locator('#ai-chat-thread')).toContainText('CPA biến động do chi phí CPC thay đổi');
});

test('template download and multimodal file import (Excel, Word, PDF)', async ({page, request}) => {
  for (const type of ['xlsx', 'docx', 'pdf', 'csv']) {
    const res = await request.get(`/api/template?type=${type}`);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-disposition']).toContain(`mau_kpi_chien_dich.${type}`);
  }

  await page.goto('/');
  page.on('dialog', d => d.accept());
  await page.locator('#btn-clear-all').click();
  await expect(page.locator('#data-table-body tr')).toHaveCount(0);

  await page.locator('#btn-toggle-template-menu').click();
  await expect(page.locator('#template-dropdown-menu')).toBeVisible();

  const path = require('path');
  const xlsxPath = path.join(__dirname, '..', 'templates', 'mau_kpi_chien_dich.xlsx');
  await page.locator('#campaign-file-input').setInputFiles(xlsxPath);

  await expect(page.locator('#toast-container')).toContainText('Nhập thành công');
  await expect(page.locator('#data-table-body tr')).toHaveCount(7);
  await expect(page.locator('#kpi-total-orders')).toHaveText('183 đơn');

  const docxPath = path.join(__dirname, '..', 'templates', 'mau_kpi_chien_dich.docx');
  await page.locator('#campaign-file-input').setInputFiles(docxPath);
  await expect(page.locator('#toast-container')).toContainText('Nhập thành công');
  await expect(page.locator('#data-table-body tr')).toHaveCount(7);

  const pdfPath = path.join(__dirname, '..', 'templates', 'mau_kpi_chien_dich.pdf');
  await page.locator('#campaign-file-input').setInputFiles(pdfPath);
  await expect(page.locator('#toast-container')).toContainText('Nhập thành công');
  await expect(page.locator('#data-table-body tr')).toHaveCount(7);
});


