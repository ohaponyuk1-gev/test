/* ============================================================
   AP DEALERS HUB — фінансова модель
   Односторінковий застосунок, дані зберігаються в localStorage
   браузера. Немає сервера й немає реального розмежування
   доступів (див. README, розділ "Обмеження") — це інструмент
   для моделювання й перевірки логіки, а не production-система
   з реальним контролем прав.
   ============================================================ */
(function(){
"use strict";

/* ---------------- УТИЛІТИ ---------------- */
const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const uah = n => money(n); // aliases kept minimal, single currency USD
function money(n){
  n = num(n);
  const s = Math.abs(n).toLocaleString('uk-UA',{minimumFractionDigits:2,maximumFractionDigits:2});
  return (n<0?'-':'') + '$' + s;
}
function pct(n,d){ d = d===undefined?2:d; return num(n).toFixed(d) + '%'; }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function todayStr(){ return new Date().toISOString().slice(0,10); }
function toDate(s){ return new Date((s||'1970-01-01')+'T00:00:00'); }
function daysBetween(a,b){ return Math.round((toDate(b)-toDate(a))/86400000); }
function addDays(s,n){ const d=toDate(s); d.setDate(d.getDate()+num(n)); return d.toISOString().slice(0,10); }
function clampDate(s){ return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : todayStr(); }
function byId(arr,id){ return (arr||[]).find(x=>x.id===id); }

/* ---------------- СХЕМА ДОВІДНИКІВ ---------------- */
const COST_CATEGORIES = [
  {key:'netValue',     label:'Чиста вартість авто (з KRW)', financing:true,  derived:true},
  {key:'auctionFee',   label:'Аукціонний збір',             financing:true},
  {key:'dealerKorea',  label:'Послуги дилера в Кореї',      financing:true},
  {key:'transfer',     label:'Вартість переказу коштів',    financing:true},
  {key:'freight',      label:'Фрахт / комплекс',            financing:true},
  {key:'broker',       label:'Брокер',                      financing:true},
  {key:'insurance',    label:'Страхування доставки',        financing:true},
  {key:'apCommission', label:'Комісія AP Dealers Hub',      financing:true},
  {key:'customs',      label:'Розмитнення',                 financing:false},
  {key:'certification',label:'Сертифікація',                financing:false},
  {key:'mreo',         label:'МРЕО',                        financing:false},
  {key:'diagnostics',  label:'Діагностика',                 financing:false},
  {key:'rivne',        label:'Витрати в Рівному',           financing:false},
];
const FINANCING_KEYS = COST_CATEGORIES.filter(c=>c.financing).map(c=>c.key);
const ALL_COST_KEYS = COST_CATEGORIES.map(c=>c.key);

const INCOME_CATEGORIES = ['Внесок інвестора','Внесок Олега','Внесок Сергія','Аванс дилера','Остаточна оплата дилера','VAT','Інший прихід'];
const EXPENSE_CATEGORIES = ['Купівля автомобіля','Аукціон','Дилер Корея','Переказ коштів','Фрахт','Брокер','Страхування','Повернення інвестору','Відсотки','Зарплата','Офіс','Реклама','Податки','Банківські витрати','Інші витрати'];
const OPERATING_EXPENSE_CATEGORIES = ['Зарплата','Офіс','Реклама','Податки','Банківські витрати','Інші витрати'];
const CAR_STATUSES = ['Куплено','В дорозі','Митниця','Клевань','Передано дилеру','Закрито'];

/* ---------------- СХОВИЩЕ ---------------- */
const STORAGE_KEY = 'apDealersHub_v1';
let DB = null;

function nextId(prefix){
  DB.counters[prefix] = (DB.counters[prefix]||0) + 1;
  return prefix + '-' + String(DB.counters[prefix]).padStart(4,'0');
}

function emptyDB(){
  return {
    settings: {
      standardMonthlyRatePct: 2,
      standardFinancingMonths: 3.5,
      investmentTermDays: 105,
      dealerPaymentDueDays: 5,
    },
    counters: {},
    auctions: [
      {id:'AutoBell', vatRatePct:2.05},
      {id:'LotteRental', vatRatePct:4.10},
      {id:'AutoHub', vatRatePct:4.10},
    ],
    cashboxes: [
      {id:'cb-main', name:'Основна каса USD'},
      {id:'cb-oleg', name:'Каса Олег USD'},
      {id:'cb-sergiy', name:'Каса Сергій USD'},
      {id:'cb-bank', name:'Банк AP'},
      {id:'cb-procar', name:'PROCAR'},
    ],
    dealers: [],
    dealerAdvances: [],
    dealerAdvanceAllocations: [],
    dealerPayments: [],
    investors: [],
    investorRepayments: [],
    investorAllocations: [],
    cars: [],
    cashTransactions: [],
    cashChecks: [], // фактичні перевірки каси (control)
    vatRecords: [],
    koreaPayments: [],
    koreaPaymentAllocations: [],
    fxTransactions: [],
    plannedCashFlowItems: [],
  };
}

function loadDB(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){ return JSON.parse(raw); }
  }catch(e){ console.warn('DB load failed', e); }
  return seedDB();
}
function saveDB(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(DB)); }
  catch(e){ alert('Не вдалося зберегти дані в localStorage: ' + e.message); }
}

