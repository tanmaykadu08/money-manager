// ── Config & State ──
    let txChartInstance = null;
    let spendChartInstance = null;
    // RESTORED: Backend Sync Mode variables
    let API_URL = localStorage.getItem('mypocket_api_url') || window.location.origin;
    let token = localStorage.getItem('mypocket_token') || '';
    let currentUser = JSON.parse(localStorage.getItem('mypocket_user') || 'null');
    let currentMonth = '';
    let cache = { income: [], expenses: [], autopay: [], settings: { bank_balance: 0 } };
    
    // Transactions Filtering State
    let currentTxFilter = 'all'; // all, income, expense
    let unifiedTransactions = [];

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
      if (!el) return; // apiStatus element not present in current UI
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
      const tabLogin    = document.getElementById('tab-login');
      const tabRegister = document.getElementById('tab-register');
      const formLogin   = document.getElementById('form-login');
      const formReg     = document.getElementById('form-register');
      const authErr     = document.getElementById('auth-error');
      if (tabLogin)    tabLogin.classList.toggle('active', tab === 'login');
      if (tabRegister) tabRegister.classList.toggle('active', tab === 'register');
      if (formLogin)   formLogin.style.display   = tab === 'login'    ? 'flex' : 'none';
      if (formReg)     formReg.style.display     = tab === 'register' ? 'flex' : 'none';
      if (authErr)     authErr.style.display     = 'none';
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

      // Update all user display elements
      const displayName = currentUser.name || currentUser.email || 'User';
      document.getElementById('sidebarUser').textContent = displayName;
      document.getElementById('mobileUser').textContent = displayName;

      if (document.getElementById('userInitial')) {
        document.getElementById('userInitial').textContent = displayName.charAt(0).toUpperCase() || 'U';
      }
      // Profile dropdown — name + email
      const ddUser  = document.getElementById('profileDropdownUser');
      const ddEmail = document.getElementById('profileDropdownEmail');
      if (ddUser)  ddUser.textContent  = displayName;
      if (ddEmail) ddEmail.textContent = currentUser.email || '';
      
      const sbName = document.getElementById('sidebarUserName');
      const sbEmail = document.getElementById('sidebarUserEmail');
      const sbAvatar = document.getElementById('sidebarAvatar');
      if (sbName) sbName.textContent = displayName;
      if (sbEmail) sbEmail.textContent = currentUser.email || '';
      if (sbAvatar) sbAvatar.textContent = displayName.charAt(0).toUpperCase() || 'U';

      // Show AI FAB
      const fab = document.getElementById('aiFab');
      if (fab) fab.style.display = 'flex';

      initApp();
    }

    function doLogout() {
      token = ''; currentUser = null;
      localStorage.removeItem('mypocket_token');
      localStorage.removeItem('mypocket_user');
      document.getElementById('authScreen').style.display = 'flex';
      document.getElementById('appShell').classList.remove('visible');
      // Hide AI fab and close drawer
      const fab = document.getElementById('aiFab');
      if (fab) fab.style.display = 'none';
      if (typeof aiAssistant !== 'undefined') aiAssistant.close();
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
        const [income, expenses, autopay, settings, summary, goals] = await Promise.all([
          api('GET', `/api/income?month=${currentMonth}`),
          api('GET', `/api/expenses?month=${currentMonth}`),
          api('GET', '/api/autopay'),
          api('GET', '/api/settings'),
          api('GET', '/api/settings/summary'),
          api('GET', '/api/goals')
        ]);
        cache = { income, expenses, autopay, settings, summary, goals };
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
      const secEl = document.getElementById('sec-' + section);
      if (secEl) secEl.classList.add('active');

      // Tag proper menu buttons active
      const targetFn = `navigate('${section}')`;
      document.querySelectorAll(`.nav-btn[onclick="${targetFn}"], .mobile-nav-btn[onclick="${targetFn}"]`)
        .forEach(b => b.classList.add('active'));

      // Notify AI agent of page change
      if (typeof aiAssistant !== 'undefined' && aiAssistant.setPage) {
        aiAssistant.setPage(section);
      }
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

    // Number animation utility
    function animateValue(obj, start, end, duration) {
      if (!obj) return;
      let startTimestamp = null;
      const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const current = Math.floor(progress * (end - start) + start);
        obj.innerHTML = fmt(current);
        if (progress < 1) {
          window.requestAnimationFrame(step);
        }
      };
      window.requestAnimationFrame(step);
    }

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

      // Dashboard Greetings
      const userName = (typeof currentUser !== 'undefined' && currentUser?.name) ? currentUser.name.split(' ')[0] : 'User';
      const greet = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';
      document.getElementById('dash-greeting').textContent = `${greet}, ${userName} 👋`;
      document.getElementById('dash-overview-text').textContent = `Here's your financial overview for ${monthLabel}.`;
      
      // Dashboard Cards with animations
      animateValue(document.getElementById('d-income'), 0, totalIncome, 800);
      animateValue(document.getElementById('d-expenses'), 0, totalExpenses + totalAuto, 800);
      const totalSavings = cache.goals?.reduce((acc, g) => acc + g.total_saved, 0) || savings;
      animateValue(document.getElementById('d-savings'), 0, totalSavings, 800);
      animateValue(document.getElementById('d-balance'), 0, bankNow, 800);

      // Card Contexts (optional percentages)
      if (document.getElementById('dash-inc-pct')) document.getElementById('dash-inc-pct').textContent = 'This Month';
      if (document.getElementById('dash-exp-pct')) document.getElementById('dash-exp-pct').textContent = 'Outflow';
      if (document.getElementById('d-savings-pct')) document.getElementById('d-savings-pct').textContent = 'Total Goals Saved';

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

      const dailyData = {};
      
      // Group by day for the current month
      for (let i = 1; i <= new Date(y, m, 0).getDate(); i++) {
        const dStr = `${y}-${m}-${String(i).padStart(2, '0')}`;
        dailyData[dStr] = { inc: 0, exp: 0 };
      }

      income.forEach(i => { if (dailyData[i.date]) dailyData[i.date].inc += i.amount; });
      expenses.forEach(e => { if (dailyData[e.date]) dailyData[e.date].exp += e.amount; });
      autopay.filter(a => a.active).forEach(a => {
        const day = String(a.due_day).padStart(2, '0');
        const dStr = `${y}-${m}-${day}`;
        if (dailyData[dStr]) dailyData[dStr].exp += a.amount;
      });

      const lineLabels = [];
      const lineDataInc = [];
      const lineDataExp = [];
      Object.keys(dailyData).sort().forEach(date => {
        const ld = new Date(date);
        lineLabels.push(ld.toLocaleDateString('en-US', {day: 'numeric'}));
        lineDataInc.push(dailyData[date].inc);
        lineDataExp.push(dailyData[date].exp);
      });

      const txCtx = document.getElementById('txGraphCanvas');
      if (txCtx) {
         if (txChartInstance) txChartInstance.destroy();
         const gradInc = txCtx.getContext('2d').createLinearGradient(0, 0, 0, 250);
         gradInc.addColorStop(0, 'rgba(168, 85, 247, 0.4)');
         gradInc.addColorStop(1, 'rgba(168, 85, 247, 0)');
         
         const gradExp = txCtx.getContext('2d').createLinearGradient(0, 0, 0, 250);
         gradExp.addColorStop(0, 'rgba(239, 68, 68, 0.4)');
         gradExp.addColorStop(1, 'rgba(239, 68, 68, 0)');
         
         txChartInstance = new Chart(txCtx, {
            type: 'line',
            data: {
               labels: lineLabels,
               datasets: [
                 {
                   label: 'Income',
                   data: lineDataInc,
                   borderColor: '#a855f7',
                   backgroundColor: gradInc,
                   borderWidth: 3,
                   pointRadius: 0,
                   pointHoverRadius: 5,
                   fill: true,
                   tension: 0.4
                 },
                 {
                   label: 'Expenses',
                   data: lineDataExp,
                   borderColor: '#ef4444',
                   backgroundColor: gradExp,
                   borderWidth: 3,
                   pointRadius: 0,
                   pointHoverRadius: 5,
                   fill: true,
                   tension: 0.4
                 }
               ]
            },
            options: {
               responsive: true,
               maintainAspectRatio: false,
               interaction: { mode: 'index', intersect: false },
               plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ' ' + ctx.dataset.label + ': ₹' + ctx.parsed.y } } },
               scales: { 
                 x: { grid: { display: false, drawBorder: false }, ticks: { font: { size: 10, family: 'Inter' }, color: '#94a3b8', maxTicksLimit: 10 } }, 
                 y: { display: false, beginAtZero: true } 
               },
               animation: {
                 y: { duration: 1500, easing: 'easeOutQuart' }
               }
            }
         });
      }

      const allTx = [
        ...income.map(i => ({ date: i.date, desc: i.label, cat: 'income', pay: 'Income', amount: i.amount, sign: 1 })),
        ...expenses.map(e => ({ date: e.date, desc: e.desc, cat: e.category, pay: e.payment, amount: e.amount, sign: -1 })),
        ...autopay.filter(a => a.active).map(a => ({ date: 'Auto', desc: a.name, cat: 'auto', pay: a.payment, amount: a.amount, sign: -1 }))
      ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
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

      // Savings Progress Card
      const monthlyTarget = totalIncome * 0.20;
      const curSavings = Math.max(0, savings);
      const savingsPctRaw = monthlyTarget > 0 ? (curSavings / monthlyTarget) * 100 : 0;
      const savingsPct = Math.min(savingsPctRaw, 100);
      
      const scCurrent = document.getElementById('dash-savings-current');
      const scTarget = document.getElementById('dash-savings-target');
      const scBar = document.getElementById('dash-savings-bar');
      const scText = document.getElementById('dash-savings-text');
      
      if (scCurrent) animateValue(scCurrent, 0, curSavings, 800);
      if (scTarget) scTarget.textContent = '/ ' + fmt(monthlyTarget);
      if (scBar) setTimeout(() => scBar.style.width = savingsPct + '%', 100);
      if (scText) {
        if (savingsPct >= 100) scText.textContent = 'Target hit! Great job! 🎉';
        else if (savingsPct >= 50) scText.textContent = 'You are more than halfway there!';
        else scText.textContent = 'Keep saving to hit your target!';
      }

      // Income and Expenses legacy tables removed in favor of unified Transactions page

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

      // Render new Goals views
      renderGoals();
      renderDashboardGoals();

      // Compute unified transactions
      unifiedTransactions = [
        ...income.map(i => ({ id: i.id, type: 'income', date: i.date, amount: i.amount, description: i.label, category: 'income', source: i.source || 'Manual', originalData: i })),
        ...expenses.map(e => ({ id: e.id, type: 'expense', date: e.date, amount: e.amount, description: e.desc, category: e.category, source: e.source || 'Manual', originalData: e }))
      ];

      renderTransactionsList();
    }

    function setTxFilter(filterType) {
      currentTxFilter = filterType;
      document.querySelectorAll('.tx-filter-tab').forEach(btn => {
        btn.classList.remove('active', 'bg-white', 'shadow-sm', 'text-slate-800');
        btn.classList.add('text-slate-500');
        if (btn.innerText.toLowerCase().includes(filterType) || (filterType === 'all' && btn.innerText === 'All')) {
           btn.classList.add('active', 'bg-white', 'shadow-sm', 'text-slate-800');
           btn.classList.remove('text-slate-500');
        }
      });
      renderTransactionsList();
    }

    function renderTransactionsList() {
      const tbody = document.getElementById('transactions-tbody');
      if (!tbody) return;

      const searchTerm = (document.getElementById('tx-search')?.value || '').toLowerCase();
      const sortVal = document.getElementById('tx-sort')?.value || 'newest';
      const catVal = document.getElementById('tx-cat')?.value || 'all';

      let filtered = unifiedTransactions.filter(t => {
        if (currentTxFilter !== 'all' && t.type !== currentTxFilter) return false;
        if (catVal !== 'all' && t.category !== catVal && t.type === 'expense') return false;
        if (searchTerm && !t.description.toLowerCase().includes(searchTerm)) return false;
        return true;
      });

      filtered.sort((a, b) => {
        if (sortVal === 'newest') return new Date(b.date) - new Date(a.date);
        if (sortVal === 'oldest') return new Date(a.date) - new Date(b.date);
        if (sortVal === 'highest') return b.amount - a.amount;
        if (sortVal === 'lowest') return a.amount - b.amount;
      });

      tbody.innerHTML = filtered.length
        ? filtered.map(t => {
            const isInc = t.type === 'income';
            const catHtml = isInc 
              ? '<span class="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest bg-emerald-50 text-emerald-600">Income</span>' 
              : `<span class="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest bg-slate-100 text-slate-600">${t.category}</span>`;
            const sourceHtml = `<span class="text-[10px] font-semibold text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-200 uppercase">${t.source}</span>`;
            const amountColor = isInc ? 'text-emerald-600' : 'text-rose-500';
            
            return `<tr class="hover:bg-slate-50/80 transition-colors group cursor-pointer" onclick="openEditModal(${t.id}, '${t.type}')">
              <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-500">${t.date}</td>
              <td class="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-800">${t.description}</td>
              <td class="px-6 py-4 whitespace-nowrap">${catHtml}</td>
              <td class="px-6 py-4 whitespace-nowrap">${sourceHtml}</td>
              <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-bold ${amountColor}">${isInc ? '+' : '−'}${fmt(t.amount)}</td>
              <td class="px-6 py-4 whitespace-nowrap text-right">
                <button class="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100" onclick="event.stopPropagation(); deleteTransaction(${t.id}, '${t.type}')" title="Delete">
                  <span class="material-symbols-outlined text-[18px]">delete</span>
                </button>
              </td>
            </tr>`;
          }).join('')
        : '<tr><td colspan="6" class="px-6 py-12 text-center text-slate-500"><div class="flex flex-col items-center justify-center"><span class="material-symbols-outlined text-4xl text-slate-300 mb-2">receipt_long</span><p>No transactions found</p></div></td></tr>';
    }

    // ── Goals Rendering ──
    function getGoalStatus(g) {
      if (g.total_saved >= g.target_amount) return { text: 'Completed', color: 'text-emerald-600', bg: 'bg-emerald-50', icon: 'check_circle' };
      if (!g.target_date) return { text: 'No deadline', color: 'text-slate-500', bg: 'bg-slate-50', icon: 'schedule' };
      
      const today = new Date();
      const targetDate = new Date(g.target_date);
      if (targetDate < today) return { text: 'Behind', color: 'text-rose-600', bg: 'bg-rose-50', icon: 'warning' };
      
      const monthsRemaining = Math.max(1, (targetDate.getFullYear() - today.getFullYear()) * 12 + targetDate.getMonth() - today.getMonth());
      const remaining = Math.max(0, g.target_amount - g.total_saved);
      const reqMonthly = remaining / monthsRemaining;
      
      return { text: 'On Track', color: 'text-indigo-600', bg: 'bg-indigo-50', icon: 'trending_up', reqMonthly, targetDateStr: targetDate.toLocaleString('default', { month: 'short', year: 'numeric' }) };
    }

    function renderGoals() {
      const goals = cache.goals || [];
      const grid = document.getElementById('goals-grid');
      const emptyState = document.getElementById('goals-empty-state');
      if (!grid) return;
      
      const activeGoals = goals.filter(g => g.total_saved < g.target_amount);
      const totalSaved = goals.reduce((s, g) => s + g.total_saved, 0);
      const totalTarget = activeGoals.reduce((s, g) => s + g.target_amount, 0);
      const monthContributed = goals.reduce((s, g) => s + (g.month_contributed || 0), 0);
      
      document.getElementById('goal-summary-active').textContent = activeGoals.length;
      document.getElementById('goal-summary-saved').textContent = fmt(totalSaved);
      document.getElementById('goal-summary-target').textContent = fmt(totalTarget);
      
      const monthEl = document.getElementById('goal-summary-monthly');
      if (monthEl) monthEl.textContent = fmt(monthContributed);
      
      if (goals.length === 0) {
        grid.style.display = 'none';
        emptyState.style.display = 'flex';
        return;
      }
      
      grid.style.display = 'grid';
      emptyState.style.display = 'none';
      
      grid.innerHTML = goals.map(g => {
        const status = getGoalStatus(g);
        const pct = Math.min(100, Math.round((g.total_saved / g.target_amount) * 100)) || 0;
        const isCompleted = g.total_saved >= g.target_amount;
        
        let iconStr = '🎯';
        if (g.category === 'Emergency Fund') iconStr = '🚨';
        else if (g.category === 'Electronics') iconStr = '💻';
        else if (g.category === 'Travel') iconStr = '✈️';
        else if (g.category === 'Vehicle') iconStr = '🚗';
        else if (g.category === 'Education') iconStr = '📚';
        else if (g.category === 'Home') iconStr = '🏠';
        else if (g.category === 'Wedding') iconStr = '💍';
        else if (g.category === 'Investment') iconStr = '📈';
        else if (g.category === 'Business') iconStr = '💼';
        
        return `
        <div class="bg-white rounded-[24px] border border-outline-variant/10 shadow-sm p-6 relative flex flex-col fade-up">
          <div class="absolute top-4 right-4 group">
            <button class="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors">
              <span class="material-symbols-outlined text-[20px]">more_vert</span>
            </button>
            <div class="absolute right-0 top-8 bg-white border border-slate-100 shadow-xl rounded-xl w-40 py-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              <button class="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50" onclick="openGoalModal(${g.id})">Edit Goal</button>
              <button class="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50" onclick="openContribHistoryModal(${g.id})">History</button>
              <button class="w-full text-left px-4 py-2 text-sm text-rose-600 hover:bg-rose-50" onclick="deleteGoal(${g.id})">Delete</button>
            </div>
          </div>
          
          <div class="flex items-center gap-3 mb-6">
            <div class="w-12 h-12 rounded-xl bg-slate-50 text-2xl flex items-center justify-center border border-slate-100">${iconStr}</div>
            <div>
              <h4 class="font-bold text-slate-900">${g.name}</h4>
              <p class="text-[11px] font-bold text-slate-500 uppercase tracking-widest">${g.category}</p>
            </div>
          </div>
          
          <div class="flex items-center gap-5 mb-6">
            <div class="relative w-16 h-16 flex-shrink-0 flex items-center justify-center">
              <svg class="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <path class="text-slate-100" stroke-width="3" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
                <path class="${isCompleted ? 'text-emerald-500' : 'text-indigo-500'}" stroke-width="3" stroke-dasharray="${pct}, 100" stroke-linecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
              </svg>
              <span class="absolute text-sm font-bold text-slate-700">${pct}%</span>
            </div>
            <div class="flex-1">
              <p class="text-xs text-slate-500 mb-1">Saved</p>
              <p class="text-xl font-extrabold font-headline ${isCompleted ? 'text-emerald-600' : 'text-slate-900'}">${fmt(g.total_saved)}</p>
              <p class="text-xs text-slate-400 mt-1">of ${fmt(g.target_amount)}</p>
            </div>
          </div>
          
          <div class="flex items-center gap-2 mb-6">
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold ${status.bg} ${status.color}">
              <span class="material-symbols-outlined text-[14px]">${status.icon}</span> ${status.text}
            </span>
            ${status.reqMonthly ? `<span class="text-xs text-slate-500 font-medium">${fmt(status.reqMonthly)}/mo</span>` : ''}
          </div>
          
          <div class="w-full bg-slate-100 rounded-full h-1.5 mb-6 overflow-hidden">
            <div class="h-1.5 rounded-full ${isCompleted ? 'bg-emerald-500' : 'bg-indigo-500'}" style="width: ${pct}%"></div>
          </div>
          
          <button class="w-full py-2.5 rounded-xl border-2 border-dashed ${isCompleted ? 'border-emerald-200 text-emerald-600 bg-emerald-50' : 'border-indigo-200 text-indigo-600 hover:bg-indigo-50'} font-bold text-sm transition-colors mt-auto" ${isCompleted ? 'disabled' : `onclick="openContribModal(${g.id})"`}>
            ${isCompleted ? 'Goal Achieved 🎉' : '+ Add Contribution'}
          </button>
        </div>
        `;
      }).join('');
    }

    function renderDashboardGoals() {
      const list = document.getElementById('dash-goals-list');
      if (!list) return;
      
      const goals = cache.goals || [];
      const activeGoals = goals.filter(g => g.total_saved < g.target_amount).slice(0, 3);
      
      if (goals.length === 0) {
        list.innerHTML = `
          <div class="p-8 text-center bg-slate-50">
            <h4 class="font-bold text-slate-800 mb-2">No active goals</h4>
            <p class="text-sm text-slate-500 mb-4">Start tracking your financial milestones.</p>
            <button class="btn btn-primary" onclick="navigate('savings'); setTimeout(openGoalModal, 100);">+ Create Goal</button>
          </div>
        `;
        return;
      }
      
      list.innerHTML = activeGoals.map(g => {
        const pct = Math.min(100, Math.round((g.total_saved / g.target_amount) * 100)) || 0;
        
        let iconStr = '🎯';
        if (g.category === 'Emergency Fund') iconStr = '🚨';
        else if (g.category === 'Electronics') iconStr = '💻';
        else if (g.category === 'Travel') iconStr = '✈️';
        else if (g.category === 'Vehicle') iconStr = '🚗';
        else if (g.category === 'Education') iconStr = '📚';
        else if (g.category === 'Home') iconStr = '🏠';
        else if (g.category === 'Wedding') iconStr = '💍';
        else if (g.category === 'Investment') iconStr = '📈';
        else if (g.category === 'Business') iconStr = '💼';

        return `
          <div class="p-5 border-b border-slate-100 last:border-0 hover:bg-slate-50/50 transition-colors cursor-pointer" onclick="navigate('savings')">
            <div class="flex justify-between items-center mb-2">
              <div class="flex items-center gap-3">
                <span class="text-xl">${iconStr}</span>
                <span class="font-bold text-sm text-slate-800">${g.name}</span>
              </div>
              <span class="text-xs font-bold text-slate-500">${fmt(g.total_saved)} / ${fmt(g.target_amount)}</span>
            </div>
            <div class="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div class="bg-indigo-500 h-1.5 rounded-full" style="width: ${pct}%"></div>
            </div>
          </div>
        `;
      }).join('');
      
      // Calculate current month's contributions for summary
      const currentMonthContribs = 0; // Requires parsing contributions history for current month.
      // We'll update monthly summary directly in the API or via a basic estimate.
    }

    // ── Savings Goals Helpers ──
    function openGoalModal(id = null) {
      const modal = document.getElementById('goalModal');
      const title = document.getElementById('goalModalTitle');
      if (!modal) return;
      
      if (id) {
        title.textContent = 'Edit Savings Goal';
        const goal = cache.goals.find(g => g.id === id);
        if (goal) {
          document.getElementById('goal-id').value = goal.id;
          document.getElementById('goal-name').value = goal.name;
          document.getElementById('goal-target').value = goal.target_amount;
          document.getElementById('goal-saved').value = goal.initial_saved_amount;
          document.getElementById('goal-date').value = goal.target_date || '';
          document.getElementById('goal-category').value = goal.category;
          document.getElementById('goal-desc').value = goal.description || '';
          document.getElementById('goal-saved').disabled = true; // prevent changing initial after creation
        }
      } else {
        title.textContent = 'Create Savings Goal';
        document.getElementById('goal-id').value = '';
        document.getElementById('goal-name').value = '';
        document.getElementById('goal-target').value = '';
        document.getElementById('goal-saved').value = '';
        document.getElementById('goal-date').value = '';
        document.getElementById('goal-category').value = 'Other';
        document.getElementById('goal-desc').value = '';
        document.getElementById('goal-saved').disabled = false;
      }
      
      modal.style.display = 'flex';
      setTimeout(() => modal.firstElementChild.nextElementSibling.style.transform = 'scale(1)', 10);
    }
    
    function closeGoalModal() {
      const modal = document.getElementById('goalModal');
      if (modal) {
        modal.firstElementChild.nextElementSibling.style.transform = 'scale(0.95)';
        setTimeout(() => modal.style.display = 'none', 200);
      }
    }
    
    async function saveGoal() {
      const btn = document.getElementById('goal-save-btn');
      btn.textContent = 'Saving...';
      btn.disabled = true;
      
      const id = document.getElementById('goal-id').value;
      const name = document.getElementById('goal-name').value;
      const target = document.getElementById('goal-target').value;
      const saved = document.getElementById('goal-saved').value;
      const date = document.getElementById('goal-date').value;
      const category = document.getElementById('goal-category').value;
      const desc = document.getElementById('goal-desc').value;
      
      if (!name || !target) {
        alert('Name and Target amount are required');
        btn.textContent = 'Save Goal';
        btn.disabled = false;
        return;
      }
      
      const payload = {
        name,
        target_amount: parseFloat(target),
        target_date: date || null,
        category,
        description: desc
      };
      
      try {
        if (id) {
          await api('PUT', `/api/goals/${id}`, payload);
        } else {
          payload.initial_saved_amount = saved ? parseFloat(saved) : 0;
          await api('POST', '/api/goals', payload);
        }
        closeGoalModal();
        loadMonthData(); // Refresh all to include new goals
      } catch (e) {
        alert('Failed to save goal: ' + e.message);
      }
      btn.textContent = 'Save Goal';
      btn.disabled = false;
    }

    async function deleteGoal(id) {
      if (!confirm('Are you sure you want to delete this goal and its entire contribution history?')) return;
      try {
        await api('DELETE', `/api/goals/${id}`);
        loadMonthData();
      } catch (e) {
        alert('Failed to delete goal: ' + e.message);
      }
    }

    function openContribModal(id) {
      const goal = cache.goals.find(g => g.id === id);
      if (!goal) return;
      
      document.getElementById('contrib-goal-id').value = id;
      document.getElementById('contrib-goal-name').textContent = goal.name;
      document.getElementById('contrib-goal-progress').textContent = `Saved: ${fmt(goal.total_saved)} / ${fmt(goal.target_amount)}`;
      document.getElementById('contrib-goal-remaining').textContent = `Remaining: ${fmt(Math.max(0, goal.target_amount - goal.total_saved))}`;
      
      document.getElementById('contrib-amount').value = '';
      document.getElementById('contrib-date').value = new Date().toISOString().split('T')[0];
      document.getElementById('contrib-note').value = '';
      
      const modal = document.getElementById('contribModal');
      modal.style.display = 'flex';
      setTimeout(() => modal.firstElementChild.nextElementSibling.style.transform = 'scale(1)', 10);
    }

    function closeContribModal() {
      const modal = document.getElementById('contribModal');
      if (modal) {
        modal.firstElementChild.nextElementSibling.style.transform = 'scale(0.95)';
        setTimeout(() => modal.style.display = 'none', 200);
      }
    }

    async function saveContribution() {
      const btn = document.querySelector('#contribModal .bg-emerald-600');
      btn.textContent = 'Saving...';
      btn.disabled = true;
      
      const id = document.getElementById('contrib-goal-id').value;
      const amount = document.getElementById('contrib-amount').value;
      const date = document.getElementById('contrib-date').value;
      const note = document.getElementById('contrib-note').value;
      
      if (!amount || amount <= 0) {
        alert('Valid amount required');
        btn.textContent = '+ Add Funds';
        btn.disabled = false;
        return;
      }
      
      try {
        await api('POST', `/api/goals/${id}/contributions`, {
          amount: parseFloat(amount),
          contribution_date: date,
          note
        });
        closeContribModal();
        loadMonthData(); // Refresh everything
      } catch (e) {
        alert('Failed to save contribution: ' + e.message);
      }
      btn.textContent = '+ Add Funds';
      btn.disabled = false;
    }

    async function openContribHistoryModal(id) {
      const goal = cache.goals.find(g => g.id === id);
      if (!goal) return;
      
      document.getElementById('history-modal-title').textContent = `Contributions for ${goal.name}`;
      const list = document.getElementById('contrib-history-list');
      list.innerHTML = '<div class="p-4 text-center text-slate-500">Loading...</div>';
      
      const modal = document.getElementById('contribHistoryModal');
      modal.style.display = 'flex';
      setTimeout(() => modal.firstElementChild.nextElementSibling.style.transform = 'scale(1)', 10);
      
      try {
        const history = await api('GET', `/api/goals/${id}/contributions`);
        if (history.length === 0) {
          list.innerHTML = '<div class="p-4 text-center text-slate-500">No contributions yet.</div>';
          return;
        }
        
        list.innerHTML = history.map(h => `
          <div class="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
            <div>
              <div class="text-sm font-bold text-slate-900">${h.contribution_date}</div>
              <div class="text-xs text-slate-500">${h.note || 'No note'}</div>
            </div>
            <div class="flex items-center gap-3">
              <span class="font-bold text-emerald-600">+${fmt(h.amount)}</span>
              <button class="text-red-400 hover:text-red-600 p-1" onclick="deleteContribution(${id}, ${h.id})">
                <span class="material-symbols-outlined text-sm">delete</span>
              </button>
            </div>
          </div>
        `).join('');
      } catch (e) {
        list.innerHTML = `<div class="p-4 text-center text-red-500">Error: ${e.message}</div>`;
      }
    }

    function closeContribHistoryModal() {
      const modal = document.getElementById('contribHistoryModal');
      if (modal) {
        modal.firstElementChild.nextElementSibling.style.transform = 'scale(0.95)';
        setTimeout(() => modal.style.display = 'none', 200);
      }
    }
    
    async function deleteContribution(goalId, contribId) {
      if (!confirm('Delete this contribution?')) return;
      try {
        await api('DELETE', `/api/goals/${goalId}/contributions/${contribId}`);
        openContribHistoryModal(goalId); // refresh modal list
        loadMonthData(); // refresh background cache
      } catch (e) {
        alert('Failed to delete: ' + e.message);
      }
    }

    // ── Editing Transactions from Unified List ──r:bg-red-50 transition-colors opacity-0 group-hover:opacity-100" onclick="deleteTransaction(${t.id}, '${t.type}')" title="Delete">
                  <span class="material-symbols-outlined text-[18px]">delete</span>
                </button>
              </td>
            </tr>`;
          }).join('')
        : '<tr><td colspan="6" class="px-6 py-12 text-center text-slate-500 text-sm font-medium">No transactions found</td></tr>';
    }

    async function deleteTransaction(id, type) {
      if (!confirm('Are you sure you want to delete this transaction?')) return;
      try {
        if (type === 'income') {
           await api('DELETE', `/api/income/${id}`);
           cache.income = cache.income.filter(i => i.id !== id);
        } else {
           await api('DELETE', `/api/expenses/${id}`);
           cache.expenses = cache.expenses.filter(e => e.id !== id);
        }
        renderAll();
      } catch (e) { alert(e.message); }
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
        const apiUrlInputEl = document.getElementById('apiUrlInput');
        if (apiUrlInputEl) apiUrlInputEl.value = API_URL;
        checkApiHealth();

      // Auto-login
      if (token && currentUser) {
        try {
          await api('GET', '/api/settings');
          document.getElementById('authScreen').style.display = 'none';
          document.getElementById('appShell').classList.add('visible');

          const displayName = currentUser.name || currentUser.email || 'User';
          document.getElementById('sidebarUser').textContent = displayName;
          document.getElementById('mobileUser').textContent = displayName;
          if (document.getElementById('userInitial')) {
            document.getElementById('userInitial').textContent = displayName.charAt(0).toUpperCase() || 'U';
          }
          // Populate profile dropdown (remove "Default Account")
          const ddUser  = document.getElementById('profileDropdownUser');
          const ddEmail = document.getElementById('profileDropdownEmail');
          if (ddUser)  ddUser.textContent  = displayName;
          if (ddEmail) ddEmail.textContent = currentUser.email || '';

          // Show AI FAB
          const fab = document.getElementById('aiFab');
          if (fab) fab.style.display = 'flex';

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

// ═══════════════════════════════════════════════════════════════════════════
//  BANK STATEMENT IMPORT — Parse, Classify, Review, Import
// ═══════════════════════════════════════════════════════════════════════════

let _uploadState = {
  step: 1,        // 1=upload, 2=analyzing, 3=review, 4=success
  parsedRows: [], // raw parsed rows
  reviewRows: [], // classified + duplicate-checked
  filename: '',
  fileType: '',
  importedCount: { income: 0, expense: 0 },
};

// ── Open / Close ──
function openUploadModal() {
  _uploadState = { step: 1, parsedRows: [], reviewRows: [], filename: '', fileType: '', importedCount: { income: 0, expense: 0 } };
  const modal = document.getElementById('uploadStatementModal');
  if (!modal) return;
  modal.style.display = 'flex';
  _renderUploadStep(1);
}

function closeUploadModal() {
  const modal = document.getElementById('uploadStatementModal');
  if (modal) modal.style.display = 'none';
}

// ── Step renderer ──
function _renderUploadStep(step) {
  _uploadState.step = step;
  const body  = document.getElementById('uploadModalBody');
  const foot  = document.getElementById('uploadModalFooter');
  const steps = document.getElementById('uploadStepsBar');
  if (!body) return;

  // Update step indicator
  if (steps) {
    steps.querySelectorAll('.upload-step').forEach((el, i) => {
      el.classList.toggle('active', i + 1 === step);
      el.classList.toggle('done',   i + 1 < step);
    });
    steps.querySelectorAll('.upload-step-line').forEach((el, i) => {
      el.classList.toggle('done', i + 1 < step);
    });
  }

  if (step === 1) _renderStep1(body, foot);
  else if (step === 2) _renderStep2(body, foot);
  else if (step === 3) _renderStep3(body, foot);
  else if (step === 4) _renderStep4(body, foot);
}

function _renderStep1(body, foot) {
  body.innerHTML = `
    <div class="upload-dropzone" id="uploadDropzone"
         onclick="document.getElementById('filePickerInput').click()"
         ondragover="event.preventDefault();this.classList.add('dragover')"
         ondragleave="this.classList.remove('dragover')"
         ondrop="_handleDropzoneDrop(event)">
      <span class="material-symbols-outlined" style="font-size:48px;color:#a855f7;margin-bottom:12px;display:block;">upload_file</span>
      <p style="font-size:15px;font-weight:700;color:#0f172a;margin-bottom:6px;">Drop your bank statement here</p>
      <p style="font-size:13px;color:#64748b;">Supports <strong>CSV</strong>, <strong>XLS</strong>, <strong>XLSX</strong></p>
      <p style="font-size:12px;color:#94a3b8;margin-top:8px;">Max 10 MB &bull; PDF: please export as CSV from your bank</p>
      <div style="margin-top:20px;">
        <span style="display:inline-block;padding:9px 20px;background:linear-gradient(135deg,#a855f7,#3b82f6);color:#fff;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;">Choose File</span>
      </div>
    </div>
    <input type="file" id="filePickerInput" accept=".csv,.xls,.xlsx" style="display:none;" onchange="_handleFileInputChange(event)">
    <p style="font-size:12px;color:#94a3b8;margin-top:14px;text-align:center;">💡 Tip: In your bank's internet banking, export transactions as CSV for best results.</p>
  `;
  if (foot) foot.innerHTML = `<button class="btn" style="border:1px solid rgba(15,23,42,0.12);color:#64748b;" onclick="closeUploadModal()">Cancel</button>`;
}

function _handleDropzoneDrop(e) {
  e.preventDefault();
  document.getElementById('uploadDropzone')?.classList.remove('dragover');
  const file = e.dataTransfer?.files?.[0];
  if (file) _processFile(file);
}

function _handleFileInputChange(e) {
  const file = e.target.files?.[0];
  if (file) _processFile(file);
}

async function _processFile(file) {
  if (file.size > 10 * 1024 * 1024) { alert('File too large. Maximum 10 MB allowed.'); return; }
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) {
    alert('PDF parsing is not supported directly.\n\nPlease export your bank statement as a CSV file from your bank\'s internet banking portal or mobile app, then upload that instead.');
    return;
  }

  _uploadState.filename = file.name;
  _uploadState.fileType = name.endsWith('.csv') ? 'csv' : 'xlsx';
  _renderUploadStep(2);

  // Slight delay so the spinner renders
  await new Promise(r => setTimeout(r, 100));

  try {
    let rows;
    if (_uploadState.fileType === 'csv') {
      const text = await file.text();
      rows = _parseCSV(text);
    } else {
      const buffer = await file.arrayBuffer();
      rows = await _parseXLSX(buffer);
    }

    if (!rows || rows.length === 0) {
      alert('No transactions found in the file. Please check the file format and ensure it has Date, Description, and Amount columns.');
      _renderUploadStep(1); return;
    }

    _uploadState.parsedRows = rows;
    _uploadState.reviewRows = _classifyAndCheck(rows);
    _renderUploadStep(3);
  } catch (e) {
    console.error('Parse error:', e);
    alert('Failed to parse file: ' + e.message);
    _renderUploadStep(1);
  }
}

function _renderStep2(body, foot) {
  body.innerHTML = `
    <div class="analyze-spinner">
      <div class="analyze-ring"></div>
      <p style="font-size:14px;font-weight:700;color:#0f172a;">Analyzing your statement...</p>
      <p style="font-size:12px;color:#64748b;">Detecting transactions, dates, and categories</p>
    </div>
  `;
  if (foot) foot.innerHTML = '';
}

// ── CSV Parser ──
function _parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  // Auto-detect delimiter from first line
  const delimiters = [',', ';', '\t', '|'];
  const firstLine  = lines[0];
  const delim = delimiters.reduce((best, d) =>
    (firstLine.split(d).length > firstLine.split(best).length) ? d : best, ',');

  const headers = _csvSplitLine(lines[0], delim).map(h =>
    h.toLowerCase().replace(/["'\s]/g, ''));

  const find = (...keys) => headers.findIndex(h => keys.some(k => h.includes(k)));

  const colDate   = find('date', 'txndate', 'transactiondate', 'valuedate', 'postingdate', 'bookingdate');
  const colDesc   = find('description', 'narration', 'particulars', 'details', 'remarks', 'txndescription', 'memo', 'beneficiary', 'narrative');
  const colDebit  = find('debit', 'withdrawal', 'dr', 'debitamount', 'withdrawalamount', 'paid');
  const colCredit = find('credit', 'deposit', 'cr', 'creditamount', 'depositamount', 'received');
  const colAmount = find('amount', 'txnamount', 'transactionamount', 'value', 'net');
  const colRef    = find('reference', 'ref', 'chequeno', 'cheque', 'transactionid', 'txnid', 'utr', 'refno');

  if (colDate < 0) throw new Error('Could not find a Date column. Please check headers (expected: Date, Transaction Date, or similar).');
  if (colDesc < 0) throw new Error('Could not find a Description column. Please check headers (expected: Description, Narration, Particulars, or similar).');

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = _csvSplitLine(lines[i], delim);
    if (cells.length < 2) continue;

    const rawDate = colDate >= 0 ? (cells[colDate] || '').trim() : '';
    const desc    = colDesc  >= 0 ? (cells[colDesc]  || '').trim().replace(/^"+|"+$/g, '') : '';
    const ref     = colRef   >= 0 ? (cells[colRef]   || '').trim() : '';

    let debit = 0, credit = 0;
    if (colDebit >= 0 || colCredit >= 0) {
      debit  = parseFloat((cells[colDebit]  || '0').replace(/[^\d.\-]/g, '')) || 0;
      credit = parseFloat((cells[colCredit] || '0').replace(/[^\d.\-]/g, '')) || 0;
    } else if (colAmount >= 0) {
      const raw = parseFloat((cells[colAmount] || '0').replace(/[^\d.\-]/g, '')) || 0;
      if (raw < 0) debit = Math.abs(raw);
      else credit = raw;
    }

    if (!rawDate || (!debit && !credit) || !desc) continue;

    const date = _normalizeDate(rawDate);
    if (!date) continue;

    rows.push({ rawDate, date, desc, debit, credit, ref });
  }
  return rows;
}

function _csvSplitLine(line, delim) {
  const result = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; }
    else if (ch === delim && !inQ) { result.push(cur); cur = ''; }
    else { cur += ch; }
  }
  result.push(cur);
  return result.map(c => c.trim());
}

function _normalizeDate(raw) {
  if (!raw) return null;
  raw = raw.replace(/^"+|"+$/g, '').trim();
  // ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // DD/MM/YYYY or DD-MM-YYYY
  const m1 = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`;
  // MM/DD/YY  
  const m2 = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
  if (m2) return `20${m2[3]}-${m2[1].padStart(2,'0')}-${m2[2].padStart(2,'0')}`;
  // Free-form (e.g. "18 Jul 2025", "Jul 18, 2025")
  try {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return getLocalDateStr(d);
  } catch { /* */ }
  return null;
}

