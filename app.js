/* ═══════════════════════════════════════════════
   THE LEDGER — App Logic
   Vanilla JS + Supabase
═══════════════════════════════════════════════ */

'use strict';

// ── Supabase ──────────────────────────────────────
const SUPABASE_URL     = 'https://znioqfzjrwkkptsaigik.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_i1z-glN_TSW7_pDtIQ9vbw_zS6GvE7j';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Category config ──────────────────────────────
const CATEGORIES = {
  Food:      { emoji: '🍽️', bg: '#fff7ed', color: '#f97316' },
  Transport: { emoji: '🚗', bg: '#eff6ff', color: '#3b82f6' },
  Shopping:  { emoji: '🛍️', bg: '#fdf4ff', color: '#a855f7' },
  Bills:     { emoji: '⚡',  bg: '#fefce8', color: '#eab308' },
  Others:    { emoji: '📦', bg: '#f0fdf4', color: '#22c55e' },
  'Cash-in': { emoji: '💰', bg: '#d1fae5', color: '#059669' },
};

const WALLET_ICONS  = ['📱', '💵', '🏦', '💳', '👛', '🏧', '💎', '🪙'];
const WALLET_COLORS = [
  '#7C3AED', '#3b82f6', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#06b6d4', '#8b5cf6',
];

// ── State ────────────────────────────────────────
let currentUser = null;
let state = {
  wallets: [],
  transactions: [],
  currentPage: 'home',
  addForm: { type: 'expense', walletId: null, category: 'Food' },
  historyFilter: 'all',
  reportPeriod: 'week',
};

// ── DB row mappers ────────────────────────────────
function walletFromDb(row) {
  return { ...row, balance: Number(row.balance) };
}
function walletToDb(w) {
  return { id: w.id, user_id: currentUser.id, name: w.name, icon: w.icon, color: w.color, balance: w.balance };
}
function txFromDb(row) {
  return { ...row, walletId: row.wallet_id, amount: Number(row.amount) };
}
function txToDb(tx) {
  return { id: tx.id, user_id: currentUser.id, wallet_id: tx.walletId, type: tx.type, amount: tx.amount, category: tx.category, date: tx.date, note: tx.note };
}

// ── Data loading ──────────────────────────────────
async function loadData() {
  const [{ data: wallets, error: we }, { data: txRows, error: te }] = await Promise.all([
    db.from('wallets').select('*').order('created_at', { ascending: true }),
    db.from('transactions').select('*').order('date', { ascending: false }),
  ]);
  if (we || te) { toast('Failed to load data', 'error'); return; }
  state.wallets      = (wallets || []).map(walletFromDb);
  state.transactions = (txRows  || []).map(txFromDb);
}

// ── Utilities ────────────────────────────────────
function uid() { return '_' + Math.random().toString(36).slice(2, 10); }

function fmt(n) {
  return '₱' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtShort(n) {
  if (n >= 1000000) return '₱' + (n/1000000).toFixed(1) + 'M';
  if (n >= 1000)    return '₱' + (n/1000).toFixed(1) + 'k';
  return fmt(n);
}

function walletById(id) { return state.wallets.find(w => w.id === id); }

function txLabel(tx) {
  return tx.note || (tx.type === 'cashin' ? 'Cash In' : tx.category);
}

function formatTime(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(isoStr) {
  const d = new Date(isoStr);
  const today     = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate()-1);
  const txDay     = new Date(d); txDay.setHours(0,0,0,0);

  if (txDay.getTime() === today.getTime())     return 'TODAY';
  if (txDay.getTime() === yesterday.getTime()) return 'YESTERDAY';
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
}

function formatDateShort(isoStr) {
  return new Date(isoStr).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }).toUpperCase();
}

function startOf(period) {
  const d = new Date(); d.setHours(0,0,0,0);
  if (period === 'day')   return d;
  if (period === 'week')  { d.setDate(d.getDate() - d.getDay()); return d; }
  if (period === 'month') { d.setDate(1); return d; }
}
function startOfPrev(period) {
  const d = new Date(); d.setHours(0,0,0,0);
  if (period === 'day')   { d.setDate(d.getDate()-1); return d; }
  if (period === 'week')  { d.setDate(d.getDate() - d.getDay() - 7); return d; }
  if (period === 'month') { d.setDate(1); d.setMonth(d.getMonth()-1); return d; }
}
function endOfPrev(period) {
  return new Date(startOf(period).getTime() - 1);
}

