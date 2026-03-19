// ===== Return Order Submission =====
Router.register('return-submit', async (params) => {
  const app = document.getElementById('app');
  const user = Api.getUser();
  const borrowOrderId = params.borrow_order_id;
  if (!borrowOrderId) {
    app.innerHTML = '<div class="empty-state"><p>缺少借用单 ID</p></div>';
    return;
  }

  let order = null;
  try {
    const res = await Api.getBorrowOrder(borrowOrderId);
    order = res.data;
  } catch (e) {
    app.innerHTML = `<div class="empty-state"><p>${Utils.escapeHtml(e.message)}</p></div>`;
    return;
  }

  if (!['DELIVERED', 'PARTIALLY_RETURNED'].includes(order.status)) {
    app.innerHTML = '<div class="empty-state"><p>该借用单当前状态不可归还</p></div>';
    return;
  }

  // Fetch existing return orders to find already-returned items
  let returnedAssetIds = new Set();
  try {
    const ror = await Api.listReturnOrders({ borrow_order_id: borrowOrderId, page_size: 100 });
    (ror.data.items || []).forEach(ro => {
      if (ro.status !== 'REJECTED') {
        // We need detail to get asset_ids; for now mark by order existence
      }
    });
    // Get details for each non-rejected return order
    for (const ro of (ror.data.items || [])) {
      if (ro.status === 'REJECTED') continue;
      try {
        const detail = await Api.getReturnOrder(ro.id);
        (detail.data.items || []).forEach(ri => returnedAssetIds.add(ri.asset_id));
      } catch (e) { /* ignore */ }
    }
  } catch (e) { /* ignore */ }

  const availableItems = order.items.filter(i => !returnedAssetIds.has(i.asset_id));

  const conditionOptions = [
    { value: 'GOOD', label: '完好' },
    { value: 'DAMAGED', label: '损坏' },
    { value: 'PARTIAL_LOSS', label: '部分丢失' },
    { value: 'FULL_LOSS', label: '完全丢失' },
  ];

  const formHtml = `
    <div class="page-header">
      <div class="page-header__info">
        <h1 class="page-header__title">提交归还</h1>
        <p class="page-header__desc">借用单 ${Utils.escapeHtml(order.order_no)} · ${availableItems.length} 件可归还</p>
      </div>
      <div class="page-header__actions">
        <button class="btn btn--outline btn--sm" onclick="Router.navigate('borrow-detail',{id:'${borrowOrderId}'})">返回借用单</button>
      </div>
    </div>

    ${availableItems.length === 0 ? '<div class="empty-state"><p>所有设备已提交归还</p></div>' : `
    <div class="card stack--lg">
      <h3>选择归还设备</h3>
      <div class="stack--md" id="return-items-form">
        ${availableItems.map((item, idx) => `
          <div class="return-item-row" style="padding:12px;background:var(--panel-alt);border-radius:var(--radius-input);">
            <label style="display:flex;align-items:center;gap:10px;margin-bottom:8px;cursor:pointer;">
              <input type="checkbox" class="return-check" data-idx="${idx}"
                     data-boi-id="${item.id}" data-asset-id="${item.asset_id}"
                     data-code="${Utils.escapeHtml(item.asset_code_snapshot)}"
                     data-name="${Utils.escapeHtml(item.asset_name_snapshot)}" checked>
              <span style="font-weight:500;">${Utils.escapeHtml(item.asset_code_snapshot)} - ${Utils.escapeHtml(item.asset_name_snapshot)}</span>
            </label>
            <div class="flex gap-md" style="margin-left:28px;">
              <div class="form-group" style="flex:1;">
                <label class="form-label">归还状态</label>
                <select class="form-select return-condition" data-idx="${idx}">
                  ${conditionOptions.map(c => `<option value="${c.value}">${c.label}</option>`).join('')}
                </select>
              </div>
              <div class="form-group return-damage-group" data-idx="${idx}" style="flex:1;display:none;">
                <label class="form-label">损坏描述</label>
                <input type="text" class="form-input return-damage-desc" data-idx="${idx}" placeholder="描述损坏情况">
              </div>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="form-group">
        <label class="form-label">备注（选填）</label>
        <textarea id="return-remark" class="form-textarea" placeholder="归还备注"></textarea>
      </div>
      <div id="return-error" class="form-error hidden"></div>
      <button id="return-submit-btn" class="btn btn--primary btn--full">提交归还单</button>
    </div>`}`;

  const isAdmin = user && (user.role === 'ASSET_ADMIN' || user.role === 'SUPER_ADMIN');
  if (isAdmin) {
    app.innerHTML = renderPcLayout('my-orders', formHtml);
  } else {
    app.innerHTML = `<div class="page--mobile"><div class="page">${formHtml}</div></div>`;
  }

  // Toggle damage description visibility
  document.querySelectorAll('.return-condition').forEach(sel => {
    sel.addEventListener('change', () => {
      const idx = sel.dataset.idx;
      const grp = document.querySelector(`.return-damage-group[data-idx="${idx}"]`);
      if (grp) grp.style.display = (sel.value === 'DAMAGED' || sel.value === 'PARTIAL_LOSS') ? '' : 'none';
    });
  });

  // Submit
  const submitBtn = document.getElementById('return-submit-btn');
  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const errEl = document.getElementById('return-error');
      errEl.classList.add('hidden');

      const items = [];
      document.querySelectorAll('.return-check:checked').forEach(cb => {
        const idx = cb.dataset.idx;
        const condition = document.querySelector(`.return-condition[data-idx="${idx}"]`).value;
        const desc = document.querySelector(`.return-damage-desc[data-idx="${idx}"]`)?.value?.trim() || null;
        items.push({
          borrow_order_item_id: cb.dataset.boiId,
          asset_id: cb.dataset.assetId,
          condition,
          damage_description: (condition === 'DAMAGED' || condition === 'PARTIAL_LOSS') ? desc : null,
        });
      });

      if (items.length === 0) {
        errEl.textContent = '请至少选择一件设备';
        errEl.classList.remove('hidden');
        return;
      }

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = '提交中...';
        const res = await Api.createReturnOrder({
          borrow_order_id: borrowOrderId,
          items,
          remark: document.getElementById('return-remark').value.trim() || null,
        });
        Utils.showToast('归还单已提交，等待审批');
        Router.navigate('return-detail', { id: res.data.id });
      } catch (e) {
        errEl.textContent = e.message;
        errEl.classList.remove('hidden');
        submitBtn.disabled = false;
        submitBtn.textContent = '提交归还单';
      }
    });
  }
});


// ===== Return Order Detail =====
Router.register('return-detail', async (params) => {
  const app = document.getElementById('app');
  const user = Api.getUser();
  const isAdmin = user && (user.role === 'ASSET_ADMIN' || user.role === 'SUPER_ADMIN');

  let order = null;
  try {
    const res = await Api.getReturnOrder(params.id);
    order = res.data;
  } catch (e) {
    app.innerHTML = `<div class="empty-state"><p>${Utils.escapeHtml(e.message)}</p></div>`;
    return;
  }

  const returnStatusMap = {
    PENDING_APPROVAL: { label: '待审核', class: 'chip--pending' },
    PARTIALLY_APPROVED: { label: '部分审批', class: 'chip--warning' },
    APPROVED: { label: '已通过', class: 'chip--success' },
    REJECTED: { label: '已驳回', class: 'chip--danger' },
    COMPLETED: { label: '已完成', class: 'chip--success' },
  };
  const taskStatusMap = {
    PENDING: { label: '待审批', class: 'chip--pending' },
    APPROVED: { label: '已通过', class: 'chip--success' },
    REJECTED: { label: '已驳回', class: 'chip--danger' },
  };
  const conditionMap = {
    GOOD: { label: '完好', class: 'chip--stock' },
    DAMAGED: { label: '损坏', class: 'chip--damaged' },
    PARTIAL_LOSS: { label: '部分丢失', class: 'chip--warning' },
    FULL_LOSS: { label: '完全丢失', class: 'chip--lost' },
  };

  const sm = returnStatusMap[order.status] || { label: order.status, class: '' };

  const detailHtml = `
    <div class="page-header">
      <div class="page-header__info">
        <h1 class="page-header__title">${Utils.escapeHtml(order.order_no)}</h1>
        <p class="page-header__desc">关联借用单：<a href="#borrow-detail?id=${order.borrow_order_id}">${Utils.escapeHtml(order.borrow_order_no || '-')}</a> · ${Utils.formatDateTime(order.created_at)}</p>
      </div>
      <div class="page-header__actions">
        <span class="chip ${sm.class}">${sm.label}</span>
        <button class="btn btn--outline btn--sm" onclick="Router.navigate('my-returns')">返回列表</button>
      </div>
    </div>

    <div class="content-row">
      <div class="content-main">
        <div class="card stack--md">
          <h3>归还明细 (${order.item_count} 件)</h3>
          <div class="table-wrapper">
            <table class="data-table">
              <thead><tr><th>编号</th><th>名称</th><th>归还状态</th><th>管理员</th><th>备注</th></tr></thead>
              <tbody>
                ${order.items.map(i => {
                  const cm = conditionMap[i.condition] || { label: i.condition, class: '' };
                  return `<tr>
                    <td class="text-sm">${Utils.escapeHtml(i.asset_code_snapshot)}</td>
                    <td>${Utils.escapeHtml(i.asset_name_snapshot)}</td>
                    <td><span class="chip ${cm.class}">${cm.label}</span></td>
                    <td class="text-sm">${Utils.escapeHtml(i.admin_name_snapshot)}</td>
                    <td class="text-sm text-muted">${Utils.escapeHtml(i.damage_description || '-')}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
        ${order.remark ? `<div class="card stack--sm"><h3>备注</h3><p class="text-sm">${Utils.escapeHtml(order.remark)}</p></div>` : ''}
      </div>

      <div class="content-side">
        <div class="card stack--md">
          <h3>审批进度</h3>
          <div class="stack--sm">
            ${(order.approval_tasks || []).map(t => {
              const ts = taskStatusMap[t.status] || { label: t.status, class: '' };
              return `
                <div class="user-row">
                  <div class="user-row__info">
                    <span class="user-row__name">${Utils.escapeHtml(t.approver_name || '-')}</span>
                    <span class="user-row__meta">${t.item_ids.length} 件设备 · ${t.decided_at ? Utils.formatDateTime(t.decided_at) : '待处理'}</span>
                    ${t.comment ? `<span class="user-row__meta text-muted">${Utils.escapeHtml(t.comment)}</span>` : ''}
                  </div>
                  <span class="chip ${ts.class}">${ts.label}</span>
                </div>`;
            }).join('')}
          </div>
        </div>
      </div>
    </div>`;

  if (isAdmin) {
    app.innerHTML = renderPcLayout('my-orders', detailHtml);
  } else {
    app.innerHTML = `<div class="page--mobile"><div class="page">${detailHtml}</div></div>`;
  }
});


// ===== My Return Orders List =====
Router.register('my-returns', async (params) => {
  const app = document.getElementById('app');
  const user = Api.getUser();
  const isAdmin = user && (user.role === 'ASSET_ADMIN' || user.role === 'SUPER_ADMIN');
  const page = parseInt(params.page) || 1;
  const statusFilter = params.status || '';

  let orders = [], total = 0;
  try {
    const qp = { page, page_size: 20, mine: !isAdmin };
    if (statusFilter) qp.status = statusFilter;
    const res = await Api.listReturnOrders(qp);
    orders = res.data.items;
    total = res.data.total;
  } catch (e) { console.error(e); }

  const returnStatusMap = {
    PENDING_APPROVAL: { label: '待审核', class: 'chip--pending' },
    PARTIALLY_APPROVED: { label: '部分审批', class: 'chip--warning' },
    APPROVED: { label: '已通过', class: 'chip--success' },
    REJECTED: { label: '已驳回', class: 'chip--danger' },
    COMPLETED: { label: '已完成', class: 'chip--success' },
  };

  if (isAdmin) {
    const tableRows = orders.map(o => {
      const sm = returnStatusMap[o.status] || { label: o.status, class: '' };
      return `<tr>
        <td><a href="#return-detail?id=${o.id}" style="font-weight:500;">${Utils.escapeHtml(o.order_no)}</a></td>
        <td>${Utils.escapeHtml(o.borrow_order_no || '-')}</td>
        <td>${Utils.escapeHtml(o.applicant_name || '-')}</td>
        <td>${o.item_count} 件</td>
        <td><span class="chip ${sm.class}">${sm.label}</span></td>
        <td>${Utils.formatDateTime(o.created_at)}</td>
      </tr>`;
    }).join('');

    const mainContent = `
      <div class="page-header">
        <div class="page-header__info">
          <h1 class="page-header__title">归还单管理</h1>
          <p class="page-header__desc">共 ${total} 条记录</p>
        </div>
      </div>
      <div class="flex gap-md" style="margin-bottom:4px;">
        <select id="return-status-filter" class="form-select" style="width:160px;">
          <option value="">全部状态</option>
          ${Object.entries(returnStatusMap).map(([k, v]) => `<option value="${k}" ${statusFilter === k ? 'selected' : ''}>${v.label}</option>`).join('')}
        </select>
      </div>
      <div class="card" style="padding:0;overflow:hidden;">
        <div class="table-wrapper">
          <table class="data-table">
            <thead><tr><th>归还单号</th><th>借用单号</th><th>申请人</th><th>数量</th><th>状态</th><th>创建时间</th></tr></thead>
            <tbody>${tableRows || '<tr><td colspan="6"><div class="empty-state">暂无记录</div></td></tr>'}</tbody>
          </table>
        </div>
      </div>`;
    app.innerHTML = renderPcLayout('my-returns', mainContent);

    document.getElementById('return-status-filter').addEventListener('change', (e) => {
      Router.navigate('my-returns', { status: e.target.value });
    });
  } else {
    app.innerHTML = `
      <div class="page--mobile has-bottom-nav">
        <div class="page" style="padding-top:20px;">
          <h1 style="font-size:1.625rem;margin-bottom:16px;">我的归还单</h1>
          <div class="stack--md">
            ${orders.length === 0 ? '<div class="empty-state"><p>暂无归还单</p></div>' :
              orders.map(o => {
                const sm = returnStatusMap[o.status] || { label: o.status, class: '' };
                return `
                  <div class="asset-card" data-id="${o.id}" style="cursor:pointer;">
                    <div class="asset-card__header">
                      <div>
                        <div class="asset-card__title">${Utils.escapeHtml(o.order_no)}</div>
                        <div class="asset-card__code">${o.item_count} 件 · 借用单 ${Utils.escapeHtml(o.borrow_order_no || '-')}</div>
                      </div>
                      <span class="chip ${sm.class}">${sm.label}</span>
                    </div>
                    <div class="asset-card__meta">${Utils.formatDateTime(o.created_at)}</div>
                  </div>`;
              }).join('')}
          </div>
        </div>
        <nav class="bottom-nav">
          <a href="#asset-list" class="bottom-nav__item">${Utils.svgIcon('box')}<span>设备</span></a>
          <a href="#borrow-cart" class="bottom-nav__item">${Utils.svgIcon('wrench')}<span>清单</span></a>
          <a href="#my-orders" class="bottom-nav__item">${Utils.svgIcon('tag')}<span>我的单</span></a>
        </nav>
      </div>`;

    document.querySelectorAll('.asset-card[data-id]').forEach(card => {
      card.addEventListener('click', () => Router.navigate('return-detail', { id: card.dataset.id }));
    });
  }
});


// ===== Admin: Return Approval Tasks =====
Router.register('return-approvals', async (params) => {
  const app = document.getElementById('app');
  const page = parseInt(params.page) || 1;
  const statusFilter = params.status || 'PENDING';

  let tasks = [], total = 0;
  try {
    const res = await Api.listReturnApprovalTasks({ page, page_size: 20, status: statusFilter });
    tasks = res.data.items;
    total = res.data.total;
  } catch (e) { console.error(e); }

  const taskStatusMap = {
    PENDING: { label: '待审批', class: 'chip--pending' },
    APPROVED: { label: '已通过', class: 'chip--success' },
    REJECTED: { label: '已驳回', class: 'chip--danger' },
  };

  const tableRows = tasks.map(t => {
    const ts = taskStatusMap[t.status] || { label: t.status, class: '' };
    return `<tr>
      <td><a href="#return-detail?id=${t.return_order_id}" style="font-weight:500;">查看归还单</a></td>
      <td>${Utils.escapeHtml(t.approver_name || '-')}</td>
      <td>${t.item_ids.length} 件</td>
      <td><span class="chip ${ts.class}">${ts.label}</span></td>
      <td>${Utils.formatDateTime(t.created_at)}</td>
      <td>
        ${t.status === 'PENDING' ? `
          <button class="btn btn--primary btn--sm rt-approve-btn" data-id="${t.id}">通过</button>
          <button class="btn btn--outline btn--sm rt-reject-btn" data-id="${t.id}">驳回</button>
        ` : (t.comment ? `<span class="text-xs text-muted">${Utils.escapeHtml(t.comment)}</span>` : '-')}
      </td>
    </tr>`;
  }).join('');

  const mainContent = `
    <div class="page-header">
      <div class="page-header__info">
        <h1 class="page-header__title">归还审批</h1>
        <p class="page-header__desc">共 ${total} 条任务</p>
      </div>
    </div>
    <div class="flex gap-md" style="margin-bottom:4px;">
      <select id="rt-status-filter" class="form-select" style="width:140px;">
        <option value="PENDING" ${statusFilter === 'PENDING' ? 'selected' : ''}>待审批</option>
        <option value="APPROVED" ${statusFilter === 'APPROVED' ? 'selected' : ''}>已通过</option>
        <option value="REJECTED" ${statusFilter === 'REJECTED' ? 'selected' : ''}>已驳回</option>
        <option value="" ${!statusFilter ? 'selected' : ''}>全部</option>
      </select>
    </div>
    <div class="card" style="padding:0;overflow:hidden;">
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr><th>归还单</th><th>审批人</th><th>设备数</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead>
          <tbody>${tableRows || '<tr><td colspan="6"><div class="empty-state">暂无任务</div></td></tr>'}</tbody>
        </table>
      </div>
    </div>`;

  app.innerHTML = renderPcLayout('return-approvals', mainContent);

  document.getElementById('rt-status-filter').addEventListener('change', (e) => {
    Router.navigate('return-approvals', { status: e.target.value });
  });

  document.querySelectorAll('.rt-approve-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const comment = prompt('审批意见（可选）：') || null;
      try {
        await Api.approveReturnTask(btn.dataset.id, comment);
        Utils.showToast('已通过');
        Router.navigate('return-approvals', { status: statusFilter });
      } catch (e) { Utils.showToast(e.message, 'error'); }
    });
  });

  document.querySelectorAll('.rt-reject-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const comment = prompt('驳回原因：');
      try {
        await Api.rejectReturnTask(btn.dataset.id, comment);
        Utils.showToast('已驳回');
        Router.navigate('return-approvals', { status: statusFilter });
      } catch (e) { Utils.showToast(e.message, 'error'); }
    });
  });
});
