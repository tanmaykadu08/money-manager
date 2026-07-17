import re

with open('c:/Programing/MyPocket/frontend/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Sidebar Theme Fix
content = content.replace('bg-slate-50 dark:bg-slate-900 border-r border-outline-variant/10', 'bg-surface/80 backdrop-blur-xl border-r border-outline-variant/10 shadow-[var(--glass-shadow)]')

# 2. Month Selector Theme Fix
content = content.replace('class="month-selector w-full mb-4 text-slate-800 dark:text-slate-200"', 'class="month-selector w-full mb-4 text-on-surface"')
content = content.replace('class="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 mt-1 font-bold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-primary cursor-pointer transition-all"', 'class="w-full bg-transparent border border-outline-variant/30 rounded-lg p-2.5 mt-1 font-bold text-on-surface outline-none focus:ring-2 focus:ring-primary cursor-pointer transition-all"')

content = content.replace('class="month-selector md:hidden text-slate-800 dark:text-slate-200"', 'class="month-selector md:hidden text-on-surface"')
content = content.replace('class="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-1.5 font-bold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-primary transition-all"', 'class="bg-transparent border border-outline-variant/30 rounded-lg p-1.5 font-bold text-on-surface outline-none focus:ring-2 focus:ring-primary transition-all"')

# 3. Mobile Nav Theme Fix
content = content.replace('bg-slate-50 dark:bg-slate-900 border-t border-outline-variant/10 p-3', 'bg-surface/90 backdrop-blur-xl border-t border-outline-variant/10 p-3')

# 4. Replace Modal HTML completely with proper theme and buttons
old_modal_match = re.search(r'<!-- Transaction Modal -->.*?</div>\s*</div>\s*</div>', content, re.DOTALL)

new_modal = '''<!-- Transaction Modal -->
  <div id="transactionModal" class="fixed inset-0 z-[100] flex items-center justify-center hidden opacity-0 transition-opacity duration-300">
    <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onclick="closeModal()"></div>
    <div class="form-card z-10 w-[90%] max-w-xl transform scale-95 transition-transform duration-300 !m-0 p-6 md:p-8 flex flex-col" id="modalContent">
      <div class="flex justify-between items-center mb-6 border-b border-outline-variant/10 pb-4">
        <h3 class="text-2xl font-headline font-bold text-on-surface" id="modalTitle">Add Transaction</h3>
        <button class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 p-2 rounded-full transition-colors" onclick="closeModal()">
          <span class="material-symbols-outlined text-sm">close</span>
        </button>
      </div>

      <div id="modal-income-form" class="hidden">
        <div class="form-row three">
          <div class="form-group"><label>Source / label</label><input id="inc-label" placeholder="e.g. Salary, Freelance" /></div>
          <div class="form-group"><label>Amount (₹)</label><input id="inc-amount" type="number" placeholder="0" /></div>
          <div class="form-group"><label>Date received</label><input id="inc-date" type="date" /></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label>Notes (optional)</label><input id="inc-notes" placeholder="Optional note" /></div>
          <div class="form-group" style="justify-content:flex-end;flex-direction:row;align-items:flex-end">
            <button class="btn btn-primary w-full" id="inc-btn" onclick="addIncome()">+ Add income</button>
          </div>
        </div>
      </div>
      
      <div id="modal-expense-form" class="hidden">
        <div class="form-row three">
          <div class="form-group"><label>Description</label><input id="exp-desc" placeholder="e.g. Grocery, Zomato" /></div>
          <div class="form-group"><label>Amount (₹)</label><input id="exp-amount" type="number" placeholder="0" /></div>
          <div class="form-group"><label>Date</label><input id="exp-date" type="date" /></div>
        </div>
        <div class="form-row three">
          <div class="form-group"><label>Category</label>
            <select id="exp-cat">
              <option value="auto" selected>✨ Auto Classify</option>
              <option value="food">🍔 Food</option>
              <option value="transport">🚗 Transport</option>
              <option value="bills">⚡ Bills</option>
              <option value="shopping">🛍️ Shopping</option>
              <option value="health">💊 Health</option>
              <option value="other">📦 Other</option>
            </select>
          </div>
          <div class="form-group"><label>Payment type</label>
            <select id="exp-pay">
              <option>UPI</option>
              <option>Cash</option>
              <option>Card</option>
              <option>Net Banking</option>
            </select>
          </div>
          <div class="form-group" style="justify-content:flex-end;flex-direction:row;align-items:flex-end">
            <button class="btn btn-primary w-full" id="exp-btn" onclick="addExpense()">+ Add expense</button>
          </div>
        </div>
      </div>
    </div>
  </div>'''

if old_modal_match:
    content = content.replace(old_modal_match.group(0), new_modal)

with open('c:/Programing/MyPocket/frontend/index.html', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done!')