/* ---------------- ПРИКЛАД ДАНИХ (розділ 40 ТЗ) ---------------- */
function seedDB(){
  DB = emptyDB();
  const dealerId = nextId('DLR');
  DB.dealers.push({id:dealerId, name:'Гуліновський Олександр', creditLimit:60000, note:''});

  const invId = nextId('INV');
  DB.investors.push({
    id: invId, investor:'Петро', date:'2026-06-01', amount:30000, ratePct:2,
    plannedReturnDate: addDays('2026-06-01', DB.settings.investmentTermDays), note:'Приклад з ТЗ, розділ 2'
  });

  const advId = nextId('ADV');
  DB.dealerAdvances.push({id:advId, dealerId, date:'2026-06-01', amount:10000, note:'Аванс під Kia Carnival'});

  const vin = 'KNANE81BBPS326945';
  DB.cars.push({
    vin, kpk:'AP-1', model:'Kia Carnival KA4 2.2d 9-seat Signature', dealerId,
    purchaseDate:'2026-06-01', koreanPlate:'210서7703', make:'Kia', modelName:'Carnival',
    year:2021, mileage:'', engine:'2.2d', fuel:'дизель', auction:'AutoBell',
    priceKRW:30000000, fxRate:1463,
    plannedArrivalDate:'2026-09-05', arrivedDate:'2026-09-05', status:'Передано дилеру',
    costs:{
      netValue:{plan:0, fact:0},
      auctionFee:{plan:300.75, fact:300.75},
      dealerKorea:{plan:390, fact:390},
      transfer:{plan:512.65, fact:512.65},
      freight:{plan:2100, fact:2100},
      broker:{plan:200, fact:200},
      insurance:{plan:0, fact:0},
      apCommission:{plan:400, fact:400},
      customs:{plan:6224, fact:6224},
      certification:{plan:85, fact:85},
      mreo:{plan:820, fact:820},
      diagnostics:{plan:0, fact:0},
      rivne:{plan:0, fact:0},
    },
  });

  DB.dealerAdvanceAllocations.push({id:nextId('DAA'), advanceId:advId, vin, amount:10000, date:'2026-06-01'});
  DB.investorAllocations.push({id:nextId('IA'), loanId:invId, vin, amount:14409.21, date:'2026-06-01'});
  DB.dealerPayments.push({id:nextId('DP'), dealerId, vin, date:'2026-09-09', amount:22546.85, note:'Остаточний розрахунок (приблизно, авто-приклад)'});

  // Каса — ілюстративні рухи грошей
  DB.cashTransactions.push(
    {id:nextId('CT'), date:'2026-06-01', type:'income', category:'Внесок інвестора', amount:30000, cashboxId:'cb-main', cashier:'Оля', investorLoanId:invId, note:'INV-0001 Петро'},
    {id:nextId('CT'), date:'2026-06-01', type:'income', category:'Аванс дилера', amount:10000, cashboxId:'cb-main', cashier:'Оля', dealerId, vin, note:'Аванс під Kia Carnival'},
    {id:nextId('CT'), date:'2026-06-02', type:'transfer', category:'', amount:24409.21, cashboxId:'', fromCashboxId:'cb-main', toCashboxId:'cb-procar', cashier:'Оля', note:'Фінансування закупівлі Kia через PROCAR'},
    {id:nextId('CT'), date:'2026-06-03', type:'expense', category:'Аукціон', amount:20505.81+300.75, cashboxId:'cb-procar', cashier:'Оля', vin, note:'Оплата авто + аукціонний збір'},
    {id:nextId('CT'), date:'2026-06-03', type:'expense', category:'Дилер Корея', amount:390, cashboxId:'cb-procar', cashier:'Оля', vin, note:''},
    {id:nextId('CT'), date:'2026-06-05', type:'expense', category:'Фрахт', amount:2100, cashboxId:'cb-procar', cashier:'Оля', vin, note:''},
    {id:nextId('CT'), date:'2026-09-09', type:'income', category:'Остаточна оплата дилера', amount:22546.85, cashboxId:'cb-main', cashier:'Оля', dealerId, vin, note:''}
  );

  saveDB();
  return DB;
}

