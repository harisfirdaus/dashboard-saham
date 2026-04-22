// Dashboard Kepemilikan Saham >1%
const fmtInt = new Intl.NumberFormat('id-ID');
const fmtDec = new Intl.NumberFormat('id-ID', {minimumFractionDigits:2, maximumFractionDigits:2});

let rawData = [];
let filtered = [];
let sortCol = 'TOTAL_HOLDING_SHARES';
let sortDir = 'desc';
let page = 1;
const pageSize = 20;

let donutChart, barChart;

function parseNumber(str){
  if(typeof str === 'number') return str;
  return parseInt(String(str).replace(/\./g,'').replace(/,/g,''),10) || 0;
}
function parsePercent(str){
  if(typeof str === 'number') return str;
  return parseFloat(String(str).replace(',','.')) || 0;
}

async function loadData(){
  const res = await fetch('./data/data.json');
  const json = await res.json();
  rawData = json.map(d => ({
    ...d,
    _shares: parseNumber(d.TOTAL_HOLDING_SHARES),
    _pct: parsePercent(d.PERCENTAGE),
    _emitenLabel: `${d.SHARE_CODE} - ${d.ISSUER_NAME}`
  }));
  initFilters();
  applyFilters();
}

function initFilters(){
  // Emiten autocomplete
  const emitenInput = document.getElementById('filter-emiten');
  const emitenList = document.getElementById('emiten-list');
  const emitens = [...new Map(rawData.map(d=>[d._emitenLabel, d])).values()]
    .sort((a,b)=>a.SHARE_CODE.localeCompare(b.SHARE_CODE));
  
  function updateEmitenList(q=''){
    emitenList.innerHTML = '<option value="Semua"></option>';
    if(q.length < 2) return;
    const filtered = emitens.filter(e => 
      e.SHARE_CODE.toLowerCase().includes(q.toLowerCase()) ||
      e.ISSUER_NAME.toLowerCase().includes(q.toLowerCase())
    ).slice(0,50);
    filtered.forEach(e=>{
      const opt = document.createElement('option');
      opt.value = e._emitenLabel;
      emitenList.appendChild(opt);
    });
  }
  emitenInput.addEventListener('input', e=>{
    updateEmitenList(e.target.value);
    applyFilters();
  });
  emitenInput.addEventListener('focus', e=> updateEmitenList(e.target.value));

  // Tipe Investor
  const tipeSel = document.getElementById('filter-tipe');
  const types = [...new Set(rawData.map(d=>d.INVESTOR_TYPE).filter(Boolean))].sort();
  tipeSel.innerHTML = '<option>Semua</option>' + types.map(t=>`<option>${t}</option>`).join('');

  // Domisili
  const domSel = document.getElementById('filter-domisili');
  const doms = [...new Set(rawData.map(d=>d.DOMICILE).filter(Boolean))].sort();
  domSel.innerHTML = '<option>Semua</option>' + doms.map(d=>`<option>${d}</option>`).join('');

  // Events
  document.getElementById('filter-asal').addEventListener('change', applyFilters);
  tipeSel.addEventListener('change', applyFilters);
  domSel.addEventListener('change', applyFilters);
  
  const cari = document.getElementById('filter-cari');
  let debounce;
  cari.addEventListener('input', ()=>{
    clearTimeout(debounce);
    debounce = setTimeout(applyFilters, 300);
  });

  document.getElementById('btn-reset').addEventListener('click', ()=>{
    emitenInput.value = '';
    tipeSel.value = 'Semua';
    document.getElementById('filter-asal').value = 'Semua';
    domSel.value = 'Semua';
    cari.value = '';
    sortCol = 'TOTAL_HOLDING_SHARES';
    sortDir = 'desc';
    page = 1;
    applyFilters();
  });

  // Table sort
  document.querySelectorAll('thead th[data-sort]').forEach(th=>{
    th.addEventListener('click', ()=>{
      const col = th.dataset.sort;
      if(sortCol === col){ sortDir = sortDir === 'asc' ? 'desc' : 'asc'; }
      else { sortCol = col; sortDir = 'desc'; }
      page = 1;
      renderTable();
    });
  });
}

