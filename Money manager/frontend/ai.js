// ════════════════════════════════════════════════════════
//  MyPocket — AI INSIGHTS ENGINE  (ai.js)
//  Runs entirely client-side using cached transaction data.
// ════════════════════════════════════════════════════════

const AI_CAT_EMOJI = {
  food: '🍔', transport: '🚗', bills: '⚡', shopping: '🛍️',
  health: '💊', other: '📦', auto: '🔁', income: '💰'
};
const AI_CAT_COL = {
  food: '#f59e0b', transport: '#3b82f6', bills: '#a855f7',
  shopping: '#ef4444', health: '#10b981', other: '#64748b', auto: '#f97316'
};

// ── Helper: pull computed data from shared cache ──────────
function aiGetCurrentData() {
  const income   = (typeof cache !== 'undefined' && cache.income)   || [];
  const expenses = (typeof cache !== 'undefined' && cache.expenses) || [];
  const autopay  = ((typeof cache !== 'undefined' && cache.autopay) || []).filter(a => a.active);

  const totalIncome   = income.reduce((s, i) => s + i.amount, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const totalAuto     = autopay.reduce((s, a) => s + a.amount, 0);
  const savings       = totalIncome - totalExpenses - totalAuto;
  const savePct       = totalIncome > 0 ? (savings / totalIncome * 100) : 0;

  const catTotals = {};
  ['food','transport','bills','shopping','health','other'].forEach(c => {
    catTotals[c] = expenses.filter(e => e.category === c).reduce((s, e) => s + e.amount, 0);
  });

  const topCat = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];
  const [y, m] = (typeof currentMonth !== 'undefined' ? currentMonth : '').split('-');
  const today       = new Date();
  const daysInMonth = (+y && +m) ? new Date(+y, +m, 0).getDate() : 30;
  const dayOfMonth  = (today.getFullYear() == +y && today.getMonth() + 1 == +m)
    ? today.getDate() : daysInMonth;

  return {
    income, expenses, autopay, totalIncome, totalExpenses, totalAuto,
    savings, savePct, catTotals, topCat, y, m, daysInMonth, dayOfMonth
  };
}

// Currency formatter (reuses app.js fmt if available)
function aiFmt(n) {
  return typeof fmt === 'function' ? fmt(n) : '₹' + Math.round(n).toLocaleString('en-IN');
}

// ── AI SEARCH ─────────────────────────────────────────────
function onAISearchInput(val) {
  if (!val.trim()) {
    const el = document.getElementById('ai-search-results');
    if (el) el.innerHTML = '';
  }
}