/* ---------------- РОЗРАХУНКОВИЙ ДВИГУН ---------------- */

// Дохід/тіло/відсотки по одній інвесторській позиці на дату asOf.
// Відсотки нараховуються по днях: залишок × ставка/30 × дні.
// День отримання коштів вважається, день повернення — ні.
function loanSchedule(loan, asOf){
  asOf = clampDate(asOf);
  const repayments = DB.investorRepayments
    .filter(r=>r.loanId===loan.id)
    .slice()
    .sort((a,b)=> a.date<b.date?-1:a.date>b.date?1:0);

  let balance = num(loan.amount);
  let cursor = loan.date;
  let interestAccrued = 0;
  let interestPaidOut = 0;
  const rows = [];

  for(const r of repayments){
    if(r.date < cursor) continue; // ігноруємо некоректні дані заднім числом
    const d = Math.max(0, daysBetween(cursor, r.date));
    const segInterest = balance * (num(loan.ratePct)/100/30) * d;
    interestAccrued += segInterest;
    const principalPaid = Math.min(num(r.principalAmount), balance);
    balance -= principalPaid;
    interestPaidOut += segInterest; // разом з тілом виплачується накопичений відсоток (п.4)
    rows.push({date:r.date, days:d, interestForSegment:segInterest, principalPaid, balanceAfter:balance});
    cursor = r.date;
  }
  // відкритий (ще не погашений) сегмент до asOf
  if(cursor <= asOf && balance > 0.00001){
    const d = Math.max(0, daysBetween(cursor, asOf));
    const segInterest = balance * (num(loan.ratePct)/100/30) * d;
    interestAccrued += segInterest;
    rows.push({date:asOf, days:d, interestForSegment:segInterest, principalPaid:0, balanceAfter:balance, open:true});
  }

  const overdue = balance > 0.00001 && asOf > loan.plannedReturnDate;
  return {
    rows, balance, interestAccrued, interestPaidOut,
    interestOutstanding: interestAccrued - interestPaidOut,
    overdue,
    daysToReturn: daysBetween(asOf, loan.plannedReturnDate),
  };
}

function allInvestorInterestAccrued(asOf){
  return DB.investors.reduce((s,l)=> s + loanSchedule(l, asOf).interestAccrued, 0);
}

function costVal(car, key, kind){
  const c = (car.costs && car.costs[key]) || {plan:0,fact:0};
  if(key==='netValue'){
    const v = (num(car.priceKRW)) / (num(car.fxRate) || 1);
    return v;
  }
  return kind==='fact' ? num(c.fact) : num(c.plan);
}

function totalAdvanceForVin(vin){
  return DB.dealerAdvanceAllocations.filter(a=>a.vin===vin).reduce((s,a)=>s+num(a.amount),0);
}
function totalInvestorAllocForVin(vin){
  return DB.investorAllocations.filter(a=>a.vin===vin).reduce((s,a)=>s+num(a.amount),0);
}
function totalDealerPaidForVin(vin){
  return DB.dealerPayments.filter(p=>p.vin===vin).reduce((s,p)=>s+num(p.amount),0);
}

// Планове фінансування рахується виключно на ПЛАН-значеннях витрат — це
// навмисно "заморожує" ціну дилера від подальшого росту факту (п.12),
// але дозволяє їй зменшуватись при додаткових авансах (п.10-11).
function carFinance(car){
  const financingBase = FINANCING_KEYS.reduce((s,k)=>s+costVal(car,k,'plan'),0);
  const totalAdvance = totalAdvanceForVin(car.vin);
  const neededFinancing = Math.max(0, financingBase - totalAdvance);
  const rate = num(DB.settings.standardMonthlyRatePct)/100;
  const months = num(DB.settings.standardFinancingMonths);
  const plannedFinancingCost = neededFinancing * rate * months;
  const financingEconomy = Math.min(totalAdvance, financingBase) * rate * months;

  const totalCostPlan = ALL_COST_KEYS.reduce((s,k)=>s+costVal(car,k,'plan'),0);
  const dealerPrice = totalCostPlan + plannedFinancingCost - totalAdvance;

  const paid = totalAdvance + totalDealerPaidForVin(car.vin);
  const balanceDue = dealerPrice - totalDealerPaidForVin(car.vin); // аванс вже врахований в dealerPrice

  const dueDate = car.arrivedDate ? addDays(car.arrivedDate, DB.settings.dealerPaymentDueDays) : null;
  const isOverdue = !!(dueDate && balanceDue > 0.01 && todayStr() > dueDate);
  const overdueDays = dueDate ? Math.max(0, daysBetween(dueDate, todayStr())) : 0;

  return {financingBase, totalAdvance, neededFinancing, plannedFinancingCost, financingEconomy,
          totalCostPlan, dealerPrice, paid, balanceDue, dueDate, isOverdue, overdueDays};
}

