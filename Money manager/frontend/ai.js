// ════════════════════════════════════════════════════════════════
//  MyPocket — AI INSIGHTS ENGINE + GLOBAL AI ASSISTANT  (ai.js)
//  • Original AI panels (Budget Coach, Anomaly, DNA, Forecast, Search)
//  • Global AI floating button + drawer with context-aware chat
//  • Provider architecture: rule-based by default; LLM-ready
// ════════════════════════════════════════════════════════════════

// ── Category emoji / color maps ────────────────────────────────
const AI_CAT_EMOJI = {
  food: '🍔', transport: '🚗', bills: '⚡', shopping: '🛍️',
  health: '💊', other: '📦', auto: '🔁', income: '💰',
  entertainment: '🎬', education: '📚', rent: '🏠',
  subscription: '📱', transfer: '↔️'
};
const AI_CAT_COL = {
  food: '#f59e0b', transport: '#3b82f6', bills: '#a855f7',
  shopping: '#ef4444', health: '#10b981', other: '#64748b',
  auto: '#f97316', entertainment: '#ec4899', education: '#0ea5e9',
  rent: '#8b5cf6', subscription: '#06b6d4', transfer: '#6366f1'
};

// ── Helper: pull computed data from shared cache ──────────────
function aiGetCurrentData() {
  const income   = (typeof cache !== 'undefined' && cache.income)   || [];
  const expenses = (typeof cache !== 'undefined' && cache.expenses) || [];
  const autopay  = ((typeof cache !== 'undefined' && cache.autopay) || []).filter(a => a.active);
  const goals    = (typeof cache !== 'undefined' && cache.goals)    || [];

  const totalIncome   = income.reduce((s, i) => s + i.amount, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const totalAuto     = autopay.reduce((s, a) => s + a.amount, 0);
  const totalSaved    = goals.reduce((s, g) => s + (g.total_saved || 0), 0);
  const savings       = totalIncome - totalExpenses - totalAuto;
  const savePct       = totalIncome > 0 ? (savings / totalIncome * 100) : 0;

  const CATS = ['food','transport','bills','shopping','health','entertainment','education','rent','subscription','transfer','other'];
  const catTotals = {};
  CATS.forEach(c => {
    catTotals[c] = expenses.filter(e => e.category === c).reduce((s, e) => s + e.amount, 0);
  });

  const topCat = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];
  const [y, m] = (typeof currentMonth !== 'undefined' ? currentMonth : '').split('-');
  const today       = new Date();
  const daysInMonth = (+y && +m) ? new Date(+y, +m, 0).getDate() : 30;
  const dayOfMonth  = (today.getFullYear() == +y && today.getMonth() + 1 == +m)
    ? today.getDate() : daysInMonth;

  return {
    income, expenses, autopay, goals, totalIncome, totalExpenses, totalAuto,
    totalSaved, savings, savePct, catTotals, topCat, y, m, daysInMonth, dayOfMonth
  };
}

// Currency formatter
function aiFmt(n) {
  return typeof fmt === 'function' ? fmt(n) : '₹' + Math.round(n).toLocaleString('en-IN');
}

// ════════════════════════════════════════════════════════════════
//  GLOBAL AI ASSISTANT
// ════════════════════════════════════════════════════════════════