function applyFilters(){
  const emitenVal = document.getElementById('filter-emiten').value.trim();
  const tipe = document.getElementById('filter-tipe').value;
  const asal = document.getElementById('filter-asal').value;
  const dom = document.getElementById('filter-domisili').value;
  const cari = document.getElementById('filter-cari').value.trim().toLowerCase();

  filtered = rawData.filter(d=>{
    const matchEmiten = !emitenVal || emitenVal === 'Semua' || d._emitenLabel === emitenVal || d.SHARE_CODE === emitenVal;
    const matchTipe = tipe === 'Semua' || d.INVESTOR_TYPE === tipe;
    const matchAsal = asal === 'Semua' || (asal.includes('(L)') && d.LOCAL_FOREIGN === 'L') || (asal.includes('(A)') && d.LOCAL_FOREIGN === 'A');
    const matchDom = dom === 'Semua' || d.DOMICILE === dom;
    const matchCari = !cari || d.INVESTOR_NAME.toLowerCase().includes(cari);
    return matchEmiten && matchTipe && matchAsal && matchDom && matchCari;
  });

  page = 1;
  updateKPIs();
  updateCharts();
  renderTable();
}

function updateKPIs(){
  const totalEmiten = new Set(filtered.map(d=>d.SHARE_CODE)).size;
  const totalInvestor = new Set(filtered.map(d=>d.INVESTOR_NAME)).size;
  const totalShares = filtered.reduce((s,d)=>s+d._shares,0);
  const avgPct = filtered.length ? filtered.reduce((s,d)=>s+d._pct,0)/filtered.length : 0;

  document.getElementById('kpi-emiten').textContent = fmtInt.format(totalEmiten);
  document.getElementById('kpi-investor').textContent = fmtInt.format(totalInvestor);
  document.getElementById('kpi-shares').textContent = fmtInt.format(totalShares);
  document.getElementById('kpi-avg').textContent = fmtDec.format(avgPct);
}

function updateCharts(){
  // Donut Lokal vs Asing
  const sumL = filtered.filter(d=>d.LOCAL_FOREIGN==='L').reduce((s,d)=>s+d._shares,0);
  const sumA = filtered.filter(d=>d.LOCAL_FOREIGN==='A').reduce((s,d)=>s+d._shares,0);
  
  if(!donutChart){
    const ctx = document.getElementById('chart-donut').getContext('2d');
    Chart.defaults.font.family = "'PT Sans', sans-serif";
    donutChart = new Chart(ctx,{
      type:'doughnut',
      data:{labels:['Lokal','Asing'],datasets:[{data:[sumL,sumA],backgroundColor:['#00599A','#c92b2c'],borderWidth:0}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{usePointStyle:true}},tooltip:{callbacks:{label:(c)=>`${c.label}: ${fmtInt.format(c.parsed)} lembar`}}}}
    });
  } else {
    donutChart.data.datasets[0].data = [sumL,sumA];
    donutChart.update();
  }

  // Bar Top 10
  const cari = document.getElementById('filter-cari').value.trim();
  const barTitle = document.getElementById('bar-title');
  const barSub = document.getElementById('bar-sub');
  let labels=[], values=[];

  if(cari){
    barTitle.textContent = 'Portofolio Terbesar';
    barSub.textContent = 'emiten dengan kepemilikan terbanyak';
    const byEmiten = {};
    filtered.forEach(d=>{
      const key = d._emitenLabel;
      byEmiten[key] = (byEmiten[key]||0)+d._shares;
    });
    const top = Object.entries(byEmiten).sort((a,b)=>b[1]-a[1]).slice(0,10);
    labels = top.map(t=>t[0].length>32?t[0].slice(0,29)+'â€¦':t[0]);
    values = top.map(t=>t[1]);
  } else {
    barTitle.textContent = 'Investor Terbesar';
    barSub.textContent = 'berdasarkan total lembar';
    const byInv = {};
    filtered.forEach(d=>{
      byInv[d.INVESTOR_NAME] = (byInv[d.INVESTOR_NAME]||0)+d._shares;
    });
    const top = Object.entries(byInv).sort((a,b)=>b[1]-a[1]).slice(0,10);
    labels = top.map(t=>t[0].length>32?t[0].slice(0,29)+'â€¦':t[0]);
    values = top.map(t=>t[1]);
  }

  if(!barChart){
    const ctx2 = document.getElementById('chart-bar').getContext('2d');
    barChart = new Chart(ctx2,{
      type:'bar',
      data:{labels,datasets:[{label:'Jumlah Saham',data:values,backgroundColor:'#00599A',borderRadius:6}]},
      options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:(c)=>fmtInt.format(c.parsed.x)+' lembar'}}},scales:{x:{ticks:{callback:v=>fmtInt.format(v)}},y:{ticks:{autoSkip:false}}}}
    });
  } else {
    barChart.data.labels = labels;
    barChart.data.datasets[0].data = values;
    barChart.update();
  }
}