// Фактична вартість інвесторських коштів для конкретного VIN: нараховуємо
// відсоток на закріплену суму від дати закріплення до дати, коли дилер
// ПОВНІСТЮ розрахувався (або до "сьогодні", якщо ще не розрахувався).
// Відсоток, нарахований після повної оплати дилером — це вже
// загальнокорпоративні фінансові витрати AP Dealers Hub, а не собівартість
// авто (п.14).
function carActualInvestorCost(car, asOf){
  asOf = clampDate(asOf);
  const fin = carFinance(car);
  const fullyPaidDate = findFullyPaidDate(car, fin.dealerPrice);
  const cutoff = fullyPaidDate && fullyPaidDate < asOf ? fullyPaidDate : asOf;
  const allocs = DB.investorAllocations.filter(a=>a.vin===car.vin);
  let total = 0;
  for(const a of allocs){
    const loan = byId(DB.investors, a.loanId);
    if(!loan) continue;
    const start = a.date > cutoff ? cutoff : a.date;
    const d = Math.max(0, daysBetween(start, cutoff));
    total += num(a.amount) * (num(loan.ratePct)/100/30) * d;
  }
  return {actualInvestorCost: total, fullyPaidDate};
}

// Дата, коли накопичені надходження (аванси + оплати) від дилера по VIN
// вперше досягли повної ціни дилера.
function findFullyPaidDate(car, dealerPrice){
  const events = [];
  DB.dealerAdvanceAllocations.filter(a=>a.vin===car.vin).forEach(a=>events.push({date:a.date, amount:num(a.amount)}));
  DB.dealerPayments.filter(p=>p.vin===car.vin).forEach(p=>events.push({date:p.date, amount:num(p.amount)}));
  events.sort((a,b)=> a.date<b.date?-1:a.date>b.date?1:0);
  let cum = 0;
  for(const e of events){
    cum += e.amount;
    if(cum >= dealerPrice - 0.005) return e.date;
  }
  return null;
}

function carEconomics(car, asOf){
  const fin = carFinance(car);
  const {actualInvestorCost} = carActualInvestorCost(car, asOf);
  const commission = costVal(car,'apCommission','fact') || costVal(car,'apCommission','plan');
  const financeResult = fin.plannedFinancingCost - actualInvestorCost;
  const carProfit = commission + financeResult;
  return {...fin, actualInvestorCost, commission, financeResult, carProfit};
}

function cashboxBalance(cashboxId, asOf){
  asOf = clampDate(asOf);
  let bal = 0;
  for(const t of DB.cashTransactions){
    if(t.date > asOf) continue;
    if(t.type==='income' && t.cashboxId===cashboxId) bal += num(t.amount);
    else if(t.type==='expense' && t.cashboxId===cashboxId) bal -= num(t.amount);
    else if(t.type==='transfer'){
      if(t.fromCashboxId===cashboxId) bal -= num(t.amount);
      if(t.toCashboxId===cashboxId) bal += num(t.amount);
    }
  }
  return bal;
}
function totalCash(asOf){
  return DB.cashboxes.reduce((s,c)=>s+cashboxBalance(c.id, asOf),0);
}