const aiAssistant = {
  currentPage: 'dashboard',
  isOpen: false,
  messages: [],
  _processingAction: null,

  // Called by navigate() in app.js
  setPage(page) {
    this.currentPage = page;
    // Update chips when page changes
    if (this.isOpen) this._renderChips();
  },

  // Toggle drawer open/closed
  toggle() {
    this.isOpen ? this.close() : this.open();
  },

  open() {
    this.isOpen = true;
    const drawer  = document.getElementById('aiDrawer');
    const overlay = document.getElementById('aiDrawerOverlay');
    const fab = document.getElementById('aiFab');
    const fabIcon = document.getElementById('aiFabIcon');
    if (drawer)  drawer.classList.add('ai-drawer-open');
    if (overlay) overlay.classList.add('ai-overlay-open');
    if (fab) {
      fab.classList.add('is-open');
      fab.classList.remove('attention');
      fab.classList.remove('clicking');
      void fab.offsetWidth; // trigger reflow
      fab.classList.add('clicking');
    }
    if (fabIcon) fabIcon.textContent = 'close';

    // Show welcome if first time
    if (this.messages.length === 0) {
      this._addMessage('ai', this._getWelcomeMsg());
    }
    this._renderChips();
    this._scrollToBottom();
  },

  close() {
    this.isOpen = false;
    const drawer  = document.getElementById('aiDrawer');
    const overlay = document.getElementById('aiDrawerOverlay');
    const fab = document.getElementById('aiFab');
    const fabIcon = document.getElementById('aiFabIcon');
    if (drawer)  drawer.classList.remove('ai-drawer-open');
    if (overlay) overlay.classList.remove('ai-overlay-open');
    if (fab) {
      fab.classList.remove('is-open');
      fab.classList.remove('clicking');
      void fab.offsetWidth;
      fab.classList.add('clicking');
    }
    if (fabIcon) fabIcon.textContent = 'auto_awesome';
  },

  _getWelcomeMsg() {
    const d = aiGetCurrentData();
    const greet = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';
    const userName = (typeof currentUser !== 'undefined' && currentUser?.name) ? currentUser.name.split(' ')[0] : '';
    if (d.totalIncome === 0 && d.totalExpenses === 0) {
      return `${greet}${userName ? ', ' + userName : ''}! 👋 I'm your AI financial assistant. Start by adding some income or expenses, then I can give you insights, find patterns, and help you reach your goals.`;
    }
    return `${greet}${userName ? ', ' + userName : ''}! 👋 I'm here to help with your finances. You've spent <strong>${aiFmt(d.totalExpenses)}</strong> this month. Ask me anything — or tap a suggestion below.`;
  },

  // Page-specific quick chips
  _getChips() {
    const base = ['How much did I spend?', 'Top expenses', 'Am I on track?'];
    const pageChips = {
      dashboard:    ['Show spending breakdown', 'Monthly summary', 'Find anomalies'],
      transactions: ['Analyze my transactions', 'Compare income and expenses', 'Find duplicates', 'Show my largest expenses'],
      savings:      ['How much am I saving?', 'Savings rate', 'Improve savings'],
      autopay:      ['Review subscriptions', 'Total recurring cost', 'Unused subscriptions'],
      ai:           ['Generate full overview', 'Spending DNA', 'Budget tips'],
    };
    return [...(pageChips[this.currentPage] || base), ...base].slice(0, 5);
  },

  _renderChips() {
    const wrap = document.getElementById('aiChips');
    if (!wrap) return;
    const chips = this._getChips();
    wrap.innerHTML = chips.map(c =>
      `<button class="ai-chip" onclick="aiAssistant.sendMessage('${c.replace(/'/g, "\\'")}')">${c}</button>`
    ).join('');
  },

  // Add a message to the chat
  _addMessage(role, content, actionData) {
    const msg = { role, content, actionData, id: Date.now() };
    this.messages.push(msg);
    this._renderMessage(msg);
    this._scrollToBottom();
    return msg;
  },

  _renderMessage(msg) {
    const container = document.getElementById('aiMessages');
    if (!container) return;

    // Remove typing indicator if present
    const typing = container.querySelector('.ai-typing-wrap');
    if (typing) typing.remove();

    const isUser = msg.role === 'user';
    const userName = (typeof currentUser !== 'undefined' && currentUser?.name)
      ? currentUser.name.charAt(0).toUpperCase() : 'U';

    const el = document.createElement('div');
    el.className = `ai-msg ${isUser ? 'ai-msg-user' : 'ai-msg-ai'}`;
    el.id = `ai-msg-${msg.id}`;

    const avatarHtml = isUser
      ? `<div class="ai-msg-avatar">${userName}</div>`
      : `<div class="ai-msg-avatar"><span class="material-symbols-outlined" style="font-size:14px;">auto_awesome</span></div>`;

    let actionHtml = '';
    if (msg.actionData) {
      actionHtml = `
        <div class="ai-action-card">
          <div class="ai-action-card-title">Proposed Action</div>
          <div class="ai-action-card-body">${msg.actionData.description}</div>
          <div class="ai-action-buttons">
            <button class="ai-action-confirm" onclick="aiAssistant.confirmAction(${msg.id})">✓ Confirm</button>
            <button class="ai-action-cancel"  onclick="aiAssistant.cancelAction(${msg.id})">Cancel</button>
          </div>
        </div>`;
    }

    el.innerHTML = `
      ${avatarHtml}
      <div>
        <div class="ai-msg-bubble">${msg.content}</div>
        ${actionHtml}
      </div>`;
    container.appendChild(el);
  },

  _showTyping() {
    const container = document.getElementById('aiMessages');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'ai-msg ai-msg-ai ai-typing-wrap';
    el.innerHTML = `
      <div class="ai-msg-avatar"><span class="material-symbols-outlined" style="font-size:14px;">auto_awesome</span></div>
      <div class="ai-msg-bubble" style="padding:0;background:transparent;border:none;">
        <div class="ai-typing"><span></span><span></span><span></span></div>
      </div>`;
    container.appendChild(el);
    this._scrollToBottom();
  },

  _scrollToBottom() {
    setTimeout(() => {
      const container = document.getElementById('aiMessages');
      if (container) container.scrollTop = container.scrollHeight;
    }, 50);
  },

  // Send a message (called by button or chip)
  async sendMessage(text) {
    text = text.trim();
    if (!text) return;

    // Clear input
    const input = document.getElementById('aiInput');
    if (input) input.value = '';

    this._addMessage('user', text);
    this._showTyping();

    // Disable input during processing
    const sendBtn = document.getElementById('aiSendBtn');
    if (sendBtn) sendBtn.disabled = true;

    // Small delay for realism
    await new Promise(r => setTimeout(r, 600 + Math.random() * 600));

    try {
      const response = await this._processQuery(text);
      const typing = document.querySelector('.ai-typing-wrap');
      if (typing) typing.remove();
      this._addMessage('ai', response.text, response.action || null);
    } catch (e) {
      const typing = document.querySelector('.ai-typing-wrap');
      if (typing) typing.remove();
      this._addMessage('ai', 'Sorry, I ran into an issue processing that. Please try again.');
    }

    if (sendBtn) sendBtn.disabled = false;
    this._scrollToBottom();
  },

  // ── Query processor (rule-based provider) ──
  async _processQuery(query) {
    const q = query.toLowerCase();
    const d = aiGetCurrentData();
    const page = this.currentPage;

    // ── Intent: spending amount ──
    if (/how much.*spend|total.*spend|spent.*month|spending total/.test(q)) {
      if (d.totalExpenses === 0) return { text: "You haven't recorded any expenses yet this month. Add some using the <strong>Add Expense</strong> button on the Dashboard." };
      return { text: `This month you've spent <strong>${aiFmt(d.totalExpenses)}</strong> across ${d.expenses.length} transactions${d.topCat?.[1] > 0 ? `, with <strong>${d.topCat[0]}</strong> being your top category at ${aiFmt(d.topCat[1])}` : ''}.` };
    }

    // ── Intent: top/biggest expenses ──
    if (/top|biggest|largest|highest|most.*spent/.test(q) && !/income|earn/.test(q)) {
      const top5 = [...d.expenses].sort((a, b) => b.amount - a.amount).slice(0, 5);
      if (!top5.length) return { text: "No expenses recorded this month yet." };
      const list = top5.map((e, i) => `${i+1}. <strong>${e.desc}</strong> — ${aiFmt(e.amount)}`).join('<br>');
      return { text: `Your top expenses this month:<br><br>${list}` };
    }

    // ── Intent: income ──
    if (/income|earn|salary|how much.*make|revenue/.test(q)) {
      if (d.totalIncome === 0) return { text: "No income has been recorded this month. Add income using the <strong>Add Income</strong> button." };
      const sources = d.income.slice(0, 5).map(i => `• <strong>${i.label}</strong>: ${aiFmt(i.amount)}`).join('<br>');
      return { text: `Your total income this month is <strong>${aiFmt(d.totalIncome)}</strong>.<br><br>${sources}` };
    }

    // ── Intent: savings / on track ──
    if (/saving|save|on track|savings rate/.test(q)) {
      const savePct = Math.round(d.savePct);
      let advice = '';
      if (d.savePct < 0) advice = ' You\'re currently over budget. Consider reducing discretionary spending immediately.';
      else if (d.savePct < 10) advice = ' This is below the recommended 20%. Try to reduce your top spending category.';
      else if (d.savePct >= 20) advice = ' Great job! You\'re at or above the recommended savings rate.';
      return { text: `Your savings this month: <strong>${aiFmt(d.savings)}</strong> (${savePct}% of income).${advice}` };
    }

    // ── Intent: category breakdown ──
    if (/breakdown|categor|where.*money|spending.*on/.test(q)) {
      const cats = Object.entries(d.catTotals).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
      if (!cats.length) return { text: "No categorized expenses yet this month." };
      const list = cats.map(([c, v]) => `${AI_CAT_EMOJI[c] || '📦'} <strong>${c.charAt(0).toUpperCase()+c.slice(1)}</strong>: ${aiFmt(v)} (${d.totalExpenses > 0 ? Math.round(v/d.totalExpenses*100) : 0}%)`).join('<br>');
      return { text: `Here's your spending breakdown this month:<br><br>${list}` };
    }

    // ── Intent: food/transport/bills/specific category ──
    const catMatch = Object.keys(d.catTotals).find(c => q.includes(c));
    if (catMatch && !/(how much|income|salary)/.test(q) === false || q.includes(catMatch || '___')) {
      const cat = catMatch;
      if (cat && d.catTotals[cat] !== undefined) {
        const val = d.catTotals[cat];
        const txns = d.expenses.filter(e => e.category === cat);
        return { text: `You've spent <strong>${aiFmt(val)}</strong> on ${cat} this month across ${txns.length} transaction${txns.length !== 1 ? 's' : ''}.` };
      }
    }

    // ── Intent: food specifically ──
    if (/food|eat|restaurant|dining|grocery/.test(q)) {
      const val = d.catTotals.food || 0;
      return { text: `Food spending this month: <strong>${aiFmt(val)}</strong>${d.totalIncome > 0 ? ` (${Math.round(val/d.totalIncome*100)}% of income)` : ''}. ${val > d.totalIncome * 0.25 ? '⚠️ This is above the recommended 25% limit.' : '✅ This is within a healthy range.'}` };
    }

    // ── Intent: anomalies / unusual ──
    if (/anomal|unusual|weird|strange|spike|duplicate|find/.test(q)) {
      const sorted = [...d.expenses].sort((a, b) => b.amount - a.amount);
      const avg = d.totalExpenses / Math.max(1, d.expenses.length);
      const anomalies = sorted.filter(e => e.amount > avg * 3).slice(0, 3);
      if (!anomalies.length) return { text: '✅ No unusual transactions detected. Your spending patterns look normal this month.' };
      const list = anomalies.map(e => `• <strong>${e.desc}</strong>: ${aiFmt(e.amount)} (${Math.round(e.amount/avg)}× average)`).join('<br>');
      return { text: `⚠️ I found ${anomalies.length} unusually large transaction${anomalies.length > 1 ? 's' : ''}:<br><br>${list}` };
    }

    // ── Intent: subscriptions / recurring ──
    if (/subscription|recurring|auto.*pay|repeat/.test(q)) {
      const ap = (typeof cache !== 'undefined' && cache.autopay) || [];
      const active = ap.filter(a => a.active);
      if (!active.length) return { text: "No auto payments are currently set up. You can add recurring payments in the <strong>Auto Payments</strong> section." };
      const total = active.reduce((s, a) => s + a.amount, 0);
      const list  = active.map(a => `• <strong>${a.name}</strong>: ${aiFmt(a.amount)}/mo`).join('<br>');
      return { text: `You have ${active.length} active recurring payment${active.length > 1 ? 's' : ''} totalling <strong>${aiFmt(total)}/month</strong>:<br><br>${list}` };
    }

    // ── Intent: monthly summary ──
    if (/summary|overview|report|month/.test(q)) {
      return { text: `<strong>This Month's Summary</strong><br><br>💰 Income: <strong>${aiFmt(d.totalIncome)}</strong><br>💸 Expenses: <strong>${aiFmt(d.totalExpenses)}</strong><br>🔁 Auto Payments: <strong>${aiFmt(d.totalAuto)}</strong><br>💚 Savings: <strong>${aiFmt(d.savings)}</strong> (${Math.round(d.savePct)}%)<br><br>${d.savings < 0 ? '⚠️ You\'re over budget this month.' : d.savePct >= 20 ? '🏆 Excellent savings rate!' : '📊 Try to increase savings to 20%+.'}` };
    }

    // ── Intent: budget advice ──
    if (/tip|advice|suggest|improve|how.*save|reduce.*spend|budget/.test(q)) {
      const tips = [];
      if (d.catTotals.food > d.totalIncome * 0.25) tips.push('🍔 Your food spending is high. Meal prepping can cut costs by 30-40%.');
      if (d.catTotals.shopping > d.totalIncome * 0.15) tips.push('🛍️ Shopping is elevated. Try the 24-hour rule before purchases.');
      if (d.totalAuto > d.totalIncome * 0.3) tips.push('🔁 Recurring payments are high. Review and cancel unused subscriptions.');
      if (d.savePct < 10) tips.push('💡 Aim for 20%+ savings rate. Even ₹500 less per category adds up.');
      if (!tips.length) tips.push('✅ Your finances look healthy! Keep tracking consistently.', '📈 Consider investing your savings for long-term growth.');
      return { text: tips.join('<br><br>') };
    }

    // ── Intent: add income (action) ──
    if (/add.*income|record.*income|log.*income/.test(q)) {
      return {
        text: "I can help you add income. Click the button below to confirm, or use the <strong>Add Income</strong> button on the Dashboard.",
        action: {
          type: 'navigate',
          target: 'dashboard',
          description: 'Open the Add Income form on the Dashboard.',
          execute: () => { this.close(); navigate('dashboard'); setTimeout(() => openModal('income'), 300); }
        }
      };
    }

    // ── Intent: add expense (action) ──
    if (/add.*expense|record.*expense|log.*expense/.test(q)) {
      return {
        text: "I can open the Add Expense form for you.",
        action: {
          type: 'navigate',
          target: 'dashboard',
          description: 'Open the Add Expense form on the Dashboard.',
          execute: () => { this.close(); navigate('dashboard'); setTimeout(() => openModal('expense'), 300); }
        }
      };
    }

    // ── Intent: add goal (action) ──
    if (/create.*goal|new.*goal|add.*goal|set.*goal/.test(q)) {
      return {
        text: "I can help you set up a new savings goal. Click confirm to open the goal creator.",
        action: {
          type: 'navigate',
          target: 'savings',
          description: 'Open the Create Savings Goal form.',
          execute: () => { this.close(); navigate('savings'); setTimeout(() => openGoalModal(), 300); }
        }
      };
    }

    // ── Intent: add contribution (action) ──
    if (/add.*contribution|add.*funds|contribute.*goal/.test(q)) {
      if (!d.goals || d.goals.length === 0) {
        return { text: "You don't have any savings goals yet. Say 'Create a new goal' to get started." };
      }
      // If there's only one active goal, auto-select it, otherwise just navigate to savings.
      const activeGoals = d.goals.filter(g => g.total_saved < g.target_amount);
      if (activeGoals.length === 1) {
        return {
          text: `I can help you add funds to your <strong>${activeGoals[0].name}</strong> goal.`,
          action: {
            type: 'navigate',
            target: 'savings',
            description: `Add contribution to ${activeGoals[0].name}`,
            execute: () => { this.close(); navigate('savings'); setTimeout(() => openContribModal(activeGoals[0].id), 300); }
          }
        };
      }
      return {
        text: "I can take you to your goals so you can choose which one to contribute to.",
        action: {
          type: 'navigate',
          target: 'savings',
          description: 'Navigate to Savings Goals to add funds.',
          execute: () => { this.close(); navigate('savings'); }
        }
      };
    }

    // ── Intent: upload statement ──
    if (/upload|import.*statement|bank statement|csv/.test(q)) {
      return {
        text: "I can open the bank statement upload flow for you.",
        action: {
          type: 'navigate',
          target: 'upload',
          description: 'Open the Upload Statement dialog to import your bank transactions.',
          execute: () => { this.close(); navigate('dashboard'); setTimeout(() => openUploadModal(), 300); }
        }
      };
    }

    // ── Intent: go to page ──
    const pageMap = { 'transactions': 'report', 'goals': 'savings', 'expenses': 'expenses', 'income': 'income', 'autopay': 'autopay', 'auto payments': 'autopay', 'ai insights': 'ai' };
    for (const [kw, pg] of Object.entries(pageMap)) {
      if (q.includes(kw)) {
        return {
          text: `I'll take you to the <strong>${kw.charAt(0).toUpperCase()+kw.slice(1)}</strong> page.`,
          action: {
            type: 'navigate',
            target: pg,
            description: `Navigate to the ${kw} page.`,
            execute: () => { this.close(); navigate(pg); }
          }
        };
      }
    }

    // ── Page-context specific responses ──
    if (page === 'report' && /categori|sort|filter/.test(q)) {
      return { text: "On the Transactions page, you can view all your income and expenses. Use the filter options to sort by category or date. Would you like me to analyze specific transactions?" };
    }
    if (page === 'savings' && /goal|target/.test(q)) {
      const activeGoals = d.goals ? d.goals.filter(g => g.total_saved < g.target_amount) : [];
      if (activeGoals.length > 0) {
        const nextGoal = activeGoals.sort((a,b) => (a.target_amount - a.total_saved) - (b.target_amount - b.total_saved))[0];
        return { text: `You have <strong>${activeGoals.length}</strong> active goals. You are closest to completing <strong>${nextGoal.name}</strong> (${aiFmt(nextGoal.total_saved)} of ${aiFmt(nextGoal.target_amount)}).` };
      }
      const savingsRate = Math.round(d.savePct);
      return { text: `Your current savings rate is <strong>${savingsRate}%</strong>. You don't have any active goals yet. Should we create one?` };
    }

    // ── Fallback ──
    return { text: `I can help you analyze your finances! Here's what I know about this month: you've earned <strong>${aiFmt(d.totalIncome)}</strong> and spent <strong>${aiFmt(d.totalExpenses)}</strong>. Try asking me things like "Where am I spending the most?", "Show my top expenses", or "Am I on track this month?".` };
  },

  // ── Action confirmation ──
  confirmAction(msgId) {
    const msg = this.messages.find(m => m.id === msgId);
    if (!msg?.actionData) return;

    // Execute the action
    try { msg.actionData.execute(); } catch (e) { console.error('AI action error:', e); }

    // Update the action card to show confirmed
    const el = document.getElementById(`ai-msg-${msgId}`);
    const card = el?.querySelector('.ai-action-card');
    if (card) {
      card.innerHTML = `<div style="color:#10b981;font-size:12px;font-weight:700;">✓ Action confirmed!</div>`;
    }
    msg.actionData = null;
  },

  cancelAction(msgId) {
    const msg = this.messages.find(m => m.id === msgId);
    if (msg) msg.actionData = null;
    const el = document.getElementById(`ai-msg-${msgId}`);
    const card = el?.querySelector('.ai-action-card');
    if (card) {
      card.innerHTML = `<div style="color:#64748b;font-size:12px;">Action cancelled.</div>`;
    }
  }
};

