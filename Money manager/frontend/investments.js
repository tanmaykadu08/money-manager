let investmentsChartInstance = null;
let portfolioHoldings = [];
let marketPrices = {};
let searchDebounceTimeout = null;

function switchInvTab(tab) {
  const tPort = document.getElementById('inv-tab-portfolio');
  const tAnal = document.getElementById('inv-tab-analysis');
  const btnPort = document.getElementById('tab-portfolio');
  const btnAnal = document.getElementById('tab-analysis');
  
  if (tab === 'portfolio') {
    tPort.classList.remove('hidden');
    tPort.style.display = 'flex';
    tAnal.classList.add('hidden');
    tAnal.style.display = 'none';
    
    btnPort.className = 'pb-3 text-lg font-bold border-b-2 border-accent-purple text-accent-purple transition-colors';
    btnAnal.className = 'pb-3 text-lg font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-800 transition-colors';
    loadPortfolio();
  } else {
    tAnal.classList.remove('hidden');
    tAnal.style.display = 'flex';
    tPort.classList.add('hidden');
    tPort.style.display = 'none';
    
    btnAnal.className = 'pb-3 text-lg font-bold border-b-2 border-accent-purple text-accent-purple transition-colors';
    btnPort.className = 'pb-3 text-lg font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-800 transition-colors';
  }
}

