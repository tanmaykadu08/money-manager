import re

with open('c:/Programing/MyPocket/frontend/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

replacement = '''      <!-- INCOME -->
      <div class="section" id="sec-income">
        <div class="page-header">
          <h1>Income</h1>
          <p>Record your monthly earnings</p>
        </div>
        <div class="flex justify-between items-center mb-6">
          <p class="text-sm text-slate-500">Your logged income sources</p>
          <button class="btn btn-primary shadow-lg hover:scale-105 active:scale-95 transition-all" onclick="openModal('income')">+ Add Income</button>
        </div>
        <div class="table-card">
          <div class="table-header">
            <h3>Income this month</h3><span id="inc-total-label" style="color:var(--accent-green);font-weight:700;font-size:16px"></span>
          </div>
          <div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Source</th>
                  <th>Notes</th>
                  <th style="text-align:right">Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody id="income-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- EXPENSES -->
      <div class="section" id="sec-expenses">
        <div class="page-header">
          <h1>Expenses</h1>
          <p>Track every rupee spent securely</p>
        </div>
        <div class="flex justify-between items-center mb-6">
          <p class="text-sm text-slate-500">Your logged expenses</p>
          <button class="btn btn-primary shadow-lg bg-red-500 hover:bg-red-600 hover:scale-105 active:scale-95 transition-all" onclick="openModal('expense')">+ Add Expense</button>
        </div>
        <div class="table-card">
          <div class="table-header">
            <h3>Expenses this month</h3><span id="exp-total-label" style="color:var(--accent-red);font-weight:700;font-size:16px"></span>
          </div>
          <div class="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Payment</th>
                  <th style="text-align:right">Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody id="exp-tbody"></tbody>
            </table>
          </div>
        </div>
      </div>'''

content = re.sub(r'<!-- INCOME -->.*?<!-- AUTO PAYMENTS -->', replacement + '\n\n      <!-- AUTO PAYMENTS -->', content, flags=re.DOTALL)

with open('c:/Programing/MyPocket/frontend/index.html', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done!')
