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
    const startN = sorted[0]?.date;
    const fmt = n => n === null ? 'chưa xác định' : n.toLocaleString('vi-VN', {maximumFractionDigits:2});
    const fmtDate = iso => iso ? iso.slice(8,10) + '/' + iso.slice(5,7) : '';
    const direction = v => v === null ? null : Math.abs(v) <= threshold ? 0 : Math.sign(v);
    const rec = (title, why, measure, evidenceId) => ({title, why, measure, evidenceId});

    // Special handling for days = 1 (always compare last 2 days if available)
    if (days === 1) {
      const start = end;
      const prevStart = end ? shift(end, -1) : null;
      const prevEnd = prevStart;
      const currentRows = sorted.filter(r => r.date === end);
      const previousRows = sorted.filter(r => r.date === prevStart);
      const current = totals(currentRows), previous = totals(previousRows);
      const complete = !!end && valid.length === rows.length && new Set(sorted.map(r=>r.date)).size === sorted.length && currentRows.length === 1 && previousRows.length === 1;
      const delta = {};
      for (const k of Object.keys(current)) delta[k] = current[k] === null || previous[k] === null || previous[k] === 0 ? null : (current[k]-previous[k])/previous[k]*100;
      const o = direction(delta.orders), c = direction(delta.cpa);
      let conclusion = 'Chưa đủ dữ liệu so sánh 1 ngày liền kề';
      if (complete) {
        if (o === null || c === null) conclusion = 'Chưa thể kết luận xu hướng: mẫu số bằng 0 hoặc CPA chưa xác định';
        else if (o > 0 && c < 0) conclusion = 'Sản lượng và hiệu quả chi phí cùng cải thiện';
        else if (o < 0 && c > 0) conclusion = 'Sản lượng và hiệu quả chi phí cùng suy giảm';
        else if (o > 0 && c > 0) conclusion = 'Có thêm đơn nhưng chi phí mỗi đơn tăng';
        else if (o < 0 && c < 0) conclusion = 'Chi phí mỗi đơn giảm nhưng sản lượng giảm';
        else conclusion = `Số đơn ${o > 0 ? 'tăng' : o < 0 ? 'giảm' : 'ít biến động'}; CPA ${c > 0 ? 'tăng' : c < 0 ? 'giảm' : 'ít biến động'}`;
      }
      const evidence = ['cost','orders','cpa','cpc','cvr','clickReach'].map((k,i) => ({id:k, text:`${['Chi phí','Số đơn','CPA','CPC','CVR (%)','Click/reach (%)'][i]}: ${fmt(previous[k])} → ${fmt(current[k])}; ${delta[k] === null ? 'không tính % thay đổi khi mẫu số bằng 0/chưa xác định' : `${fmt(delta[k])}%`}`}));
      const recommendations = !complete ? [
        rec('Bổ sung ngày hôm qua', `Cần 2 ngày liên tiếp để so sánh ngày ${fmtDate(end)} với ngày liền trước.`, 'Nhập thêm số liệu ngày hôm qua để đánh giá biến động.', 'coverage'),
        rec('Đối soát dữ liệu nhập', 'Dữ liệu cần hợp lệ và mỗi ngày chỉ có một bản ghi.', 'Đối chiếu chi phí, click và đơn với nguồn; sửa số âm hoặc ngày trùng.', 'coverage'),
        rec('Thống nhất cách ghi nhận đơn', 'Thiếu dữ liệu có thể làm sai tỷ lệ.', 'Dùng cùng cửa sổ ghi nhận đơn cho hai kỳ rồi tính lại.', 'coverage')
      ] : make3Recommendations(evidence, delta, o, c, rec);
      const driver = decomposeCpa(current, previous, delta);
      const extrema = dailyExtrema(sorted);
      return {days,threshold,start,end,prevStart,prevEnd,current,previous,complete,delta,conclusion,evidence,recommendations,driver,extrema,coverage:{current:currentRows.length,previous:previousRows.length}};
    }

    // CASE A: Under 7 days (< 7 ngày) -> Vẫn đánh giá từ ngày N đến M, chưa vội khuyên
    if (sorted.length < 7) {
      const currentRows = sorted;
      const previousRows = [];
      const current = totals(currentRows), previous = totals([]);
      const complete = false;
      const delta = { cost: null, orders: null, cpa: null, cpc: null, cvr: null, clickReach: null };
      const extrema = dailyExtrema(sorted);

      let conclusion = '';
      if (sorted.length <= 1) {
        conclusion = 'Chưa đủ dữ liệu so sánh';
      } else {
        const mid = Math.floor(sorted.length / 2);
        const h1 = totals(sorted.slice(0, mid)), h2 = totals(sorted.slice(mid));
        const len1 = mid, len2 = sorted.length - mid;
        const normH1Orders = h1.orders / len1, normH2Orders = h2.orders / len2;
        const oChange = normH1Orders > 0 ? (normH2Orders - normH1Orders) / normH1Orders * 100 : null;
        const cChange = h1.cpa && h2.cpa && h1.cpa > 0 ? (h2.cpa - h1.cpa) / h1.cpa * 100 : null;
        const oDir = direction(oChange), cDir = direction(cChange);

        let subTrend = 'Hiệu suất duy trì ổn định';
        if (oDir > 0 && cDir < 0) subTrend = 'Hiệu quả đang cải thiện (CPA xu hướng giảm, số đơn tăng)';
        else if (oDir < 0 && cDir > 0) subTrend = 'Chi phí mỗi đơn có xu hướng tăng, sản lượng đơn giảm';
        else if (oDir > 0 && cDir > 0) subTrend = 'Có thêm đơn nhưng chi phí mỗi đơn đang tăng';
        else if (oDir < 0 && cDir < 0) subTrend = 'Chi phí mỗi đơn giảm nhưng sản lượng đơn giảm';
        else if (cDir < 0) subTrend = 'Chi phí mỗi đơn (CPA) đang có xu hướng giảm tốt';
        else if (cDir > 0) subTrend = 'Chi phí mỗi đơn (CPA) đang có xu hướng tăng';

        conclusion = `Đánh giá từ ${fmtDate(startN)} đến ${fmtDate(end)} (${sorted.length} ngày): ${subTrend} (CPA tb ${current.cpa ? fmt(current.cpa) + ' ₫' : 'chưa xác định'}, ${current.orders} đơn). Đang theo dõi máy học (< 7 ngày).`;
      }

      const evidence = ['cost','orders','cpa','cpc','cvr','clickReach'].map((k,i) => ({
        id:k,
        text:`${['Chi phí','Số đơn','CPA','CPC','CVR (%)','Click/reach (%)'][i]}: ${fmt(current[k])} (tổng hợp từ ngày ${fmtDate(startN)} đến ${fmtDate(end)})`
      }));

      const recommendations = sorted.length === 0 ? [
        rec('Nhập số liệu chiến dịch', 'Chưa có bản ghi nào để phân tích.', 'Nhập số liệu theo ngày hoặc nạp file mẫu Excel/Word/PDF.', 'coverage'),
        rec('Đối soát dữ liệu nhập', 'Dữ liệu cần hợp lệ và mỗi ngày chỉ có một bản ghi.', 'Đối chiếu chi phí, click và đơn với nguồn; sửa số âm hoặc ngày trùng.', 'coverage'),
        rec('Thống nhất cách ghi nhận đơn', 'Thiếu dữ liệu có thể làm sai tỷ lệ.', 'Dùng cùng cửa sổ ghi nhận đơn cho hai kỳ rồi tính lại.', 'coverage')
      ] : [
        rec('Giai đoạn máy học (< 7 ngày)', `Dữ liệu đang được đánh giá từ ${fmtDate(startN)} đến ${fmtDate(end)} (${sorted.length} ngày).`, 'Hệ thống cần tích lũy đủ 7 ngày để hoàn tất chu kỳ học máy trước khi đưa ra 03 gợi ý tối ưu chiến dịch.', 'coverage'),
        rec('Theo dõi ngày hiệu quả nhất', `Ngày đạt CPA tốt nhất ghi nhận: ${extrema?.bestCpaDay ? fmtDate(extrema.bestCpaDay.date) + ' (CPA: ' + fmt(extrema.bestCpaDay.cpa) + ' ₫)' : 'chưa xác định'}.`, 'Quan sát xem mức CPA này có được duy trì ổn định khi chạy hết chu kỳ 7 ngày.', 'coverage'),
        rec('Duy trì ngân sách ổn định', `Tổng chi phí đã ghi nhận: ${fmt(current.cost)} ₫ qua ${sorted.length} ngày.`, 'Tránh thay đổi ngân sách quá 20% mỗi ngày trong giai đoạn máy học ban đầu.', 'coverage')
      ];

      const driver = { driverType: 'learning', driverSummary: `Đang theo dõi giai đoạn máy học (${sorted.length}/7 ngày). CPA trung bình: ${fmt(current.cpa)} ₫.` };
      return {days,threshold,start:startN,end,prevStart:null,prevEnd:null,current,previous,complete,delta,conclusion,evidence,recommendations,driver,extrema,coverage:{current:currentRows.length,previous:0}};
    }

    // CASE B: Đủ 7 ngày trở lên (>= 7 ngày) -> KHUYÊN THÔI (complete = true & 03 gợi ý cải thiện)
    let start, prevEnd, prevStart, currentRows, previousRows;
    const isConsecutive = (arr) => arr.length < 2 || arr.every((r, idx) => idx === 0 || shift(arr[idx-1].date, 1) === r.date);

    if (days === 14 && sorted.length >= 28) {
      start = shift(end, 1-days);
      prevEnd = shift(start, -1);
      prevStart = shift(start, -days);
      currentRows = sorted.filter(r => r.date >= start && r.date <= end);
      previousRows = sorted.filter(r => r.date >= prevStart && r.date <= prevEnd);
    } else if (sorted.length >= 14 && days === 7) {
      start = shift(end, 1-days);
      prevEnd = shift(start, -1);
      prevStart = shift(start, -days);
      currentRows = sorted.filter(r => r.date >= start && r.date <= end);
      previousRows = sorted.filter(r => r.date >= prevStart && r.date <= prevEnd);
    } else {
      // Có từ 7 đến 13 ngày: đánh giá chu kỳ 7 ngày gần nhất bằng cách so sánh nửa sau vs nửa trước của tuần!
      const cycle7 = sorted.slice(-7);
      const splitIdx = Math.floor(cycle7.length / 2); // 3 ngày đầu, 4 ngày sau
      previousRows = cycle7.slice(0, splitIdx);
      currentRows = cycle7.slice(splitIdx);
      start = currentRows[0].date;
      prevStart = previousRows[0].date;
      prevEnd = previousRows.at(-1).date;
    }

    const current = totals(currentRows), previous = totals(previousRows);
    const complete = currentRows.length > 0 && previousRows.length > 0;
    const delta = {};

    // Standardize delta calculation (using daily pace for absolute metrics if periods have different lengths)
    const curLen = currentRows.length, prevLen = previousRows.length;
    for (const k of ['cpa', 'cpc', 'cvr', 'clickReach']) {
      delta[k] = current[k] === null || previous[k] === null || previous[k] === 0 ? null : (current[k]-previous[k])/previous[k]*100;
    }
    for (const k of ['cost', 'orders', 'reach', 'clicks']) {
      const curNorm = current[k] / curLen;
      const prevNorm = previous[k] / prevLen;
      delta[k] = prevNorm === 0 ? null : (curNorm - prevNorm) / prevNorm * 100;
    }

    const o = direction(delta.orders), c = direction(delta.cpa);
    let conclusion = 'Chưa thể kết luận xu hướng';
    if (complete) {
      if (o === null || c === null) conclusion = 'Chưa thể kết luận xu hướng: mẫu số bằng 0 hoặc CPA chưa xác định';
      else if (o > 0 && c < 0) conclusion = 'Sản lượng và hiệu quả chi phí cùng cải thiện';
      else if (o < 0 && c > 0) conclusion = 'Sản lượng và hiệu quả chi phí cùng suy giảm';
      else if (o > 0 && c > 0) conclusion = 'Có thêm đơn nhưng chi phí mỗi đơn tăng';
      else if (o < 0 && c < 0) conclusion = 'Chi phí mỗi đơn giảm nhưng sản lượng giảm';
      else conclusion = `Số đơn ${o > 0 ? 'tăng' : o < 0 ? 'giảm' : 'ít biến động'}; CPA ${c > 0 ? 'tăng' : c < 0 ? 'giảm' : 'ít biến động'}`;
    }

    const periodLabel = prevLen !== curLen ? `nửa đầu tuần (${fmtDate(prevStart)}–${fmtDate(prevEnd)}) → nửa sau (${fmtDate(start)}–${fmtDate(end)})` : `${fmtDate(prevStart)}–${fmtDate(prevEnd)} → ${fmtDate(start)}–${fmtDate(end)}`;
    const evidence = ['cost','orders','cpa','cpc','cvr','clickReach'].map((k,i) => ({
      id:k,
      text:`${['Chi phí/ngày','Số đơn/ngày','CPA','CPC','CVR (%)','Click/reach (%)'][i]}: ${fmt(prevLen !== curLen && ['cost','orders'].includes(k) ? previous[k]/prevLen : previous[k])} → ${fmt(prevLen !== curLen && ['cost','orders'].includes(k) ? current[k]/curLen : current[k])}; ${delta[k] === null ? 'không tính % khi mẫu số bằng 0' : `${fmt(delta[k])}%`} (${periodLabel})`
    }));

    const recommendations = make3Recommendations(evidence, delta, o, c, rec);
    const driver = decomposeCpa(current, previous, delta);
    const extrema = dailyExtrema(sorted);
    return {days,threshold,start,end,prevStart,prevEnd,current,previous,complete,delta,conclusion,evidence,recommendations,driver,extrema,coverage:{current:currentRows.length,previous:previousRows.length}};
  }

  function make3Recommendations(evidence, delta, o, c, rec) {
    const direction = v => v === null ? null : Math.abs(v) <= 5 ? 0 : Math.sign(v);
    const ev = id => evidence.find(e => e.id === id)?.text || '';
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
  }
  function decomposeCpa(current, previous, delta) {
    if (!current || !previous || current.cpa === null || previous.cpa === null || delta.cpa === null) {
      return { driverType: 'unknown', driverSummary: 'Chưa đủ dữ liệu để phân rã biến động CPA.' };
    }
    const dCpc = delta.cpc ?? 0;
    const dCvr = delta.cvr ?? 0;
    let driverType = 'mixed';
    let driverSummary = '';
    if (Math.abs(delta.cpa) <= 0.05) {
      driverType = 'stable';
      driverSummary = 'CPA giữ mức ổn định giữa hai kỳ.';
    } else if (dCpc > 0 && dCvr < 0) {
      driverType = 'both_worse';
      driverSummary = `CPA tăng do cả hai yếu tố tiêu cực: CPC tăng (${dCpc.toFixed(1)}%) và CVR giảm (${dCvr.toFixed(1)}%).`;
    } else if (dCpc < 0 && dCvr > 0) {
      driverType = 'both_better';
      driverSummary = `CPA giảm nhờ cả hai yếu tố tích cực: CPC giảm (${dCpc.toFixed(1)}%) và CVR tăng (${dCvr.toFixed(1)}%).`;
    } else if (Math.abs(dCpc) >= Math.abs(dCvr)) {
      driverType = 'cpc_driven';
      const dir = dCpc > 0 ? 'tăng' : 'giảm';
      driverSummary = `Biến động CPA chủ yếu do chi phí mỗi click (CPC ${dir} ${Math.abs(dCpc).toFixed(1)}%).`;
    } else {
      driverType = 'cvr_driven';
      const dir = dCvr < 0 ? 'suy giảm' : 'cải thiện';
      driverSummary = `Biến động CPA chủ yếu do tỷ lệ chuyển đổi đơn hàng (CVR ${dir} ${Math.abs(dCvr).toFixed(1)}%).`;
    }
    return { driverType, driverSummary };
  }
  function dailyExtrema(rows) {
    const valid = (rows || []).filter(isValidRow);
    if (valid.length === 0) return null;
    const withMetrics = valid.map(r => ({
      ...r,
      cpa: r.orders > 0 ? r.cost / r.orders : null,
      cpc: r.clicks > 0 ? r.cost / r.clicks : null,
      cvr: r.clicks > 0 ? (r.orders * 100) / r.clicks : null,
      clickReach: r.reach > 0 ? (r.clicks * 100) / r.reach : null
    }));
    const cpaDays = withMetrics.filter(r => r.cpa !== null);
    const bestCpa = cpaDays.length > 0 ? cpaDays.reduce((min, r) => r.cpa < min.cpa ? r : min) : null;
    const worstCpa = cpaDays.length > 0 ? cpaDays.reduce((max, r) => r.cpa > max.cpa ? r : max) : null;
    const maxOrders = withMetrics.reduce((max, r) => r.orders > max.orders ? r : max, withMetrics[0]);
    const maxCost = withMetrics.reduce((max, r) => r.cost > max.cost ? r : max, withMetrics[0]);
    return {
      bestCpaDay: bestCpa ? { date: bestCpa.date, cpa: Math.round(bestCpa.cpa), orders: bestCpa.orders } : null,
      worstCpaDay: worstCpa ? { date: worstCpa.date, cpa: Math.round(worstCpa.cpa), orders: worstCpa.orders } : null,
      maxOrdersDay: { date: maxOrders.date, orders: maxOrders.orders, cost: maxOrders.cost },
      maxCostDay: { date: maxCost.date, cost: maxCost.cost, orders: maxCost.orders }
    };
  }
  function extractAllowedNumbers(snapshot, rows = []) {
    const set = new Set([0, 1, 2, 3, 4, 5, 7, 10, 14, 100]);
    const addNum = val => {
      if (typeof val === 'number' && Number.isFinite(val)) {
        const abs = Math.abs(val);
        for (const v of [val, abs]) {
          set.add(Math.round(v));
          set.add(Math.round(v * 10) / 10);
          set.add(Math.round(v * 100) / 100);
          set.add(Math.floor(v));
          set.add(Number(v.toFixed(1)));
          set.add(Number(v.toFixed(2)));
        }
      }
    };
    if (snapshot) {
      for (const group of [snapshot.current, snapshot.previous, snapshot.delta]) {
        if (group) Object.values(group).forEach(addNum);
      }
      if (snapshot.extrema) {
        for (const obj of Object.values(snapshot.extrema)) {
          if (obj && typeof obj === 'object') Object.values(obj).forEach(addNum);
        }
      }
    }
    for (const r of rows) {
      for (const k of ['cost', 'reach', 'clicks', 'orders']) addNum(r[k]);
      if (r.orders > 0) addNum(r.cost / r.orders);
      if (r.clicks > 0) {
        addNum(r.cost / r.clicks);
        addNum((r.orders * 100) / r.clicks);
      }
      if (r.reach > 0) addNum((r.clicks * 100) / r.reach);
    }
    return set;
  }
  const api = {analyze,totals,shift,isValidRow,decomposeCpa,dailyExtrema,extractAllowedNumbers};
  if (typeof module !== 'undefined') module.exports = api;
  else root.CampaignAnalysis = api;
})(typeof window !== 'undefined' ? window : globalThis);