function runAISearch() {
  const raw = ((document.getElementById('ai-search-input') || {}).value || '').toLowerCase().trim();
  const el  = document.getElementById('ai-search-results');
  if (!el) return;
  if (!raw) { el.innerHTML = ''; return; }

  const { income, expenses, autopay } = aiGetCurrentData();

  // Intent detection
  const isTop  = /top|most|highest|biggest|largest/.test(raw);
  const wantsIncome = /income|salary|earn/.test(raw);

  // Category mapping
  const catMap = {
    food:      ['food','eat','restaurant','grocery','zomato','swiggy','lunch','dinner','breakfast','cafe'],
    transport: ['transport','uber','ola','petrol','fuel','metro','bus','cab','rapido','auto'],
    bills:     ['bill','bills','subscription','netflix','jio','rent','wifi','airtel','recharge','emi'],
    shopping:  ['shopping','amazon','flipkart','clothes','shoes','mall','myntra','ajio'],
    health:    ['health','medicine','doctor','gym','pharmacy','apollo','1mg']
  };
  let catFilter = null;
  for (const [cat, keys] of Object.entries(catMap)) {
    if (keys.some(k => raw.includes(k))) { catFilter = cat; break; }
  }

  // Amount filter
  const amtMatch = raw.match(/(?:over|above|more than|under|below|less than)\s*(\d+)/);
  let amtFilter = null, amtDir = null;
  if (amtMatch) {
    amtFilter = parseFloat(amtMatch[1]);
    amtDir    = /under|below|less/.test(amtMatch[0]) ? 'lt' : 'gt';
  }

  let results = [], title = '';

  if (wantsIncome) {
    results = income.map(i => ({ date: i.date, desc: i.label, cat: 'income', pay: 'Income', amount: i.amount, sign: 1 }));
    title   = 'Income Transactions';
  } else {
    let pool = [
      ...expenses.map(e => ({ date: e.date, desc: e.desc, cat: e.category, pay: e.payment, amount: e.amount, sign: -1 })),
      ...autopay.map(a  => ({ date: 'Recurring', desc: a.name, cat: 'auto', pay: a.payment, amount: a.amount, sign: -1 }))
    ];

    if (catFilter) {
      pool  = pool.filter(t => t.cat === catFilter);
      title = catFilter.charAt(0).toUpperCase() + catFilter.slice(1) + ' Expenses';
    } else {
      const stopWords = /top|most|highest|recent|latest|show|this month|expenses|transactions|spending|all/g;
      const kws = raw.replace(stopWords, '').trim().split(/\s+/).filter(k => k.length > 1);
      if (kws.length) pool = pool.filter(t => kws.some(k => t.desc.toLowerCase().includes(k)));
      title = 'Search Results';
    }

    if (amtFilter !== null) {
      pool = pool.filter(t => amtDir === 'gt' ? t.amount > amtFilter : t.amount < amtFilter);
    }
    results = pool;
  }

  if (isTop) results = results.sort((a, b) => b.amount - a.amount);
  results = results.slice(0, 20);

  if (!results.length) {
    el.innerHTML = `<div class="bg-white rounded-2xl border border-slate-100 p-6 text-center text-slate-500 text-sm">
      No results for <strong>"${raw}"</strong>. Try "food", "top expenses", "show transport", or "income".
    </div>`;
    return;
  }

  const total = results.reduce((s, t) => s + t.amount, 0);
  el.innerHTML = `
    <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div class="flex justify-between items-center p-4 border-b border-slate-100">
        <span class="font-bold text-slate-800 text-sm">${title} <span class="text-slate-400 font-normal">(${results.length})</span></span>
        <span class="font-bold text-sm" style="color:#a855f7;">${aiFmt(total)}</span>
      </div>
      <div>
        ${results.map(t => `
          <div class="flex items-center justify-between px-4 py-3 hover:bg-slate-50 border-b border-slate-50 last:border-0 transition-colors">
            <div class="flex items-center gap-3">
              <span class="text-xl">${AI_CAT_EMOJI[t.cat] || '📦'}</span>
              <div>
                <p class="font-semibold text-sm text-slate-800">${t.desc}</p>
                <p class="text-xs text-slate-400 mt-0.5">${t.cat.toUpperCase()} · ${t.date}</p>
              </div>
            </div>
            <span class="font-bold text-sm ${t.sign > 0 ? 'text-green-600' : 'text-red-500'}">
              ${t.sign > 0 ? '+' : '−'}${aiFmt(t.amount)}
            </span>
          </div>`).join('')}
      </div>
    </div>`;
}