function totalSpent(txs) {
  return txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
}

function pctChange(cur, prev) {
  if (prev === 0) return cur === 0 ? 0 : 100;
  return ((cur - prev) / prev) * 100;
}

function catIcon(cat)  { return (CATEGORIES[cat] || CATEGORIES['Others']).emoji; }
function catBg(cat)    { return (CATEGORIES[cat] || CATEGORIES['Others']).bg; }
function catColor(cat) { return (CATEGORIES[cat] || CATEGORIES['Others']).color; }

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Toast ─────────────────────────────────────────
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast' + (type ? ' ' + type : '');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.className = 'toast hidden'; }, 2200);
}

// ── Auth UI ───────────────────────────────────────
let _authMode = 'login';

function showAuthPage() {
  document.getElementById('page-auth').classList.remove('hidden');
  document.getElementById('app-shell').classList.add('hidden');
}

function showAppShell() {
  document.getElementById('page-auth').classList.add('hidden');
  document.getElementById('app-shell').classList.remove('hidden');
}

function switchAuthTab(mode) {
  _authMode = mode;
  document.getElementById('auth-tab-login').classList.toggle('active', mode === 'login');
  document.getElementById('auth-tab-signup').classList.toggle('active', mode === 'signup');
  document.getElementById('auth-submit-btn').textContent = mode === 'login' ? 'Sign In' : 'Create Account';
  document.getElementById('auth-error').classList.add('hidden');
}

async function handleAuth(e) {
  e.preventDefault();
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const btn      = document.getElementById('auth-submit-btn');
  const errEl    = document.getElementById('auth-error');

  btn.disabled    = true;
  btn.textContent = 'Please wait…';
  errEl.classList.add('hidden');

  const { error } = _authMode === 'login'
    ? await db.auth.signInWithPassword({ email, password })
    : await db.auth.signUp({ email, password });

  if (error) {
    errEl.textContent = error.message;
    errEl.classList.remove('hidden');
    btn.disabled    = false;
    btn.textContent = _authMode === 'login' ? 'Sign In' : 'Create Account';
  }
  // success is handled by onAuthStateChange
}

async function signOut() {
  await db.auth.signOut();
  // onAuthStateChange cleans up state and shows auth page
}

// ── Navigate ─────────────────────────────────────
function navigate(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');

  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  const navBtn = document.getElementById('nav-' + page);
  if (navBtn) navBtn.classList.add('active');

  document.getElementById('nav-add').classList.toggle('active-page', page === 'add');

  state.currentPage = page;

  if (page === 'home')    renderHome();
  if (page === 'history') renderHistory();
  if (page === 'reports') renderReports();
  if (page === 'add')     initAddForm();
}

// ══════════════════════════════════════════════════
// HOME
// ══════════════════════════════════════════════════
function renderHome() {
  const total = state.wallets.reduce((s, w) => s + w.balance, 0);
  document.getElementById('home-total-balance').textContent = fmt(total);

  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const ystStart   = new Date(todayStart); ystStart.setDate(ystStart.getDate()-1);
  const todayTxs   = state.transactions.filter(t => t.type === 'expense' && new Date(t.date) >= todayStart);
  const ystTxs     = state.transactions.filter(t => t.type === 'expense' && new Date(t.date) >= ystStart && new Date(t.date) < todayStart);
  const spentToday = totalSpent(todayTxs);
  const spentYst   = totalSpent(ystTxs);
  document.getElementById('home-spent-today').textContent = fmt(spentToday);

  const badge = document.getElementById('home-spent-badge');
  const pct   = pctChange(spentToday, spentYst);
  badge.textContent = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '%';
  badge.className   = 'balance-badge' + (pct < 0 ? ' negative' : '');

  const wc = document.getElementById('home-wallets');
  wc.innerHTML = state.wallets.map(w => `
    <div class="wallet-card" onclick="App.openWalletManager()">
      <div class="wallet-card-top">
        <div class="wallet-icon" style="background:${w.color}22">${w.icon}</div>
        <button class="wallet-card-menu" onclick="event.stopPropagation();App.openWalletEdit('${w.id}')">⋯</button>
      </div>
      <div class="wallet-card-name">${w.name}</div>
      <div class="wallet-card-balance">${fmt(w.balance)}</div>
    </div>
  `).join('') + `
    <div class="add-wallet-card" onclick="App.openWalletAdd()">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
      <span>Add</span>
    </div>
  `;

  const recent = [...state.transactions]
    .sort((a,b) => new Date(b.date) - new Date(a.date))
    .slice(0, 8);
  const rc = document.getElementById('home-recent');
  if (recent.length === 0) {
    rc.innerHTML = `<div class="tx-empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" display="block" margin="0 auto 8px">
        <path d="M9 17H5a2 2 0 0 0-2 2v0a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v0a2 2 0 0 0-2-2h-4"/>
        <rect x="9" y="3" width="6" height="14" rx="1"/>
      </svg>
      <p>No transactions yet</p>
    </div>`;
    return;
  }
  rc.innerHTML = recent.map(tx => {
    const w   = walletById(tx.walletId);
    const cat = tx.type === 'cashin' ? 'Cash-in' : tx.category;
    return `
      <div class="tx-item" onclick="App.openTxDetail('${tx.id}')">
        <div class="tx-icon" style="background:${catBg(cat)}">${catIcon(cat)}</div>
        <div class="tx-info">
          <div class="tx-name">${escHtml(txLabel(tx))}</div>
          <div class="tx-meta">${w ? w.name : '—'} · ${formatDate(tx.date) === 'TODAY' ? 'Today' : formatDate(tx.date)}</div>
        </div>
        <div>
          <div class="tx-amount ${tx.type}">${tx.type === 'expense' ? '-' : '+'}${fmt(tx.amount)}</div>
          <div class="tx-time">${formatTime(tx.date)}</div>
        </div>
      </div>
    `;
  }).join('');
}