function dealerAggregates(dealer, asOf){
  const cars = DB.cars.filter(c=>c.dealerId===dealer.id);
  let exposure = 0, overdueAmount = 0, openCars=0, closedCars=0;
  const advanceTotal = DB.dealerAdvances.filter(a=>a.dealerId===dealer.id).reduce((s,a)=>s+num(a.amount),0);
  const advanceAllocated = DB.dealerAdvanceAllocations
    .filter(a=>cars.some(c=>c.vin===a.vin))
    .reduce((s,a)=>s+num(a.amount),0);
  for(const car of cars){
    const fin = carFinance(car);
    if(car.status==='Закрито') closedCars++; else openCars++;
    if(fin.balanceDue > 0.01) exposure += fin.balanceDue;
    if(fin.isOverdue) overdueAmount += fin.balanceDue;
  }
  return {
    carsCount: cars.length, openCars, closedCars,
    advanceTotal, advanceFree: Math.max(0, advanceTotal - advanceAllocated),
    exposure, overdueAmount,
    overLimit: exposure > num(dealer.creditLimit) && num(dealer.creditLimit) > 0,
    financingEconomy: cars.reduce((s,c)=>s+carFinance(c).financingEconomy,0),
  };
}

function vatProfitTotal(){
  return DB.vatRecords.reduce((s,v)=>s+num(v.vatUSD),0);
}
function fxProfitTotal(){
  return DB.fxTransactions.reduce((s,t)=>{
    const diff = (num(t.referenceRate) - num(t.actualRate));
    // якщо купуємо валюту дешевше за референс — це виграш, дорожче — програш
    return s + diff * num(t.amount) * (t.direction==='sell' ? -1 : 1);
  },0);
}

function overheadInterest(asOf){
  const totalInterest = allInvestorInterestAccrued(asOf);
  const attributed = DB.cars.reduce((s,c)=>s+carActualInvestorCost(c, asOf).actualInvestorCost,0);
  return Math.max(0, totalInterest - attributed);
}

function operatingExpensesTotal(asOf){
  asOf = clampDate(asOf);
  return DB.cashTransactions
    .filter(t=>t.type==='expense' && OPERATING_EXPENSE_CATEGORIES.includes(t.category) && t.date<=asOf)
    .reduce((s,t)=>s+num(t.amount),0);
}

function netProfit(asOf){
  const carProfitSum = DB.cars.reduce((s,c)=>s+carEconomics(c, asOf).carProfit,0);
  const vatP = vatProfitTotal();
  const fxP = fxProfitTotal();
  const opex = operatingExpensesTotal(asOf);
  const overhead = overheadInterest(asOf);
  const total = carProfitSum + vatP + fxP - opex - overhead;
  return {carProfitSum, vatP, fxP, opex, overhead, total};
}

/* ---------------- ПОПЕРЕДЖЕННЯ (розділ 37) ---------------- */
function computeWarnings(asOf){
  asOf = clampDate(asOf);
  const warns = [];
  // дублі VIN
  const seen = {};
  DB.cars.forEach(c=>{ seen[c.vin]=(seen[c.vin]||0)+1; });
  Object.entries(seen).filter(([,n])=>n>1).forEach(([vin])=>
    warns.push({level:'crit', text:`Дубль VIN: ${vin}`}));

  // прострочення дилера
  DB.cars.forEach(c=>{
    const fin = carFinance(c);
    if(fin.isOverdue) warns.push({level:'crit', text:`Дилер прострочив оплату по ${c.vin} (${c.model||''}) на ${fin.overdueDays} дн., борг ${money(fin.balanceDue)}`});
  });

  // кредитний ліміт
  DB.dealers.forEach(d=>{
    const agg = dealerAggregates(d, asOf);
    if(agg.overLimit) warns.push({level:'warn', text:`Дилер ${d.name} перевищив кредитний ліміт: ${money(agg.exposure)} з ${money(d.creditLimit)}`});
  });

  // інвестори — наближення / прострочення повернення
  DB.investors.forEach(l=>{
    const s = loanSchedule(l, asOf);
    if(s.balance>0.01){
      if(s.overdue) warns.push({level:'crit', text:`Прострочена позика ${l.id} (${l.investor}): плановий термін ${l.plannedReturnDate}, залишок тіла ${money(s.balance)}`});
      else if(s.daysToReturn<=7) warns.push({level:'warn', text:`Наближається повернення позики ${l.id} (${l.investor}) — через ${s.daysToReturn} дн.`});
    }
  });

  // касовий розрив
  const forecast = cashFlowForecast(asOf);
  if(forecast.gapDate) warns.push({level:'crit', text:`Прогнозований касовий розрив: ${money(forecast.gapAmount)} на ${forecast.gapDate}`});

  // факт вищий за план по авто
  DB.cars.forEach(c=>{
    ALL_COST_KEYS.forEach(k=>{
      if(k==='netValue') return;
      const plan = costVal(c,k,'plan'), fact = costVal(c,k,'fact');
      if(fact > plan + 0.01) warns.push({level:'info', text:`${c.vin}: факт «${labelFor(k)}» (${money(fact)}) вищий за план (${money(plan)}) на ${money(fact-plan)}`});
    });
  });

  // розбіжність каси факт/розрахунок
  DB.cashChecks.forEach(ch=>{
    const calc = cashboxBalance(ch.cashboxId, ch.date);
    const diff = num(ch.actualBalance) - calc;
    if(Math.abs(diff) > 0.01){
      const cb = byId(DB.cashboxes, ch.cashboxId);
      warns.push({level:'warn', text:`Розбіжність каси «${cb?cb.name:ch.cashboxId}» на ${ch.date}: розрахунково ${money(calc)}, фактично ${money(ch.actualBalance)}, різниця ${money(diff)}`});
    }
  });

  return warns;
}
function labelFor(key){
  const c = COST_CATEGORIES.find(x=>x.key===key);
  return c ? c.label : key;
}