// ── AI MONTHLY OVERVIEW ───────────────────────────────────
async function generateAIOverview() {
  const btn = document.getElementById('ai-overview-btn');
  const el  = document.getElementById('ai-overview-content');
  if (!btn || !el) return;

  btn.disabled = true;
  btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px;animation:aiSpin 1s linear infinite;display:inline-block;">refresh</span>&nbsp;Thinking...`;

  const d = aiGetCurrentData();
  const monthLabel = (+d.y && +d.m)
    ? new Date(+d.y, +d.m - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
    : 'This Month';

  try {
    const aiData = await api('POST', '/api/ai/insights', { d, monthLabel });
    
    if (aiData.error) throw new Error(aiData.error);

    const gradeColor = { S: '#10b981', A: '#3b82f6', B: '#f59e0b', C: '#f97316', D: '#ef4444' }[aiData.grade] || '#3b82f6';

    el.innerHTML = `
      <div class="flex flex-wrap gap-6 items-start mb-6">
        <div class="text-center">
          <div class="text-6xl font-extrabold font-headline leading-none" style="color:${gradeColor};">${aiData.grade}</div>
          <div class="text-xs text-slate-400 font-bold mt-2 uppercase tracking-widest">Finance Score</div>
        </div>
        <div class="flex-1 min-w-[200px]">
          <p class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">${monthLabel} Summary</p>
          <p class="text-slate-700 text-sm leading-relaxed">${aiData.summary}</p>
        </div>
      </div>
      ${aiData.insights && aiData.insights.length ? `
        <div class="border-t border-slate-100 pt-5">
          <p class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Key Insights</p>
          <div class="space-y-2">
            ${aiData.insights.map(i => `<div class="text-sm text-slate-700 bg-slate-50 rounded-xl p-3">${i}</div>`).join('')}
          </div>
        </div>` : ''}
      <div class="mt-5 grid grid-cols-3 gap-4">
        ${[
          { label: 'Income',  value: aiFmt(d.totalIncome), color: '#10b981' },
          { label: 'Spent',   value: aiFmt(d.totalExpenses + d.totalAuto), color: '#ef4444' },
          { label: 'Saved',   value: aiFmt(d.savings), color: d.savings >= 0 ? '#3b82f6' : '#ef4444' }
        ].map(s => `
          <div class="bg-slate-50 rounded-2xl p-4 text-center">
            <div class="text-lg font-extrabold font-headline" style="color:${s.color};">${s.value}</div>
            <div class="text-xs text-slate-400 font-bold mt-1">${s.label}</div>
          </div>`).join('')}
      </div>`;
  } catch (err) {
    el.innerHTML = `<div class="p-4 text-center text-sm text-red-500">Error generating insights: ${err.message}</div>`;
  }

  btn.disabled = false;
  btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px;">auto_awesome</span>&nbsp;Regenerate`;
}

// ── AI BUDGET COACH ───────────────────────────────────────
async function renderAICoach() {
  const el = document.getElementById('ai-coach-content');
  if (!el) return;

  const d = aiGetCurrentData();
  if (!d.totalIncome && !d.totalExpenses) {
    el.innerHTML = `<p class="text-sm text-slate-400 text-center py-8">Add some transactions to unlock personalised coaching.</p>`;
    return;
  }

  el.innerHTML = `<div class="py-8 text-center text-sm text-slate-400"><span class="material-symbols-outlined" style="font-size:16px;animation:aiSpin 1s linear infinite;display:inline-block;">refresh</span>&nbsp;Generating Coach Tips...</div>`;

  try {
    const aiData = await api('POST', '/api/ai/insights', { d, monthLabel: d.m, feature: 'coach' });
    if (aiData.error) throw new Error(aiData.error);
    
    const tips = aiData.tips || [];
    
    if (tips.length === 0) {
      tips.push({ icon: '👍', type: 'good', title: 'Finances look healthy!', body: 'No major red flags. Keep the consistent tracking going!' });
    }

    const typeStyle = { danger: 'border-red-200 bg-red-50', warn: 'border-amber-200 bg-amber-50', good: 'border-green-200 bg-green-50' };
    el.innerHTML = `<div class="space-y-3">
      ${tips.map(t => `
        <div class="flex items-start gap-3 p-4 rounded-2xl border ${typeStyle[t.type] || typeStyle.good}">
          <span class="text-xl flex-shrink-0">${t.icon || '💡'}</span>
          <div>
            <p class="font-bold text-sm text-slate-800">${t.title || 'Tip'}</p>
            <p class="text-xs text-slate-600 mt-0.5 leading-relaxed">${t.body || ''}</p>
          </div>
        </div>`).join('')}
    </div>`;
  } catch (err) {
    el.innerHTML = `<div class="p-4 text-center text-sm text-red-500">Error generating coach tips: ${err.message}</div>`;
  }
}

// ── AI SPENDING FORECAST ──────────────────────────────────
async function renderAIPrediction() {
  const el = document.getElementById('ai-prediction-content');
  if (!el) return;

  const d = aiGetCurrentData();
  const today = new Date();
  const isCurrentMonth = today.getFullYear() == +d.y && today.getMonth() + 1 == +d.m;

  if (!isCurrentMonth) {
    el.innerHTML = `<p class="text-sm text-slate-400 text-center py-8">Forecast is available only for the current month.</p>`;
    return;
  }
  if (!d.totalExpenses && !d.totalIncome) {
    el.innerHTML = `<p class="text-sm text-slate-400 text-center py-8">Add transactions first to generate a forecast.</p>`;
    return;
  }

  el.innerHTML = `<div class="py-8 text-center text-sm text-slate-400"><span class="material-symbols-outlined" style="font-size:16px;animation:aiSpin 1s linear infinite;display:inline-block;">refresh</span>&nbsp;Calculating Forecast...</div>`;

  try {
    const aiData = await api('POST', '/api/ai/insights', { d, monthLabel: d.m, feature: 'forecast' });
    if (aiData.error) throw new Error(aiData.error);

    const projectedSav = aiData.projectedSav || 0;
    const projectedExp = aiData.projectedExp || 0;
    const statusLabel  = aiData.statusLabel || (projectedSav >= 0 ? 'On Track ✅' : 'Over Budget Risk ⚠️');
    
    const daysElapsed  = Math.max(1, d.dayOfMonth);
    const daysLeft     = Math.max(0, d.daysInMonth - daysElapsed);
    const dailyBurn    = (d.totalExpenses + d.totalAuto) / daysElapsed;
    const color        = projectedSav >= 0 ? '#10b981' : '#ef4444';

    const bars = [
      { label: 'Spent so far',          val: d.totalExpenses + d.totalAuto, max: Math.max(d.totalIncome, 1), color: '#ef4444' },
      { label: 'Projected total spend', val: Math.min(projectedExp, d.totalIncome * 1.5), max: Math.max(d.totalIncome * 1.5, 1), color: '#f59e0b' },
      { label: 'Projected savings',     val: Math.max(projectedSav, 0), max: Math.max(d.totalIncome, 1), color: '#10b981' }
    ];

    el.innerHTML = `
      <div class="text-center mb-6">
        <div class="text-3xl font-extrabold font-headline" style="color:${color};">${aiFmt(Math.round(projectedSav))}</div>
        <div class="text-xs font-bold uppercase tracking-wider mt-1" style="color:${color};">${statusLabel}</div>
        <div class="text-xs text-slate-400 mt-2">${daysLeft} days remaining · Daily burn: ${aiFmt(Math.round(dailyBurn))}</div>
      </div>
      <div class="space-y-4">
        ${bars.map(b => `
          <div>
            <div class="flex justify-between text-xs text-slate-500 mb-1.5">
              <span>${b.label}</span>
              <span class="font-bold text-slate-700">${aiFmt(Math.round(b.val))}</span>
            </div>
            <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div class="h-full rounded-full transition-all duration-700"
                style="width:${Math.min(100, b.val / b.max * 100).toFixed(1)}%;background:${b.color};"></div>
            </div>
          </div>`).join('')}
      </div>`;
  } catch (err) {
    el.innerHTML = `<div class="p-4 text-center text-sm text-red-500">Error generating forecast: ${err.message}</div>`;
  }
}

// ── AI ANOMALY DETECTION ──────────────────────────────────
async function renderAIAnomalies() {
  const el = document.getElementById('ai-anomaly-content');
  if (!el) return;

  const d = aiGetCurrentData();
  
  el.innerHTML = `<div class="py-8 text-center text-sm text-slate-400"><span class="material-symbols-outlined" style="font-size:16px;animation:aiSpin 1s linear infinite;display:inline-block;">refresh</span>&nbsp;Hunting for Anomalies...</div>`;

  try {
    const aiData = await api('POST', '/api/ai/insights', { d, monthLabel: d.m, feature: 'anomalies' });
    if (aiData.error) throw new Error(aiData.error);
    
    const anomalies = aiData.anomalies || [];

    if (!anomalies.length) {
      el.innerHTML = `
        <div class="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-2xl">
          <span class="text-2xl">✅</span>
          <div>
            <p class="font-bold text-sm text-slate-800">No anomalies detected!</p>
            <p class="text-xs text-slate-600 mt-0.5">Spending patterns look normal for this month. Keep it up!</p>
          </div>
        </div>`;
      return;
    }

    el.innerHTML = `<div class="space-y-3">
      ${anomalies.map(a => `
        <div class="flex items-start gap-3 p-4 rounded-2xl border border-amber-200 bg-amber-50">
          <span class="text-xl flex-shrink-0">${a.icon || '⚠️'}</span>
          <div>
            <p class="font-bold text-sm text-slate-800">${a.title}</p>
            <p class="text-xs text-slate-600 mt-0.5">${a.body}</p>
          </div>
        </div>`).join('')}
    </div>`;
  } catch (err) {
    el.innerHTML = `<div class="p-4 text-center text-sm text-red-500">Error generating anomalies: ${err.message}</div>`;
  }
}

// ── AI SPENDING DNA ───────────────────────────────────────
async function renderAIDNA() {
  const el = document.getElementById('ai-dna-content');
  if (!el) return;

  const d     = aiGetCurrentData();
  const total = d.totalExpenses + d.totalAuto;

  if (!total) {
    el.innerHTML = `<p class="text-sm text-slate-400 text-center py-8">No spending data yet. Add expenses to see your spending DNA.</p>`;
    return;
  }

  el.innerHTML = `<div class="py-8 text-center text-sm text-slate-400"><span class="material-symbols-outlined" style="font-size:16px;animation:aiSpin 1s linear infinite;display:inline-block;">refresh</span>&nbsp;Profiling DNA...</div>`;

  try {
    const aiData = await api('POST', '/api/ai/insights', { d, monthLabel: d.m, feature: 'dna' });
    if (aiData.error) throw new Error(aiData.error);

    const personality = aiData.personality || 'The Spender 💳';

    const segments = [
      ...Object.entries(d.catTotals).filter(([, v]) => v > 0).map(([cat, val]) => ({ cat, val })),
      ...(d.totalAuto > 0 ? [{ cat: 'auto', val: d.totalAuto }] : [])
    ].sort((a, b) => b.val - a.val);

    el.innerHTML = `
      <div class="mb-5 text-center">
        <span class="inline-block px-5 py-1.5 rounded-full text-sm font-bold text-white"
          style="background:linear-gradient(135deg,#a855f7,#ec4899);">${personality}</span>
      </div>
      <div class="space-y-3">
        ${segments.map(s => {
          const pct = Math.round(s.val / total * 100);
          const col = AI_CAT_COL[s.cat] || '#64748b';
          return `
            <div>
              <div class="flex justify-between items-center mb-1.5">
                <span class="text-sm font-semibold text-slate-700">
                  ${AI_CAT_EMOJI[s.cat] || '📦'} ${s.cat.charAt(0).toUpperCase() + s.cat.slice(1)}
                </span>
                <div class="flex items-center gap-2">
                  <span class="text-xs font-bold text-slate-500">${aiFmt(s.val)}</span>
                  <span class="text-xs font-extrabold px-2 py-0.5 rounded-full text-white" style="background:${col};">${pct}%</span>
                </div>
              </div>
              <div class="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                <div class="h-full rounded-full transition-all duration-700" style="width:${pct}%;background:${col};"></div>
              </div>
            </div>`;
        }).join('')}
      </div>`;
  } catch (err) {
    el.innerHTML = `<div class="p-4 text-center text-sm text-red-500">Error profiling DNA: ${err.message}</div>`;
  }
}

// ── Auto-refresh AI panels whenever data reloads ──────────
function refreshAllAI() {
  try { renderAICoach(); }      catch (e) { /* no-op */ }
  try { renderAIPrediction(); } catch (e) { /* no-op */ }
  try { renderAIAnomalies(); }  catch (e) { /* no-op */ }
  try { renderAIDNA(); }        catch (e) { /* no-op */ }
}

// Monkey-patch the main renderAll once the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const checkInterval = setInterval(() => {
    if (typeof renderAll === 'function') {
      clearInterval(checkInterval);
      const _orig = renderAll;
      window.renderAll = function () { _orig.apply(this, arguments); refreshAllAI(); };
    }
  }, 300);
});

// Spinner animation
(function () {
  const s = document.createElement('style');
  s.textContent = `@keyframes aiSpin { to { transform: rotate(360deg); } }`;
  document.head.appendChild(s);
})();
