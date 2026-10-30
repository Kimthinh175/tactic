(function (root) {
  const day = 86400000;
  const shift = (date, n) => new Date(Date.parse(date + 'T00:00:00Z') + n * day).toISOString().slice(0, 10);
  const ratio = (a, b) => b > 0 ? a / b : null;
  function totals(rows) {
    const t = rows.reduce((a, r) => { for (const k of ['cost', 'reach', 'clicks', 'orders']) a[k] += r[k]; return a; }, {cost:0, reach:0, clicks:0, orders:0});
    return {...t, cpa:ratio(t.cost,t.orders), cpc:ratio(t.cost,t.clicks), cvr:ratio(t.orders * 100,t.clicks), clickReach:ratio(t.clicks * 100,t.reach)};
  }
  function isValidRow(r) {
    return !!r && typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(Date.parse(r.date)) && new Date(r.date).toISOString().slice(0,10) === r.date && ['cost','reach','clicks','orders'].every(k => Number.isFinite(r[k]) && r[k] >= 0) && ['reach','clicks','orders'].every(k => Number.isInteger(r[k]));
  }
  function analyze(rows, days = 7, threshold = 5) {
    if (!Array.isArray(rows) || ![1,7,14].includes(days) || ![0,5,10].includes(threshold)) throw new TypeError('Invalid analysis input');
    const valid = rows.filter(isValidRow);
    const sorted = [...valid].sort((a,b) => a.date.localeCompare(b.date));
    const end = sorted.at(-1)?.date;
    const start = end ? shift(end, 1-days) : null;
    const prevEnd = start ? shift(start,-1) : null;
    const prevStart = start ? shift(start,-days) : null;
    const currentRows = sorted.filter(r => r.date >= start && r.date <= end);
    const previousRows = sorted.filter(r => r.date >= prevStart && r.date <= prevEnd);
    const current = totals(currentRows), previous = totals(previousRows);
    const complete = !!end && valid.length === rows.length && new Set(sorted.map(r=>r.date)).size === sorted.length && currentRows.length === days && previousRows.length === days;
    const delta = {};
    for (const k of Object.keys(current)) delta[k] = current[k] === null || previous[k] === null || previous[k] === 0 ? null : (current[k]-previous[k])/previous[k]*100;
    const direction = v => v === null ? null : Math.abs(v) <= threshold ? 0 : Math.sign(v);
    const o = direction(delta.orders), c = direction(delta.cpa);
    let conclusion = 'Chưa đủ dữ liệu so sánh';
    if (complete) {
      if (o === null || c === null) conclusion = 'Chưa thể kết luận xu hướng: mẫu số bằng 0 hoặc CPA chưa xác định';
      else if (o > 0 && c < 0) conclusion = 'Sản lượng và hiệu quả chi phí cùng cải thiện';
      else if (o < 0 && c > 0) conclusion = 'Sản lượng và hiệu quả chi phí cùng suy giảm';
      else if (o > 0 && c > 0) conclusion = 'Có thêm đơn nhưng chi phí mỗi đơn tăng';
      else if (o < 0 && c < 0) conclusion = 'Chi phí mỗi đơn giảm nhưng sản lượng giảm';
      else conclusion = `Số đơn ${o > 0 ? 'tăng' : o < 0 ? 'giảm' : 'ít biến động'}; CPA ${c > 0 ? 'tăng' : c < 0 ? 'giảm' : 'ít biến động'}`;
    }
    const fmt = n => n === null ? 'chưa xác định' : n.toLocaleString('vi-VN', {maximumFractionDigits:2});
    const evidence = ['cost','orders','cpa','cpc','cvr','clickReach'].map((k,i) => ({id:k, text:`${['Chi phí','Số đơn','CPA','CPC','CVR (%)','Click/reach (%)'][i]}: ${fmt(previous[k])} → ${fmt(current[k])}; ${delta[k] === null ? 'không tính % thay đổi khi mẫu số bằng 0/chưa xác định' : `${fmt(delta[k])}%`}`}));
    const rec = (title, why, measure, evidenceId) => ({title, why, measure, evidenceId});
    const recommendations = !complete ? [
      rec('Bổ sung ngày còn thiếu', `Kỳ hiện tại có ${currentRows.length}/${days} ngày, kỳ trước có ${previousRows.length}/${days} ngày.`, 'Chỉ so sánh khi cả hai kỳ đủ ngày, không nhập 0 thay ngày chưa biết.', 'coverage'),
      rec('Đối soát dữ liệu nhập', 'Dữ liệu cần hợp lệ và mỗi ngày chỉ có một bản ghi.', 'Đối chiếu chi phí, click và đơn với nguồn; sửa số âm hoặc ngày trùng.', 'coverage'),
      rec('Thống nhất cách ghi nhận đơn', 'Thiếu dữ liệu có thể làm sai tỷ lệ.', 'Dùng cùng cửa sổ ghi nhận đơn cho hai kỳ rồi tính lại.', 'coverage')
    ] : (() => {
      const ev = id => evidence.find(e => e.id === id).text;
      const dCvr = direction(delta.cvr), dCr = direction(delta.clickReach);
      // Trụ cột 1: chuyển đổi sau click (CVR)
      const conv = dCvr < 0
        ? rec('Kiểm tra hành trình sau click', ev('cvr'), 'Thử đặt hàng trên điện thoại, đo tốc độ tải trang, ghi lỗi ở bước giỏ hàng/thanh toán; so CVR ở kỳ đủ ngày kế tiếp. Đây là giả thuyết cần kiểm chứng.', 'cvr')
        : dCvr > 0
        ? rec('Giữ ổn định trang đặt hàng', ev('cvr'), 'Ghi lại thay đổi gần đây ở trang hoặc ưu đãi; tránh sửa nhiều thứ cùng lúc và theo dõi CVR có giữ được khi lưu lượng tăng.', 'cvr')
        : rec('Thử một cải thiện nhỏ ở trang đặt hàng', ev('cvr'), 'Chỉ đổi một yếu tố (nút đặt hàng, cách hiển thị giá hoặc bước thanh toán) rồi so CVR ở kỳ kế tiếp.', 'cvr');
      // Trụ cột 2: nội dung quảng cáo (click/reach)
      const creative = dCr < 0
        ? rec('Làm mới nội dung quảng cáo', ev('clickReach'), 'Thêm một đến hai biến thể khác phần mở đầu hoặc hình đầu tiên, giữ nguyên đối tượng; theo dõi click/reach và CPA. Chưa có tần suất hiển thị nên chưa kết luận nội dung bị nhàm.', 'clickReach')
        : dCr > 0
        ? rec('Nhân rộng hướng nội dung đang hiệu quả', ev('clickReach'), 'Xác định nội dung nào kéo click tốt (cần số liệu theo từng quảng cáo), dựng một biến thể gần giống để kiểm tra có giữ được kết quả không.', 'clickReach')
        : rec('Thử một biến thể nội dung', ev('clickReach'), 'Chỉ thay một yếu tố, theo dõi click/reach và CPA; bổ sung impressions nếu cần CTR chuẩn.', 'clickReach');
      // Trụ cột 3: ngân sách và CPA (đối chiếu số đơn với CPA)
      const budget = o > 0 && c > 0
        ? rec('Đặt CPA trần trước khi mở rộng thêm', ev('cpa'), 'Xác định CPA chấp nhận được; nếu CPA vượt mức đó thì giữ ngân sách thay vì tăng, rồi đối chiếu lại sau một kỳ.', 'cpa')
        : o > 0 && c < 0
        ? rec('Tăng ngân sách từng bước có kiểm soát', ev('cpa'), 'Thử tăng một mức nhỏ (ví dụ vài chục phần trăm là quy ước thận trọng, không phải chuẩn), theo dõi CPA ngày kế tiếp và dừng nếu vượt mục tiêu.', 'cpa')
        : o < 0 && c > 0
        ? rec('Rà lại đối tượng và nội dung trước khi chi thêm', ev('cpa'), 'Chưa nên tăng ngân sách; kiểm tra đối tượng đang chạy, nội dung và trang đặt hàng, đổi một thứ rồi đo lại CPA.', 'cpa')
        : o < 0 && c < 0
        ? rec('Tìm hiểu vì sao sản lượng giảm dù CPA tốt', ev('cpa'), 'Có thể phân phối đang bị giới hạn (cần thêm dữ liệu để biết); thử nâng nhẹ ngân sách ở nhóm có CPA tốt và theo dõi số đơn.', 'cpa')
        : rec('Đặt CPA mục tiêu trước khi đổi ngân sách', ev('cpa'), 'Xác định CPA chấp nhận được và mục tiêu đơn; đối chiếu cả hai sau thử nghiệm, chưa suy ra lợi nhuận.', 'cpa');
      return [conv, creative, budget];
    })();
    return {days,threshold,start,end,prevStart,prevEnd,current,previous,complete,delta,conclusion,evidence,recommendations,coverage:{current:currentRows.length,previous:previousRows.length}};
  }
  const api = {analyze,totals,shift,isValidRow};
  if (typeof module !== 'undefined') module.exports = api;
  else root.CampaignAnalysis = api;
})(typeof window !== 'undefined' ? window : globalThis);
