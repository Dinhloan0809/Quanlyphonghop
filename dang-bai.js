/* Bộ máy "Luyện theo dạng": đọc một dạng bài (đề + khoảng số + công thức) và sinh ra đề mới mỗi lần gọi.
   Dùng chung cho portal.html (học viên) và quiz-admin.html (trang quản trị). Đặt cùng thư mục với hai file đó.
   Dữ liệu các dạng nằm ở file riêng (ví dụ dangbai-chuyen-mon.json), sửa trong trang quản trị, không sửa ở đây. */
(function(){
  const N = (x, d) => { d = d == null ? 2 : d; const s = Math.abs(x).toFixed(d); const p = s.split("."); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, "."); return (x < 0 && Number(s) !== 0 ? "−" : "") + p.join(","); };
  // Số hiển thị trong đề: số nguyên thì không có phần thập phân, số lẻ thì bỏ số 0 thừa
  const auto = x => { if(Math.abs(x - Math.round(x)) < 1e-7) return N(Math.round(x), 0); let d = 4; let s = x.toFixed(d); while(d > 0 && s[s.length - 1] === "0"){ d--; s = x.toFixed(d); } return N(x, d); };

  /* ---------- Tính công thức (không dùng eval) ----------
     Hỗ trợ: + − * / ^, ngoặc, số có dấu chấm thập phân, % sau một giá trị (r% = r/100),
     so sánh < > <= >= == !=, and/or, và các hàm bên dưới. */
  const FN = {
    floor: Math.floor, ceil: Math.ceil, round: (x, d) => { const k = Math.pow(10, d || 0); return Math.round(x * k) / k; },
    sqrt: Math.sqrt, ln: Math.log, exp: Math.exp, abs: Math.abs, min: Math.min, max: Math.max, pow: Math.pow,
    xuong: (x, b) => Math.floor(x / b + 1e-9) * b,   // làm tròn xuống theo bước giá
    len: (x, b) => Math.ceil(x / b - 1e-9) * b       // làm tròn lên theo bước giá
  };
  function tokenize(src){
    const out = []; const re = /\s*(\d+(?:\.\d+)?|[A-Za-z_À-ỹ][A-Za-z0-9_À-ỹ]*|<=|>=|==|!=|&&|\|\||[-+*/^()%,<>])/y; let m;
    re.lastIndex = 0;
    while(re.lastIndex < src.length){
      if(/^\s*$/.test(src.slice(re.lastIndex))) break;
      m = re.exec(src);
      if(!m) throw new Error("Không đọc được công thức ở: “" + src.slice(re.lastIndex, re.lastIndex + 12) + "”");
      out.push(m[1]);
    }
    return out;
  }
  function ev(src, scope){
    const t = tokenize(String(src == null ? "" : src).replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-"));
    if(!t.length) throw new Error("Công thức đang để trống");
    let i = 0;
    const peek = () => t[i], next = () => t[i++];
    function primary(){
      const k = next();
      if(k === undefined) throw new Error("Công thức bị thiếu ở cuối");
      let v;
      if(k === "("){ v = or(); if(next() !== ")") throw new Error("Thiếu dấu đóng ngoặc )"); }
      else if(/^\d/.test(k)) v = parseFloat(k);
      else if(/^[A-Za-z_À-ỹ]/.test(k)){
        if(peek() === "("){
          next(); const args = [];
          if(peek() !== ")"){ args.push(or()); while(peek() === ","){ next(); args.push(or()); } }
          if(next() !== ")") throw new Error("Thiếu dấu đóng ngoặc ) sau hàm " + k);
          if(!FN[k]) throw new Error("Không có hàm “" + k + "”");
          v = FN[k].apply(null, args);
        } else {
          if(!(k in scope)) throw new Error("Chưa khai báo biến “" + k + "”");
          v = scope[k];
        }
      } else throw new Error("Không hiểu ký hiệu “" + k + "”");
      while(peek() === "%"){ next(); v = v / 100; }
      return v;
    }
    function power(){ const b = primary(); if(peek() === "^"){ next(); return Math.pow(b, unary()); } return b; }
    function unary(){ if(peek() === "-"){ next(); return -unary(); } if(peek() === "+"){ next(); return unary(); } return power(); }
    function term(){ let v = unary(); while(peek() === "*" || peek() === "/"){ const o = next(); const r = unary(); v = o === "*" ? v * r : v / r; } return v; }
    function sum(){ let v = term(); while(peek() === "+" || peek() === "-"){ const o = next(); const r = term(); v = o === "+" ? v + r : v - r; } return v; }
    function cmp(){ let v = sum(); const o = peek();
      if(["<", ">", "<=", ">=", "==", "!="].indexOf(o) >= 0){ next(); const r = sum();
        v = o === "<" ? v < r : o === ">" ? v > r : o === "<=" ? v <= r : o === ">=" ? v >= r : o === "==" ? Math.abs(v - r) < 1e-9 : Math.abs(v - r) >= 1e-9; v = v ? 1 : 0; }
      return v; }
    function and(){ let v = cmp(); while(peek() === "and" || peek() === "&&"){ next(); const r = cmp(); v = (v && r) ? 1 : 0; } return v; }
    function or(){ let v = and(); while(peek() === "or" || peek() === "||"){ next(); const r = and(); v = (v || r) ? 1 : 0; } return v; }
    const v = or();
    if(i < t.length) throw new Error("Thừa ký hiệu “" + t[i] + "” trong công thức");
    return v;
  }

  const fmtAns = (def, v) => { const u = def.unit || ""; return N(v, def.dec == null ? 2 : Number(def.dec)) + (u ? (u === "%" ? "" : " ") + u : ""); };
  /* Chữ trong đề và lời giải: {P} = giá trị biến, {P:2} = 2 số lẻ, {m#} = nhãn chữ của biến, {=công thức:2} = tính tại chỗ, {dapan} = đáp án đúng */
  function fill(tpl, scope, labels, answer){
    return String(tpl || "").replace(/\{([^{}]+)\}/g, (all, body) => {
      body = body.trim();
      if(body === "dapan" || body === "đáp án") return answer;
      let d = null; const m = body.match(/^(.*):(\d)$/); if(m){ body = m[1].trim(); d = Number(m[2]); }
      if(body[body.length - 1] === "#"){ const k = body.slice(0, -1).trim(); return labels[k] != null ? labels[k] : all; }
      let v;
      if(body[0] === "=") v = ev(body.slice(1), scope);
      else if(body in scope) v = scope[body];
      else return all;
      return d == null ? auto(v) : N(v, d);
    });
  }

  function drawVar(v, R){
    if(Array.isArray(v.pick) && v.pick.length){ const i = Math.floor(Math.random() * v.pick.length); return { val: Number(v.pick[i]), label: v.labels ? v.labels[i] : null }; }
    const min = Number(v.min), max = Number(v.max), step = Number(v.step) > 0 ? Number(v.step) : 1;
    const n = Math.max(0, Math.floor((max - min) / step + 1e-9));
    return { val: +(min + step * Math.floor(Math.random() * (n + 1))).toFixed(8), label: null };
  }

  /* Sinh một đề từ một dạng. Trả về { q, ok, wrong:[3], steps:[], trap } hoặc ném lỗi có lời giải thích bằng tiếng Việt. */
  function makeOnce(def, R){
    if(def.kind === "code"){
      const g = CODE[def.code]; if(!g) throw new Error("Dạng đặc biệt “" + def.code + "” không có trong bộ máy");
      return g(R || RAND);
    }
    const scope = {}, labels = {};
    (def.vars || []).forEach(v => { if(!v.k) return; const r = drawVar(v, R); scope[v.k] = r.val; if(r.label != null) labels[v.k] = r.label; });
    (def.calc || []).forEach(c => { if(c.k) scope[c.k] = ev(c.f, scope); });
    if(def.cond && String(def.cond).trim() && !ev(def.cond, scope)) return null;
    const okVal = ev(def.ok, scope);
    const ok = fmtAns(def, okVal);
    const wrong = (def.wrong || []).slice(0, 3).map(w => fmtAns(def, ev(w.f, scope)));
    const txt = s => fill(s, scope, labels, ok);
    return { q: txt(def.q), ok, wrong, steps: (def.steps || []).filter(s => String(s).trim()).map(txt), trap: txt(def.trap) };
  }
  function valid(g){
    if(!g || !g.wrong) return "không ra đề";
    const o = [g.ok].concat(g.wrong);
    if(o.length !== 4) return "chưa đủ 3 đáp án sai";
    if(/NaN|Infinity|undefined/.test(o.join("|") + g.q)) return "ra số lỗi (chia cho 0 hoặc thiếu biến)";
    if(new Set(o).size !== 4) return "có đáp án trùng nhau";
    return "";
  }
  function generate(def, R){
    for(let i = 0; i < 80; i++){
      let g = null;
      try{ g = makeOnce(def, R); }catch(e){ return null; }
      if(g && !valid(g)) return g;
    }
    return null;
  }
  /* Thử nhiều bộ số để báo cho người soạn biết dạng này có ổn không */
  function selfTest(def, times){
    times = times || 200; let good = 0; const why = {}; let err = "";
    for(let i = 0; i < times; i++){
      let g = null;
      try{ g = makeOnce(def); }catch(e){ err = e.message; break; }
      const v = g ? valid(g) : "bộ số không thỏa điều kiện";
      if(!v) good++; else why[v] = (why[v] || 0) + 1;
    }
    return { times, good, why, err };
  }

  /* ---------- Các dạng đặc biệt: đề không viết được bằng một công thức ---------- */
  const RAND = { int(a, b, step){ step = step || 1; return a + step * Math.floor(Math.random() * (Math.floor((b - a) / step) + 1)); }, pick(arr){ return arr[Math.floor(Math.random() * arr.length)]; } };
  const DAYS = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu"];
  const PC = (x, d) => N(x * 100, d) + "%";
  const CODE = {
    kldk(R){
      const base = R.int(15, 60), ps = [0, 1, 2, 3].map(i => +(base + i * 0.1).toFixed(1));
      const buy = ps.map(() => R.int(1, 6) * 500), sell = ps.map(() => R.int(1, 6) * 500);
      const rows = ps.map((p, i) => { const b = buy.slice(i).reduce((x, y) => x + y, 0), s = sell.slice(0, i + 1).reduce((x, y) => x + y, 0); return { p, b, s, m: Math.min(b, s) }; });
      const best = rows.slice().sort((x, y) => y.m - x.m);
      if(best[0].m === best[1].m) return null;
      const f = r => `Giá ${N(r.p, 1)}, khối lượng ${N(r.m, 0)} cổ phiếu`;
      return { q: `Sổ lệnh đợt khớp lệnh định kỳ (giá nghìn đồng). Lệnh MUA: ${ps.map((p, i) => `${N(p, 1)} – ${N(buy[i], 0)} CP`).reverse().join("; ")}. Lệnh BÁN: ${ps.map((p, i) => `${N(p, 1)} – ${N(sell[i], 0)} CP`).join("; ")}. Giá và khối lượng khớp lệnh là:`,
        ok: f(best[0]), wrong: rows.filter(r => r !== best[0]).map(f),
        steps: rows.map(r => `Giá ${N(r.p, 1)}: mua cộng dồn ${N(r.b, 0)}, bán cộng dồn ${N(r.s, 0)} → khớp được ${N(r.m, 0)}`).concat([`Chọn giá ${N(best[0].p, 1)} vì khối lượng khớp lớn nhất`]),
        trap: `Mua cộng dồn từ giá CAO xuống, bán cộng dồn từ giá THẤP lên.` };
    },
    kllt(R){
      const base = R.int(15, 60), p = [0, 1, 2].map(i => +(base + i * 0.1).toFixed(1)), v = [R.int(1, 4) * 500, R.int(1, 4) * 500, R.int(2, 6) * 500];
      const qty = v[0] + v[1] + R.int(1, 3) * 500, matched = v[0] + v[1], val = (v[0] * p[0] + v[1] * p[1]) / 1000;
      return { q: `Sổ lệnh bán đang chờ (giá nghìn đồng): ${p.map((x, i) => `${N(x, 1)} – ${N(v[i], 0)} CP`).join("; ")}. Nhà đầu tư đặt lệnh giới hạn MUA ${N(qty, 0)} CP giá ${N(p[1], 1)}. Khối lượng và giá trị khớp ngay là:`,
        ok: `${N(matched, 0)} cổ phiếu, ${N(val, 2)} triệu đồng`,
        wrong: [`${N(matched, 0)} cổ phiếu, ${N(matched * p[1] / 1000, 2)} triệu đồng`, `${N(qty, 0)} cổ phiếu, ${N(qty * p[1] / 1000, 2)} triệu đồng`, `${N(v[0], 0)} cổ phiếu, ${N(v[0] * p[0] / 1000, 2)} triệu đồng`],
        steps: [`Khớp ${N(v[0], 0)} CP giá ${N(p[0], 1)} và ${N(v[1], 0)} CP giá ${N(p[1], 1)}`, `Giá trị = ${N(v[0], 0)} × ${N(p[0] * 1000, 0)} + ${N(v[1], 0)} × ${N(p[1] * 1000, 0)} = ${N(val, 2)} triệu đồng`, `Còn ${N(qty - matched, 0)} CP chờ mua ở giá ${N(p[1], 1)}`],
        trap: `Khớp theo giá của lệnh đang chờ, không phải tất cả theo giá đặt mua.` };
    },
    t2(R){
      const i = R.int(0, 4), kind = R.pick([["bán", "tiền bán"], ["mua", "cổ phiếu"]]), j = (i + 2) % 5;
      const w = k => DAYS[(i + k) % 5] + (i + k > 4 ? " tuần sau" : " cùng tuần");
      return { q: `Nhà đầu tư ${kind[0]} cổ phiếu vào ${DAYS[i]} (không có ngày nghỉ lễ). Với chu kỳ thanh toán T+2, ${kind[1]} về tài khoản vào:`,
        ok: w(2), wrong: [w(1), w(3), i <= 2 ? "Thứ Bảy cùng tuần" : w(4)],
        steps: [`${DAYS[i]} là ngày T`, `${DAYS[(i + 1) % 5]} là T+1, ${DAYS[j]} là T+2`], trap: `Thứ Bảy và Chủ nhật không tính.` };
    },
    khq(R){
      const i = R.int(0, 4), j = (i + 4) % 5, prev = i === 0;
      return { q: `Ngày đăng ký cuối cùng để nhận cổ tức là ${DAYS[i]}. Ngày giao dịch không hưởng quyền là:`,
        ok: DAYS[j] + (prev ? " tuần trước" : " cùng tuần"),
        wrong: [DAYS[i] + " (chính ngày đăng ký cuối cùng)", DAYS[(i + 3) % 5] + (i < 2 ? " tuần trước" : " cùng tuần"), DAYS[(i + 1) % 5] + (i === 4 ? " tuần sau" : " cùng tuần")],
        steps: [`Ngày làm việc liền trước ${DAYS[i]} là ${DAYS[j]}${prev ? " tuần trước" : ""}`, `Mua từ ngày này trở đi thì không được nhận quyền`], trap: `Muốn nhận quyền phải mua trước ngày không hưởng quyền.` };
    },
    epsdoi(R){
      const x = R.pick([0.1, 0.2, 0.3]), y = R.pick([0.05, 0.1, 0.15].filter(k => k !== x)), v = (1 + x) / (1 + y) - 1;
      return { q: `Năm tới lợi nhuận sau thuế tăng ${PC(x, 0)} trong khi số cổ phiếu lưu hành tăng ${PC(y, 0)}. EPS thay đổi:`,
        ok: (v >= 0 ? "Tăng " : "Giảm ") + PC(Math.abs(v)),
        wrong: [(x - y >= 0 ? "Tăng " : "Giảm ") + PC(Math.abs(x - y)), "Tăng " + PC(x + y), "Tăng " + PC(x * (1 - y) + 0.001)],
        steps: [`EPS mới / EPS cũ = ${N(1 + x)} / ${N(1 + y)} = ${N((1 + x) / (1 + y), 4)}`, `EPS ${v >= 0 ? "tăng" : "giảm"} ${PC(Math.abs(v))}`], trap: `Không lấy hai tỷ lệ trừ thẳng cho nhau.` };
    }
  };
  const CODE_NAMES = { kldk: "Khớp lệnh định kỳ (sổ lệnh ngẫu nhiên)", kllt: "Khớp lệnh liên tục (sổ lệnh ngẫu nhiên)", t2: "Ngày thanh toán T+2", khq: "Ngày giao dịch không hưởng quyền", epsdoi: "EPS tăng/giảm bao nhiêu %" };

  window.CCHN_DRILL = { generate, selfTest, makeOnce, valid, ev, fill, N, CODE_NAMES };
})();
