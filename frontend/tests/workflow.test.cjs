// Synthetic fixtures only. Run: node --test frontend/tests/workflow.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function storage() {
  const values = new Map();
  return {getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key)};
}
function setup() {
  const elements = new Map();
  const routes = {};
  const navigation = [];
  const context = vm.createContext({
    console, URLSearchParams, Date, setTimeout, clearTimeout, AbortController,
    window: {location: {protocol: 'http:'}, innerWidth: 1200},
    localStorage: storage(), sessionStorage: storage(),
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, {innerHTML: '', listeners: {}, addEventListener(event, handler) {this.listeners[event] = handler;}});
        return elements.get(id);
      },
      querySelectorAll: () => [],
    },
    Router: {register: (name, handler) => routes[name] = handler, navigate: (...args) => navigation.push(args)},
    Utils: {escapeHtml: value => String(value ?? ''), formatDateTime: () => 'fixture-date', svgIcon: () => ''},
    renderPcLayout: (_, content) => content,
  });
  function load(file) {vm.runInContext(fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'), context);}
  load('api.js');
  context.Api = vm.runInContext('Api', context);
  context.Api.setToken('fixture-token');
  context.Api.setUser({id:'fixture-a', role:'ASSET_ADMIN'});
  load('borrow.js'); load('return.js');
  return {context, routes, elements, navigation};
}

test('cart and draft stay with their owner and clear together after submission', () => {
  const {context: {Api, localStorage}} = setup();
  localStorage.setItem('borrow_cart', JSON.stringify([{id:'old-owner'}]));
  assert.equal(Api.getCart().length, 0);
  Api.addToCart({id:'fixture-device', name:'Fixture'});
  Api.saveBorrowDraft({purpose:'Fixture purpose', remark:'Fixture note'});
  Api.setUser({id:'fixture-b'});
  assert.equal(Api.getCart().length, 0);
  assert.equal(Api.getBorrowDraft().purpose, undefined);
  Api.setUser({id:'fixture-a'});
  assert.equal(Api.getCart()[0].id, 'fixture-device');
  assert.equal(Api.getBorrowDraft().purpose, 'Fixture purpose');
  Api.clearCart();
  assert.equal(Api.getCart().length, 0);
  assert.equal(Api.getBorrowDraft().purpose, undefined);
});

test('delivery list renders item details and only offers the current administrator pending handoff', async () => {
  const {context, routes, elements} = setup();
  const order = {id:'fixture-order', order_no:'BO-FIX', item_count:2, handoff_completed_count:1,
    can_deliver:false, pending_deliver_count:0, items:[{asset_code_snapshot:'FIX001',asset_name_snapshot:'Fixture device'}]};
  context.Api.listBorrowOrders = async () => ({data:{items:[order],total:1}});
  await routes['borrow-approvals']({status:'READY_FOR_PICKUP'});
  assert.match(elements.get('app').innerHTML, /Fixture device/);
  assert.match(elements.get('app').innerHTML, /已交付 1\/2 件/);
  assert.doesNotMatch(elements.get('app').innerHTML, /task-deliver-btn/);
  order.can_deliver = true; order.pending_deliver_count = 1;
  await routes['borrow-approvals']({status:'READY_FOR_PICKUP'});
  assert.match(elements.get('app').innerHTML, /确认交付 \(1 件\)/);
});

test('both approval filters default to pending and retain an explicit ALL selection', async () => {
  const {context, routes, elements, navigation} = setup();
  for (const [route, method, filter] of [
    ['borrow-approvals','listBorrowApprovalTasks','task-status-filter'],
    ['return-approvals','listReturnApprovalTasks','rt-status-filter'],
  ]) {
    const queries = [];
    context.Api[method] = async query => {queries.push(query); return {data:{items:[],total:0}};};
    await routes[route]({});
    assert.equal(queries[0].status, 'PENDING');
    elements.get(filter).listeners.change({target:{value:'ALL'}});
    assert.equal(navigation.at(-1)[1].status, 'ALL');
    await routes[route](navigation.at(-1)[1]);
    assert.equal(queries.at(-1).status, undefined);
  }
  // The detail panel calls this helper outside the list handler.
  assert.equal(vm.runInContext("buildBorrowApprovalParams('ALL', 2).page",context),2);
});

test('approval loading failures propagate to the retry page instead of showing empty tasks', async () => {
  const {context, routes} = setup();
  context.Api.listBorrowApprovalTasks = context.Api.listReturnApprovalTasks = async () => {throw new Error('offline');};
  await assert.rejects(routes['borrow-approvals']({}), /offline/);
  await assert.rejects(routes['return-approvals']({}), /offline/);
});