// Global toggle function for the FAB
function toggleAIDrawer() {
  aiAssistant.toggle();
}

// Handle Enter key in AI input
function aiInputKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const input = document.getElementById('aiInput');
    if (input?.value.trim()) aiAssistant.sendMessage(input.value);
  }
}

// ════════════════════════════════════════════════════════════════
//  ORIGINAL AI PANELS (kept intact)
// ════════════════════════════════════════════════════════════════

// ── AI SEARCH ────────────────────────────────────────────────
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

  const isTop  = /top|most|highest|biggest|largest/.test(raw);
  const wantsIncome = /income|salary|earn/.test(raw);

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

// ── AI MONTHLY OVERVIEW ──────────────────────────────────────
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

    const grade      = d.savePct >= 30 ? 'S' : d.savePct >= 20 ? 'A' : d.savePct >= 10 ? 'B' : d.savePct >= 0 ? 'C' : 'D';
    const gradeColor = { S: '#10b981', A: '#3b82f6', B: '#f59e0b', C: '#f97316', D: '#ef4444' }[grade];

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

// ── AI BUDGET COACH ──────────────────────────────────────────
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

// ── AI SPENDING FORECAST ─────────────────────────────────────
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

// ── AI ANOMALY DETECTION ─────────────────────────────────────
function renderAIAnomalies() {
  const el = document.getElementById('ai-anomaly-content');
  if (!el) return;

  const d = aiGetCurrentData();
  const anomalies = [];

  const sorted = [...d.expenses].sort((a, b) => b.amount - a.amount);
  if (sorted.length > 0) {
    const top = sorted[0];
    const avg = d.totalExpenses / Math.max(1, d.expenses.length);
    if (top.amount > avg * 3) {
      anomalies.push({ icon: '💸', title: `Unusually large: "${top.desc}"`, body: `${aiFmt(top.amount)} is ${Math.round(top.amount / avg)}× your average transaction (${aiFmt(Math.round(avg))}).` });
    }
  }

  for (const [cat, amt] of Object.entries(d.catTotals)) {
    if (amt > 0 && d.totalExpenses > 500 && amt / d.totalExpenses > 0.60) {
      anomalies.push({ icon: AI_CAT_EMOJI[cat] || '📦', title: `${cat.charAt(0).toUpperCase() + cat.slice(1)} dominates spending`, body: `${Math.round(amt / d.totalExpenses * 100)}% of all expenses go to ${cat}. Consider rebalancing.` });
    }
  }

  if (d.totalIncome > 0 && (d.totalExpenses + d.totalAuto) > d.totalIncome * 0.9)
    anomalies.push({ icon: '⚡', title: 'Approaching income limit', body: `You've used ${Math.round((d.totalExpenses + d.totalAuto) / d.totalIncome * 100)}% of income. Very little buffer remains.` });

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

// ── AI SPENDING DNA ──────────────────────────────────────────
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
    shopping: 'The Shopaholic 🛍️', health: 'The Health Buff 💪', other: 'The Minimalist ✨',
    auto: 'The Automator 🔁', entertainment: 'The Entertainment Fan 🎬',
    education: 'The Learner 📚', rent: 'The Renter 🏠'
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

// ── Auto-refresh AI panels whenever data reloads ─────────────
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
