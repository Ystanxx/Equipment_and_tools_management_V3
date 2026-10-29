const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function setup() {
  const callbacks = {};
  const elements = {app: {innerHTML:'', childElementCount:0}};
  const storage = () => { const data = new Map(); return {getItem:k=>data.get(k)||null, setItem:(k,v)=>data.set(k,v), removeItem:k=>data.delete(k)}; };
  const context = vm.createContext({console, URLSearchParams, Date, setTimeout, clearTimeout,
    AbortController, DOMException, CustomEvent:class {},
    sessionStorage:storage(), localStorage:storage(),
    Utils:{escapeHtml:s=>String(s ?? ''), svgIcon:()=>''},
    window:{location:{protocol:'http:',hash:'#dashboard'}, scrollY:0, scrollTo(){}, innerWidth:1200,
      addEventListener:(n,f)=>callbacks[n]=f, setInterval:()=>1, dispatchEvent(){}},
    clearInterval(){},
    document:{hidden:false, addEventListener:(n,f)=>callbacks[n]=f, querySelectorAll:()=>[], querySelector:()=>null,
      getElementById:id=>elements[id], activeElement:null, body:{appendChild(){}},
      createElement:()=>({classList:{add(){},remove(){}},innerHTML:''})},
  });
  for(const file of ['api.js','router.js','dashboard.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',file),'utf8'),context);
  const evaluate = code=>vm.runInContext(code,context);
  context.Api = evaluate('Api'); context.Router = evaluate('Router');
  context.Api.setToken('fixture-token'); context.Api.setUser({id:'fixture-user', role:'SUPER_ADMIN'});
  return {context, evaluate, callbacks, elements};
}

test('summary errors show unavailable and preserve explicitly stale values', async()=>{
  const {context:c,evaluate:e} = setup();
  c.Api.getDashboardSummary = async()=>{throw new Error('offline');};
  await c.ensureNavigationState();
  assert.equal(e('_navigationError'),true);
  assert.equal(e('_menuBadgeState.borrowApprovals'),null);
  assert.match(c.renderDashboardStatCard({value:null,label:'待办'}),/暂不可用/);
  c.Api.getDashboardSummary = async()=>({data:{borrow_approvals:7}});
  await c.ensureNavigationState(undefined,true);
  c.Api.getDashboardSummary = async()=>{throw new Error('offline');};
  await c.ensureNavigationState(undefined,true);
  assert.equal(e('_dashboardSummary.borrow_approvals'),7);
  assert.equal(e('_navigationError'),true);
});

test('summary cache coalesces navigation calls and isolates users', async()=>{
  const {context:c,evaluate:e} = setup(); let count=0;
  c.Api.getDashboardSummary=async()=>{count++;return {data:{unread:4}};};
  await Promise.all([c.ensureNavigationState(),c.ensureNavigationState()]);
  await c.ensureNavigationState();
  assert.equal(count,1);
  c.Api.setUser({id:'next-user',role:'USER'});
  c.Api.getDashboardSummary=async()=>{throw new Error('offline');};
  await c.ensureNavigationState();
  assert.equal(e('_dashboardSummary'),null);
});

test('hidden pages do not poll', async()=>{
  const {context:c}=setup(); c.document.hidden=true;
  c.Api.getDashboardSummary=async()=>{throw new Error('must not fetch');};
  await c.pollInventoryState();
});

test('a cancelled shared summary is retried by the new page', async()=>{
  const {context:c,evaluate:e}=setup(); let rejectFirst, count=0;
  c.Api.getDashboardSummary=()=>++count===1 ? new Promise((resolve,reject)=>rejectFirst=reject) : Promise.resolve({data:{total_assets:6}});
  const old=c.ensureNavigationState(); const next=c.ensureNavigationState();
  rejectFirst(new DOMException('cancelled','AbortError'));
  await Promise.all([old,next]);
  assert.equal(e('_dashboardSummary.total_assets'),6);
  assert.equal(count,2);
});

test('temporary bootstrap failure retains the logged-in session', async()=>{
  const {context:c,callbacks,evaluate:e}=setup();
  c.Api.me=async()=>{throw Object.assign(new Error('server unavailable'),{status:500});};
  c.Router.init=()=>{}; e('startInventoryStateSync = () => {}');
  await callbacks.DOMContentLoaded();
  assert.equal(c.Api.getToken(),'fixture-token');
});

test('navigation aborts an old read before rendering the next route', async()=>{
  const {context:c,elements}=setup();
  let fetched;
  const started=new Promise(resolve=>fetched=resolve);
  c.fetch=(_,options)=>new Promise((resolve,reject)=>{
    options.signal.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')));
    fetched();
  });
  c.ensureNavigationState=async()=>{};
  c.Router.register('slow',async()=>{await c.Api.get('/slow');elements.app.innerHTML='stale';});
  c.Router.register('fast',async()=>{elements.app.innerHTML='fresh';});
  c.window.location.hash='#slow';
  const pending=c.Router.resolve(); await started;
  c.window.location.hash='#fast'; await c.Router.resolve(); await pending;
  assert.equal(elements.app.innerHTML,'fresh');
});

test('navigation never aborts a submitted mutation', async()=>{
  const {context:c}=setup();
  const route=new AbortController(); route.abort(); c.Api.routeSignal=route.signal;
  c.fetch=async()=>({status:200,ok:true,text:async()=>'{"data":true}'});
  assert.equal((await c.Api.post('/fixture',{})).data,true);
});

test('upload concurrency stays bounded and failures release slots', async()=>{
  const {context:c}=setup(); let active=0,peak=0;
  const jobs=Array.from({length:7},(_,i)=>c.Api.queueUpload(async()=>{
    peak=Math.max(peak,++active);
    await new Promise(resolve=>setTimeout(resolve,5));
    active--; if(i===1) throw new Error('fixture'); return i;
  }));
  const results=await Promise.allSettled(jobs);
  assert.equal(peak,2);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,6);
});