// ══════════════════════════════════════════════════
// ADD FORM
// ══════════════════════════════════════════════════
function initAddForm() {
  const f = state.addForm;

  document.getElementById('tab-expense').classList.toggle('active', f.type === 'expense');
  document.getElementById('tab-cashin').classList.toggle('active', f.type === 'cashin');
  document.getElementById('fg-category').style.display = f.type === 'cashin' ? 'none' : '';
  document.getElementById('add-amount-label').textContent = f.type === 'cashin' ? 'Amount Received' : 'Amount Spent';
  document.getElementById('add-page-title').textContent   = f.type === 'cashin' ? 'Cash In' : 'Add Expense';
  document.getElementById('save-btn-label').textContent   = f.type === 'cashin' ? 'Save Cash In' : 'Save Expense';

  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById('add-date').value = now.toISOString().slice(0, 16);

  document.getElementById('add-amount').value = '';
  document.getElementById('add-note').value   = '';

  const wc = document.getElementById('add-wallet-chips');
  if (state.wallets.length === 0) {
    wc.innerHTML = '<span style="font-size:13px;color:var(--text-muted)">No wallets yet — add one first</span>';
  } else {
    if (!f.walletId || !walletById(f.walletId)) f.walletId = state.wallets[0].id;
    wc.innerHTML = state.wallets.map(w => `
      <button class="wallet-chip ${f.walletId === w.id ? 'active' : ''}"
              onclick="App.selectWallet('${w.id}')">
        <span class="chip-icon">${w.icon}</span>
        <span>${escHtml(w.name)}</span>
      </button>
    `).join('');
  }

  document.querySelectorAll('.cat-chip').forEach(b => {
    b.classList.toggle('active', b.dataset.cat === f.category);
  });
}

function setAddType(type) {
  state.addForm.type = type;
  initAddForm();
}

function selectWallet(id) {
  state.addForm.walletId = id;
  document.querySelectorAll('.wallet-chip').forEach(b => {
    const btnId = b.getAttribute('onclick').match(/'([^']+)'/)[1];
    b.classList.toggle('active', btnId === id);
  });
}

