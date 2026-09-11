(function(){
"use strict";
const A = window.APDH;
const {num, money, pct, esc, todayStr, addDays, daysBetween, byId} = A;

let state = { tab:'dashboard', asOf: todayStr(), role:'owner', editing:{entity:null,id:null} };

/* ---------------- ВКЛАДКИ ---------------- */
const TABS = [
  {id:'dashboard', label:'DASHBOARD', roles:['owner']},
  {id:'purchase',  label:'КУПІВЛЯ АВТО', roles:['owner','employee']},
  {id:'cash',      label:'КАСА', roles:['owner','cashier']},
  {id:'investors', label:'ІНВЕСТОРИ', roles:['owner']},
  {id:'repayments',label:'ПОГАШЕННЯ', roles:['owner']},
  {id:'financing', label:'ФІНАНСУВАННЯ', roles:['owner']},
  {id:'economics', label:'ЕКОНОМІКА АВТО', roles:['owner']},
  {id:'dealers',   label:'ДИЛЕРИ', roles:['owner']},
  {id:'procar',    label:'PROCAR / VAT', roles:['owner']},
  {id:'korea',     label:'ПЛАТЕЖІ КОРЕЯ', roles:['owner']},
  {id:'currency',  label:'ВАЛЮТИ', roles:['owner']},
  {id:'cashflow',  label:'CASH FLOW', roles:['owner']},
  {id:'control',   label:'КОНТРОЛЬ', roles:['owner']},
  {id:'reference', label:'ДОВІДНИКИ', roles:['owner']},
];
const ROLE_LABELS = {owner:'Власник (повний доступ)', cashier:'Касир (Оля) — тільки КАСА', employee:'Працівник — тільки КУПІВЛЯ АВТО'};

/* ---------------- ГЕНЕРИЧНІ ПОЛЯ/ФОРМИ ---------------- */
function dealerOptions(){ return A.DB.dealers.map(d=>({value:d.id,label:d.name})); }
function carOptions(){ return A.DB.cars.map(c=>({value:c.vin,label:`${c.vin} — ${c.model||c.make||''}`})); }
// Той самий список VIN, але з підсвіченим залишком до оплати PROCAR прямо в назві
// пункту — щоб було видно "скільки треба на цей VIN", не переключаючись на іншу вкладку.
function carOptionsWithProcar(){
  return A.DB.cars.map(c=>{
    const {procarRemaining} = A.carProcarStatus(c);
    const tag = procarRemaining>0.01 ? `— на PROCAR ще ${money(procarRemaining)}` : '— PROCAR закрито';
    return {value:c.vin, label:`${c.vin} — ${c.model||c.make||''} (${tag})`};
  });
}
function loanOptions(){ return A.DB.investors.map(l=>({value:l.id,label:`${l.id} — ${l.investor} (${money(l.amount)})`})); }
function advanceOptions(){ return A.DB.dealerAdvances.map(a=>{ const d=byId(A.DB.dealers,a.dealerId); return {value:a.id,label:`${a.id} — ${d?d.name:'?'} (${money(a.amount)}, ${a.date})`}; }); }
function cashboxOptions(){ return A.DB.cashboxes.map(c=>({value:c.id,label:c.name})); }
function auctionOptions(){ return A.DB.auctions.map(a=>({value:a.id,label:`${a.id} (VAT ${a.vatRatePct}%)`})); }
function koreaPaymentOptions(){ return A.DB.koreaPayments.map(p=>({value:p.id,label:`${p.id} — ${p.date} ${money(p.amount)} ${p.currency||''}`})); }

function fieldInput(f, value){
  if(value===undefined || value===null || value===''){
    value = f.default ? f.default() : '';
  }
  const name = f.key;
  if(f.type==='select'){
    const opts = f.optionsFn ? f.optionsFn() : (f.options||[]).map(o=>({value:o,label:o}));
    return `<select name="${name}" ${f.required?'required':''}>
      <option value="">—</option>
      ${opts.map(o=>`<option value="${esc(o.value)}" ${String(o.value)===String(value)?'selected':''}>${esc(o.label)}</option>`).join('')}
    </select>`;
  }
  if(f.type==='checkbox'){
    return `<input type="checkbox" name="${name}" ${value?'checked':''}>`;
  }
  if(f.type==='textarea'){
    return `<textarea name="${name}" rows="2">${esc(value)}</textarea>`;
  }
  const step = f.step ? `step="${f.step}"` : (f.type==='number'?'step="0.01"':'');
  return `<input type="${f.type||'text'}" name="${name}" value="${esc(value)}" ${step} ${f.required?'required':''} placeholder="${esc(f.placeholder||'')}">`;
}
function crudForm(def, editRecord){
  const isEdit = !!editRecord;
  return `<form data-entity="${def.array}" ${isEdit?`data-edit-id="${esc(editRecord.id)}"`:''} class="inline-form">
    ${def.manualId && !isEdit ? `<label>Ід.${fieldInput({key:'id',required:true},'')}</label>` : ''}
    ${def.fields.map(f=>`<label>${esc(f.label)}${fieldInput(f, editRecord?editRecord[f.key]:undefined)}</label>`).join('')}
    <div class="form-actions">
      <button type="submit" class="btn-primary">${isEdit?'Зберегти':'Додати'}</button>
      ${isEdit?`<button type="button" data-action="cancelEdit">Скасувати</button>`:''}
    </div>
  </form>`;
}
function crudTable(def, columns){
  const arr = A.DB[def.array];
  if(!arr.length) return `<p class="muted">Записів ще немає.</p>`;
  return `<div class="table-wrap"><table><thead><tr>${columns.map(c=>`<th>${esc(c.label)}</th>`).join('')}<th></th></tr></thead>
  <tbody>${arr.map(row=>`<tr>${columns.map(c=>`<td>${c.render?c.render(row):esc(row[c.key]==null?'':row[c.key])}</td>`).join('')}
    <td class="row-actions">
      <button type="button" title="Редагувати" data-action="edit" data-entity="${def.array}" data-id="${esc(row.id)}">✎</button>
      <button type="button" title="Видалити" data-action="del" data-entity="${def.array}" data-id="${esc(row.id)}">✕</button>
    </td></tr>`).join('')}</tbody></table></div>`;
}
function crudFormAuto(def){
  const editRecord = state.editing.entity===def.array ? byId(A.DB[def.array], state.editing.id) : null;
  return crudForm(def, editRecord);
}
function crudSection(def, columns, title, hint){
  const editRecord = state.editing.entity===def.array ? byId(A.DB[def.array], state.editing.id) : null;
  return `<div class="card">
    <h3>${esc(title)}</h3>
    ${hint?`<p class="hint">${hint}</p>`:''}
    ${crudForm(def, editRecord)}
    ${crudTable(def, columns)}
  </div>`;
}

/* ---------------- ВИЗНАЧЕННЯ СУТНОСТЕЙ ---------------- */
const DEFS = {
  dealers: {array:'dealers', idPrefix:'DLR', fields:[
    {key:'name', label:'Назва / дилер', required:true},
    {key:'creditLimit', label:'Кредитний ліміт, $', type:'number'},
    {key:'note', label:'Примітка'},
  ]},
  investors: {array:'investors', idPrefix:'INV', fields:[
    {key:'investor', label:'Інвестор', required:true},
    {key:'date', label:'Дата внеску', type:'date', required:true, default:todayStr},
    {key:'amount', label:'Сума, $', type:'number', required:true},
    {key:'ratePct', label:'Ставка, %/міс', type:'number', step:'0.01', default:()=>2, required:true},
    {key:'plannedReturnDate', label:'Планова дата повернення (авто, якщо порожньо)', type:'date'},
    {key:'note', label:'Примітка'},
  ], onAdd(rec){ if(!rec.plannedReturnDate) rec.plannedReturnDate = addDays(rec.date, A.DB.settings.investmentTermDays); }},
  investorRepayments: {array:'investorRepayments', idPrefix:'REP', fields:[
    {key:'loanId', label:'Позика', type:'select', optionsFn:loanOptions, required:true},
    {key:'date', label:'Дата повернення тіла', type:'date', required:true, default:todayStr},
    {key:'principalAmount', label:'Сума тіла, $', type:'number', required:true},
  ]},
  investorAllocations: {array:'investorAllocations', idPrefix:'IA', fields:[
    {key:'loanId', label:'Позика', type:'select', optionsFn:loanOptions, required:true},
    {key:'vin', label:'VIN', type:'select', optionsFn:carOptionsWithProcar, required:true},
    {key:'amount', label:'Сума, $', type:'number', required:true},
    {key:'date', label:'Дата закріплення', type:'date', required:true, default:todayStr},
  ]},
  dealerAdvances: {array:'dealerAdvances', idPrefix:'ADV', fields:[
    {key:'dealerId', label:'Дилер', type:'select', optionsFn:dealerOptions, required:true},
    {key:'date', label:'Дата', type:'date', required:true, default:todayStr},
    {key:'amount', label:'Сума, $', type:'number', required:true},
    {key:'note', label:'Примітка'},
  ]},
  dealerAdvanceAllocations: {array:'dealerAdvanceAllocations', idPrefix:'DAA', fields:[
    {key:'advanceId', label:'Аванс', type:'select', optionsFn:advanceOptions, required:true},
    {key:'vin', label:'VIN', type:'select', optionsFn:carOptionsWithProcar, required:true},
    {key:'amount', label:'Сума, $', type:'number', required:true},
    {key:'date', label:'Дата закріплення', type:'date', required:true, default:todayStr},
  ]},
  dealerPayments: {array:'dealerPayments', idPrefix:'DP', fields:[
    {key:'dealerId', label:'Дилер', type:'select', optionsFn:dealerOptions, required:true},
    {key:'vin', label:'VIN', type:'select', optionsFn:carOptions, required:true},
    {key:'date', label:'Дата оплати', type:'date', required:true, default:todayStr},
    {key:'amount', label:'Сума, $', type:'number', required:true},
    {key:'note', label:'Примітка'},
  ]},
  cashChecks: {array:'cashChecks', idPrefix:'CHK', fields:[
    {key:'cashboxId', label:'Каса', type:'select', optionsFn:cashboxOptions, required:true},
    {key:'date', label:'Дата перевірки', type:'date', required:true, default:todayStr},
    {key:'actualBalance', label:'Фактичний залишок, $', type:'number', required:true},
    {key:'note', label:'Примітка'},
  ]},
  vatRecords: {array:'vatRecords', idPrefix:'VAT', fields:[
    {key:'vin', label:'VIN (необов’язково)', type:'select', optionsFn:carOptions},
    {key:'auction', label:'Аукціон', type:'select', optionsFn:auctionOptions, required:true},
    {key:'netKRW', label:'Чиста вартість авто, KRW', type:'number', required:true},
    {key:'fxRate', label:'Курс KRW/USD', type:'number', step:'0.01', required:true},
    {key:'expectedDate', label:'Очікувана дата отримання', type:'date', default:todayStr},
    {key:'realized', label:'Кошти вже в касі', type:'checkbox'},
    {key:'note', label:'Примітка'},
  ], onAdd(rec){
    const auc = byId(A.DB.auctions, rec.auction);
    rec.vatRatePct = auc ? num(auc.vatRatePct) : 0;
    rec.vatKRW = num(rec.netKRW) * rec.vatRatePct/100;
    rec.vatUSD = rec.vatKRW / (num(rec.fxRate)||1);
  }},
  koreaPayments: {array:'koreaPayments', idPrefix:'KP', fields:[
    {key:'date', label:'Дата', type:'date', required:true, default:todayStr},
    {key:'method', label:'Спосіб', type:'select', options:['SWIFT','USDT'], required:true},
    {key:'amount', label:'Сума відправлено', type:'number', required:true},
    {key:'currency', label:'Валюта відправлення', default:()=>'USD'},
    {key:'rate', label:'Курс купівлі (для USDT)', type:'number', step:'0.0001'},
    {key:'bankFeeLocal', label:'Комісія укр. банку', type:'number'},
    {key:'correspondentFee', label:'Комісія кор.банку', type:'number'},
    {key:'koreanBankFee', label:'Комісія корейського банку', type:'number'},
    {key:'actualReceivedPROCAR', label:'Фактично отримав PROCAR, $', type:'number', required:true},
    {key:'note', label:'Примітка'},
  ]},
  koreaPaymentAllocations: {array:'koreaPaymentAllocations', idPrefix:'KPA', fields:[
    {key:'paymentId', label:'Платіж', type:'select', optionsFn:koreaPaymentOptions, required:true},
    {key:'vin', label:'VIN', type:'select', optionsFn:carOptions, required:true},
    {key:'sharePct', label:'Частка платежу, %', type:'number', step:'0.01', required:true},
  ]},
  fxTransactions: {array:'fxTransactions', idPrefix:'FX', fields:[
    {key:'date', label:'Дата', type:'date', required:true, default:todayStr},
    {key:'direction', label:'Операція', type:'select', options:['buy','sell'], required:true},
    {key:'fromCurrency', label:'З валюти'},
    {key:'toCurrency', label:'У валюту'},
    {key:'amount', label:'Сума базової валюти', type:'number', required:true},
    {key:'actualRate', label:'Фактичний курс', type:'number', step:'0.0001', required:true},
    {key:'referenceRate', label:'Референсний курс (НБУ/план)', type:'number', step:'0.0001', required:true},
    {key:'note', label:'Примітка'},
  ]},
  plannedCashFlowItems: {array:'plannedCashFlowItems', idPrefix:'PCF', fields:[
    {key:'date', label:'Очікувана дата', type:'date', required:true, default:todayStr},
    {key:'type', label:'Тип', type:'select', options:[['in','Надходження'],['out','Витрата']].map(x=>x[0]) , required:true},
    {key:'amount', label:'Сума, $', type:'number', required:true},
    {key:'note', label:'Опис', required:true},
  ]},
  cashboxes: {array:'cashboxes', idPrefix:'cb', fields:[
    {key:'name', label:'Назва каси', required:true},
  ], editable:false},
  auctions: {array:'auctions', manualId:true, fields:[
    {key:'vatRatePct', label:'Ставка VAT, %', type:'number', step:'0.01', required:true},
  ]},
};

/* ---------------- ДОДАВАННЯ / РЕДАГУВАННЯ / ВИДАЛЕННЯ ---------------- */
function collectFields(def, form){
  const rec = {};
  const fieldsList = def.manualId ? [{key:'id'}].concat(def.fields) : def.fields;
  fieldsList.forEach(f=>{
    const el = form.elements[f.key];
    if(!el) return;
    let val = el.type==='checkbox' ? el.checked : el.value;
    if(f.type==='number') val = num(val);
    rec[f.key] = val;
  });
  return rec;
}
function genericSubmit(entityName, form){
  const editId = form.dataset.editId;
  if(entityName==='cars'){ return carSubmit(form, editId); }
  if(entityName==='cashTransactions'){ return cashSubmit(form, editId); }

  const def = DEFS[entityName];
  if(!def) return;
  const rec = collectFields(def, form);

  if(editId){
    const existing = byId(A.DB[def.array], editId);
    if(existing){ Object.assign(existing, rec); if(def.onAdd) def.onAdd(existing); }
    state.editing = {entity:null,id:null};
  } else {
    if(def.manualId){
      if(!rec.id || A.DB[def.array].some(r=>r.id===rec.id)){ alert('Вкажіть унікальний ідентифікатор.'); return; }
    } else {
      rec.id = A.nextId(def.idPrefix);
    }
    if(def.onAdd) def.onAdd(rec);
    A.DB[def.array].push(rec);
  }
  A.saveDB();
  render();
}
function genericDelete(entityName, id){
  if(entityName==='cars'){
    const idx = A.DB.cars.findIndex(c=>c.vin===id);
    if(idx<0) return;
    if(!confirm('Видалити авто '+id+'? Пов\'язані записи (розподіли, платежі) залишаться, але втратять зв\'язок з автомобілем.')) return;
    A.DB.cars.splice(idx,1);
    A.saveDB();
    render();
    return;
  }
  const def = DEFS[entityName];
  if(!def) return;
  const arr = A.DB[def.array];
  const idx = arr.findIndex(r=>r.id===id);
  if(idx<0) return;
  if(!confirm('Видалити запис '+id+'?')) return;
  arr.splice(idx,1);
  A.saveDB();
  render();
}

/* ---------------- КАСА (бо тип впливає на набір полів) ---------------- */
function cashForm(edit){
  const t = edit ? edit.type : 'income';
  const catOptions = t==='income' ? A.INCOME_CATEGORIES : A.EXPENSE_CATEGORIES;
  return `<form data-entity="cashTransactions" ${edit?`data-edit-id="${esc(edit.id)}"`:''} class="inline-form">
    <label>Тип операції
      <select name="type" data-action="cashTypeChange">
        <option value="income" ${t==='income'?'selected':''}>Прихід</option>
        <option value="expense" ${t==='expense'?'selected':''}>Видаток</option>
        <option value="transfer" ${t==='transfer'?'selected':''}>Переміщення між касами</option>
      </select>
    </label>
    <label>Дата<input type="date" name="date" value="${esc(edit?edit.date:todayStr())}" required></label>
    ${t!=='transfer' ? `
    <label>Категорія<select name="category">${catOptions.map(c=>`<option ${edit&&edit.category===c?'selected':''}>${esc(c)}</option>`).join('')}</select></label>
    <label>Каса<select name="cashboxId">${cashboxOptions().map(o=>`<option value="${esc(o.value)}" ${edit&&edit.cashboxId===o.value?'selected':''}>${esc(o.label)}</option>`).join('')}</select></label>
    ` : `
    <label>З каси<select name="fromCashboxId">${cashboxOptions().map(o=>`<option value="${esc(o.value)}" ${edit&&edit.fromCashboxId===o.value?'selected':''}>${esc(o.label)}</option>`).join('')}</select></label>
    <label>У касу<select name="toCashboxId">${cashboxOptions().map(o=>`<option value="${esc(o.value)}" ${edit&&edit.toCashboxId===o.value?'selected':''}>${esc(o.label)}</option>`).join('')}</select></label>
    `}
    <label>Сума, $<input type="number" step="0.01" name="amount" value="${edit?edit.amount:''}" required></label>
    <label>Касир<input name="cashier" value="${esc(edit?edit.cashier:'Оля')}"></label>
    <label>VIN (необов'язково)<select name="vin"><option value="">—</option>${carOptions().map(o=>`<option value="${esc(o.value)}" ${edit&&edit.vin===o.value?'selected':''}>${esc(o.label)}</option>`).join('')}</select></label>
    <label>Дилер (необов'язково)<select name="dealerId"><option value="">—</option>${dealerOptions().map(o=>`<option value="${esc(o.value)}" ${edit&&edit.dealerId===o.value?'selected':''}>${esc(o.label)}</option>`).join('')}</select></label>
    <label>Позика інвестора (необов'язково)<select name="investorLoanId"><option value="">—</option>${loanOptions().map(o=>`<option value="${esc(o.value)}" ${edit&&edit.investorLoanId===o.value?'selected':''}>${esc(o.label)}</option>`).join('')}</select></label>
    <label>Примітка<input name="note" value="${esc(edit?edit.note:'')}"></label>
    <div class="form-actions">
      <button type="submit" class="btn-primary">${edit?'Зберегти':'Додати операцію'}</button>
      ${edit?`<button type="button" data-action="cancelEdit">Скасувати</button>`:''}
    </div>
  </form>`;
}
function cashSubmit(form, editId){
  const type = form.elements['type'].value;
  const rec = {
    type, date: form.elements['date'].value,
    amount: num(form.elements['amount'].value),
    cashier: form.elements['cashier'].value,
    vin: form.elements['vin'] ? form.elements['vin'].value : '',
    dealerId: form.elements['dealerId'] ? form.elements['dealerId'].value : '',
    investorLoanId: form.elements['investorLoanId'] ? form.elements['investorLoanId'].value : '',
    note: form.elements['note'] ? form.elements['note'].value : '',
  };
  if(type==='transfer'){
    rec.fromCashboxId = form.elements['fromCashboxId'].value;
    rec.toCashboxId = form.elements['toCashboxId'].value;
    rec.cashboxId = ''; rec.category='';
  } else {
    rec.cashboxId = form.elements['cashboxId'].value;
    rec.category = form.elements['category'].value;
  }
  if(editId){
    const existing = byId(A.DB.cashTransactions, editId);
    Object.assign(existing, rec);
    state.editing = {entity:null,id:null};
  } else {
    rec.id = A.nextId('CT');
    A.DB.cashTransactions.push(rec);
  }
  A.saveDB();
  render();
}

/* ---------------- КУПІВЛЯ АВТО (форма авто) ---------------- */
const CAR_BASE_FIELDS = [
  {key:'vin', label:'VIN', required:true},
  {key:'kpk', label:'КПК / внутрішній номер'},
  {key:'dealerId', label:'Дилер', type:'select', optionsFn:dealerOptions, required:true},
  {key:'purchaseDate', label:'Дата покупки', type:'date', default:todayStr, required:true},
  {key:'koreanPlate', label:'Корейський номер авто'},
  {key:'make', label:'Марка'},
  {key:'modelName', label:'Модель'},
  {key:'model', label:'Повна назва (для списків)'},
  {key:'year', label:'Рік', type:'number', step:'1'},
  {key:'mileage', label:'Пробіг, км', type:'number', step:'1'},
  {key:'engine', label:'Двигун'},
  {key:'fuel', label:'Паливо'},
  {key:'auction', label:'Аукціон', type:'select', optionsFn:auctionOptions, required:true},
  {key:'priceKRW', label:'Ціна, KRW', type:'number', required:true},
  {key:'fxRate', label:'Курс KRW/USD', type:'number', step:'0.01', required:true},
  {key:'plannedArrivalDate', label:'Планова дата прибуття', type:'date'},
  {key:'arrivedDate', label:'Дата прибуття в Клевань'},
  {key:'status', label:'Статус', type:'select', options:A.CAR_STATUSES, default:()=>'Куплено'},
];
function carForm(edit, restrictedView){
  const costsRows = A.COST_CATEGORIES.filter(c=>!c.derived).map(c=>{
    const p = edit && edit.costs && edit.costs[c.key] ? edit.costs[c.key].plan : '';
    const f = edit && edit.costs && edit.costs[c.key] ? edit.costs[c.key].fact : '';
    return `<tr><td>${esc(c.label)}</td>
      <td><input type="number" step="0.01" name="plan_${c.key}" value="${p}"></td>
      <td><input type="number" step="0.01" name="fact_${c.key}" value="${f}"></td></tr>`;
  }).join('');
  return `<form data-entity="cars" ${edit?`data-edit-id="${esc(edit.vin)}"`:''} class="inline-form car-form">
    <div class="grid-fields">
      ${CAR_BASE_FIELDS.map(f=>{
        const html = fieldInput(f, edit?edit[f.key]:undefined);
        const locked = edit && f.key==='vin' ? html.replace('<input ', '<input readonly title="VIN не можна змінити після створення (на нього посилаються інші записи)" ') : html;
        return `<label>${esc(f.label)}${locked}</label>`;
      }).join('')}
    </div>
    ${!restrictedView ? `
    <h4>Витрати — план / факт</h4>
    <div class="table-wrap"><table class="costs-table"><thead><tr><th>Стаття</th><th>План, $</th><th>Факт, $</th></tr></thead>
    <tbody>${costsRows}</tbody></table></div>
    ` : `<p class="hint">Витрати та фінансова аналітика доступні лише власникам.</p>`}
    <div class="form-actions">
      <button type="submit" class="btn-primary">${edit?'Зберегти авто':'Додати авто'}</button>
      ${edit?`<button type="button" data-action="cancelEdit">Скасувати</button>`:''}
    </div>
  </form>`;
}
function carSubmit(form, editId){
  const rec = {};
  CAR_BASE_FIELDS.forEach(f=>{
    const el = form.elements[f.key];
    if(!el) return;
    let val = el.value;
    if(f.type==='number') val = num(val);
    rec[f.key] = val;
  });
  if(!rec.vin){ alert('VIN обов\'язковий.'); return; }
  const isNew = !editId;
  if(isNew && A.DB.cars.some(c=>c.vin===rec.vin)){ alert('VIN вже існує — дублікати заборонені.'); return; }

  const costs = {};
  A.COST_CATEGORIES.filter(c=>!c.derived).forEach(c=>{
    const planEl = form.elements['plan_'+c.key], factEl = form.elements['fact_'+c.key];
    costs[c.key] = { plan: planEl?num(planEl.value):0, fact: factEl?num(factEl.value):0 };
  });
  costs.netValue = {plan:0, fact:0};
  rec.costs = costs;

  if(editId){
    const existing = A.DB.cars.find(c=>c.vin===editId);
    if(!existing){ alert('Не вдалося знайти авто для редагування.'); return; }
    if(rec.vin!==editId && A.DB.cars.some(c=>c.vin===rec.vin)){ alert('VIN вже існує — дублікати заборонені.'); return; }
    Object.assign(existing, rec);
    state.editing = {entity:null,id:null};
  } else {
    A.DB.cars.push(rec);
  }
  A.saveDB();
  render();
}

/* ---------------- ДІЇ (не-CRUD) ---------------- */
const ACTIONS = {
  cancelEdit(){ state.editing = {entity:null,id:null}; render(); },
  async exportJson(){
    const blob = new Blob([JSON.stringify(A.DB,null,2)], {type:'application/json'});
    // У переглядачі Artifact сторінка не може сама ініціювати завантаження
    // файлу — тільки віддати його користувачу через capability "downloads".
    // Поза Artifact (файл відкрито прямо в браузері) window.claude відсутній,
    // тож працює звичайне посилання-завантаження.
    if(window.claude && window.claude.use){
      try{
        const downloads = await window.claude.use('downloads');
        if(downloads){
          await downloads.save({filename:'ap-dealers-hub-data.json', data:blob});
          return;
        }
      }catch(e){
        if(e && e.code!=='declined') alert('Не вдалося зберегти файл: ' + (e.message||e.code||e));
        return;
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='ap-dealers-hub-data.json'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 2000);
  },
  resetSeed(){ if(confirm('Скинути всі дані та завантажити приклад з ТЗ (Kia Carnival)?')){ A.DB = A.seedDB(); render(); } },
  resetEmpty(){ if(confirm('Видалити всі дані та почати з чистого аркуша?')){ A.DB = A.emptyDB(); A.saveDB(); render(); } },
};

/* ---------------- DASHBOARD ---------------- */
function renderDashboard(){
  const asOf = state.asOf;
  const np = A.netProfit(asOf);
  const cash = totalCashByBox();
  const warns = A.computeWarnings(asOf);
  const forecast = A.cashFlowForecast(asOf);
  const openCars = A.DB.cars.filter(c=>c.status!=='Закрито');
  const closedCars = A.DB.cars.filter(c=>c.status==='Закрито');
  const lastCar = A.DB.cars.slice().sort((a,b)=> (b.purchaseDate||'').localeCompare(a.purchaseDate||''))[0];
  const investorDebt = A.DB.investors.reduce((s,l)=>s+A.loanSchedule(l,asOf).balance,0);
  const investorInterestAccrued = A.allInvestorInterestAccrued(asOf);
  const overdueLoans = A.DB.investors.filter(l=>A.loanSchedule(l,asOf).overdue);

  return `
  <div class="grid-cards">
    ${statCard('Автомобілів всього', A.DB.cars.length)}
    ${statCard('В роботі', openCars.length)}
    ${statCard('Закрито', closedCars.length)}
    ${statCard('Остання покупка', lastCar? `${lastCar.vin}<br><span class="muted small">${lastCar.model||''}, ${dealerName(lastCar.dealerId)}</span>` : '—')}
  </div>
  <div class="grid-cards">
    ${statCard('Планова ціна дилерам (рахунки)', money(A.DB.cars.reduce((s,c)=>s+A.carFinance(c).dealerPrice,0)))}
    ${statCard('Планова ціна в Україні (довідково)', money(A.DB.cars.reduce((s,c)=>s+A.carFinance(c).ukrainePrice,0)))}
    ${statCard('Очікуємо від дилерів', money(A.DB.cars.reduce((s,c)=>s+A.carFinance(c).balanceDue,0)))}
  </div>
  <div class="grid-cards">
    ${statCard('Загальна каса (USD)', money(cash.total))}
    ${statCard('Баланс PROCAR', money(cash.procar))}
    ${statCard('Борг перед інвесторами', money(investorDebt))}
    ${statCard('Нараховані відсотки (накопичено)', money(investorInterestAccrued))}
  </div>
  <div class="grid-cards">
    ${statCard('VAT Profit', money(A.vatProfitTotal()))}
    ${statCard('FX Profit/Loss', money(A.fxProfitTotal()), A.fxProfitTotal()<0?'neg':'pos')}
    ${statCard('Фінансовий результат по авто', money(np.carProfitSum - A.DB.cars.reduce((s,c)=>s+A.carEconomics(c,asOf).commission,0)))}
    ${statCard('Чистий прибуток', money(np.total), np.total<0?'neg':'pos')}
  </div>
  <div class="grid-cards">
    ${statCard('Частка Гапонюк Олег (50%)', money(np.total*0.5))}
    ${statCard('Частка Мойсієнко Сергій (50%)', money(np.total*0.5))}
    ${statCard('Прострочені позики', overdueLoans.length)}
    ${statCard('Попереджень активно', warns.length, warns.length?'neg':'pos')}
  </div>

  <div class="card">
    <h3>Гроші по касах</h3>
    <div class="table-wrap"><table><thead><tr><th>Каса</th><th>Залишок</th></tr></thead>
    <tbody>${A.DB.cashboxes.map(c=>`<tr><td>${esc(c.name)}</td><td>${money(A.cashboxBalance(c.id, asOf))}</td></tr>`).join('')}</tbody></table></div>
  </div>

  <div class="card">
    <h3>Cash Flow Forecast</h3>
    <div class="table-wrap"><table><thead><tr>${[7,30,60,90,120].map(h=>`<th>${h} дн.</th>`).join('')}</tr></thead>
    <tbody><tr>${[7,30,60,90,120].map(h=>`<td class="${forecast.buckets[h]<0?'neg':''}">${money(forecast.buckets[h])}</td>`).join('')}</tr></tbody></table></div>
    ${forecast.gapDate? `<p class="warn-line">⚠ Прогнозований касовий розрив ${money(forecast.gapAmount)} на ${forecast.gapDate}.</p>` : `<p class="ok-line">Касових розривів у прогнозі не виявлено.</p>`}
  </div>

  <div class="card">
    <h3>Фінансові попередження</h3>
    ${warns.length? `<ul class="warn-list">${warns.map(w=>`<li class="lvl-${w.level}">${w.text}</li>`).join('')}</ul>` : `<p class="ok-line">Активних попереджень немає.</p>`}
  </div>

  <div class="card">
    <h3>Останні рухи грошей</h3>
    ${renderCashTable(A.DB.cashTransactions.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10), true)}
  </div>
  `;
}
function totalCashByBox(){
  const asOf = state.asOf;
  const total = A.totalCash(asOf);
  const procarBox = A.DB.cashboxes.find(c=>c.name.toUpperCase().includes('PROCAR'));
  const procar = procarBox ? A.cashboxBalance(procarBox.id, asOf) : 0;
  return {total, procar};
}
function statCard(label, value, cls){
  return `<div class="stat-card ${cls||''}"><div class="stat-label">${esc(label)}</div><div class="stat-value">${value}</div></div>`;
}
function dealerName(id){ const d = byId(A.DB.dealers,id); return d?d.name:'—'; }
// Три колонки-ідентифікатори перед VIN у довгих фінансових таблицях — по
// самому VIN авто важко впізнати, з КПК/маркою/моделлю пошук набагато швидший.
function carIdCells(c){
  return `<td>${esc(c.kpk)}</td><td>${esc(c.make)}</td><td>${esc(c.modelName||c.model)}</td><td class="mono">${esc(c.vin)}</td>`;
}
const CAR_ID_HEADERS = '<th>КПК</th><th>Марка</th><th>Модель</th><th>VIN</th>';

/* ---------------- КУПІВЛЯ АВТО ---------------- */
function renderPurchase(){
  const restricted = state.role==='employee';
  const editRecord = state.editing.entity==='cars' ? A.DB.cars.find(c=>c.vin===state.editing.id) : null;
  const rows = A.DB.cars.slice().sort((a,b)=>(b.purchaseDate||'').localeCompare(a.purchaseDate||''));
  return `
  <div class="card">
    <h3>${editRecord?'Редагування авто':'Нове авто'}</h3>
    ${carForm(editRecord, restricted)}
  </div>
  <div class="card">
    <h3>Список автомобілів</h3>
    <div class="table-wrap"><table><thead><tr><th>VIN</th><th>КПК</th><th>Дилер</th><th>Марка/модель</th><th>Дата покупки</th><th>Статус</th><th></th></tr></thead>
    <tbody>${rows.map(c=>`<tr>
      <td class="mono">${esc(c.vin)}</td><td>${esc(c.kpk)}</td><td>${esc(dealerName(c.dealerId))}</td>
      <td>${esc(c.model||((c.make||'')+' '+(c.modelName||'')))}</td><td>${esc(c.purchaseDate)}</td><td>${esc(c.status)}</td>
      <td class="row-actions">
        <button type="button" data-action="edit" data-entity="cars" data-id="${esc(c.vin)}">✎</button>
        <button type="button" data-action="del" data-entity="cars" data-id="${esc(c.vin)}">✕</button>
      </td></tr>`).join('')}</tbody></table></div>
  </div>`;
}

/* ---------------- КАСА ---------------- */
function renderCashTable(rows, compact){
  if(!rows.length) return `<p class="muted">Записів ще немає.</p>`;
  return `<div class="table-wrap"><table><thead><tr><th>Дата</th><th>Тип</th><th>Категорія / напрям</th><th>Сума</th><th>Каса</th><th>Касир</th>${compact?'':'<th>Примітка</th><th></th>'}</tr></thead>
  <tbody>${rows.map(t=>`<tr>
    <td>${esc(t.date)}</td>
    <td>${t.type==='income'?'Прихід':t.type==='expense'?'Видаток':'Переміщення'}</td>
    <td>${t.type==='transfer'? `${esc(cashboxName(t.fromCashboxId))} → ${esc(cashboxName(t.toCashboxId))}` : esc(t.category)}</td>
    <td class="${t.type==='expense'?'neg':t.type==='income'?'pos':''}">${money(t.amount)}</td>
    <td>${t.type==='transfer'?'—':esc(cashboxName(t.cashboxId))}</td>
    <td>${esc(t.cashier)}</td>
    ${compact?'':`<td>${esc(t.note)}</td><td class="row-actions">
      <button type="button" data-action="edit" data-entity="cashTransactions" data-id="${esc(t.id)}">✎</button>
      <button type="button" data-action="del" data-entity="cashTransactions" data-id="${esc(t.id)}">✕</button>
    </td>`}
  </tr>`).join('')}</tbody></table></div>`;
}
function cashboxName(id){ const c = byId(A.DB.cashboxes,id); return c?c.name:'—'; }
// Компактна підказка "скільки ще треба на PROCAR по кожному VIN" — щоб було
// видно одразу над формою розподілу, без переключення на вкладку PROCAR/VAT.
function procarNeedHint(){
  const rows = A.DB.cars.map(c=>({c, st:A.carProcarStatus(c)}));
  if(!rows.length) return '';
  return `<div class="card procar-hint">
    <h4>Скільки ще треба перерахувати на PROCAR по кожному авто</h4>
    <div class="table-wrap"><table><thead><tr><th>VIN</th><th>Потрібно PROCAR</th><th>Вже переказано</th><th>Залишок</th></tr></thead>
    <tbody>${rows.map(({c,st})=>`<tr class="${st.procarRemaining>0.01?'row-crit':''}">
      <td class="mono">${esc(c.vin)}</td><td>${money(st.procarNeeded)}</td><td>${money(st.procarPaid)}</td>
      <td class="${st.procarRemaining>0.01?'neg':'pos'}">${money(st.procarRemaining)}</td>
    </tr>`).join('')}</tbody></table></div>
  </div>`;
}
function renderCash(){
  const editRecord = state.editing.entity==='cashTransactions' ? byId(A.DB.cashTransactions, state.editing.id) : null;
  const rows = A.DB.cashTransactions.slice().sort((a,b)=>b.date.localeCompare(a.date));
  return `
  <div class="card"><h3>${editRecord?'Редагування операції':'Нова операція каси'}</h3>${cashForm(editRecord)}</div>
  <div class="card"><h3>Журнал КАСА</h3>${renderCashTable(rows,false)}</div>
  `;
}

/* ---------------- ІНВЕСТОРИ ---------------- */
function renderInvestors(){
  const asOf = state.asOf;
  const rows = A.DB.investors.map(l=>{
    const s = A.loanSchedule(l, asOf);
    const allocated = A.totalInvestorAllocForVin ? A.DB.investorAllocations.filter(a=>a.loanId===l.id).reduce((sum,a)=>sum+num(a.amount),0) : 0;
    return {l,s,allocated};
  });
  return `
  <div class="card"><h3>Нова позика інвестора</h3>${crudFormAuto(DEFS.investors)}</div>
  <div class="card">
    <h3>Позики інвесторів</h3>
    <div class="table-wrap"><table><thead><tr>
      <th>ID</th><th>Інвестор</th><th>Дата</th><th>Сума</th><th>Ставка</th><th>План повернення</th>
      <th>Залишок тіла</th><th>Нараховано %</th><th>Виплачено %</th><th>Вільно (не закріплено)</th><th>Статус</th><th></th>
    </tr></thead><tbody>
    ${rows.map(({l,s,allocated})=>`<tr class="${s.overdue?'row-crit':''}">
      <td class="mono">${esc(l.id)}</td><td>${esc(l.investor)}</td><td>${esc(l.date)}</td>
      <td>${money(l.amount)}</td><td>${pct(l.ratePct)}</td><td>${esc(l.plannedReturnDate)}</td>
      <td>${money(s.balance)}</td><td>${money(s.interestAccrued)}</td><td>${money(s.interestPaidOut)}</td>
      <td>${money(Math.max(0,s.balance-allocated))}</td>
      <td>${s.balance<=0.01?'Погашено':s.overdue?'Прострочено':'Активна'}</td>
      <td class="row-actions"><button type="button" data-action="edit" data-entity="investors" data-id="${esc(l.id)}">✎</button>
      <button type="button" data-action="del" data-entity="investors" data-id="${esc(l.id)}">✕</button></td>
    </tr>`).join('')}
    </tbody></table></div>
  </div>
  <div class="card">
    <h3>Розподіл коштів інвесторів по VIN</h3>
    <p class="hint">Один внесок може фінансувати кілька авто; один VIN може фінансуватись кількома інвесторами. Розподіл — вручну.</p>
    ${procarNeedHint()}
    ${crudFormAuto(DEFS.investorAllocations)}
    ${crudTable(DEFS.investorAllocations, [
      {label:'Позика', render:r=>esc(r.loanId)},
      {label:'VIN', render:r=>esc(r.vin)},
      {label:'Сума', render:r=>money(r.amount)},
      {label:'Дата', render:r=>esc(r.date)},
    ])}
  </div>`;
}

/* ---------------- ПОГАШЕННЯ ---------------- */
function renderRepayments(){
  return `
  <div class="card"><h3>Часткове / повне погашення позики</h3>
  <p class="hint">Разом з поверненням тіла автоматично «закривається» накопичений на цю дату відсоток (нараховується/показується у вкладці «Інвестори»).</p>
  ${crudFormAuto(DEFS.investorRepayments)}
  ${crudTable(DEFS.investorRepayments, [
    {label:'Позика', render:r=>esc(r.loanId)},
    {label:'Дата', render:r=>esc(r.date)},
    {label:'Сума тіла', render:r=>money(r.principalAmount)},
  ])}
  </div>`;
}

/* ---------------- ФІНАНСУВАННЯ ---------------- */
function renderFinancing(){
  const asOf = state.asOf;
  const rows = A.DB.cars.map(c=>({c, fin:A.carFinance(c)}));
  return `
  <div class="card">
    <h3>Планове / фактичне фінансування по VIN</h3>
    <p class="hint">Планове фінансування = (потреба у фінансуванні) × ${A.DB.settings.standardMonthlyRatePct}%/міс × ${A.DB.settings.standardFinancingMonths} міс. Розраховується на ПЛАН-значеннях витрат, тому не зростає, якщо факт дорожчий (п.12 ТЗ), але зменшується при додаткових авансах дилера (п.10-11).</p>
    <div class="table-wrap"><table><thead><tr>
      ${CAR_ID_HEADERS}<th>База фінансування</th><th>Аванс дилера</th><th>Потреба у фінансуванні</th>
      <th>Планове фінансування</th><th>Економія від авансу</th><th>Факт. вартість інв. коштів</th><th>Різниця (план−факт)</th>
      <th>Ціна дилеру (рахунок)</th><th>Ціна в Україні (довідково)</th>
    </tr></thead><tbody>
    ${rows.map(({c,fin})=>{
      const {actualInvestorCost} = A.carActualInvestorCost(c, asOf);
      const diff = fin.plannedFinancingCost - actualInvestorCost;
      return `<tr>${carIdCells(c)}<td>${money(fin.financingBase)}</td><td>${money(fin.totalAdvance)}</td>
      <td>${money(fin.neededFinancing)}</td><td>${money(fin.plannedFinancingCost)}</td><td>${money(fin.financingEconomy)}</td>
      <td>${money(actualInvestorCost)}</td><td class="${diff<0?'neg':'pos'}">${money(diff)}</td>
      <td>${money(fin.dealerPrice)}</td><td class="muted">${money(fin.ukrainePrice)}</td></tr>`;
    }).join('')}
    </tbody></table></div>
  </div>`;
}

/* ---------------- ЕКОНОМІКА АВТО ---------------- */
function renderEconomics(){
  const asOf = state.asOf;
  const rows = A.DB.cars.map(c=>({c, eco:A.carEconomics(c, asOf)}));
  return `
  <div class="card">
    <h3>Економіка кожного автомобіля</h3>
    <p class="hint">«Ціна дилеру» — це те, що ми виставляємо в рахунку (без розмитнення/сертифікації/МРЕО — дилер оплачує їх сам, напряму). «Ціна в Україні» — довідкова сума «під ключ» з урахуванням цих трьох статей, для рішення дилера про купівлю.</p>
    <div class="table-wrap"><table><thead><tr>
      ${CAR_ID_HEADERS}<th>Дилер</th><th>Усі витрати (план)</th><th>Ціна дилеру (рахунок)</th><th>Ціна в Україні (довідково)</th><th>Отримано</th><th>Борг дилера</th>
      <th>Комісія AP</th><th>Фінрезультат</th><th>Прибуток по авто</th><th>Прострочено</th>
    </tr></thead><tbody>
    ${rows.map(({c,eco})=>`<tr class="${eco.isOverdue?'row-crit':''}">
      ${carIdCells(c)}<td>${esc(dealerName(c.dealerId))}</td>
      <td>${money(eco.totalCostPlan)}</td><td>${money(eco.dealerPrice)}</td><td class="muted">${money(eco.ukrainePrice)}</td><td>${money(eco.paid)}</td>
      <td class="${eco.balanceDue>0.01?'neg':''}">${money(eco.balanceDue)}</td>
      <td>${money(eco.commission)}</td>
      <td class="${eco.financeResult<0?'neg':'pos'}">${money(eco.financeResult)}</td>
      <td class="${eco.carProfit<0?'neg':'pos'}">${money(eco.carProfit)}</td>
      <td>${eco.isOverdue? eco.overdueDays+' дн.' : '—'}</td>
    </tr>`).join('')}
    </tbody></table></div>
  </div>
  <div class="card">
    <h3>Структура прибутку компанії (наростаючим підсумком)</h3>
    ${(()=>{ const np = A.netProfit(asOf); return `
    <div class="table-wrap"><table>
      <tr><td>Маржа по авто (комісія AP)</td><td>${money(A.DB.cars.reduce((s,c)=>s+A.carEconomics(c,asOf).commission,0))}</td></tr>
      <tr><td>Фінансовий результат (план − факт вартості інв. коштів по VIN)</td><td>${money(A.DB.cars.reduce((s,c)=>s+A.carEconomics(c,asOf).financeResult,0))}</td></tr>
      <tr><td>VAT Profit</td><td>${money(np.vatP)}</td></tr>
      <tr><td>FX Profit/Loss</td><td>${money(np.fxP)}</td></tr>
      <tr><td>Загальні операційні витрати AP</td><td class="neg">−${money(np.opex)}</td></tr>
      <tr><td>Загальнокорпоративні відсотки (не віднесені на VIN)</td><td class="neg">−${money(np.overhead)}</td></tr>
      <tr class="total-row"><td>Чистий прибуток</td><td class="${np.total<0?'neg':'pos'}">${money(np.total)}</td></tr>
      <tr><td>Частка Гапонюк Олег (50%)</td><td>${money(np.total*0.5)}</td></tr>
      <tr><td>Частка Мойсієнко Сергій (50%)</td><td>${money(np.total*0.5)}</td></tr>
    </table></div>`; })()}
  </div>`;
}

/* ---------------- ДИЛЕРИ ---------------- */
function renderDealers(){
  const asOf = state.asOf;
  return `
  <div class="card"><h3>Дилери</h3>${crudFormAuto(DEFS.dealers)}
    <div class="table-wrap"><table><thead><tr>
      <th>Дилер</th><th>Ліміт</th><th>Авто всього</th><th>В роботі</th><th>Закрито</th>
      <th>Аванси (загалом)</th><th>Аванси вільні</th><th>Борг (експозиція)</th><th>Прострочено</th><th>Економія на фінансуванні</th><th></th>
    </tr></thead><tbody>
    ${A.DB.dealers.map(d=>{ const agg = A.dealerAggregates(d, asOf); return `<tr class="${agg.overLimit||agg.overdueAmount>0?'row-crit':''}">
      <td>${esc(d.name)}</td><td>${money(d.creditLimit)}</td><td>${agg.carsCount}</td><td>${agg.openCars}</td><td>${agg.closedCars}</td>
      <td>${money(agg.advanceTotal)}</td><td>${money(agg.advanceFree)}</td>
      <td class="${agg.exposure>0.01?'neg':''}">${money(agg.exposure)}</td>
      <td class="${agg.overdueAmount>0.01?'neg':''}">${money(agg.overdueAmount)}</td>
      <td>${money(agg.financingEconomy)}</td>
      <td class="row-actions"><button type="button" data-action="edit" data-entity="dealers" data-id="${esc(d.id)}">✎</button>
      <button type="button" data-action="del" data-entity="dealers" data-id="${esc(d.id)}">✕</button></td>
    </tr>`; }).join('')}
    </tbody></table></div>
  </div>
  <div class="card"><h3>Аванси дилерів</h3>
    <p class="hint">Аванс потрапляє на загальний баланс дилера; закріплення за конкретним VIN — окремою таблицею нижче.</p>
    ${crudFormAuto(DEFS.dealerAdvances)}
    ${crudTable(DEFS.dealerAdvances, [
      {label:'Дилер', render:r=>esc(dealerName(r.dealerId))},
      {label:'Дата', render:r=>esc(r.date)},
      {label:'Сума', render:r=>money(r.amount)},
      {label:'Примітка', render:r=>esc(r.note)},
    ])}
  </div>
  <div class="card"><h3>Закріплення авансу за VIN</h3>
    ${procarNeedHint()}
    ${crudFormAuto(DEFS.dealerAdvanceAllocations)}
    ${crudTable(DEFS.dealerAdvanceAllocations, [
      {label:'Аванс', render:r=>esc(r.advanceId)},
      {label:'VIN', render:r=>esc(r.vin)},
      {label:'Сума', render:r=>money(r.amount)},
      {label:'Дата', render:r=>esc(r.date)},
    ])}
  </div>
  <div class="card"><h3>Остаточні оплати дилера по VIN</h3>
    ${crudFormAuto(DEFS.dealerPayments)}
    ${crudTable(DEFS.dealerPayments, [
      {label:'Дилер', render:r=>esc(dealerName(r.dealerId))},
      {label:'VIN', render:r=>esc(r.vin)},
      {label:'Дата', render:r=>esc(r.date)},
      {label:'Сума', render:r=>money(r.amount)},
    ])}
  </div>`;
}

/* ---------------- PROCAR / VAT ---------------- */
function renderProcar(){
  const asOf = state.asOf;
  const procarBox = A.DB.cashboxes.find(c=>c.name.toUpperCase().includes('PROCAR'));
  const bal = procarBox ? A.cashboxBalance(procarBox.id, asOf) : 0;
  return `
  <div class="grid-cards">
    ${statCard('Баланс PROCAR', money(bal))}
    ${statCard('VAT Profit (накопичено)', money(A.vatProfitTotal()))}
  </div>
  <div class="card">
    <h3>Переміщення коштів (Основна каса ↔ PROCAR)</h3>
    <p class="hint">Це внутрішній рух грошей — використовуйте вкладку «КАСА», операцію «Переміщення між касами» з/у «PROCAR».</p>
  </div>
  <div class="card">
    <h3>Розрахунок VAT (повернення) по аукціонах</h3>
    <p class="hint">База VAT — чиста вартість авто в KRW без комісій. Ставки за замовчуванням: AutoBell 2,05%, LotteRental / AutoHub 4,10% (редагуються у «Довідниках»).</p>
    ${crudFormAuto(DEFS.vatRecords)}
    <div class="table-wrap"><table><thead><tr>
      <th>VIN</th><th>Аукціон</th><th>Чиста вартість, KRW</th><th>Ставка VAT</th><th>VAT, KRW</th><th>VAT, $</th><th>Реалізовано</th><th></th>
    </tr></thead><tbody>
    ${A.DB.vatRecords.map(v=>`<tr>
      <td class="mono">${esc(v.vin)}</td><td>${esc(v.auction)}</td><td>${num(v.netKRW).toLocaleString('uk-UA')}</td>
      <td>${pct(v.vatRatePct)}</td><td>${num(v.vatKRW).toLocaleString('uk-UA')}</td><td>${money(v.vatUSD)}</td>
      <td>${v.realized?'так':'ні'}</td>
      <td class="row-actions"><button type="button" data-action="edit" data-entity="vatRecords" data-id="${esc(v.id)}">✎</button>
      <button type="button" data-action="del" data-entity="vatRecords" data-id="${esc(v.id)}">✕</button></td>
    </tr>`).join('')}
    </tbody></table></div>
    <p class="hint">Собівартість до VAT → VAT повернення → економічна собівартість після VAT: VAT показується окремим рядком (VAT Profit), а не «ховається» всередині зменшеної собівартості авто.</p>
  </div>`;
}

/* ---------------- ПЛАТЕЖІ КОРЕЯ ---------------- */
function renderKorea(){
  return `
  <div class="card">
    <h3>SWIFT / USDT платежі в Корею</h3>
    ${crudFormAuto(DEFS.koreaPayments)}
    ${crudTable(DEFS.koreaPayments, [
      {label:'Дата', render:r=>esc(r.date)},
      {label:'Спосіб', render:r=>esc(r.method)},
      {label:'Відправлено', render:r=>money(r.amount)+' '+esc(r.currency||'')},
      {label:'Комісії разом', render:r=>money(num(r.bankFeeLocal)+num(r.correspondentFee)+num(r.koreanBankFee))},
      {label:'Отримав PROCAR', render:r=>money(r.actualReceivedPROCAR)},
    ])}
  </div>
  <div class="card">
    <h3>Розподіл одного платежу на кілька VIN</h3>
    <p class="hint">Комісії розподіляються пропорційно вказаним часткам платежу.</p>
    ${crudFormAuto(DEFS.koreaPaymentAllocations)}
    <div class="table-wrap"><table><thead><tr><th>Платіж</th><th>VIN</th><th>Частка</th><th>Частка комісії</th><th></th></tr></thead>
    <tbody>${A.DB.koreaPaymentAllocations.map(a=>{
      const p = byId(A.DB.koreaPayments, a.paymentId);
      const totalFee = p ? num(p.bankFeeLocal)+num(p.correspondentFee)+num(p.koreanBankFee) : 0;
      const feeShare = totalFee * num(a.sharePct)/100;
      return `<tr><td>${esc(a.paymentId)}</td><td class="mono">${esc(a.vin)}</td><td>${pct(a.sharePct)}</td><td>${money(feeShare)}</td>
      <td class="row-actions"><button type="button" data-action="edit" data-entity="koreaPaymentAllocations" data-id="${esc(a.id)}">✎</button>
      <button type="button" data-action="del" data-entity="koreaPaymentAllocations" data-id="${esc(a.id)}">✕</button></td></tr>`;
    }).join('')}</tbody></table></div>
  </div>`;
}

/* ---------------- ВАЛЮТИ ---------------- */
function renderCurrency(){
  return `
  <div class="grid-cards">${statCard('FX Profit / Loss (накопичено)', money(A.fxProfitTotal()), A.fxProfitTotal()<0?'neg':'pos')}</div>
  <div class="card">
    <h3>Операції з валютою</h3>
    <p class="hint">«Купівля» дешевше за референсний курс і «продаж» дорожче — дає позитивний FX-результат.</p>
    ${crudFormAuto(DEFS.fxTransactions)}
    ${crudTable(DEFS.fxTransactions, [
      {label:'Дата', render:r=>esc(r.date)},
      {label:'Операція', render:r=>r.direction==='buy'?'Купівля':'Продаж'},
      {label:'Пара', render:r=>esc(r.fromCurrency)+' → '+esc(r.toCurrency)},
      {label:'Сума', render:r=>money(r.amount)},
      {label:'Факт. курс', render:r=>num(r.actualRate).toFixed(4)},
      {label:'Референс', render:r=>num(r.referenceRate).toFixed(4)},
      {label:'Результат', render:r=>{ const diff=(num(r.referenceRate)-num(r.actualRate))*num(r.amount)*(r.direction==='sell'?-1:1); return `<span class="${diff<0?'neg':'pos'}">${money(diff)}</span>`; }},
    ])}
  </div>`;
}

/* ---------------- CASH FLOW ---------------- */
function renderCashflow(){
  const asOf = state.asOf;
  const f = A.cashFlowForecast(asOf);
  return `
  <div class="card">
    <h3>Прогноз ліквідності від ${esc(asOf)}</h3>
    <p class="hint">Поточні гроші + майбутні оплати дилерів + очікуваний VAT + інші заплановані надходження − повернення інвесторам − відсотки − заплановані витрати.</p>
    <div class="table-wrap"><table><thead><tr><th>Горизонт</th><th>Прогнозований залишок</th></tr></thead>
    <tbody>${[7,30,60,90,120].map(h=>`<tr><td>${h} днів</td><td class="${f.buckets[h]<0?'neg':'pos'}">${money(f.buckets[h])}</td></tr>`).join('')}</tbody></table></div>
    ${f.gapDate? `<p class="warn-line">⚠ Касовий розрив ${money(f.gapAmount)} прогнозується на ${f.gapDate}.</p>` : `<p class="ok-line">Розривів не виявлено в межах запланованих подій.</p>`}
  </div>
  <div class="card">
    <h3>Заплановані ручні статті (не відображені автоматично)</h3>
    <p class="hint">Наприклад: зарплата, оренда, реклама, податки — регулярні платежі, яких немає в інших модулях.</p>
    ${crudFormAuto(DEFS.plannedCashFlowItems)}
    ${crudTable(DEFS.plannedCashFlowItems, [
      {label:'Дата', render:r=>esc(r.date)},
      {label:'Тип', render:r=>r.type==='in'?'Надходження':'Витрата'},
      {label:'Сума', render:r=>money(r.amount)},
      {label:'Опис', render:r=>esc(r.note)},
    ])}
  </div>
  <div class="card">
    <h3>Врахований потік подій (автоматично обчислені)</h3>
    <div class="table-wrap"><table><thead><tr><th>Дата</th><th>Сума</th></tr></thead>
    <tbody>${f.events.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(e=>`<tr><td>${esc(e.date)}</td><td class="${e.amount<0?'neg':'pos'}">${money(e.amount)}</td></tr>`).join('')}</tbody></table></div>
  </div>`;
}

/* ---------------- КОНТРОЛЬ ---------------- */
function renderControl(){
  const asOf = state.asOf;
  const warns = A.computeWarnings(asOf);
  return `
  <div class="card">
    <h3>Перевірка каси: розрахунковий vs фактичний залишок</h3>
    ${crudFormAuto(DEFS.cashChecks)}
    <div class="table-wrap"><table><thead><tr><th>Каса</th><th>Дата</th><th>Розрахунково</th><th>Фактично</th><th>Різниця</th><th></th></tr></thead>
    <tbody>${A.DB.cashChecks.map(ch=>{
      const calc = A.cashboxBalance(ch.cashboxId, ch.date);
      const diff = num(ch.actualBalance)-calc;
      return `<tr class="${Math.abs(diff)>0.01?'row-crit':''}"><td>${esc(cashboxName(ch.cashboxId))}</td><td>${esc(ch.date)}</td>
      <td>${money(calc)}</td><td>${money(ch.actualBalance)}</td><td class="${diff<0?'neg':diff>0?'pos':''}">${money(diff)}</td>
      <td class="row-actions"><button type="button" data-action="edit" data-entity="cashChecks" data-id="${esc(ch.id)}">✎</button>
      <button type="button" data-action="del" data-entity="cashChecks" data-id="${esc(ch.id)}">✕</button></td></tr>`;
    }).join('')}</tbody></table></div>
  </div>
  <div class="card">
    <h3>Усі активні попередження</h3>
    ${warns.length? `<ul class="warn-list">${warns.map(w=>`<li class="lvl-${w.level}">${w.text}</li>`).join('')}</ul>` : `<p class="ok-line">Попереджень немає.</p>`}
  </div>`;
}

/* ---------------- ДОВІДНИКИ ---------------- */
function renderReference(){
  const s = A.DB.settings;
  return `
  <div class="card">
    <h3>Загальні ставки та терміни</h3>
    <form data-action="settingsForm" class="inline-form">
      <label>Стандартна ставка, %/міс<input type="number" step="0.01" name="standardMonthlyRatePct" value="${s.standardMonthlyRatePct}"></label>
      <label>Стандартний термін фінансування, міс<input type="number" step="0.1" name="standardFinancingMonths" value="${s.standardFinancingMonths}"></label>
      <label>Плановий термін інвестиції, днів<input type="number" step="1" name="investmentTermDays" value="${s.investmentTermDays}"></label>
      <label>Термін оплати дилером, днів<input type="number" step="1" name="dealerPaymentDueDays" value="${s.dealerPaymentDueDays}"></label>
      <div class="form-actions"><button type="submit" class="btn-primary">Зберегти</button></div>
    </form>
  </div>
  <div class="card">
    <h3>Аукціони та ставки VAT</h3>
    ${crudFormAuto(DEFS.auctions)}
    ${crudTable(DEFS.auctions, [
      {label:'Аукціон', render:r=>esc(r.id)},
      {label:'Ставка VAT', render:r=>pct(r.vatRatePct)},
    ])}
  </div>
  <div class="card">
    <h3>Каси / місця зберігання грошей</h3>
    ${crudFormAuto(DEFS.cashboxes)}
    <div class="table-wrap"><table><thead><tr><th>Назва</th><th>Поточний залишок</th></tr></thead>
    <tbody>${A.DB.cashboxes.map(c=>`<tr><td>${esc(c.name)}</td><td>${money(A.cashboxBalance(c.id, state.asOf))}</td></tr>`).join('')}</tbody></table></div>
  </div>
  <div class="card">
    <h3>Засновники</h3>
    <table><tr><td>Гапонюк Олег</td><td>50%</td></tr><tr><td>Мойсієнко Сергій</td><td>50%</td></tr></table>
    <p class="hint">Кошти, які засновники вносять особисто, обліковуються як звичайна інвесторська позика (вкладка «Інвестори») — на них нараховується інвесторський відсоток, вони не є безкоштовним капіталом.</p>
  </div>`;
}

/* ---------------- ШЕЛЛ / НАВІГАЦІЯ ---------------- */
function shell(content){
  const visibleTabs = TABS.filter(t=>t.roles.includes(state.role));
  if(!visibleTabs.some(t=>t.id===state.tab)) state.tab = visibleTabs[0].id;
  return `
  <header class="topbar">
    <div class="topbar-title">
      <div class="eyebrow">AP DEALERS HUB</div>
      <h1>Фінансова модель</h1>
    </div>
    <div class="topbar-controls">
      <label class="tiny-label">Роль
        <select data-role-select>${Object.entries(ROLE_LABELS).map(([v,l])=>`<option value="${v}" ${state.role===v?'selected':''}>${esc(l)}</option>`).join('')}</select>
      </label>
      <label class="tiny-label">Дата (на яку рахувати)
        <input type="date" data-asof value="${esc(state.asOf)}">
      </label>
      <button type="button" data-action="exportJson">Експорт даних (.json)</button>
      <label class="btn-file">Імпорт даних (.json)<input type="file" accept="application/json" data-import></label>
      <button type="button" data-action="resetSeed">Приклад з ТЗ</button>
      <button type="button" data-action="resetEmpty">Почати з нуля</button>
    </div>
  </header>
  <nav class="tabs">
    ${visibleTabs.map(t=>`<button type="button" class="tab-btn ${state.tab===t.id?'active':''}" data-action="switchTab" data-tab="${t.id}">${t.label}</button>`).join('')}
  </nav>
  <main class="content">${content}</main>
  `;
}

function renderTab(){
  switch(state.tab){
    case 'dashboard': return renderDashboard();
    case 'purchase': return renderPurchase();
    case 'cash': return renderCash();
    case 'investors': return renderInvestors();
    case 'repayments': return renderRepayments();
    case 'financing': return renderFinancing();
    case 'economics': return renderEconomics();
    case 'dealers': return renderDealers();
    case 'procar': return renderProcar();
    case 'korea': return renderKorea();
    case 'currency': return renderCurrency();
    case 'cashflow': return renderCashflow();
    case 'control': return renderControl();
    case 'reference': return renderReference();
    default: return '';
  }
}

function render(){
  const root = document.getElementById('app');
  root.innerHTML = shell(renderTab());
}

/* ---------------- ІНІЦІАЛІЗАЦІЯ ТА ДЕЛЕГУВАННЯ ПОДІЙ ---------------- */
function init(){
  A.DB = A.loadDB();
  const root = document.getElementById('app');

  root.addEventListener('submit', e=>{
    const form = e.target.closest('form');
    if(!form) return;
    e.preventDefault();
    if(form.dataset.action==='settingsForm'){
      const s = A.DB.settings;
      s.standardMonthlyRatePct = num(form.elements['standardMonthlyRatePct'].value);
      s.standardFinancingMonths = num(form.elements['standardFinancingMonths'].value);
      s.investmentTermDays = num(form.elements['investmentTermDays'].value);
      s.dealerPaymentDueDays = num(form.elements['dealerPaymentDueDays'].value);
      A.saveDB(); render(); return;
    }
    if(form.dataset.entity){ genericSubmit(form.dataset.entity, form); return; }
  });

  root.addEventListener('click', e=>{
    const btn = e.target.closest('[data-action]');
    if(!btn) return;
    const action = btn.dataset.action;
    if(action==='switchTab'){ state.tab = btn.dataset.tab; render(); return; }
    if(action==='edit'){ state.editing = {entity:btn.dataset.entity, id:btn.dataset.id}; render(); return; }
    if(action==='del'){ genericDelete(btn.dataset.entity, btn.dataset.id); return; }
    if(ACTIONS[action]){ ACTIONS[action](btn); return; }
  });

  root.addEventListener('change', e=>{
    if(e.target.matches('[data-role-select]')){ state.role = e.target.value; state.editing={entity:null,id:null}; render(); return; }
    if(e.target.matches('[data-asof]')){ state.asOf = e.target.value || todayStr(); render(); return; }
    if(e.target.matches('[data-import]')){
      const file = e.target.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try{
          const parsed = JSON.parse(reader.result);
          if(!parsed || !Array.isArray(parsed.cars)) throw new Error('Не схоже на файл цієї моделі');
          A.DB = parsed; A.saveDB(); render();
        }catch(err){ alert('Не вдалося імпортувати файл: '+err.message); }
      };
      reader.readAsText(file);
      return;
    }
  });

  render();
}

document.addEventListener('DOMContentLoaded', init);
})();