function renderTable(){
  const tbody = document.getElementById('tbody');
  const info = document.getElementById('page-info');
  const prev = document.getElementById('prev');
  const next = document.getElementById('next');

  if(filtered.length===0){
    tbody.innerHTML = `<tr><td colspan="7" class="empty">Tidak ada data</td></tr>`;
    info.textContent = '0 dari 0';
    prev.disabled = next.disabled = true;
    return;
  }

  // sort
  const sorted = [...filtered].sort((a,b)=>{
    let va, vb;
    switch(sortCol){
      case 'EMITEN': va=a._emitenLabel; vb=b._emitenLabel; break;
      case 'INVESTOR': va=a.INVESTOR_NAME; vb=b.INVESTOR_NAME; break;
      case 'TIPE': va=a.INVESTOR_TYPE; vb=b.INVESTOR_TYPE; break;
      case 'LA': va=a.LOCAL_FOREIGN; vb=b.LOCAL_FOREIGN; break;
      case 'DOMISILI': va=a.DOMICILE; vb=b.DOMICILE; break;
      case 'TOTAL_HOLDING_SHARES': va=a._shares; vb=b._shares; break;
      case 'PERCENTAGE': va=a._pct; vb=b._pct; break;
      default: va='';vb='';
    }
    if(typeof va === 'string') return sortDir==='asc'? va.localeCompare(vb): vb.localeCompare(va);
    return sortDir==='asc'? va-vb : vb-va;
  });

  const total = sorted.length;
  const pages = Math.ceil(total/pageSize);
  if(page>pages) page=pages;
  const start = (page-1)*pageSize;
  const end = Math.min(start+pageSize, total);
  const slice = sorted.slice(start,end);

  tbody.innerHTML = slice.map(d=>{
    const highlight = d._pct>50 ? 'highlight' : '';
    return `<tr class="${highlight}">
      <td>${d._emitenLabel}</td>
      <td>${d.INVESTOR_NAME}</td>
      <td>${d.INVESTOR_TYPE||''}</td>
      <td><span class="pill ${d.LOCAL_FOREIGN}">${d.LOCAL_FOREIGN==='L'?'L':'A'}</span></td>
      <td>${d.DOMICILE||''}</td>
      <td class="right">${fmtInt.format(d._shares)}</td>
      <td class="right">${fmtDec.format(d._pct)}</td>
    </tr>`;
  }).join('');

  info.textContent = `${fmtInt.format(start+1)}â€“${fmtInt.format(end)} dari ${fmtInt.format(total)} data`;
  prev.disabled = page<=1;
  next.disabled = page>=pages;
  prev.onclick = ()=>{page--; renderTable();};
  next.onclick = ()=>{page++; renderTable();};

  // update sort indicators
  document.querySelectorAll('thead th').forEach(th=>{
    th.textContent = th.textContent.replace(/ [â–²â–¼]$/,'');
    if(th.dataset.sort===sortCol){
      th.textContent += sortDir==='asc'?' â–²':' â–¼';
    }
  });
}

document.addEventListener('DOMContentLoaded', loadData);