// ── XLSX Parser (SheetJS loaded from CDN on demand) ──
async function _parseXLSX(buffer) {
  if (typeof XLSX === 'undefined') {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load SheetJS library for Excel parsing'));
      document.head.appendChild(s);
    });
  }
  const wb  = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: true });
  const ws  = wb.Sheets[wb.SheetNames[0]];
  const csv = XLSX.utils.sheet_to_csv(ws);
  return _parseCSV(csv);
}

// ── Classify & Duplicate Check ──
function _classifyAndCheck(rows) {
  // Build existing tx index for duplicate detection
  const allExisting = [
    ...(cache.expenses || []).map(e => ({ date: e.date, amount: e.amount, desc: (e.desc  || '').toLowerCase() })),
    ...(cache.income   || []).map(i => ({ date: i.date, amount: i.amount, desc: (i.label || '').toLowerCase() })),
  ];

  return rows.map((r, idx) => {
    const isIncome = r.credit > 0 && r.debit === 0;
    const amount   = isIncome ? r.credit : r.debit;
    const type     = isIncome ? 'income' : 'expense';
    const category = isIncome
      ? _classifyIncomeCategory(r.desc)
      : (guessCategoryAI(r.desc) || 'other');
    const isDup = _checkDuplicate(r.date, amount, r.desc, allExisting);
    return { idx, date: r.date, desc: r.desc, amount, type, category, ref: r.ref || '', isDup, selected: !isDup };
  });
}

