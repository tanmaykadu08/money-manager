// ── Config & State ──
    let txChartInstance = null;
    let spendChartInstance = null;
    // RESTORED: Backend Sync Mode variables
    let API_URL = localStorage.getItem('mypocket_api_url') || window.location.origin;
    let token = localStorage.getItem('mypocket_token') || '';
    let currentUser = JSON.parse(localStorage.getItem('mypocket_user') || 'null');
    let currentMonth = '';
    let cache = { income: [], expenses: [], autopay: [], settings: { bank_balance: 0 } };

    // ── API helper ──
    async function api(method, path, body) {
      if (!API_URL) throw new Error('No API URL configured');
      const res = await fetch(API_URL.replace(/\/$/, '') + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': 'Bearer ' + token } : {})
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Request failed');
      return data;
    }

    // ── API URL setup ──
    function saveApiUrl() {
      const val = document.getElementById('apiUrlInput').value.trim();
      if (!val) return;
      API_URL = val;
      localStorage.setItem('mypocket_api_url', val);
      checkApiHealth();
    }
    async function checkApiHealth() {
      const el = document.getElementById('apiStatus');
      el.textContent = 'Checking connection...';
      try {
        await api('GET', '/api/health');
        el.textContent = '✅ Syncer Active';
        el.style.color = 'var(--accent-green)';
      } catch {
        el.textContent = '❌ Syncer Offline';
        el.style.color = 'var(--accent-red)';
      }
    }

    // ── Auth ──
    function switchTab(tab) {
      document.getElementById('tab-login').classList.toggle('active', tab === 'login');
      document.getElementById('tab-register').classList.toggle('active', tab === 'register');
      document.getElementById('form-login').style.display = tab === 'login' ? 'flex' : 'none';
      document.getElementById('form-register').style.display = tab === 'register' ? 'flex' : 'none';
      document.getElementById('auth-error').style.display = 'none';
    }
    function showAuthError(msg) {
      const el = document.getElementById('auth-error');
      el.textContent = msg; el.style.display = 'block';
    }

    async function doLogin() {
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      if (!email || !password) return showAuthError('Please enter email and password.');
      if (!API_URL) return showAuthError('Please set the Backend Syncer URL first.');
      const btn = document.getElementById('login-btn');
      btn.disabled = true; btn.textContent = 'Authenticating...';
      try {
        const data = await api('POST', '/api/auth/login', { email, password });
        onAuthSuccess(data);
      } catch (e) { showAuthError(e.message); }
      finally { btn.disabled = false; btn.textContent = 'Sign In'; }
    }

    async function doRegister() {
      const name = document.getElementById('reg-name').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      const password = document.getElementById('reg-password').value;
      if (!email || !password) return showAuthError('Please enter email and password.');
      if (!API_URL) return showAuthError('Please set the Backend Syncer URL first.');
      const btn = document.getElementById('reg-btn');
      btn.disabled = true; btn.textContent = 'Registering...';
      try {
        const data = await api('POST', '/api/auth/register', { email, password, name });
        onAuthSuccess(data);
      } catch (e) { showAuthError(e.message); }
      finally { btn.disabled = false; btn.textContent = 'Create Account'; }
    }

    function onAuthSuccess(data) {
      token = data.token;
      currentUser = data.user;
      localStorage.setItem('mypocket_token', token);
      localStorage.setItem('mypocket_user', JSON.stringify(currentUser));
      document.getElementById('authScreen').style.display = 'none';
      document.getElementById('appShell').classList.add('visible');
      document.getElementById('sidebarUser').textContent = currentUser.name || currentUser.email;
      document.getElementById('mobileUser').textContent = currentUser.name || currentUser.email;
      if (document.getElementById('userInitial')) {
        const dName = currentUser.name || currentUser.email;
        document.getElementById('userInitial').textContent = dName ? dName.charAt(0).toUpperCase() : 'U';
      }
      initApp();
    }

    function doLogout() {
      token = ''; currentUser = null;
      localStorage.removeItem('mypocket_token');
      localStorage.removeItem('mypocket_user');
      document.getElementById('authScreen').style.display = 'flex';
      document.getElementById('appShell').classList.remove('visible');
    }

    // ── Timezone FIX ──
    function getLocalMonthKey(d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      return `${y}-${m}`;
    }

    function getLocalDateStr(d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }

    // ── Month setup ──
    function initMonthSelect() {
      const hiddenSelect = document.getElementById('monthSelect');
      const mobileSelect = document.getElementById('monthSelectMobile');
      const pickerList = document.getElementById('monthPickerList');
      const now = new Date();

      // Clear
      if (hiddenSelect) hiddenSelect.innerHTML = '';
      if (mobileSelect) mobileSelect.innerHTML = '';
      if (pickerList) pickerList.innerHTML = '';

      for (let i = 0; i < 12; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = getLocalMonthKey(d);
        const label = d.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
        const shortLabel = d.toLocaleString('en-IN', { month: 'short', year: 'numeric' });

        // Hidden select option
        [hiddenSelect, mobileSelect].forEach(sel => {
          if (!sel) return;
          const opt = document.createElement('option');
          opt.value = key;
          opt.textContent = label;
          sel.appendChild(opt);
        });

        // Visual button for picker list
        if (pickerList) {
          const btn = document.createElement('button');
          btn.dataset.key = key;
          btn.className = 'month-picker-btn';
          btn.innerHTML = `<span style="font-size:13px;font-weight:700;color:var(--text);font-family:var(--font-body);">${shortLabel}</span>`;
          btn.style.cssText = 'padding:12px 14px;border-radius:14px;border:1px solid var(--border);background:var(--surface2);cursor:pointer;text-align:left;transition:all .15s;width:100%;';
          btn.onmouseover = () => { btn.style.background = 'var(--accent-blue)'; btn.querySelector('span').style.color = '#fff'; };
          btn.onmouseout = () => {
            const isActive = currentMonth === key;
            btn.style.background = isActive ? 'var(--accent-blue)' : 'var(--surface2)';
            btn.querySelector('span').style.color = isActive ? '#fff' : 'var(--text)';
          };
          btn.onclick = () => {
            if (hiddenSelect) { hiddenSelect.value = key; onMonthChange(hiddenSelect); }
            closeMonthPicker();
          };
          pickerList.appendChild(btn);
        }
      }

      currentMonth = getLocalMonthKey(now);
      if (hiddenSelect) hiddenSelect.value = currentMonth;
      if (mobileSelect) mobileSelect.value = currentMonth;
      _updateMonthLabels(now.toLocaleString('en-IN', { month: 'long', year: 'numeric' }));
      _highlightActivePicker();
      setDefaultDates();
    }

    function _updateMonthLabels(text) {
      const stickyLbl = document.getElementById('stickyMonthLabel');
      if (stickyLbl) stickyLbl.textContent = text;
      const lbl = document.getElementById('monthPickerLabel');
      if (lbl) lbl.textContent = text;
      // Show sticky bar
      const stickyBar = document.getElementById('stickyMonthBar');
      if (stickyBar) stickyBar.style.display = 'flex';
    }

    function _highlightActivePicker() {
      document.querySelectorAll('.month-picker-btn').forEach(btn => {
        const isActive = btn.dataset.key === currentMonth;
        btn.style.background = isActive ? 'var(--accent-blue)' : 'var(--surface2)';
        btn.style.borderColor = isActive ? 'var(--accent-blue)' : 'var(--border)';
        const span = btn.querySelector('span');
        if (span) span.style.color = isActive ? '#fff' : 'var(--text)';
      });
    }


    function setDefaultDates() {
      const [y, m] = currentMonth.split('-');
      const today = new Date();
      const d = (today.getFullYear() == +y && today.getMonth() + 1 == +m) ? today : new Date(y, m - 1, 1);
      const ds = getLocalDateStr(d);
      ['inc-date', 'exp-date'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ds; });
    }

    function onMonthChange(selectEl) {
      currentMonth = selectEl.value;
      ['monthSelect', 'monthSelectMobile'].forEach(id => {
        const el = document.getElementById(id);
        if (el && el !== selectEl) el.value = currentMonth;
      });
      // Sync labels
      const sel = document.getElementById('monthSelect') || selectEl;
      const selectedOpt = sel ? sel.options[sel.selectedIndex] : null;
      if (selectedOpt) _updateMonthLabels(selectedOpt.textContent);
      _highlightActivePicker();
      setDefaultDates();
      loadMonthData();
    }

    // ── Data loading ──
    async function loadMonthData() {
      try {
        const [income, expenses, autopay, settings, summary] = await Promise.all([
          api('GET', `/api/income?month=${currentMonth}`),
          api('GET', `/api/expenses?month=${currentMonth}`),
          api('GET', '/api/autopay'),
          api('GET', '/api/settings'),
          api('GET', '/api/settings/summary'),
        ]);
        cache = { income, expenses, autopay, settings, summary };
        renderAll();
      } catch (e) {
        if (e.message === 'Token expired' || e.message === 'Invalid token' || e.message.includes('No API') || e.message === 'Unexpected end of JSON input') {
          console.warn(e.message);
        } else {
          console.error('Load error:', e);
        }
      }
    }

    // ── Navigate ──
    function navigate(section) {
      // Hide all sections, remove active class
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.querySelectorAll('.nav-btn, .mobile-nav-btn').forEach(b => b.classList.remove('active'));

      // Show section
      document.getElementById('sec-' + section).classList.add('active');

    // ── Tag proper menu buttons active ──
    const targetFn = `navigate('${section}')`;
    document.querySelectorAll(`.nav-btn[onclick="${targetFn}"], .mobile-nav-btn[onclick="${targetFn}"]`)
      .forEach(b => b.classList.add('active'));
  }

  // ── Modals ──
  function openModal(type) {
    const modal = document.getElementById('transactionModal');
    const content = document.getElementById('modalContent');
    const title = document.getElementById('modalTitle');
    const incForm = document.getElementById('modal-income-form');
    const expForm = document.getElementById('modal-expense-form');

    if (type === 'income') {
      title.textContent = 'Add Income';
      incForm.classList.remove('hidden');
      expForm.classList.add('hidden');
    } else {
      title.textContent = 'Add Expense';
      expForm.classList.remove('hidden');
      incForm.classList.add('hidden');
    }

    modal.classList.remove('hidden');
    // slight delay for transition
    setTimeout(() => {
      modal.classList.remove('opacity-0');
      content.classList.remove('scale-95');
    }, 10);
  }

  function closeModal() {
    const modal = document.getElementById('transactionModal');
    const content = document.getElementById('modalContent');
    modal.classList.add('opacity-0');
    content.classList.add('scale-95');
    setTimeout(() => {
      modal.classList.add('hidden');
    }, 300);
  }

  // ── Actions (RESTORED API LOGIC) ──
    async function addIncome() {
      const label = document.getElementById('inc-label').value.trim();
      const amount = parseFloat(document.getElementById('inc-amount').value);
      const date = document.getElementById('inc-date').value;
      const notes = document.getElementById('inc-notes').value.trim();
      if (!label || !amount || !date) return alert('Please fill label, amount, and date.');
      const btn = document.getElementById('inc-btn');
      btn.disabled = true;

      const d = new Date(date);
      const valid_month_key = getLocalMonthKey(d);

      try {
        const row = await api('POST', '/api/income', { month_key: valid_month_key, label, amount, date, notes });

        // Only unshift to the view cache if the item belongs to the CURRENT viewed month
        if (valid_month_key === currentMonth) {
          cache.income.unshift(row);
        }
        document.getElementById('inc-label').value = '';
        document.getElementById('inc-amount').value = '';
        document.getElementById('inc-notes').value = '';
        renderAll();
        closeModal();
      } catch (e) { alert(e.message); }
      finally { btn.disabled = false; }
    }

    async function deleteIncome(id) {
      try {
        await api('DELETE', `/api/income/${id}`);
        cache.income = cache.income.filter(i => i.id !== id);
        renderAll();
      } catch (e) { alert(e.message); }
    }

    async function addExpense() {
      const desc = document.getElementById('exp-desc').value.trim();
      const amount = parseFloat(document.getElementById('exp-amount').value);
      const date = document.getElementById('exp-date').value;
      let category = document.getElementById('exp-cat').value;
      if (category === 'auto') {
         category = guessCategoryAI(desc) || 'other';
      }
      const payment = document.getElementById('exp-pay').value;
      if (!desc || !amount || !date) return alert('Please fill description, amount, and date.');
      const btn = document.getElementById('exp-btn');
      btn.disabled = true;

      const d = new Date(date);
      const valid_month_key = getLocalMonthKey(d);

      try {
        const row = await api('POST', '/api/expenses', { month_key: valid_month_key, desc, amount, date, category, payment });

        // Only show if the current view matches the date the user set
        if (valid_month_key === currentMonth) {
          cache.expenses.unshift(row);
        }
        document.getElementById('exp-desc').value = '';
        document.getElementById('exp-amount').value = '';
        
        document.getElementById('exp-cat').value = 'auto';
        const autoOpt = Array.from(document.getElementById('exp-cat').options).find(o => o.value === 'auto');
        if(autoOpt) autoOpt.textContent = '✨ Auto Classify';

        renderAll();
        closeModal();
      } catch (e) { alert(e.message); }
      finally { btn.disabled = false; }
    }

    async function deleteExpense(id) {
      try {
        await api('DELETE', `/api/expenses/${id}`);
        cache.expenses = cache.expenses.filter(e => e.id !== id);
        renderAll();
      } catch (e) { alert(e.message); }
    }

    async function addAutoPay() {
      const name = document.getElementById('ap-name').value.trim();
      const amount = parseFloat(document.getElementById('ap-amount').value);
      const due_day = parseInt(document.getElementById('ap-day').value);
      const payment = document.getElementById('ap-pay').value;
      if (!name || !amount || !due_day) return alert('Please fill name, amount, and due day.');
      const btn = document.getElementById('ap-btn');
      btn.disabled = true;
      try {
        const row = await api('POST', '/api/autopay', { name, amount, due_day, payment });
        cache.autopay.push(row);
        document.getElementById('ap-name').value = '';
        document.getElementById('ap-amount').value = '';
        document.getElementById('ap-day').value = '';
        renderAll();
      } catch (e) { alert(e.message); }
      finally { btn.disabled = false; }
    }

    async function toggleAutoPay(id) {
      try {
        const updated = await api('PATCH', `/api/autopay/${id}/toggle`);
        const idx = cache.autopay.findIndex(a => a.id === id);
        if (idx >= 0) cache.autopay[idx] = updated;
        renderAll();
      } catch (e) { alert(e.message); }
    }

    async function deleteAutoPay(id) {
      try {
        await api('DELETE', `/api/autopay/${id}`);
        cache.autopay = cache.autopay.filter(a => a.id !== id);
        renderAll();
      } catch (e) { alert(e.message); }
    }

    async function setBankBalance() {
      const val = parseFloat(document.getElementById('bank-balance-input').value);
      if (isNaN(val)) return;
      try {
        const updated = await api('PUT', '/api/settings', { bank_balance: val });
        cache.settings = updated;
        document.getElementById('bank-balance-input').value = '';
        renderAll();
      } catch (e) { alert(e.message); }
    }

    // ── Render ──
    const fmt = n => '₹' + Math.round(n).toLocaleString('en-IN');
    const catBadge = cat => `<span class="badge badge-${cat}">${cat}</span>`;
    const CATS = ['food', 'transport', 'bills', 'shopping', 'health', 'other'];
    const CAT_LABELS = { food: 'Food', transport: 'Transport', bills: 'Bills', shopping: 'Shopping', health: 'Health', other: 'Other' };
    const CAT_COLORS = { food: 'var(--accent-amber)', transport: 'var(--accent-blue)', bills: 'var(--accent-purple)', shopping: 'var(--accent-red)', health: 'var(--accent-green)', other: 'var(--muted)' };
    const CAT_HEX = { food: '#f59e0b', transport: '#3b82f6', bills: '#a855f7', shopping: '#ef4444', health: '#10b981', other: '#64748b' };

    function renderAll() {
      const income = cache.income || [];
      const expenses = cache.expenses || [];
      const autopay = cache.autopay || [];
      const bankOpening = cache.settings?.bank_balance || 0;

      const totalIncome = income.reduce((s, i) => s + i.amount, 0);
      const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
      const totalAuto = autopay.filter(a => a.active).reduce((s, a) => s + a.amount, 0);
      const savings = totalIncome - totalExpenses - totalAuto;
      const bankNow = bankOpening + savings;
      const pct = totalIncome > 0 ? Math.round(savings / totalIncome * 100) : 0;

      const [y, m] = currentMonth.split('-');
      const monthLabel = new Date(y, m - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });

      // Dashboard
      document.getElementById('dash-subtitle').textContent = 'Overview for ' + monthLabel;
      document.getElementById('d-income').textContent = fmt(totalIncome);
      document.getElementById('d-expenses').textContent = fmt(totalExpenses + totalAuto);
      const totalSavings = cache.summary ? cache.summary.total_savings : savings;
      document.getElementById('d-savings').textContent = fmt(totalSavings);
      document.getElementById('d-savings-pct').textContent = 'Across all months';
      document.getElementById('d-balance').textContent = fmt(bankNow);

      const catTotals = {};
      CATS.forEach(c => catTotals[c] = expenses.filter(e => e.category === c).reduce((s, e) => s + e.amount, 0));
      const maxCat = Math.max(...Object.values(catTotals), 1);
      
      const donutLabels = [];
      const donutData = [];
      const donutColors = [];
      let legendHtml = '';

      CATS.forEach(c => {
         if(catTotals[c] > 0 || maxCat === 1) {
            donutLabels.push(CAT_LABELS[c]);
            donutData.push(catTotals[c]);
            donutColors.push(CAT_HEX[c]);
            const pct = totalExpenses > 0 ? Math.round(catTotals[c] / totalExpenses * 100) : 0;
            if (catTotals[c] > 0 || totalExpenses === 0) {
              legendHtml += `
              <div class="flex justify-between items-center">
                <div class="flex items-center gap-2">
                   <span class="w-2.5 h-2.5 rounded-full" style="background:${CAT_HEX[c]}"></span>
                   <span class="text-[11px] font-bold text-slate-700">${CAT_LABELS[c]}</span>
                </div>
                <span class="text-[11px] font-bold text-slate-900">${pct}%</span>
              </div>`;
            }
         }
      });
      document.getElementById('cat-legend').innerHTML = legendHtml;
      document.getElementById('donutTotal').textContent = fmt(totalExpenses);

      const spendCtx = document.getElementById('spendChartCanvas');
      if (spendCtx) {
         if (spendChartInstance) spendChartInstance.destroy();
         spendChartInstance = new Chart(spendCtx, {
            type: 'doughnut',
            data: { labels: donutLabels, datasets: [{ data: donutData, backgroundColor: donutColors, borderWidth: 0, hoverOffset: 4 }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ' ₹' + ctx.parsed } } } }
         });
      }

      let runningBalance = bankOpening;
      const chronologicalTx = [
        ...income.map(i => ({ date: i.date, amount: i.amount, sign: 1 })),
        ...expenses.map(e => ({ date: e.date, amount: e.amount, sign: -1 })),
        ...autopay.filter(a => a.active).map(a => {
           const day = String(a.due_day).padStart(2, '0');
           return { date: `${y}-${m}-${day}`, amount: a.amount, sign: -1 }
        })
      ].sort((a,b) => new Date(a.date) - new Date(b.date));

      const lineLabels = [new Date(y, m-1, 1).toLocaleDateString('en-US', {month: 'short', day: 'numeric'})];
      const lineData = [runningBalance];

      chronologicalTx.forEach(tx => {
         runningBalance += (tx.amount * tx.sign);
         const ld = new Date(tx.date);
         lineLabels.push(ld.toLocaleDateString('en-US', {month: 'short', day: 'numeric'}));
         lineData.push(runningBalance);
      });
      if(lineLabels.length === 1) {
         lineLabels.push('Today');
         lineData.push(bankNow);
      }

      const txCtx = document.getElementById('txGraphCanvas');
      if (txCtx) {
         if (txChartInstance) txChartInstance.destroy();
         const gradient = txCtx.getContext('2d').createLinearGradient(0, 0, 0, 250);
         gradient.addColorStop(0, 'rgba(59, 130, 246, 0.2)');
         gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');
         
         txChartInstance = new Chart(txCtx, {
            type: 'line',
            data: {
               labels: lineLabels,
               datasets: [{
                  label: 'Balance',
                  data: lineData,
                  borderColor: '#3b82f6',
                  backgroundColor: gradient,
                  borderWidth: 2,
                  pointRadius: 0,
                  pointHoverRadius: 4,
                  fill: true,
                  tension: 0.4
               }]
            },
            options: {
               responsive: true,
               maintainAspectRatio: false,
               plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ' ₹' + ctx.parsed.y } } },
               scales: { x: { grid: { display: false }, ticks: { font: { size: 9 }, color: '#94a3b8', maxTicksLimit: 5 } }, y: { display: false } }
            }
         });
      }

      const allTx = [
        ...income.map(i => ({ date: i.date, desc: i.label, cat: 'other', pay: 'Income', amount: i.amount, sign: 1 })),
        ...expenses.map(e => ({ date: e.date, desc: e.desc, cat: e.category, pay: e.payment, amount: e.amount, sign: -1 })),
        ...autopay.filter(a => a.active).map(a => ({ date: 'Auto', desc: a.name, cat: 'auto', pay: a.payment, amount: a.amount, sign: -1 }))
      ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8);
      document.getElementById('recent-tbody').innerHTML = allTx.length
        ? allTx.map(t => {
            const icon = t.sign > 0 ? 'south_west' : (t.cat === 'auto' ? 'currency_exchange' : 'shopping_bag');
            const iconColor = t.sign > 0 ? 'text-green-600' : 'text-slate-600';
            const iconBg = t.sign > 0 ? 'bg-green-50' : 'bg-slate-100';
            const amountColor = t.sign > 0 ? 'text-green-600' : 'text-red-500';
            return `<div class="p-4 md:p-6 flex items-center justify-between hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0">
              <div class="flex items-center gap-4 md:gap-5">
                <div class="w-10 h-10 md:w-12 md:h-12 rounded-full ${iconBg} flex items-center justify-center">
                  <span class="material-symbols-outlined ${iconColor}">${icon}</span>
                </div>
                <div>
                  <p class="font-bold text-sm text-slate-800">${t.desc}</p>
                  <p class="text-[11px] text-slate-500">${t.cat.toUpperCase()} · ${t.date}</p>
                </div>
              </div>
              <div class="text-right">
                <p class="font-bold text-sm ${amountColor}">${t.sign > 0 ? '+' : '−'}${fmt(t.amount)}</p>
                <p class="text-[10px] text-slate-400 font-medium">${t.pay}</p>
              </div>
            </div>`;
        }).join('')
        : '<div class="p-6 text-center text-slate-500 text-sm">No transactions yet</div>';

      // Income
      document.getElementById('inc-total-label').textContent = fmt(totalIncome);
      document.getElementById('income-tbody').innerHTML = income.length
        ? [...income].sort((a, b) => new Date(b.date) - new Date(a.date)).map(i => `<tr><td style="color:var(--muted)">${i.date}</td><td style="font-weight:500">${i.label}</td><td style="color:var(--muted);font-size:13px">${i.notes || '—'}</td><td style="text-align:right" class="amount-pos">+${fmt(i.amount)}</td><td><button class="btn btn-danger" onclick="deleteIncome(${i.id})">×</button></td></tr>`).join('')
        : '<tr><td colspan="5" class="empty-state">No income recorded this month</td></tr>';

      // Expenses
      document.getElementById('exp-total-label').textContent = fmt(totalExpenses);
      document.getElementById('exp-tbody').innerHTML = expenses.length
        ? [...expenses].sort((a, b) => new Date(b.date) - new Date(a.date)).map(e => `<tr><td style="color:var(--muted)">${e.date}</td><td style="font-weight:500">${e.desc}</td><td>${catBadge(e.category)}</td><td style="color:var(--muted);font-size:12px">${e.payment}</td><td style="text-align:right" class="amount-neg">−${fmt(e.amount)}</td><td><button class="btn btn-danger" onclick="deleteExpense(${e.id})">×</button></td></tr>`).join('')
        : '<tr><td colspan="6" class="empty-state">No expenses recorded this month</td></tr>';

      // Auto payments
      document.getElementById('ap-total-label').textContent = fmt(totalAuto) + ' / mo';
      document.getElementById('ap-list').innerHTML = autopay.length
        ? autopay.map(a => `
        <div style="display:flex; align-items:center; gap:16px; padding:16px 24px; border-bottom:1px solid var(--border);">
          <div style="width:40px; height:40px; border-radius:12px; background:rgba(255,255,255,0.05); display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0;">🔁</div>
          <div style="flex:1;">
            <div style="font-size:15px; font-weight:600;">${a.name}</div>
            <div style="font-size:12px; color:var(--muted); margin-top:2px;">Due on day ${a.due_day} · ${a.payment}</div>
          </div>
          <div class="amount-neg" style="margin-right:12px; font-size:18px;">${fmt(a.amount)}</div>
          <label style="position:relative; width:44px; height:24px; margin-right:12px;">
            <input type="checkbox" style="opacity:0; width:0; height:0;" ${a.active ? 'checked' : ''} onchange="toggleAutoPay(${a.id})"/>
            <span style="position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background:${a.active ? 'var(--accent-green)' : 'rgba(255,255,255,0.1)'}; border-radius:24px; transition:.3s;">
               <span style="content:''; position:absolute; width:18px; height:18px; left:3px; bottom:3px; background:white; border-radius:50%; transition:.3s; transform:${a.active ? 'translateX(20px)' : 'none'}"></span>
            </span>
          </label>
          <button class="btn btn-danger" onclick="deleteAutoPay(${a.id})">×</button>
        </div>`).join('')
        : '<div class="empty-state">No auto payments set up yet</div>';

      // Savings
      const savPct = totalIncome > 0 ? Math.min(Math.max(pct, 0), 100) : 0;
      document.getElementById('sav-pct').textContent = savPct + '%';
      document.getElementById('sav-pct').style.color = savings < 0 ? 'var(--accent-red)' : 'var(--accent-green)';
      document.getElementById('sav-amount').textContent = fmt(savings);
      document.getElementById('sav-amount').style.color = savings < 0 ? 'var(--accent-red)' : 'var(--accent-green)';
      document.getElementById('sav-breakdown').textContent = `${fmt(totalIncome)} income − ${fmt(totalExpenses)} expenses − ${fmt(totalAuto)} auto`;
      document.getElementById('sav-inc').textContent = fmt(totalIncome);
      document.getElementById('sav-bank').textContent = fmt(bankNow);
      document.getElementById('bank-balance-input').placeholder = 'Current opening: ' + fmt(bankOpening);

      const circ = 289;
      document.getElementById('savings-ring-circle').style.strokeDashoffset = circ - (savPct / 100) * circ;
      document.getElementById('savings-ring-circle').style.stroke = savings < 0 ? 'var(--accent-red)' : 'var(--accent-green)';

      document.getElementById('sav-bars').innerHTML = '<div style="font-size:13px;color:var(--muted);margin-bottom:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.05em;">Where your money went</div>'
        + CATS.filter(c => catTotals[c] > 0).map(c => `<div class="progress-wrap"><div class="progress-label"><span>${CAT_LABELS[c]}</span><span>${fmt(catTotals[c])}</span></div><div class="progress-bar-bg"><div class="progress-bar" style="width:${catTotals[c] / maxCat * 100}%;background:${CAT_COLORS[c]}; box-shadow: 0 0 10px ${CAT_COLORS[c]}40"></div></div></div>`).join('');

      // Report
      document.getElementById('report-title').textContent = 'Full breakdown for ' + monthLabel;
      document.getElementById('report-income-list').innerHTML = income.length
        ? income.map(i => `<div style="display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.05); font-size:14px;"><span style="font-weight:500;">${i.label}</span><span style="color:var(--accent-green); font-family:monospace; font-weight:600;">${fmt(i.amount)}</span></div>`).join('')
        : '<div class="empty-state" style="padding:20px 0;">No income recorded</div>';
      document.getElementById('report-inc-total').textContent = fmt(totalIncome);

      document.getElementById('report-auto-list').innerHTML = autopay.filter(a => a.active).length
        ? autopay.filter(a => a.active).map(a => `<div style="display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.05); font-size:14px;"><span style="font-weight:500;">${a.name} <span style="color:var(--muted);font-size:11px">(Day ${a.due_day})</span></span><span style="color:var(--accent-amber); font-family:monospace; font-weight:600;">${fmt(a.amount)}</span></div>`).join('')
        : '<div class="empty-state" style="padding:20px 0;">No active auto payments</div>';
      document.getElementById('report-auto-total').textContent = fmt(totalAuto);

      document.getElementById('report-exp-list').innerHTML = expenses.length
        ? [...expenses].sort((a, b) => new Date(b.date) - new Date(a.date)).map(e => `<div style="display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.05); font-size:14px;"><span style="font-weight:500;">${e.desc} <span style="margin-left:8px;">${catBadge(e.category)}</span></span><span style="color:var(--accent-red); font-family:monospace; font-weight:600;">${fmt(e.amount)}</span></div>`).join('')
        : '<div class="empty-state" style="padding:20px 0;">No expenses recorded</div>';
      document.getElementById('report-exp-total').textContent = fmt(totalExpenses);

      document.getElementById('report-net-savings').textContent = fmt(savings);
      document.getElementById('report-net-savings').style.color = savings < 0 ? 'var(--accent-red)' : 'var(--accent-green)';
      document.getElementById('report-alert').innerHTML = savings < 0 ? `<div class="alert">⚠️ You've spent more than you earned this month. Consider reviewing your expenses.</div>` : '';

      const allTxR = [
        ...income.map(i => ({ date: i.date, desc: i.label, cat: 'income', pay: '—', amount: i.amount, sign: 1 })),
        ...expenses.map(e => ({ date: e.date, desc: e.desc, cat: e.category, pay: e.payment, amount: e.amount, sign: -1 })),
        ...autopay.filter(a => a.active).map(a => ({ date: 'Recurring', desc: a.name, cat: 'auto', pay: a.payment, amount: a.amount, sign: -1 }))
      ].sort((a, b) => new Date(b.date) - new Date(a.date));
      document.getElementById('report-all-tbody').innerHTML = allTxR.length
        ? allTxR.map(t => `<tr><td style="color:var(--muted)">${t.date}</td><td style="font-weight:500;">${t.desc}</td><td>${t.cat === 'income' ? '<span style="color:var(--accent-green);font-size:12px;font-weight:600;">INCOME</span>' : catBadge(t.cat)}</td><td style="color:var(--muted);font-size:12px">${t.pay}</td><td style="text-align:right" class="${t.sign > 0 ? 'amount-pos' : 'amount-neg'}">${t.sign > 0 ? '+' : '−'}${fmt(t.amount)}</td></tr>`).join('')
        : '<tr><td colspan="5" class="empty-state">No transactions yet</td></tr>';
    }

    // ── AI Category Guesser ──
    const AI_KEYWORDS = {
      food: ['burger', 'pizza', 'restaurant', 'mcdonalds', 'kfc', 'swiggy', 'zomato', 'grocery', 'supermarket', 'mart', 'food', 'lunch', 'dinner', 'breakfast', 'coffee', 'starbucks', 'cafe', 'tea', 'snacks', 'milk', 'water', 'biryani', 'blinkit', 'zepto', 'instamart', 'dominos', 'pizzahut'],
      transport: ['uber', 'ola', 'auto', 'metro', 'bus', 'train', 'flight', 'petrol', 'fuel', 'diesel', 'taxi', 'parking', 'toll', 'ticket', 'cab', 'irctc', 'rapido', 'makemytrip', 'yatra', 'goibibo'],
      bills: ['electricity', 'water', 'rent', 'wifi', 'internet', 'mobile', 'recharge', 'netflix', 'amazon', 'prime', 'subscription', 'bill', 'emi', 'insurance', 'ott', 'spotify', 'jio', 'airtel', 'vi', 'bsnl', 'bescom', 'act', 'hathway', 'dth', 'tata sky'],
      shopping: ['amazon', 'flipkart', 'myntra', 'shoes', 'clothes', 'shirt', 'jeans', 'electronics', 'gift', 'shopping', 'mall', 'zara', 'h&m', 'ikea', 'ajio', 'meesho', 'nykaa', 'croma', 'reliance', 'pantaloons', 'lifestyle'],
      health: ['pharmacy', 'medicine', 'doctor', 'hospital', 'clinic', 'medical', 'gym', 'fitness', 'therapy', 'health', 'pills', 'apollo', 'pharmeasy', 'netmeds', '1mg', 'cult', 'workout']
    };

    function guessCategoryAI(desc) {
      if (!desc) return null;
      const words = desc.toLowerCase().match(/[a-z0-9&]+/g) || [];
      const scores = { food: 0, transport: 0, bills: 0, shopping: 0, health: 0, other: 0 };
      let matched = false;
      for (const word of words) {
        for (const [cat, keywords] of Object.entries(AI_KEYWORDS)) {
           if (keywords.some(k => word === k || (word.length >= 3 && (word.startsWith(k) || k.startsWith(word))))) {
              scores[cat] += 1;
              matched = true;
           }
        }
      }
      if (!matched) return null;
      let bestCat = null, maxScore = 0;
      for (const [cat, score] of Object.entries(scores)) {
        if (score > maxScore) { maxScore = score; bestCat = cat; }
      }
      return bestCat;
    }

    function initAICategorizer() {
      const expDescInput = document.getElementById('exp-desc');
      const expCatSelect = document.getElementById('exp-cat');
      if(expDescInput && expCatSelect) {
         expDescInput.addEventListener('input', (e) => {
             // Only guess if the user currently has the 'auto' option selected, so we don't annoy them
             if (expCatSelect.value !== 'auto') return;
             
             const guessedCat = guessCategoryAI(e.target.value);
             const autoOption = Array.from(expCatSelect.options).find(o => o.value === 'auto');
             
             if(autoOption) {
                 if(guessedCat) {
                     const emojiMap = {food:'🍔 ', transport:'🚗 ', bills:'⚡ ', shopping:'🛍️ ', health:'💊 ', other: '📦 '};
                     const formattedCat = emojiMap[guessedCat] + guessedCat.charAt(0).toUpperCase() + guessedCat.slice(1);
                     autoOption.textContent = `✨ Auto (${formattedCat})`;
                 } else {
                     autoOption.textContent = '✨ Auto Classify';
                 }
             }
         });
         
         // If user manually changes it to another category, change the auto mode title back
         expCatSelect.addEventListener('change', () => {
             if (expCatSelect.value !== 'auto') {
                 const autoOption = Array.from(expCatSelect.options).find(o => o.value === 'auto');
                 if(autoOption) autoOption.textContent = '✨ Auto Classify';
             }
         });
      }
    }

    // ── Init ──
    function initApp() {
      initMonthSelect();
      loadMonthData();
      initAICategorizer();
    }

    window.addEventListener('load', async () => {
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const isFileMode = window.location.protocol === 'file:';
      const urlSection = document.getElementById('apiUrlSection');
      
      // Auto-connect to the Cloudflare Backend
      API_URL = 'https://mypocket.kadutanmay-06.workers.dev';
      localStorage.setItem('mypocket_api_url', API_URL);
      
      if (urlSection) {
        urlSection.style.display = 'none'; // Hide the box so the login screen looks clean!
      }
        // If testing locally or via file, we let the user manually configure the backend URL
        document.getElementById('apiUrlInput').value = API_URL;
        checkApiHealth();

      // Auto-login
      if (token && currentUser) {
        try {
          await api('GET', '/api/settings');
          document.getElementById('authScreen').style.display = 'none';
          document.getElementById('appShell').classList.add('visible');
          document.getElementById('sidebarUser').textContent = currentUser.name || currentUser.email;
          document.getElementById('mobileUser').textContent = currentUser.name || currentUser.email;
          if (document.getElementById('userInitial')) {
            const dName = currentUser.name || currentUser.email;
            document.getElementById('userInitial').textContent = dName ? dName.charAt(0).toUpperCase() : 'U';
          }
          initApp();
        } catch {
          doLogout();
        }
      }
    });

  // ── Sidebar Toggle & Hover-to-Expand ──
  let sidebarCollapsed = false;
  let sidebarHoverExpanded = false;

  function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
    _applySidebarState(sidebarCollapsed);
    const icon = document.getElementById('sidebar-toggle-icon');
    if (icon) icon.textContent = sidebarCollapsed ? 'keyboard_double_arrow_right' : 'keyboard_double_arrow_left';
    const txt = document.getElementById('sidebar-toggle-text');
    if (txt) txt.textContent = sidebarCollapsed ? 'Expand' : 'Collapse';
  }

  function onSidebarHover(entering) {
    if (!sidebarCollapsed) return; // only act when collapsed
    sidebarHoverExpanded = entering;
    _applySidebarState(!entering); // expand on hover, collapse on leave
  }

  function _applySidebarState(collapsed) {
    const sidebar = document.getElementById('mainSidebar');
    const mainContent = document.getElementById('mainContent');
    const texts = document.querySelectorAll('.sidebar-text');
    const logo = document.getElementById('sidebar-logo');
    const stickyBar = document.getElementById('stickyMonthBar');
    if (!sidebar) return;

    if (collapsed) {
      sidebar.style.width = '68px';
      sidebar.style.padding = '20px 10px';
      mainContent && mainContent.style.setProperty('margin-left', '68px');
      if (stickyBar) stickyBar.style.left = '68px';
      texts.forEach(t => { t.style.opacity = '0'; t.style.pointerEvents = 'none'; });
      if (logo) { logo.style.opacity = '0'; logo.style.height = '0'; logo.style.marginBottom = '0'; logo.style.overflow = 'hidden'; }
    } else {
      sidebar.style.width = '260px';
      sidebar.style.padding = '28px 20px';
      mainContent && mainContent.style.setProperty('margin-left', '260px');
      if (stickyBar) stickyBar.style.left = '260px';
      texts.forEach(t => { t.style.opacity = '1'; t.style.pointerEvents = ''; });
      if (logo) { logo.style.opacity = '1'; logo.style.height = ''; logo.style.marginBottom = '32px'; logo.style.overflow = ''; }
    }
  }

  // ── Modal Open/Close ──
  function openModal(type) {
    const modal = document.getElementById('transactionModal');
    const content = document.getElementById('modalContent');
    const title = document.getElementById('modalTitle');
    const incForm = document.getElementById('modal-income-form');
    const expForm = document.getElementById('modal-expense-form');
    if (!modal) return;

    modal.style.display = 'flex';
    setTimeout(() => { content.style.transform = 'scale(1)'; }, 10);

    if (type === 'income') {
      title.textContent = 'Add Income';
      incForm.style.display = 'block';
      expForm.style.display = 'none';
      const d = document.getElementById('inc-date');
      if (d && !d.value) d.value = new Date().toISOString().split('T')[0];
    } else {
      title.textContent = 'Add Expense';
      incForm.style.display = 'none';
      expForm.style.display = 'block';
      const d = document.getElementById('exp-date');
      if (d && !d.value) d.value = new Date().toISOString().split('T')[0];
    }
  }

  function closeModal() {
    const modal = document.getElementById('transactionModal');
    const content = document.getElementById('modalContent');
    if (!modal) return;
    content.style.transform = 'scale(0.95)';
    setTimeout(() => { modal.style.display = 'none'; }, 220);
  }

  // ── Profile Dropdown ──
  function toggleProfileMenu() {
    const dd = document.getElementById('profileDropdown');
    if (!dd) return;
    const isHidden = dd.classList.contains('hidden');
    dd.classList.toggle('hidden', !isHidden);
    // update name in dropdown
    const u = document.getElementById('sidebarUser');
    const pdu = document.getElementById('profileDropdownUser');
    if (u && pdu) pdu.textContent = u.textContent;
  }

  // Close profile dropdown when clicking outside
  document.addEventListener('click', (e) => {
    const wrap = document.getElementById('profileDropdownWrap');
    if (wrap && !wrap.contains(e.target)) {
      const dd = document.getElementById('profileDropdown');
      if (dd) dd.classList.add('hidden');
    }
  });

  // openMonthPicker defined below with highlight logic

  function closeMonthPicker() {
    const modal = document.getElementById('monthPickerModal');
    if (modal) modal.style.display = 'none';
  }

  function openMonthPicker() {
    _highlightActivePicker();
    const modal = document.getElementById('monthPickerModal');
    if (modal) modal.style.display = 'flex';
    // close profile dropdown if open
    const dd = document.getElementById('profileDropdown');
    if (dd) dd.classList.add('hidden');
  }

  // ── Change Account Modal ──
  function openChangeAccountModal() {
    const dd = document.getElementById('profileDropdown');
    if (dd) dd.classList.add('hidden');
    // Simple prompt for now — could be expanded to a full account switcher
    const newName = prompt('Enter account name or email to switch accounts:\n(Feature coming soon — currently shows a name update preview)', currentUser?.name || '');
    if (newName && newName.trim()) {
      alert(`Account display updated to: ${newName.trim()}\n\nFull multi-account support is coming soon!`);
    }
  }