function openAddInvestmentModal() {
  document.getElementById('addInvestmentModal').style.display = 'flex';
  
  // Reset search & selection
  document.getElementById('add-inv-search').value = '';
  document.getElementById('add-inv-search').parentElement.style.display = 'block';
  const dropdown = document.getElementById('add-inv-dropdown');
  if(dropdown) { dropdown.classList.add('hidden'); dropdown.classList.remove('flex'); }
  document.getElementById('add-inv-selected').classList.add('hidden');
  document.getElementById('add-inv-selected').classList.remove('flex');
  
  document.getElementById('add-inv-symbol').value = '';
  document.getElementById('add-inv-name').value = '';
  document.getElementById('add-inv-qty').value = '';
  document.getElementById('add-inv-price').value = '';
  document.getElementById('add-inv-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('add-inv-error').classList.add('hidden');
}

function closeAddInvestmentModal() {
  document.getElementById('addInvestmentModal').style.display = 'none';
}

function handleStockSearch(query) {
    const dropdown = document.getElementById('add-inv-dropdown');
    if (!dropdown) return;
    
    if (!query || query.trim().length < 3) {
        dropdown.classList.add('hidden');
        dropdown.classList.remove('flex');
        return;
    }
    
    dropdown.classList.remove('hidden');
    dropdown.classList.add('flex');
    dropdown.innerHTML = '<div class="p-4 text-center text-sm text-slate-500 font-semibold">Searching...</div>';
    
    clearTimeout(searchDebounceTimeout);
    searchDebounceTimeout = setTimeout(async () => {
        try {
            const token = localStorage.getItem('token');
            const q = query.trim();
            console.log(`[Stock Search] Query: ${q}`);
            
            const res = await fetch(`/api/investments/search?q=${encodeURIComponent(q)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            console.log(`[Stock Search] Status: ${res.status}`);
            
            if (!res.ok) {
                let errorMsg = "Stock search service is temporarily unavailable.";
                try {
                    const errData = await res.json();
                    if (errData.error) errorMsg = errData.error;
                    console.log(`[Stock Search] Response:`, errData);
                } catch(e) {
                    const text = await res.text();
                    console.log(`[Stock Search] Response:`, text);
                }
                throw new Error(errorMsg);
            }
            
            const data = await res.json();
            console.log(`[Stock Search] Response:`, data);
            
            renderStockResults(data.results || []);
        } catch (e) {
            dropdown.innerHTML = `<div class="p-4 text-center text-sm text-rose-500 font-semibold">${e.message || 'Failed to search stocks.'}</div>`;
        }
    }, 400);
}

function renderStockResults(results) {
    const dropdown = document.getElementById('add-inv-dropdown');
    
    if (!results || results.length === 0) {
        dropdown.innerHTML = '<div class="p-4 text-center text-sm text-slate-500 font-semibold">No matching stocks found.</div>';
        return;
    }
    
    let html = '';
    results.forEach(r => {
        const safeSym = r.symbol.replace(/'/g, "\\'");
        const safeName = r.name.replace(/'/g, "\\'");
        const safeExch = r.exchange.replace(/'/g, "\\'");
        
        html += `
        <div onclick="selectStock('${safeSym}', '${safeName}', '${safeExch}')" class="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-0 transition-colors text-left">
            <p class="font-bold text-slate-900 truncate">${r.name}</p>
            <p class="text-xs font-semibold text-slate-500 mt-1">${r.symbol} • ${r.exchange}</p>
        </div>
        `;
    });
    dropdown.innerHTML = html;
}

function selectStock(symbol, name, exchange) {
    document.getElementById('add-inv-dropdown').classList.add('hidden');
    document.getElementById('add-inv-dropdown').classList.remove('flex');
    document.getElementById('add-inv-search').parentElement.style.display = 'none';
    
    document.getElementById('add-inv-selected').classList.remove('hidden');
    document.getElementById('add-inv-selected').classList.add('flex');
    document.getElementById('add-inv-sel-name').textContent = name;
    document.getElementById('add-inv-sel-sym').textContent = `${symbol} • ${exchange}`;
    
    document.getElementById('add-inv-symbol').value = symbol;
    document.getElementById('add-inv-name').value = name;
}

function clearStockSelection() {
    document.getElementById('add-inv-selected').classList.add('hidden');
    document.getElementById('add-inv-selected').classList.remove('flex');
    document.getElementById('add-inv-search').parentElement.style.display = 'block';
    document.getElementById('add-inv-search').value = '';
    
    document.getElementById('add-inv-symbol').value = '';
    document.getElementById('add-inv-name').value = '';
    
    document.getElementById('add-inv-search').focus();
}

// Close dropdown if clicking outside
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('add-inv-dropdown');
    const searchInput = document.getElementById('add-inv-search');
    if (dropdown && !dropdown.classList.contains('hidden')) {
        if (!dropdown.contains(e.target) && e.target !== searchInput) {
            dropdown.classList.add('hidden');
            dropdown.classList.remove('flex');
        }
    }
});

async function saveInvestment() {
  const symbol = document.getElementById('add-inv-symbol').value.trim();
  const name = document.getElementById('add-inv-name').value.trim();
  const qty = document.getElementById('add-inv-qty').value;
  const price = document.getElementById('add-inv-price').value;
  const date = document.getElementById('add-inv-date').value;
  const errEl = document.getElementById('add-inv-error');
  
  if (!symbol || !name || !qty || !price || !date) {
    errEl.textContent = "Please select a valid stock and fill all fields.";
    errEl.classList.remove('hidden');
    return;
  }
  
  try {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/investments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        symbol,
        company_name: name,
        quantity: parseFloat(qty),
        average_buy_price: parseFloat(price),
        purchase_date: date
      })
    });
    
    if (!res.ok) {
      let errorMsg = `Server returned ${res.status}`;
      try {
        const errorData = await res.json();
        if (errorData.error) errorMsg = errorData.error;
      } catch (e) {
        // Fallback to text if JSON parsing fails
        const textData = await res.text();
        if (textData) errorMsg = textData.substring(0, 100);
      }
      throw new Error(errorMsg);
    }
    
    closeAddInvestmentModal();
    loadPortfolio();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.classList.remove('hidden');
  }
}

async function loadPortfolio() {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/investments', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error("Failed to load portfolio.");
    
    portfolioHoldings = await res.json();
    
    const uniqueSymbols = [...new Set(portfolioHoldings.map(h => h.symbol))];
    if (uniqueSymbols.length > 0) {
      const priceRes = await fetch(`/api/investments/prices?symbols=${uniqueSymbols.join(',')}`, {
          headers: { 'Authorization': `Bearer ${token}` }
      });
      if (priceRes.ok) {
          const pricesData = await priceRes.json();
          marketPrices = { ...marketPrices, ...pricesData };
      }
    }
    
    renderPortfolio();
  } catch (e) {
    console.error("Portfolio load error:", e);
    document.getElementById('portfolio-table-body').innerHTML = `<tr><td colspan="7" class="py-10 text-center text-rose-500 font-semibold">Failed to load portfolio</td></tr>`;
  }
}

function renderPortfolio() {
  const tbody = document.getElementById('portfolio-table-body');
  
  if (!portfolioHoldings || portfolioHoldings.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="py-10 text-center text-slate-400 font-semibold">No investments added yet.</td></tr>`;
    document.getElementById('port-total-invested').textContent = '₹0.00';
    document.getElementById('port-current-value').textContent = '₹0.00';
    document.getElementById('port-total-pl').textContent = '₹0.00';
    document.getElementById('port-total-pl').className = 'text-2xl font-black text-slate-900';
    document.getElementById('port-today-change').textContent = '₹0.00';
    document.getElementById('port-today-change').className = 'text-2xl font-black text-slate-900';
    return;
  }

  let totalInvested = 0;
  let totalCurrentValue = 0;
  let todaysTotalChange = 0;
  
  let html = '';
  
  portfolioHoldings.forEach(h => {
    const qty = parseFloat(h.quantity);
    const avgPrice = parseFloat(h.average_buy_price);
    const invested = qty * avgPrice;
    totalInvested += invested;
    
    const marketInfo = marketPrices[h.symbol];
    let currPriceDisplay = 'Price unavailable';
    let currValueDisplay = '-';
    let plDisplay = '-';
    let plClass = 'text-slate-500';
    
    if (marketInfo && marketInfo.price) {
        const curPrice = marketInfo.price;
        const curValue = qty * curPrice;
        totalCurrentValue += curValue;
        todaysTotalChange += (marketInfo.change * qty);
        
        const pl = curValue - invested;
        const plPct = (pl / invested) * 100;
        
        currPriceDisplay = `₹${curPrice.toFixed(2)}`;
        currValueDisplay = `₹${curValue.toFixed(2)}`;
        
        const isPos = pl >= 0;
        plClass = isPos ? 'text-emerald-500' : 'text-rose-500';
        plDisplay = `${isPos ? '+' : ''}₹${Math.abs(pl).toFixed(2)} (${isPos ? '+' : ''}${Math.abs(plPct).toFixed(2)}%)`;
    } else {
        // If price is missing, we just don't add to current value to avoid breaking math, or we could use invested as current.
        // Let's assume current value = invested if unknown so total invested doesn't look like a huge loss.
        totalCurrentValue += invested; 
    }
    
    html += `<tr class="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
      <td class="py-4 pr-4">
        <p class="font-bold text-slate-900">${h.company_name}</p>
        <p class="text-xs font-semibold text-accent-purple">${h.symbol}</p>
      </td>
      <td class="py-4 px-4 font-semibold text-slate-700">${qty}</td>
      <td class="py-4 px-4 font-semibold text-slate-700">₹${avgPrice.toFixed(2)}</td>
      <td class="py-4 px-4 font-semibold text-slate-700">${currPriceDisplay}</td>
      <td class="py-4 px-4 font-semibold text-slate-700">₹${invested.toFixed(2)}</td>
      <td class="py-4 px-4 font-semibold text-slate-700">${currValueDisplay}</td>
      <td class="py-4 pl-4 text-right font-bold ${plClass}">${plDisplay}</td>
    </tr>`;
  });
  
  tbody.innerHTML = html;
  
  const totalPL = totalCurrentValue - totalInvested;
  
  document.getElementById('port-total-invested').textContent = `₹${totalInvested.toFixed(2)}`;
  document.getElementById('port-current-value').textContent = `₹${totalCurrentValue.toFixed(2)}`;
  
  const plEl = document.getElementById('port-total-pl');
  plEl.textContent = `${totalPL >= 0 ? '+' : ''}₹${Math.abs(totalPL).toFixed(2)}`;
  plEl.className = `text-2xl font-black ${totalPL >= 0 ? 'text-emerald-500' : 'text-rose-500'}`;
  
  const tcEl = document.getElementById('port-today-change');
  tcEl.textContent = `${todaysTotalChange >= 0 ? '+' : ''}₹${Math.abs(todaysTotalChange).toFixed(2)}`;
  tcEl.className = `text-2xl font-black ${todaysTotalChange >= 0 ? 'text-emerald-500' : 'text-rose-500'}`;
}

function setSearch(symbol) {
  document.getElementById('inv-search-input').value = symbol;
  analyzeStock();
}

async function analyzeStock() {
  const input = document.getElementById('inv-search-input');
  const symbol = input.value.trim().toUpperCase();
  
  if (!symbol) return;
  
  const loading = document.getElementById('inv-loading');
  const dashboard = document.getElementById('inv-dashboard');
  const errorEl = document.getElementById('inv-error');
  
  loading.classList.remove('hidden');
  dashboard.classList.add('hidden');
  errorEl.classList.add('hidden');
  
  try {
    const token = localStorage.getItem('token');
    // Assuming backend is on same host, but handling full path gracefully if needed. 
    // The main app uses relative paths for api like /api/auth
    const response = await fetch('/api/investments/analyze', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ symbol })
    });
    
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }
    
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    
    renderInvestmentDashboard(data);
    
  } catch (err) {
    console.error("Investment analysis failed:", err);
    errorEl.textContent = `Analysis failed: ${err.message}. Please try again later.`;
    errorEl.classList.remove('hidden');
  } finally {
    loading.classList.add('hidden');
    // Ensure display flex is applied properly to flex-col elements
    if (!loading.classList.contains('hidden')) {
      loading.style.display = 'flex';
    } else {
      loading.style.display = '';
    }
    if (!dashboard.classList.contains('hidden')) {
      dashboard.style.display = 'flex';
    } else {
      dashboard.style.display = '';
    }
  }
}