function _classifyIncomeCategory(desc) {
  const d = desc.toLowerCase();
  if (/salary|sal|payroll|ctc|stipend/.test(d)) return 'salary';
  if (/refund|cashback|reversal|revert/.test(d)) return 'refund';
  if (/interest|int cr|dividend/.test(d)) return 'interest';
  if (/deposit|cash dep|atm dep/.test(d)) return 'deposit';
  if (/transfer|neft|rtgs|imps|upi|received|inward/.test(d)) return 'transfer';
  return 'income';
}

function _checkDuplicate(date, amount, desc, existing) {
  const d = desc.toLowerCase();
  return existing.some(e => {
    if (e.date !== date) return false;
    if (Math.abs(e.amount - amount) > 1) return false;
    if (e.desc === d) return true;
    return _wordOverlap(d, e.desc) >= 0.5;
  });
}

function _wordOverlap(a, b) {
  const aw = new Set(a.split(/\W+/).filter(w => w.length > 2));
  const bw = new Set(b.split(/\W+/).filter(w => w.length > 2));
  if (aw.size === 0 || bw.size === 0) return 0;
  let common = 0;
  aw.forEach(w => { if (bw.has(w)) common++; });
  return common / Math.max(aw.size, bw.size);
}

// ── Step 3: Review Table ──
function _renderStep3(body, foot) {
  const rows         = _uploadState.reviewRows;
  const incomeRows   = rows.filter(r => r.type === 'income');
  const expenseRows  = rows.filter(r => r.type === 'expense');
  const dupRows      = rows.filter(r => r.isDup);
  const selectedRows = rows.filter(r => r.selected);

  const totalIncome   = incomeRows.reduce((s, r) => s + r.amount, 0);
  const totalExpenses = expenseRows.reduce((s, r) => s + r.amount, 0);

  const incomeCategories  = ['salary','refund','interest','deposit','transfer','income'];
  const expenseCategories = ['food','transport','bills','shopping','health','entertainment','education','rent','subscription','transfer','other'];

  body.innerHTML = `
    <div class="import-summary-card">
      <div class="import-summary-item">
        <div class="import-summary-val" style="color:#0f172a;">${rows.length}</div>
        <div class="import-summary-lbl">Detected</div>
      </div>
      <div class="import-summary-item">
        <div class="import-summary-val" style="color:#10b981;">+${fmt(totalIncome)}</div>
        <div class="import-summary-lbl">Income</div>
      </div>
      <div class="import-summary-item">
        <div class="import-summary-val" style="color:#ef4444;">-${fmt(totalExpenses)}</div>
        <div class="import-summary-lbl">Expenses</div>
      </div>
      <div class="import-summary-item">
        <div class="import-summary-val" style="color:#f59e0b;">${dupRows.length}</div>
        <div class="import-summary-lbl">Possible Dups</div>
      </div>
      <div class="import-summary-item">
        <div class="import-summary-val" style="color:#7c3aed;" id="selectedCount">${selectedRows.length}</div>
        <div class="import-summary-lbl">Selected</div>
      </div>
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;">
      <p style="font-size:12px;color:#64748b;">Review and edit transactions. Uncheck any to exclude from import.</p>
      <label style="font-size:12px;color:#7c3aed;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;">
        <input type="checkbox" id="selectAll" ${selectedRows.length === rows.length ? 'checked' : ''} onchange="_toggleSelectAll(this.checked)"> Select All
      </label>
    </div>

    <div class="review-table-wrap">
      <table class="review-table">
        <thead>
          <tr>
            <th style="width:32px;"></th>
            <th>Date</th>
            <th>Description</th>
            <th style="text-align:right;">Amount</th>
            <th>Type</th>
            <th>Category</th>
          </tr>
        </thead>
        <tbody id="reviewTableBody">
          ${rows.map(r => {
            const cats    = r.type === 'income' ? incomeCategories : expenseCategories;
            const catOpts = cats.map(c => `<option value="${c}" ${c === r.category ? 'selected' : ''}>${c.charAt(0).toUpperCase() + c.slice(1)}</option>`).join('');
            return `
              <tr class="${r.isDup ? 'duplicate-row' : ''}" id="review-row-${r.idx}">
                <td><input type="checkbox" class="review-checkbox" data-idx="${r.idx}" ${r.selected ? 'checked' : ''} onchange="_updateRowSelection(${r.idx}, this.checked)"></td>
                <td style="font-family:monospace;font-size:12px;color:#64748b;white-space:nowrap;">${r.date}</td>
                <td>
                  <div style="font-size:12.5px;font-weight:500;color:#0f172a;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.desc}">${r.desc}</div>
                  ${r.isDup ? '<div class="dup-badge" style="margin-top:3px;">⚠ Possible Duplicate</div>' : ''}
                  ${r.ref ? `<div style="font-size:10px;color:#94a3b8;margin-top:2px;">Ref: ${r.ref}</div>` : ''}
                </td>
                <td style="text-align:right;font-family:monospace;font-weight:700;color:${r.type === 'income' ? '#10b981' : '#ef4444'};white-space:nowrap;">
                  ${r.type === 'income' ? '+' : '−'}${fmt(r.amount)}
                </td>
                <td>
                  <span style="display:inline-block;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;background:${r.type === 'income' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'};color:${r.type === 'income' ? '#10b981' : '#ef4444'};">
                    ${r.type === 'income' ? '↑ Income' : '↓ Expense'}
                  </span>
                </td>
                <td>
                  <select onchange="_updateRowCategory(${r.idx}, this.value)">${catOpts}</select>
                </td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  if (foot) foot.innerHTML = `
    <button class="btn" style="border:1px solid rgba(15,23,42,0.12);color:#64748b;" onclick="closeUploadModal()">Cancel</button>
    <button class="btn" style="background:linear-gradient(135deg,#a855f7,#3b82f6);color:#fff;font-weight:700;padding:10px 20px;" onclick="_importSelected()" id="importBtn">
      <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;margin-right:4px;">download</span>
      Import Selected Transactions
    </button>
  `;
}

