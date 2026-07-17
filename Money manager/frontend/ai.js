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
function generateAIOverview() {
  const btn = document.getElementById('ai-overview-btn');
  const el  = document.getElementById('ai-overview-content');
  if (!btn || !el) return;

  btn.disabled = true;
  btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px;animation:aiSpin 1s linear infinite;display:inline-block;">refresh</span>&nbsp;Thinking...`;

  setTimeout(() => {
    const d = aiGetCurrentData();
    const monthLabel = (+d.y && +d.m)
      ? new Date(+d.y, +d.m - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
      : 'This Month';

    // Financial grade
    const grade      = d.savePct >= 30 ? 'S' : d.savePct >= 20 ? 'A' : d.savePct >= 10 ? 'B' : d.savePct >= 0 ? 'C' : 'D';
    const gradeColor = { S: '#10b981', A: '#3b82f6', B: '#f59e0b', C: '#f97316', D: '#ef4444' }[grade];

    // Narrative sentences
    const sentences = [];
    if (!d.totalIncome) {
      sentences.push('No income has been recorded yet.');
    } else {
      sentences.push(`You earned ${aiFmt(d.totalIncome)} this month.`);
      if (d.totalExpenses > 0) {
        const pct = Math.round(d.totalExpenses / d.totalIncome * 100);
        sentences.push(
          `You spent ${aiFmt(d.totalExpenses)} (${pct}% of income) across ${d.expenses.length} transactions` +
          (d.topCat?.[1] > 0 ? `, led by ${d.topCat[0]} (${aiFmt(d.topCat[1])}).` : '.')
        );
      }
      if (d.totalAuto > 0) sentences.push(`Recurring payments total ${aiFmt(d.totalAuto)}.`);
      sentences.push(
        d.savings >= 0
          ? `You saved ${aiFmt(d.savings)} (${Math.round(d.savePct)}%) — ${grade === 'S' || grade === 'A' ? 'excellent!' : grade === 'B' ? 'solid performance.' : 'room to improve.'}`
          : `You went over budget by ${aiFmt(Math.abs(d.savings))}.`
      );
    }

    // Insight bullets
    const insights = [];
    if (d.topCat?.[1] > 0) insights.push(`${AI_CAT_EMOJI[d.topCat[0]]} <b>${d.topCat[0].charAt(0).toUpperCase() + d.topCat[0].slice(1)}</b> is your top spend: ${aiFmt(d.topCat[1])}.`);
    if (d.totalAuto > 0)   insights.push(`🔁 Auto payments: ${aiFmt(d.totalAuto)}/mo — verify all are still needed.`);
    if (d.savePct < 10 && d.totalIncome > 0) insights.push(`⚠️ Savings below 10%. Cut ${d.topCat?.[0] || 'discretionary'} spending to hit 20%.`);
    if (d.savePct >= 20)   insights.push(`🏆 ${Math.round(d.savePct)}% savings rate puts you ahead of average.`);
    if (d.expenses.length > 20) insights.push(`📊 ${d.expenses.length} transactions — watch for small habitual leaks.`);

    el.innerHTML = `
      <div class="flex flex-wrap gap-6 items-start mb-6">
        <div class="text-center">
          <div class="text-6xl font-extrabold font-headline leading-none" style="color:${gradeColor};">${grade}</div>
          <div class="text-xs text-slate-400 font-bold mt-2 uppercase tracking-widest">Finance Score</div>
        </div>
        <div class="flex-1 min-w-[200px]">
          <p class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">${monthLabel} Summary</p>
          <p class="text-slate-700 text-sm leading-relaxed">${sentences.join(' ')}</p>
        </div>
      </div>
      ${insights.length ? `
        <div class="border-t border-slate-100 pt-5">
          <p class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Key Insights</p>
          <div class="space-y-2">
            ${insights.map(i => `<div class="text-sm text-slate-700 bg-slate-50 rounded-xl p-3">${i}</div>`).join('')}
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

    btn.disabled = false;
    btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px;">auto_awesome</span>&nbsp;Regenerate`;
  }, 850);
}

// ── AI BUDGET COACH ───────────────────────────────────────
function renderAICoach() {
  const el = document.getElementById('ai-coach-content');
  if (!el) return;

  const d = aiGetCurrentData();
  if (!d.totalIncome && !d.totalExpenses) {
    el.innerHTML = `<p class="text-sm text-slate-400 text-center py-8">Add some transactions to unlock personalised coaching.</p>`;
    return;
  }

  const tips = [];
  if (d.savePct < 0)
    tips.push({ icon: '🚨', type: 'danger', title: 'Over budget!', body: `You exceeded income by ${aiFmt(Math.abs(d.savings))}. Pause all non-essential spending now.` });
  else if (d.savePct < 10)
    tips.push({ icon: '⚠️', type: 'warn', title: 'Low savings rate', body: `Only ${Math.round(d.savePct)}% saved. Target 20%+. Reduce ${d.topCat?.[0] || 'discretionary'} spending.` });
  else if (d.savePct >= 30)
    tips.push({ icon: '🏆', type: 'good', title: 'Excellent savings!', body: `You're saving ${Math.round(d.savePct)}% — well above the recommended 20%. Keep it up!` });
  else
    tips.push({ icon: '✅', type: 'good', title: 'On track', body: `${Math.round(d.savePct)}% savings rate — within the healthy 10-30% range.` });

  if (d.totalIncome > 0) {
    if ((d.catTotals.food || 0) > d.totalIncome * 0.25)
      tips.push({ icon: '🍔', type: 'warn', title: 'High food spending', body: `Food is ${Math.round(d.catTotals.food / d.totalIncome * 100)}% of income. Meal-prepping can cut this 30-40%.` });
    if ((d.catTotals.shopping || 0) > d.totalIncome * 0.15)
      tips.push({ icon: '🛍️', type: 'warn', title: 'Shopping spike', body: `${aiFmt(d.catTotals.shopping)} on shopping. Try a 24-hour pause before any purchase.` });
    if (d.totalAuto > 0) {
      const ap = Math.round(d.totalAuto / d.totalIncome * 100);
      tips.push(ap > 30
        ? { icon: '🔁', type: 'warn', title: 'Heavy recurring costs', body: `${ap}% of income on auto payments. Review for unused subscriptions.` }
        : { icon: '✅', type: 'good', title: 'Subscriptions balanced', body: `${ap}% on recurring costs — within a healthy range.` }
      );
    }
  }

  if (tips.length === 1) tips.push({ icon: '👍', type: 'good', title: 'Finances look healthy!', body: 'No major red flags. Keep the consistent tracking going!' });

  const typeStyle = { danger: 'border-red-200 bg-red-50', warn: 'border-amber-200 bg-amber-50', good: 'border-green-200 bg-green-50' };
  el.innerHTML = `<div class="space-y-3">
    ${tips.map(t => `
      <div class="flex items-start gap-3 p-4 rounded-2xl border ${typeStyle[t.type]}">
        <span class="text-xl flex-shrink-0">${t.icon}</span>
        <div>
          <p class="font-bold text-sm text-slate-800">${t.title}</p>
          <p class="text-xs text-slate-600 mt-0.5 leading-relaxed">${t.body}</p>
        </div>
      </div>`).join('')}
  </div>`;
}

// ── AI SPENDING FORECAST ──────────────────────────────────
function renderAIPrediction() {
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

  const daysElapsed  = Math.max(1, d.dayOfMonth);
  const dailyBurn    = (d.totalExpenses + d.totalAuto) / daysElapsed;
  const daysLeft     = Math.max(0, d.daysInMonth - daysElapsed);
  const projectedExp = (d.totalExpenses + d.totalAuto) + dailyBurn * daysLeft;
  const projectedSav = d.totalIncome - projectedExp;
  const color        = projectedSav >= 0 ? '#10b981' : '#ef4444';
  const statusLabel  = projectedSav >= 0 ? 'On Track ✅' : 'Over Budget Risk ⚠️';

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
}

// ── AI ANOMALY DETECTION ──────────────────────────────────
function renderAIAnomalies() {
  const el = document.getElementById('ai-anomaly-content');
  if (!el) return;

  const d = aiGetCurrentData();
  const anomalies = [];

  // Single large transaction
  const sorted = [...d.expenses].sort((a, b) => b.amount - a.amount);
  if (sorted.length > 0) {
    const top = sorted[0];
    const avg = d.totalExpenses / Math.max(1, d.expenses.length);
    if (top.amount > avg * 3) {
      anomalies.push({ icon: '💸', title: `Unusually large: "${top.desc}"`, body: `${aiFmt(top.amount)} is ${Math.round(top.amount / avg)}× your average transaction (${aiFmt(Math.round(avg))}).` });
    }
  }

  // Category dominance
  for (const [cat, amt] of Object.entries(d.catTotals)) {
    if (amt > 0 && d.totalExpenses > 500 && amt / d.totalExpenses > 0.60) {
      anomalies.push({ icon: AI_CAT_EMOJI[cat] || '📦', title: `${cat.charAt(0).toUpperCase() + cat.slice(1)} dominates spending`, body: `${Math.round(amt / d.totalExpenses * 100)}% of all expenses go to ${cat}. Consider rebalancing.` });
    }
  }

  // Near-limit alert
  if (d.totalIncome > 0 && (d.totalExpenses + d.totalAuto) > d.totalIncome * 0.9)
    anomalies.push({ icon: '⚡', title: 'Approaching income limit', body: `You've used ${Math.round((d.totalExpenses + d.totalAuto) / d.totalIncome * 100)}% of income. Very little buffer remains.` });

  // High frequency
  if (d.expenses.length > 30)
    anomalies.push({ icon: '📈', title: 'High transaction count', body: `${d.expenses.length} expenses this month. Frequent small transactions can hide financial leaks.` });

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
        <span class="text-xl flex-shrink-0">${a.icon}</span>
        <div>
          <p class="font-bold text-sm text-slate-800">${a.title}</p>
          <p class="text-xs text-slate-600 mt-0.5">${a.body}</p>
        </div>
      </div>`).join('')}
  </div>`;
}

// ── AI SPENDING DNA ───────────────────────────────────────
function renderAIDNA() {
  const el = document.getElementById('ai-dna-content');
  if (!el) return;

  const d     = aiGetCurrentData();
  const total = d.totalExpenses + d.totalAuto;

  if (!total) {
    el.innerHTML = `<p class="text-sm text-slate-400 text-center py-8">No spending data yet. Add expenses to see your spending DNA.</p>`;
    return;
  }

  const segments = [
    ...Object.entries(d.catTotals).filter(([, v]) => v > 0).map(([cat, val]) => ({ cat, val })),
    ...(d.totalAuto > 0 ? [{ cat: 'auto', val: d.totalAuto }] : [])
  ].sort((a, b) => b.val - a.val);

  const personalities = {
    food: 'The Foodie 🍔', transport: 'The Commuter 🚗', bills: 'The Subscriber 📱',
    shopping: 'The Shopaholic 🛍️', health: 'The Health Buff 💪', other: 'The Minimalist ✨', auto: 'The Automator 🔁'
  };
  const personality = segments[0] ? (personalities[segments[0].cat] || 'The Spender 💳') : 'The Saver 🏦';

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