function selectCategory(btn) {
  state.addForm.category = btn.dataset.cat;
  document.querySelectorAll('.cat-chip').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

async function saveTransaction() {
  const amountRaw = parseFloat(document.getElementById('add-amount').value);
  const dateVal   = document.getElementById('add-date').value;
  const note      = document.getElementById('add-note').value.trim();
  const { type, walletId, category } = state.addForm;

  if (!amountRaw || amountRaw <= 0) { toast('Enter a valid amount', 'error'); return; }
  if (!walletId)                    { toast('Select a wallet', 'error'); return; }
  if (!dateVal)                     { toast('Set a date', 'error'); return; }

  const wallet = walletById(walletId);
  if (!wallet) { toast('Wallet not found', 'error'); return; }
  if (type === 'expense' && wallet.balance < amountRaw) {
    toast('Insufficient balance in ' + wallet.name, 'error'); return;
  }

  const tx = {
    id: uid(), type, amount: amountRaw, walletId,
    category: type === 'cashin' ? 'Cash-in' : category,
    date: new Date(dateVal).toISOString(), note,
  };
  const newBalance = wallet.balance + (type === 'cashin' ? amountRaw : -amountRaw);

  const btn = document.getElementById('save-btn');
  btn.disabled = true;

  const [{ error: te }, { error: we }] = await Promise.all([
    db.from('transactions').insert(txToDb(tx)),
    db.from('wallets').update({ balance: newBalance }).eq('id', walletId),
  ]);

  btn.disabled = false;

  if (te || we) { toast('Failed to save', 'error'); return; }

  state.transactions.unshift(tx);
  wallet.balance = newBalance;

  toast(type === 'cashin' ? '✓ Cash in recorded' : '✓ Expense saved', 'success');
  navigate('home');
}

// ══════════════════════════════════════════════════
// HISTORY
// ══════════════════════════════════════════════════
function setHistoryFilter(btn) {
  document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.historyFilter = btn.dataset.filter;
  renderHistory();
}

function renderHistory() {
  const query  = (document.getElementById('history-search')?.value || '').toLowerCase().trim();
  const filter = state.historyFilter;
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);

  let txs = [...state.transactions].sort((a,b) => new Date(b.date) - new Date(a.date));

  if (filter === 'expense')   txs = txs.filter(t => t.type === 'expense');
  if (filter === 'cashin')    txs = txs.filter(t => t.type === 'cashin');
  if (filter === 'this-week') txs = txs.filter(t => new Date(t.date) >= weekAgo);
  if (['Food','Transport','Shopping','Bills','Others'].includes(filter)) {
    txs = txs.filter(t => t.category === filter);
  }

  if (query) {
    txs = txs.filter(t =>
      txLabel(t).toLowerCase().includes(query) ||
      (t.category || '').toLowerCase().includes(query) ||
      (t.note || '').toLowerCase().includes(query)
    );
  }

  const list = document.getElementById('history-list');
  if (txs.length === 0) {
    list.innerHTML = `<div class="history-empty">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" display="block" margin="0 auto">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <p>No transactions found</p>
      <small>Try adjusting your search or filter</small>
    </div>`;
    return;
  }

  const groups = {};
  txs.forEach(tx => {
    const key = formatDate(tx.date);
    if (!groups[key]) groups[key] = [];
    groups[key].push(tx);
  });

  list.innerHTML = Object.entries(groups).map(([date, items]) => `
    <div class="history-group">
      <div class="history-group-header">
        <span class="history-group-date">${date}</span>
        <span class="history-group-date-right">${formatDateShort(items[0].date)}</span>
      </div>
      ${items.map(tx => {
        const w   = walletById(tx.walletId);
        const cat = tx.type === 'cashin' ? 'Cash-in' : tx.category;
        return `
          <div class="htx-item" onclick="App.openTxDetail('${tx.id}')">
            <div class="htx-icon" style="background:${catBg(cat)}">${catIcon(cat)}</div>
            <div class="htx-info">
              <div class="htx-name">${escHtml(txLabel(tx))}</div>
              <div class="htx-meta">${w ? w.name : '—'} · ${tx.category}</div>
            </div>
            <div class="htx-right">
              <div class="htx-amount ${tx.type}">${tx.type === 'expense' ? '-' : '+'}${fmt(tx.amount)}</div>
              <div class="htx-time">${formatTime(tx.date)}</div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `).join('');
}

// ══════════════════════════════════════════════════
// REPORTS
// ══════════════════════════════════════════════════
function setReportPeriod(p) {
  state.reportPeriod = p;
  ['day','week','month'].forEach(x => {
    document.getElementById('ptab-' + x).classList.toggle('active', x === p);
  });
  renderReports();
}

function renderReports() {
  const p      = state.reportPeriod;
  const start  = startOf(p);
  const pStart = startOfPrev(p);
  const pEnd   = endOfPrev(p);

  const curTxs  = state.transactions.filter(t => new Date(t.date) >= start);
  const prevTxs = state.transactions.filter(t => new Date(t.date) >= pStart && new Date(t.date) <= pEnd);

  const curSpent  = totalSpent(curTxs);
  const prevSpent = totalSpent(prevTxs);
  const pct       = pctChange(curSpent, prevSpent);

  const labels     = { day: 'TODAY', week: 'THIS WEEK', month: 'THIS MONTH' };
  const prevLabels = { day: 'vs yesterday', week: 'vs last week', month: 'vs last month' };

  document.getElementById('report-period-label').textContent = 'TOTAL SPENT ' + labels[p];
  document.getElementById('report-total').textContent = fmtShort(curSpent);

  const changeEl = document.getElementById('report-change');
  changeEl.textContent = (pct >= 0 ? '+' : '') + pct.toFixed(1) + '% ' + prevLabels[p];
  changeEl.className   = 'report-change ' + (curSpent === 0 && prevSpent === 0 ? 'neutral' : pct < 0 ? 'positive' : 'negative');

  renderMiniChart(p);

  const expenseTxs = curTxs.filter(t => t.type === 'expense');
  const catMap = {};
  expenseTxs.forEach(t => {
    catMap[t.category] = catMap[t.category] || { total: 0, count: 0 };
    catMap[t.category].total += t.amount;
    catMap[t.category].count++;
  });

  const sorted = Object.entries(catMap).sort((a,b) => b[1].total - a[1].total);
  const maxAmt = sorted[0]?.[1].total || 1;

  const bd = document.getElementById('report-breakdown');
  if (sorted.length === 0) {
    bd.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:14px">No expenses this ${p}</div>`;
  } else {
    bd.innerHTML = sorted.map(([cat, data]) => {
      const pctOfTotal = curSpent > 0 ? Math.round((data.total / curSpent) * 100) : 0;
      const barPct     = Math.round((data.total / maxAmt) * 100);
      return `
        <div class="breakdown-item">
          <div class="breakdown-top">
            <div class="breakdown-icon" style="background:${catBg(cat)}">${catIcon(cat)}</div>
            <div class="breakdown-info">
              <div class="breakdown-name">${cat}</div>
              <div class="breakdown-count">${data.count} TRANSACTION${data.count !== 1 ? 'S' : ''}</div>
            </div>
            <div>
              <div class="breakdown-amount">${fmt(data.total)}</div>
              <div class="breakdown-pct" style="text-align:right">${pctOfTotal}%</div>
            </div>
          </div>
          <div class="breakdown-bar-bg">
            <div class="breakdown-bar-fill" style="width:${barPct}%;background:${catColor(cat)}"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  renderInsights(p, expenseTxs, curSpent, prevSpent, sorted);
}

function renderMiniChart(period) {
  const chart = document.getElementById('mini-chart');
  const bars  = [];
  const now   = new Date();

  if (period === 'day') {
    for (let i = 6; i >= 0; i--) {
      const slotEnd   = new Date(now); slotEnd.setMinutes(0,0,0);
      const slotStart = new Date(slotEnd);
      slotStart.setHours(slotEnd.getHours() - i * 3 - 3);
      slotEnd.setHours(slotEnd.getHours() - i * 3);
      const txs = state.transactions.filter(t =>
        t.type === 'expense' && new Date(t.date) >= slotStart && new Date(t.date) < slotEnd
      );
      bars.push({ label: slotEnd.getHours() + 'h', total: totalSpent(txs), active: i === 0 });
    }
  } else if (period === 'week') {
    const DAY_NAMES = ['Su','Mo','Tu','We','Th','Fr','Sa'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - i);
      const dEnd = new Date(d); dEnd.setDate(d.getDate()+1);
      const txs = state.transactions.filter(t =>
        t.type === 'expense' && new Date(t.date) >= d && new Date(t.date) < dEnd
      );
      bars.push({ label: DAY_NAMES[d.getDay()], total: totalSpent(txs), active: i === 0 });
    }
  } else {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - i * 7 - 6);
      const dEnd = new Date(d); dEnd.setDate(d.getDate()+7);
      const txs = state.transactions.filter(t =>
        t.type === 'expense' && new Date(t.date) >= d && new Date(t.date) < dEnd
      );
      bars.push({ label: 'W' + (7-i), total: totalSpent(txs), active: i === 0 });
    }
  }

  const maxVal = Math.max(...bars.map(b => b.total), 1);
  chart.innerHTML = bars.map(b => {
    const h = Math.max(Math.round((b.total / maxVal) * 48), b.total > 0 ? 6 : 3);
    return `
      <div class="mini-bar-wrap">
        <div class="mini-bar ${b.active ? 'active' : 'inactive'}" style="height:${h}px"></div>
        <span class="mini-bar-lbl">${b.label}</span>
      </div>
    `;
  }).join('');
}

function renderInsights(period, expTxs, curSpent, prevSpent, sorted) {
  const el = document.getElementById('report-insights');

  if (expTxs.length === 0) {
    el.innerHTML = `<div style="padding:16px 20px;font-size:14px;color:var(--text-muted)">No expenses recorded this ${period}.</div>`;
    return;
  }

  const insights = [];

  const biggest = expTxs.reduce((a, b) => a.amount > b.amount ? a : b, expTxs[0]);
  if (biggest) {
    insights.push({ color: '#ef4444', text: `Biggest expense: <strong>${escHtml(txLabel(biggest))}</strong> at <strong>${fmt(biggest.amount)}</strong>` });
  }

  if (sorted[0]) {
    const [cat, data] = sorted[0];
    const pct = curSpent > 0 ? Math.round((data.total / curSpent) * 100) : 0;
    insights.push({ color: catColor(cat), text: `<strong>${cat}</strong> is your top spending category at <strong>${pct}%</strong> of total` });
  }

  if (prevSpent > 0) {
    const pct = Math.abs(pctChange(curSpent, prevSpent)).toFixed(1);
    const up  = curSpent > prevSpent;
    insights.push({
      color: up ? '#ef4444' : '#10b981',
      text: up
        ? `Spending is up <strong>${pct}%</strong> vs the previous ${period}`
        : `Great! Spending is down <strong>${pct}%</strong> vs the previous ${period}`
    });
  }

  insights.push({ color: '#6366f1', text: `You made <strong>${expTxs.length}</strong> expense transaction${expTxs.length !== 1 ? 's' : ''} this ${period}` });

  el.innerHTML = insights.map(i => `
    <div class="insight-card">
      <div class="insight-dot" style="background:${i.color}"></div>
      <div class="insight-text">${i.text}</div>
    </div>
  `).join('');
}

// ══════════════════════════════════════════════════
// WALLET MANAGER MODAL
// ══════════════════════════════════════════════════
let _walletEditId   = null;
let _walletIconSel  = WALLET_ICONS[0];
let _walletColorSel = WALLET_COLORS[0];

function openModal()  { document.getElementById('modal-overlay').classList.remove('hidden'); }
function closeModal(e) {
  if (!e || e.target === document.getElementById('modal-overlay')) {
    document.getElementById('modal-overlay').classList.add('hidden');
  }
}

function openWalletManager() {
  _walletEditId = null;
  const html = `
    <h3 class="modal-title">My Wallets</h3>
    ${state.wallets.length === 0
      ? `<p style="color:var(--text-muted);font-size:14px;margin-bottom:16px">No wallets yet. Add one to get started!</p>`
      : state.wallets.map(w => `
        <div class="wallet-list-item">
          <div class="wallet-list-icon" style="background:${w.color}22">${w.icon}</div>
          <div class="wallet-list-info">
            <div class="wallet-list-name">${escHtml(w.name)}</div>
            <div class="wallet-list-balance">${fmt(w.balance)}</div>
          </div>
          <div class="wallet-list-actions">
            <button class="wallet-action-btn btn-edit"   onclick="App.openWalletEdit('${w.id}')">Edit</button>
            <button class="wallet-action-btn btn-delete" onclick="App.deleteWallet('${w.id}')">Delete</button>
          </div>
        </div>
      `).join('')}
    <button class="btn-primary" style="margin-top:12px;padding:13px;border-radius:12px;width:100%" onclick="App.openWalletAdd()">+ Add New Wallet</button>
    <button class="btn-signout" onclick="App.signOut()">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
        <polyline points="16 17 21 12 16 7"/>
        <line x1="21" y1="12" x2="9" y2="12"/>
      </svg>
      Sign Out
    </button>
  `;
  document.getElementById('modal-content').innerHTML = html;
  openModal();
}

function openWalletAdd() {
  _walletEditId   = null;
  _walletIconSel  = WALLET_ICONS[0];
  _walletColorSel = WALLET_COLORS[0];
  renderWalletForm(null);
}

function openWalletEdit(id) {
  const w = walletById(id);
  if (!w) return;
  _walletEditId   = id;
  _walletIconSel  = w.icon;
  _walletColorSel = w.color;
  renderWalletForm(w);
}

function renderWalletForm(wallet) {
  const isEdit = !!wallet;
  const html = `
    <h3 class="modal-title">${isEdit ? 'Edit Wallet' : 'Add Wallet'}</h3>
    <div class="modal-field">
      <label>Wallet Name</label>
      <input id="wf-name" class="modal-input" type="text" placeholder="e.g. GCash" value="${isEdit ? escHtml(wallet.name) : ''}">
    </div>
    <div class="modal-field">
      <label>Balance ${isEdit ? '(current)' : '(initial)'}</label>
      <input id="wf-balance" class="modal-input" type="number" placeholder="0.00" min="0" step="0.01" value="${isEdit ? wallet.balance : ''}">
    </div>
    <div class="modal-field">
      <label>Icon</label>
      <div class="icon-picker" id="wf-icons">
        ${WALLET_ICONS.map(ic => `
          <div class="icon-option ${ic === _walletIconSel ? 'active' : ''}"
               onclick="App.pickWalletIcon('${ic}', this)">${ic}</div>
        `).join('')}
      </div>
    </div>
    <div class="modal-field">
      <label>Color</label>
      <div class="color-picker" id="wf-colors">
        ${WALLET_COLORS.map(c => `
          <div class="color-option ${c === _walletColorSel ? 'active' : ''}"
               style="background:${c}"
               onclick="App.pickWalletColor('${c}', this)"></div>
        `).join('')}
      </div>
    </div>
    <div class="modal-btn-row">
      <button class="btn-primary" onclick="App.saveWallet()">${isEdit ? 'Save Changes' : 'Add Wallet'}</button>
      <button class="btn-ghost"   onclick="App.openWalletManager()">Back</button>
    </div>
  `;
  document.getElementById('modal-content').innerHTML = html;
  openModal();
}

function pickWalletIcon(ic, el) {
  _walletIconSel = ic;
  document.querySelectorAll('#wf-icons .icon-option').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
}
function pickWalletColor(c, el) {
  _walletColorSel = c;
  document.querySelectorAll('#wf-colors .color-option').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
}

async function saveWallet() {
  const name    = document.getElementById('wf-name')?.value.trim();
  const balance = parseFloat(document.getElementById('wf-balance')?.value || '0');
  if (!name) { toast('Enter a wallet name', 'error'); return; }

  if (_walletEditId) {
    const w = walletById(_walletEditId);
    if (!w) return;
    const updated = { ...w, name, icon: _walletIconSel, color: _walletColorSel, balance: isNaN(balance) ? w.balance : balance };
    const { error } = await db.from('wallets').update(walletToDb(updated)).eq('id', _walletEditId);
    if (error) { toast('Failed to save', 'error'); return; }
    Object.assign(w, updated);
    toast('Wallet updated', 'success');
  } else {
    const w = { id: uid(), name, icon: _walletIconSel, color: _walletColorSel, balance: isNaN(balance) ? 0 : balance };
    const { error } = await db.from('wallets').insert(walletToDb(w));
    if (error) { toast('Failed to save', 'error'); return; }
    state.wallets.push(w);
    toast('Wallet added', 'success');
  }

  closeModal();
  renderHome();
}

async function deleteWallet(id) {
  const w = walletById(id);
  if (!w) return;
  if (!confirm(`Delete "${w.name}"? All transactions linked to it will also be removed.`)) return;

  const { error } = await db.from('wallets').delete().eq('id', id);
  if (error) { toast('Failed to delete', 'error'); return; }

  state.wallets      = state.wallets.filter(x => x.id !== id);
  state.transactions = state.transactions.filter(t => t.walletId !== id);
  toast('Wallet deleted');
  openWalletManager();
  renderHome();
}

// ══════════════════════════════════════════════════
// TRANSACTION DETAIL MODAL
// ══════════════════════════════════════════════════
function openTxDetail(id) {
  const tx = state.transactions.find(t => t.id === id);
  if (!tx) return;
  const w   = walletById(tx.walletId);
  const cat = tx.type === 'cashin' ? 'Cash-in' : tx.category;
  const html = `
    <div style="text-align:center;margin-bottom:20px">
      <div style="width:60px;height:60px;border-radius:18px;background:${catBg(cat)};display:flex;align-items:center;justify-content:center;font-size:28px;margin:0 auto 12px">${catIcon(cat)}</div>
      <div style="font-size:28px;font-weight:800;color:${tx.type === 'cashin' ? 'var(--green)' : 'var(--red)'};letter-spacing:-0.02em">
        ${tx.type === 'expense' ? '-' : '+'}${fmt(tx.amount)}
      </div>
      <div style="font-size:15px;font-weight:600;color:var(--text-mid);margin-top:4px">${escHtml(txLabel(tx))}</div>
    </div>
    <div class="tx-detail-row"><span class="tx-detail-label">Type</span><span class="tx-detail-value">${tx.type === 'cashin' ? 'Cash In' : 'Expense'}</span></div>
    <div class="tx-detail-row"><span class="tx-detail-label">Category</span><span class="tx-detail-value">${cat}</span></div>
    <div class="tx-detail-row"><span class="tx-detail-label">Wallet</span><span class="tx-detail-value">${w ? w.icon + ' ' + w.name : '—'}</span></div>
    <div class="tx-detail-row"><span class="tx-detail-label">Date</span><span class="tx-detail-value">${new Date(tx.date).toLocaleDateString('en-PH', {year:'numeric',month:'long',day:'numeric'})}</span></div>
    <div class="tx-detail-row"><span class="tx-detail-label">Time</span><span class="tx-detail-value">${formatTime(tx.date)}</span></div>
    ${tx.note ? `<div class="tx-detail-row"><span class="tx-detail-label">Note</span><span class="tx-detail-value">${escHtml(tx.note)}</span></div>` : ''}
    <div class="modal-btn-row" style="margin-top:24px">
      <button class="btn-ghost" style="flex:1;color:var(--red);background:var(--red-pale)" onclick="App.deleteTx('${id}')">Delete</button>
      <button class="btn-ghost" style="flex:1" onclick="App.closeModal(null)">Close</button>
    </div>
  `;
  document.getElementById('modal-content').innerHTML = html;
  openModal();
}

async function deleteTx(id) {
  const tx = state.transactions.find(t => t.id === id);
  if (!tx) return;
  if (!confirm('Delete this transaction?')) return;

  const wallet     = walletById(tx.walletId);
  const newBalance = wallet ? wallet.balance + (tx.type === 'cashin' ? -tx.amount : tx.amount) : null;

  const ops = [db.from('transactions').delete().eq('id', id)];
  if (wallet && newBalance !== null) {
    ops.push(db.from('wallets').update({ balance: newBalance }).eq('id', tx.walletId));
  }

  const results = await Promise.all(ops);
  if (results.some(r => r.error)) { toast('Failed to delete', 'error'); return; }

  if (wallet && newBalance !== null) wallet.balance = newBalance;
  state.transactions = state.transactions.filter(t => t.id !== id);

  closeModal(null);
  toast('Transaction deleted');
  if (state.currentPage === 'home')    renderHome();
  if (state.currentPage === 'history') renderHistory();
  if (state.currentPage === 'reports') renderReports();
}

// ── Notifications stub ────────────────────────────
function openNotifications() {
  document.getElementById('modal-content').innerHTML = `
    <h3 class="modal-title">Notifications</h3>
    <p style="color:var(--text-muted);font-size:14px;padding:20px 0;text-align:center">No new notifications</p>
    <button class="btn-ghost" style="width:100%" onclick="App.closeModal(null)">Close</button>
  `;
  openModal();
}

// ── Public API ────────────────────────────────────
const App = {
  navigate,
  setAddType,
  selectWallet,
  selectCategory,
  saveTransaction,
  setHistoryFilter,
  renderHistory,
  setReportPeriod,
  openWalletManager,
  openWalletAdd,
  openWalletEdit,
  deleteWallet,
  saveWallet,
  pickWalletIcon,
  pickWalletColor,
  openTxDetail,
  deleteTx,
  closeModal,
  openNotifications,
  signOut,
  handleAuth,
  switchAuthTab,
  applyUpdate() {
    navigator.serviceWorker.getRegistration().then(reg => {
      if (reg && reg.waiting) reg.waiting.postMessage('SKIP_WAITING');
    });
  },
};

// ── Boot ──────────────────────────────────────────
(async function init() {
  const { data: { session } } = await db.auth.getSession();

  if (session) {
    currentUser = session.user;
    await loadData();
    showAppShell();
    renderHome();
  } else {
    showAuthPage();
  }

  db.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && !currentUser) {
      currentUser = session.user;
      await loadData();
      showAppShell();
      renderHome();
    } else if (event === 'SIGNED_OUT') {
      currentUser = null;
      state.wallets = [];
      state.transactions = [];
      showAuthPage();
    }
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing;
        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
            document.getElementById('update-banner').classList.remove('hidden');
          }
        });
      });
    }).catch(() => {});

    // After SW takes over, reload to activate new version
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
  }
})();