function _updateRowSelection(idx, checked) {
  const row = _uploadState.reviewRows.find(r => r.idx === idx);
  if (row) row.selected = checked;
  const selected = _uploadState.reviewRows.filter(r => r.selected).length;
  const el = document.getElementById('selectedCount');
  if (el) el.textContent = selected;
}

function _updateRowCategory(idx, cat) {
  const row = _uploadState.reviewRows.find(r => r.idx === idx);
  if (row) row.category = cat;
}

function _toggleSelectAll(checked) {
  _uploadState.reviewRows.forEach(r => r.selected = checked);
  document.querySelectorAll('.review-checkbox').forEach(cb => cb.checked = checked);
  const sa = document.getElementById('selectAll');
  if (sa) sa.checked = checked;
  const el = document.getElementById('selectedCount');
  if (el) el.textContent = checked ? _uploadState.reviewRows.length : 0;
}

// ── Import ──
async function _importSelected() {
  const btn = document.getElementById('importBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="analyze-ring" style="width:16px;height:16px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px;"></span>Importing...'; }

  const selected = _uploadState.reviewRows.filter(r => r.selected);
  if (selected.length === 0) { alert('No transactions selected. Please select at least one transaction to import.'); if (btn) btn.disabled = false; return; }

  try {
    const incomeSelected  = selected.filter(r => r.type === 'income');
    const expenseSelected = selected.filter(r => r.type === 'expense');

    // Create import tracking record
    let importId = null;
    try {
      const imp = await api('POST', '/api/statement-imports', {
        filename: _uploadState.filename,
        file_type: _uploadState.fileType,
        record_count: selected.length,
        income_count: incomeSelected.length,
        expense_count: expenseSelected.length,
      });
      importId = imp.id;
    } catch (e) { console.warn('Import record creation failed (non-fatal):', e); }

    // Build payloads
    const incomeBulk = incomeSelected.map(r => {
      const d = new Date(r.date + 'T00:00:00');
      return {
        month_key: getLocalMonthKey(d),
        label: r.desc,
        amount: r.amount,
        date: r.date,
        notes: r.ref ? `Ref: ${r.ref}` : '',
        source: 'bank_statement',
        import_id: importId,
        original_description: r.desc,
        external_reference: r.ref || null,
      };
    });

    const expenseBulk = expenseSelected.map(r => {
      const d = new Date(r.date + 'T00:00:00');
      return {
        month_key: getLocalMonthKey(d),
        desc: r.desc,
        amount: r.amount,
        date: r.date,
        category: r.category,
        payment: 'Net Banking',
        source: 'bank_statement',
        import_id: importId,
        original_description: r.desc,
        external_reference: r.ref || null,
      };
    });

    let incomeDone = 0, expenseDone = 0;

    // Attempt bulk insert; fall back to sequential on 404
    if (incomeBulk.length) {
      try {
        const res = await api('POST', '/api/income/bulk', { rows: incomeBulk, import_id: importId });
        incomeDone = res.count || 0;
        if (res.inserted) {
          const monthItems = res.inserted.filter(i => i.month_key === currentMonth);
          cache.income = [...monthItems, ...cache.income];
        }
      } catch {
        for (const row of incomeBulk) {
          try {
            const r = await api('POST', '/api/income', row);
            if (r.month_key === currentMonth) cache.income.unshift(r);
            incomeDone++;
          } catch { /* skip individual */ }
        }
      }
    }

    if (expenseBulk.length) {
      try {
        const res = await api('POST', '/api/expenses/bulk', { rows: expenseBulk, import_id: importId });
        expenseDone = res.count || 0;
        if (res.inserted) {
          const monthItems = res.inserted.filter(e => e.month_key === currentMonth);
          cache.expenses = [...monthItems, ...cache.expenses];
        }
      } catch {
        for (const row of expenseBulk) {
          try {
            const r = await api('POST', '/api/expenses', row);
            if (r.month_key === currentMonth) cache.expenses.unshift(r);
            expenseDone++;
          } catch { /* skip individual */ }
        }
      }
    }

    // Refresh global summary
    try {
      const summary = await api('GET', '/api/settings/summary');
      cache.summary = summary;
    } catch { /* non-fatal */ }

    renderAll();
    _uploadState.importedCount = { income: incomeDone, expense: expenseDone };
    _renderUploadStep(4);
  } catch (e) {
    console.error('Import error:', e);
    alert('Import failed: ' + e.message);
    if (btn) { btn.disabled = false; btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;margin-right:4px;">download</span>Import Selected Transactions'; }
  }
}

function _renderStep4(body, foot) {
  const { income, expense } = _uploadState.importedCount || { income: 0, expense: 0 };
  body.innerHTML = `
    <div class="import-success">
      <div class="import-success-icon">
        <span class="material-symbols-outlined" style="font-size:32px;" aria-hidden="true">check_circle</span>
      </div>
      <h3 style="font-size:20px;font-weight:800;font-family:'Manrope',sans-serif;color:#0f172a;">Import Complete!</h3>
      <p style="font-size:14px;color:#64748b;line-height:1.6;">
        <strong style="color:#10b981;">${income}</strong> income and
        <strong style="color:#ef4444;">${expense}</strong> expense transactions have been imported.
      </p>
      <p style="font-size:13px;color:#94a3b8;max-width:320px;">All transactions now appear in your Dashboard, Transactions view, and AI Insights — alongside your manually entered data.</p>
    </div>
  `;
  if (foot) foot.innerHTML = `
    <button class="btn" style="background:linear-gradient(135deg,#a855f7,#3b82f6);color:#fff;font-weight:700;padding:10px 24px;" onclick="closeUploadModal()">
      <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;margin-right:4px;">done</span>
      Done
    </button>
  `;
}

// ── Historical month data loader for AI comparison ──
async function loadMonthDataForMonth(month) {
  try {
    const [income, expenses] = await Promise.all([
      api('GET', `/api/income?month=${month}`),
      api('GET', `/api/expenses?month=${month}`),
    ]);
    return { income, expenses };
  } catch {
    return { income: [], expenses: [] };
  }
}