/* ---------------- CASH FLOW FORECAST (розділ 34-35) ---------------- */
function cashFlowForecast(asOf){
  asOf = clampDate(asOf);
  const start = totalCash(asOf);
  const events = []; // {date, amount} amount can be +/-

  // майбутні оплати дилерів (по неоплаченому залишку, очікувана дата = термін оплати або +7дн якщо авто ще в дорозі)
  DB.cars.forEach(c=>{
    const fin = carFinance(c);
    if(fin.balanceDue > 0.01){
      const date = fin.dueDate && fin.dueDate>=asOf ? fin.dueDate
        : (c.plannedArrivalDate ? addDays(c.plannedArrivalDate, DB.settings.dealerPaymentDueDays) : addDays(asOf,30));
      events.push({date: date<asOf?asOf:date, amount: fin.balanceDue});
    }
  });
  // очікуваний VAT, ще не врахований у касі
  DB.vatRecords.forEach(v=>{
    if(!v.realized) events.push({date: v.expectedDate || asOf, amount: num(v.vatUSD)});
  });
  // повернення інвесторам (тіло) і відсотки на плановий термін
  DB.investors.forEach(l=>{
    const s = loanSchedule(l, asOf);
    if(s.balance>0.01){
      const d = l.plannedReturnDate < asOf ? asOf : l.plannedReturnDate;
      events.push({date:d, amount: -s.balance});
      const interestToReturn = s.interestAccrued + s.balance*(num(l.ratePct)/100/30)*Math.max(0,daysBetween(asOf, d));
      events.push({date:d, amount: -(interestToReturn - s.interestPaidOut)});
    }
  });
  // ручні заплановані статті
  DB.plannedCashFlowItems.forEach(p=>{
    events.push({date:p.date, amount: p.type==='in'? num(p.amount) : -num(p.amount)});
  });

  events.sort((a,b)=> a.date<b.date?-1:a.date>b.date?1:0);

  const horizons = [7,30,60,90,120];
  const buckets = {};
  horizons.forEach(h=>{
    const limit = addDays(asOf,h);
    buckets[h] = start + events.filter(e=>e.date<=limit).reduce((s,e)=>s+e.amount,0);
  });

  // пошук першої дати касового розриву (running balance < 0)
  let running = start, gapDate=null, gapAmount=0;
  for(const e of events){
    running += e.amount;
    if(running < -0.01 && !gapDate){ gapDate = e.date; gapAmount = running; }
  }

  return {start, events, buckets, gapDate, gapAmount};
}

/* export to window for UI layer */
window.APDH = {
  num, money, pct, esc, todayStr, toDate, daysBetween, addDays, clampDate, byId,
  COST_CATEGORIES, FINANCING_KEYS, ALL_COST_KEYS, INCOME_CATEGORIES, EXPENSE_CATEGORIES,
  OPERATING_EXPENSE_CATEGORIES, CAR_STATUSES,
  nextId,
  get DB(){ return DB; }, set DB(v){ DB=v; },
  loadDB, saveDB, seedDB, emptyDB,
  loanSchedule, allInvestorInterestAccrued, costVal,
  totalAdvanceForVin, totalInvestorAllocForVin, totalDealerPaidForVin,
  carFinance, carActualInvestorCost, findFullyPaidDate, carEconomics,
  cashboxBalance, totalCash, dealerAggregates, vatProfitTotal, fxProfitTotal,
  overheadInterest, operatingExpensesTotal, netProfit,
  computeWarnings, labelFor, cashFlowForecast,
};

})();