function renderInvestmentDashboard(data) {
  const dashboard = document.getElementById('inv-dashboard');
  dashboard.classList.remove('hidden');
  dashboard.style.display = 'flex';
  
  // Stock Header
  document.getElementById('inv-symbol').textContent = data.symbol;
  document.getElementById('inv-name').textContent = data.name;
  
  const priceEl = document.getElementById('inv-price');
  const changeEl = document.getElementById('inv-change');
  const changePctEl = document.getElementById('inv-change-pct');
  
  if (data.marketDataAvailable) {
    priceEl.classList.remove('text-lg', 'text-slate-500');
    priceEl.classList.add('text-5xl', 'text-slate-900');
    priceEl.textContent = `₹${data.price.toFixed(2)}`;
    
    const isPos = data.change >= 0;
    changeEl.textContent = `${isPos ? '+' : ''}₹${Math.abs(data.change).toFixed(2)}`;
    changePctEl.textContent = `${isPos ? '+' : ''}${Math.abs(data.changePct).toFixed(2)}%`;
    
    const colorClass = isPos ? 'text-emerald-500' : 'text-rose-500';
    const bgClass = isPos ? 'bg-emerald-50' : 'bg-rose-50';
    
    changeEl.className = `${colorClass} font-semibold`;
    changePctEl.className = `${colorClass} ${bgClass} px-2 py-1 rounded-lg font-semibold`;
  } else {
    priceEl.textContent = 'Market Data Unavailable';
    priceEl.classList.remove('text-5xl', 'text-slate-900');
    priceEl.classList.add('text-lg', 'text-slate-500');
    changeEl.textContent = '';
    changePctEl.textContent = '';
    changePctEl.className = '';
  }
  
  const analysis = data.analysis;
  
  // Recommendation
  const recBadge = document.getElementById('inv-rec-badge');
  recBadge.textContent = analysis.recommendation || 'HOLD';
  if (analysis.recommendation === 'BUY') {
    recBadge.className = 'inline-block px-4 py-2 rounded-xl text-xl font-black tracking-widest mb-4 bg-emerald-500 text-white shadow-md';
  } else if (analysis.recommendation === 'SELL') {
    recBadge.className = 'inline-block px-4 py-2 rounded-xl text-xl font-black tracking-widest mb-4 bg-rose-500 text-white shadow-md';
  } else {
    recBadge.className = 'inline-block px-4 py-2 rounded-xl text-xl font-black tracking-widest mb-4 bg-amber-500 text-white shadow-md';
  }
  
  document.getElementById('inv-rec-reason').textContent = analysis.recReason || 'Waiting for analysis...';
  document.getElementById('inv-risk').textContent = analysis.riskLevel || 'Medium';
  document.getElementById('inv-conf').textContent = `${analysis.confidence || '--'}%`;
  
  // AI Market Analysis
  document.getElementById('inv-summary').textContent = analysis.summary || '...';
  document.getElementById('inv-trend').textContent = analysis.trend || '...';
  
  const posList = document.getElementById('inv-positive');
  posList.innerHTML = (analysis.positive || []).map(s => `<li>${s}</li>`).join('');
  
  const negList = document.getElementById('inv-negative');
  negList.innerHTML = (analysis.negative || []).map(s => `<li>${s}</li>`).join('');
  
  const riskList = document.getElementById('inv-risks');
  riskList.innerHTML = (analysis.risks || []).map(s => `<li>${s}</li>`).join('');
  
  document.getElementById('inv-outlook').textContent = analysis.outlook || 'NEUTRAL';
  document.getElementById('inv-outlook-conf').textContent = `${analysis.confidence || '--'}%`;
  
  renderChart(data);
}

