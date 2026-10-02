import { gmgnLabels } from "../../shared/analysis/gmgn";

export const GMGN_READ_SCRIPT = `(() => {
  const root=document.querySelector('#GlobalScrollDomId');
  if(!root) throw new Error('Карточка GMGN ещё не загрузилась.');
  const clean=e=>(e?.innerText||'').replace(/[\\uE000-\\uF8FF]/g,'').trim();
  const aliases=${JSON.stringify(gmgnLabels)};
  const matches=(value,label)=>(aliases[label]||[label]).includes(value);
  const info={};
  for(const label of ['Top 10','Holders','Snipers','DEV','Total Fees']) {
    const rows=[...root.querySelectorAll('[data-sentry-component="InfoItem"]')].filter(e=>matches(clean(e.querySelector('.info-item-title')),label));
    info[label]=rows.length===1?clean(rows[0].querySelector('.info-item-value')):'';
  }
  const visible=e=>e.getClientRects().length>0&&getComputedStyle(e).visibility==='visible';
  const sniperRows=[...root.querySelectorAll('[data-sentry-component="InfoItem"], [data-sentry-component="CommonItemView"]')].filter(e=>visible(e)&&matches(clean(e.querySelector('.info-item-title, .item-title-cn')),'Snipers'));
  const sniperValues=[...new Set(sniperRows.map(e=>clean(e.querySelector('.info-item-value, [data-sentry-component="renderSnipers"]'))).filter(Boolean))];
  info.Snipers=sniperValues.length===1?sniperValues[0]:'';
  const risk={};
  for(const label of ['Bundler','Phishing']) {
    const labels=[...root.querySelectorAll('.item-title')].filter(e=>matches(clean(e),label));
    risk[label]=labels.length===1?clean(labels[0].parentElement?.parentElement?.querySelector('.item-value')):'';
  }
  const pool={};
  for(const label of ['Market cap','Token created','Pool created','Total liq','Holders']) {
    const rows=[...root.querySelectorAll('[data-sentry-component="PoolItem"]')].filter(e=>matches(clean(e.firstElementChild),label));
    pool[label]=rows.length===1?clean(rows[0].lastElementChild):'';
  }
  if(!pool['Market cap']) {
    const caps=[...root.querySelectorAll('[data-sentry-component="BaseInfoBar"] [data-sentry-component="InfoItem"]')].filter(e=>!e.querySelector('.info-item-title'));
    if(caps.length===1) pool['Market cap']=clean(caps[0].querySelector('.info-item-value'));
  }
  const volLabels=[...root.querySelectorAll('span')].filter(e=>['Vol','Объём','Объем'].includes(clean(e)));
  const periodLabels=[...root.querySelectorAll('span')].filter(e=>['1m','5m','1h','24h'].includes(clean(e))&&e.parentElement?.classList.contains('bg-card-100'));
  const fees=[...root.querySelectorAll('[data-sentry-component="InfoItem"]')].filter(e=>clean(e.querySelector('.info-item-title'))==='Total Fees');
  const eyes=[...root.querySelectorAll('[data-sentry-component="BaseInfoBar"] [data-icon="IconDisplay16pxRegular"]')].filter(e=>e.getClientRects().length>0&&getComputedStyle(e).visibility==='visible');
  const panel=root.querySelector('[id$="panel-holders"]');
  const activePanel=panel&&panel.getClientRects().length>0;
  const holderCells=activePanel?[...panel.querySelectorAll('[data-testid="table-cell-holder"]')]:[];
  const holders=holderCells.slice(0,200).map(cell=>{
    const row=cell.parentElement;
    const links=[...cell.querySelectorAll('a[href^="/sol/address/"],a[href^="/bsc/address/"],a[href^="/eth/address/"],a[href^="/base/address/"],a[href^="/robinhood/address/"]')];
    const addresses=[...new Set(links.map(a=>a.getAttribute('href').split('/').pop()))];
    return {address:addresses.length===1?addresses[0]:'', tags:[...cell.querySelectorAll('[data-testid^="user-tag-"]')].map(e=>e.getAttribute('data-testid').replace('user-tag-','')),
      unrealized:clean(row?.querySelector('[data-testid="table-cell-unrealized"]')),
      remaining:clean(row?.querySelector('[data-testid="table-cell-owned"]'))};
  });
  return {url:location.href,tokenLinks:[...root.querySelectorAll('a[href*="solscan.io/token/"],a[href*="bscscan.com/token/"],a[href*="etherscan.io/token/"],a[href*="basescan.org/token/"],a[href*="robin.etherscan.io/token/"]')].map(e=>e.href),info,risk,pool,
    poolLinks:[...root.querySelectorAll('[data-sentry-component="PoolInfo"] a[href]')].map(e=>e.href).slice(0,100),
    watchersText:eyes.length===1?clean(eyes[0].nextElementSibling):'',
    holders,holdersState:!activePanel?'unavailable':holderCells.length?'partial':clean(panel).includes('No Data')?'empty':'unavailable',
    tooltips:[...document.querySelectorAll('[role="tooltip"]')].filter(e=>e.getClientRects().length>0&&getComputedStyle(e).visibility==='visible'&&getComputedStyle(e).opacity!=='0').map(clean).slice(0,20),
    volumeText:volLabels.length===1?clean(volLabels[0].nextElementSibling):'',volumePeriod:periodLabels.length===1?clean(periodLabels[0]):'',
    feeIcon:fees.length===1?(fees[0].querySelector('[data-icon]')?.getAttribute('data-icon')||''):''};
})()`;