function renderChart(data) {
  const ctx = document.getElementById('investmentsChart');
  if (!ctx) return;
  
  if (investmentsChartInstance) {
    investmentsChartInstance.destroy();
    investmentsChartInstance = null;
  }
  
  if (data.historicalData && data.historicalData.length > 0) {
    const labels = data.historicalData.map(d => d.date);
    const dataPoints = data.historicalData.map(d => d.price);
    
    investmentsChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Price Action',
          data: dataPoints,
          borderColor: '#a855f7',
          backgroundColor: 'rgba(168, 85, 247, 0.1)',
          borderWidth: 2,
          tension: 0.4,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { display: false },
          y: { display: false }
        },
        interaction: {
          intersect: false,
          mode: 'index',
        },
      }
    });
  } else {
    // Show "Historical market data unavailable" inside the chart area
    const canvasCtx = ctx.getContext('2d');
    const w = ctx.parentElement.clientWidth || 300;
    const h = ctx.parentElement.clientHeight || 300;
    
    // Set internal resolution to match display size
    ctx.width = w;
    ctx.height = h;
    
    canvasCtx.clearRect(0, 0, w, h);
    canvasCtx.fillStyle = '#94a3b8'; // text-slate-400
    canvasCtx.font = '600 16px "Manrope", sans-serif';
    canvasCtx.textAlign = 'center';
    canvasCtx.textBaseline = 'middle';
    canvasCtx.fillText('Historical market data unavailable', w / 2, h / 2);
  }
}

// Load portfolio immediately when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('inv-search-input');
    if (searchInput) {
        searchInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                analyzeStock();
            }
        });
    }
    
    // Check if we are on the investments page initially
    const invSec = document.getElementById('sec-investments');
    if (invSec && invSec.classList.contains('active')) {
        loadPortfolio();
    }
    
    // Hook into navigate to load portfolio when switching to investments
    const originalNavigate = window.navigate;
    if (originalNavigate) {
        window.navigate = function(section) {
            originalNavigate(section);
            if (section === 'investments') {
                // Ensure portfolio tab is active and loaded
                switchInvTab('portfolio');
            }
        };
    }
});
