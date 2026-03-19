// ===== Borrow Cart Page (Mobile) =====
Router.register('borrow-cart', async () => {
  const app = document.getElementById('app');
  const cart = Api.getCart();

  app.innerHTML = `
    <div class="page--mobile has-bottom-nav">
      <div class="page" style="padding-top:20px;">
        <div class="flex-between" style="margin-bottom:16px;">
          <div>
            <h1 style="font-size:1.625rem;">借用清单</h1>
            <p class="text-xs text-muted">最多可添加 20 件设备</p>
          </div>
          <span class="chip chip--active">${cart.length} / 20</span>
        </div>

        ${cart.length === 0 ? `
          <div class="empty-state" style="padding:60px 24px;">
            <p style="font-size:1.25rem;margin-bottom:8px;">清单为空</p>
            <p class="text-sm text-muted">请先在设备列表中将设备加入借用清单</p>
            <a href="#asset-list" class="btn btn--primary" style="margin-top:16px;">去浏览设备</a>
          </div>
        ` : `
          <div class="stack--md" id="cart-items">
            ${cart.map(item => `
              <div class="asset-card">
                <div class="asset-card__header">
                  <div>
                    <div class="asset-card__title">${Utils.escapeHtml(item.name)}</div>
                    <div class="asset-card__code">${Utils.escapeHtml(item.asset_code)}</div>
                  </div>
                  <button class="btn btn--outline btn--sm cart-remove-btn" data-id="${item.id}">移除</button>
                </div>
                <div class="asset-card__meta">${Utils.escapeHtml(item.location_name || '-')}</div>
              </div>
            `).join('')}
          </div>

          <div class="card stack--lg" style="margin-top:20px;">
            <h3>借用信息</h3>
            <div class="form-group">
              <label class="form-label">借用说明 / 用途（选填）</label>
              <textarea id="cart-purpose" class="form-textarea" placeholder="说明借用原因"></textarea>
            </div>
            <div class="form-group">
              <label class="form-label">预计归还日期（选填）</label>
              <input type="date" id="cart-return-date" class="form-input">
            </div>
            <div class="form-group">
              <label class="form-label">备注（选填）</label>
              <textarea id="cart-remark" class="form-textarea" placeholder="其他信息"></textarea>
            </div>
            <div id="cart-error" class="form-error hidden"></div>
            <button id="cart-submit" class="btn btn--primary btn--full">提交借用单 (${cart.length} 件)</button>
          </div>
        `}
      </div>

      <nav class="bottom-nav">
        <a href="#asset-list" class="bottom-nav__item">${Utils.svgIcon('box')}<span>设备</span></a>
        <a href="#borrow-cart" class="bottom-nav__item bottom-nav__item--active">${Utils.svgIcon('wrench')}<span>清单(${cart.length})</span></a>
        <a href="#my-orders" class="bottom-nav__item">${Utils.svgIcon('tag')}<span>我的单</span></a>
      </nav>
    </div>`;

  // Remove from cart
  document.querySelectorAll('.cart-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      Api.removeFromCart(btn.dataset.id);
      Router.navigate('borrow-cart');
    });
  });

  // Submit order
  const submitBtn = document.getElementById('cart-submit');
  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const errEl = document.getElementById('cart-error');
      errEl.classList.add('hidden');
      const assetIds = cart.map(i => i.id);
      const purpose = document.getElementById('cart-purpose').value.trim() || null;
      const returnDate = document.getElementById('cart-return-date').value || null;
      const remark = document.getElementById('cart-remark').value.trim() || null;

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = '提交中...';
        const res = await Api.createBorrowOrder({
          asset_ids: assetIds,
          purpose,
          expected_return_date: returnDate,
          remark,
        });
        Api.clearCart();
        Utils.showToast('借用单已提交，等待审批');
        Router.navigate('borrow-detail', { id: res.data.id });
      } catch (e) {
        errEl.textContent = e.message;
        errEl.classList.remove('hidden');
        submitBtn.disabled = false;
        submitBtn.textContent = `提交借用单 (${cart.length} 件)`;
      }
    });
  }
});

// ===== My Borrow Orders List =====
Router.register('my-orders', async (params) => {
  const app = document.getElementById('app');
  const user = Api.getUser();
  const isAdmin = user && (user.role === 'ASSET_ADMIN' || user.role === 'SUPER_ADMIN');
  const page = parseInt(params.page) || 1;
  const statusFilter = params.status || '';

  let orders = [], total = 0;
  try {
    const qp = { page, page_size: 20, mine: !isAdmin };
    if (statusFilter) qp.status = statusFilter;
    const res = await Api.listBorrowOrders(qp);
    orders = res.data.items;
    total = res.data.total;
  } catch (e) {
    console.error(e);
  }

  const borrowStatusMap = {
    PENDING_APPROVAL: { label: '待审核', class: 'chip--pending' },
    PARTIALLY_APPROVED: { label: '部分审批', class: 'chip--warning' },
    APPROVED: { label: '已通过', class: 'chip--success' },
    REJECTED: { label: '已驳回', class: 'chip--danger' },
    READY_FOR_PICKUP: { label: '待领取', class: 'chip--stock' },
    DELIVERED: { label: '已交付', class: 'chip--borrowed' },
    PARTIALLY_RETURNED: { label: '部分归还', class: 'chip--warning' },
    COMPLETED: { label: '已完成', class: 'chip--success' },
    CANCELLED: { label: '已取消', class: 'chip--disabled' },
  };

  if (isAdmin) {
    // PC layout
    const tableRows = orders.map(o => {
      const sm = borrowStatusMap[o.status] || { label: o.status, class: '' };
      return `<tr>
        <td><a href="#borrow-detail?id=${o.id}" style="font-weight:500;">${Utils.escapeHtml(o.order_no)}</a></td>
        <td>${Utils.escapeHtml(o.applicant_name || '-')}</td>
        <td>${o.item_count} 件</td>
        <td><span class="chip ${sm.class}">${sm.label}</span></td>
        <td>${Utils.formatDateTime(o.created_at)}</td>
      </tr>`;
    }).join('');

    const mainContent = `
      <div class="page-header">
        <div class="page-header__info">
          <h1 class="page-header__title">借用单管理</h1>
          <p class="page-header__desc">共 ${total} 条记录</p>
        </div>
      </div>
      <div class="flex gap-md" style="margin-bottom:4px;">
        <select id="order-status-filter" class="form-select" style="width:160px;">
          <option value="">全部状态</option>
          ${Object.entries(borrowStatusMap).map(([k, v]) => `<option value="${k}" ${statusFilter === k ? 'selected' : ''}>${v.label}</option>`).join('')}
        </select>
      </div>
      <div class="card" style="padding:0;overflow:hidden;">
        <div class="table-wrapper">
          <table class="data-table">
            <thead><tr><th>单号</th><th>申请人</th><th>数量</th><th>状态</th><th>创建时间</th></tr></thead>
            <tbody>${tableRows || '<tr><td colspan="5"><div class="empty-state">暂无记录</div></td></tr>'}</tbody>
          </table>
        </div>
      </div>`;
    app.innerHTML = renderPcLayout('my-orders', mainContent);

    document.getElementById('order-status-filter').addEventListener('change', (e) => {
      Router.navigate('my-orders', { status: e.target.value });
    });
  } else {
    // Mobile layout
    app.innerHTML = `
      <div class="page--mobile has-bottom-nav">
        <div class="page" style="padding-top:20px;">
          <h1 style="font-size:1.625rem;margin-bottom:16px;">我的借用单</h1>
          <div class="chip-row" style="margin-bottom:16px;">
            <span class="chip ${!statusFilter ? 'chip--active' : 'chip--outline'}" data-status="">全部</span>
            <span class="chip ${statusFilter === 'PENDING_APPROVAL' ? 'chip--active' : 'chip--outline'}" data-status="PENDING_APPROVAL">待审核</span>
            <span class="chip ${statusFilter === 'READY_FOR_PICKUP' ? 'chip--active' : 'chip--outline'}" data-status="READY_FOR_PICKUP">待领取</span>
            <span class="chip ${statusFilter === 'DELIVERED' ? 'chip--active' : 'chip--outline'}" data-status="DELIVERED">已交付</span>
          </div>
          <div class="stack--md">
            ${orders.length === 0 ? '<div class="empty-state"><p>暂无借用单</p></div>' :
              orders.map(o => {
                const sm = borrowStatusMap[o.status] || { label: o.status, class: '' };
                return `
                  <div class="asset-card" data-id="${o.id}" style="cursor:pointer;">
                    <div class="asset-card__header">
                      <div>
                        <div class="asset-card__title">${Utils.escapeHtml(o.order_no)}</div>
                        <div class="asset-card__code">${o.item_count} 件设备</div>
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
          <a href="#my-orders" class="bottom-nav__item bottom-nav__item--active">${Utils.svgIcon('tag')}<span>我的单</span></a>
        </nav>
      </div>`;

    document.querySelectorAll('.chip-row .chip').forEach(chip => {
      chip.addEventListener('click', () => Router.navigate('my-orders', { status: chip.dataset.status }));
    });
    document.querySelectorAll('.asset-card[data-id]').forEach(card => {
      card.addEventListener('click', () => Router.navigate('borrow-detail', { id: card.dataset.id }));
    });
  }
});

// ===== Borrow Order Detail =====
Router.register('borrow-detail', async (params) => {
  const app = document.getElementById('app');
  const user = Api.getUser();
  const isAdmin = user && (user.role === 'ASSET_ADMIN' || user.role === 'SUPER_ADMIN');

  let order = null;
  try {
    const res = await Api.getBorrowOrder(params.id);
    order = res.data;
  } catch (e) {
    app.innerHTML = `<div class="empty-state"><p>${Utils.escapeHtml(e.message)}</p></div>`;
    return;
  }

  const borrowStatusMap = {
    PENDING_APPROVAL: { label: '待审核', class: 'chip--pending' },
    PARTIALLY_APPROVED: { label: '部分审批', class: 'chip--warning' },
    APPROVED: { label: '已通过', class: 'chip--success' },
    REJECTED: { label: '已驳回', class: 'chip--danger' },
    READY_FOR_PICKUP: { label: '待领取', class: 'chip--stock' },
    DELIVERED: { label: '已交付', class: 'chip--borrowed' },
    PARTIALLY_RETURNED: { label: '部分归还', class: 'chip--warning' },
    COMPLETED: { label: '已完成', class: 'chip--success' },
    CANCELLED: { label: '已取消', class: 'chip--disabled' },
  };
  const taskStatusMap = {
    PENDING: { label: '待审批', class: 'chip--pending' },
    APPROVED: { label: '已通过', class: 'chip--success' },
    REJECTED: { label: '已驳回', class: 'chip--danger' },
    SKIPPED: { label: '已跳过', class: 'chip--disabled' },
  };

  const sm = borrowStatusMap[order.status] || { label: order.status, class: '' };
  const canDeliver = isAdmin && (order.status === 'READY_FOR_PICKUP' || order.status === 'APPROVED');
  const canCancel = order.applicant_id === user.id && order.status === 'PENDING_APPROVAL';
  const canReturn = order.applicant_id === user.id && (order.status === 'DELIVERED' || order.status === 'PARTIALLY_RETURNED');

  const detailHtml = `
    <div class="page-header">
      <div class="page-header__info">
        <h1 class="page-header__title">${Utils.escapeHtml(order.order_no)}</h1>
        <p class="page-header__desc">申请人：${Utils.escapeHtml(order.applicant_name || '-')} · ${Utils.formatDateTime(order.created_at)}</p>
      </div>
      <div class="page-header__actions">
        <span class="chip ${sm.class}">${sm.label}</span>
        ${canDeliver ? '<button id="deliver-btn" class="btn btn--primary btn--sm">确认交付</button>' : ''}
        ${canReturn ? `<button id="return-btn" class="btn btn--primary btn--sm">归还设备</button>` : ''}
        ${canCancel ? '<button id="cancel-btn" class="btn btn--outline btn--sm">取消借用</button>' : ''}
        <button class="btn btn--outline btn--sm" onclick="Router.navigate('my-orders')">返回列表</button>
      </div>
    </div>

    <div class="content-row">
      <div class="content-main">
        <div class="card stack--md">
          <h3>借用明细 (${order.item_count} 件)</h3>
          <div class="table-wrapper">
            <table class="data-table">
              <thead><tr><th>编号</th><th>名称</th><th>管理员</th><th>位置</th></tr></thead>
              <tbody>
                ${order.items.map(i => `
                  <tr>
                    <td class="text-sm">${Utils.escapeHtml(i.asset_code_snapshot)}</td>
                    <td>${Utils.escapeHtml(i.asset_name_snapshot)}</td>
                    <td class="text-sm">${Utils.escapeHtml(i.admin_name_snapshot)}</td>
                    <td class="text-sm">${Utils.escapeHtml(i.location_name_snapshot || '-')}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
        ${order.purpose ? `<div class="card stack--sm"><h3>借用说明</h3><p class="text-sm">${Utils.escapeHtml(order.purpose)}</p></div>` : ''}
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

        <div class="card stack--sm">
          <h3>时间线</h3>
          <div class="meta-row"><span class="meta-row__label">创建</span><span class="meta-row__value text-sm">${Utils.formatDateTime(order.created_at)}</span></div>
          ${order.delivered_at ? `<div class="meta-row"><span class="meta-row__label">交付</span><span class="meta-row__value text-sm">${Utils.formatDateTime(order.delivered_at)}</span></div>` : ''}
          ${order.expected_return_date ? `<div class="meta-row"><span class="meta-row__label">预计归还</span><span class="meta-row__value text-sm">${Utils.escapeHtml(order.expected_return_date)}</span></div>` : ''}
        </div>
      </div>
    </div>`;

  if (isAdmin) {
    app.innerHTML = renderPcLayout('my-orders', detailHtml);
  } else {
    app.innerHTML = `<div class="page--mobile"><div class="page">${detailHtml}</div></div>`;
  }

  // Deliver button
  const deliverBtn = document.getElementById('deliver-btn');
  if (deliverBtn) {
    deliverBtn.addEventListener('click', async () => {
      if (!confirm('确认所有设备已线下交付？')) return;
      try {
        await Api.deliverBorrowOrder(order.id);
        Utils.showToast('已确认交付');
        Router.navigate('borrow-detail', { id: order.id });
      } catch (e) { Utils.showToast(e.message, 'error'); }
    });
  }

  // Return button
  const returnBtn = document.getElementById('return-btn');
  if (returnBtn) {
    returnBtn.addEventListener('click', () => {
      Router.navigate('return-submit', { borrow_order_id: order.id });
    });
  }

  // Cancel button
  const cancelBtn = document.getElementById('cancel-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', async () => {
      if (!confirm('确认取消该借用单？')) return;
      try {
        await Api.cancelBorrowOrder(order.id);
        Utils.showToast('借用单已取消');
        Router.navigate('my-orders');
      } catch (e) { Utils.showToast(e.message, 'error'); }
    });
  }
});

// ===== Admin: Approval Tasks Page =====
Router.register('borrow-approvals', async (params) => {
  const app = document.getElementById('app');
  const page = parseInt(params.page) || 1;
  const statusFilter = params.status || 'PENDING';

  let tasks = [], total = 0;
  try {
    const res = await Api.listBorrowApprovalTasks({ page, page_size: 20, status: statusFilter });
    tasks = res.data.items;
    total = res.data.total;
  } catch (e) {
    console.error(e);
  }

  const taskStatusMap = {
    PENDING: { label: '待审批', class: 'chip--pending' },
    APPROVED: { label: '已通过', class: 'chip--success' },
    REJECTED: { label: '已驳回', class: 'chip--danger' },
    SKIPPED: { label: '已跳过', class: 'chip--disabled' },
  };

  const tableRows = tasks.map(t => {
    const ts = taskStatusMap[t.status] || { label: t.status, class: '' };
    return `<tr>
      <td><a href="#borrow-detail?id=${t.order_id}" style="font-weight:500;">查看借用单</a></td>
      <td>${Utils.escapeHtml(t.approver_name || '-')}</td>
      <td>${t.item_ids.length} 件</td>
      <td><span class="chip ${ts.class}">${ts.label}</span></td>
      <td>${Utils.formatDateTime(t.created_at)}</td>
      <td>
        ${t.status === 'PENDING' ? `
          <button class="btn btn--primary btn--sm task-approve-btn" data-id="${t.id}">通过</button>
          <button class="btn btn--outline btn--sm task-reject-btn" data-id="${t.id}">驳回</button>
        ` : (t.comment ? `<span class="text-xs text-muted">${Utils.escapeHtml(t.comment)}</span>` : '-')}
      </td>
    </tr>`;
  }).join('');

  const mainContent = `
    <div class="page-header">
      <div class="page-header__info">
        <h1 class="page-header__title">借出审批</h1>
        <p class="page-header__desc">共 ${total} 条任务</p>
      </div>
    </div>
    <div class="flex gap-md" style="margin-bottom:4px;">
      <select id="task-status-filter" class="form-select" style="width:140px;">
        <option value="PENDING" ${statusFilter === 'PENDING' ? 'selected' : ''}>待审批</option>
        <option value="APPROVED" ${statusFilter === 'APPROVED' ? 'selected' : ''}>已通过</option>
        <option value="REJECTED" ${statusFilter === 'REJECTED' ? 'selected' : ''}>已驳回</option>
        <option value="" ${!statusFilter ? 'selected' : ''}>全部</option>
      </select>
    </div>
    <div class="card" style="padding:0;overflow:hidden;">
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr><th>借用单</th><th>审批人</th><th>设备数</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead>
          <tbody>${tableRows || '<tr><td colspan="6"><div class="empty-state">暂无任务</div></td></tr>'}</tbody>
        </table>
      </div>
    </div>`;

  app.innerHTML = renderPcLayout('borrow-approvals', mainContent);

  document.getElementById('task-status-filter').addEventListener('change', (e) => {
    Router.navigate('borrow-approvals', { status: e.target.value });
  });

  // Approve
  document.querySelectorAll('.task-approve-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const comment = prompt('审批意见（可选）：') || null;
      try {
        await Api.approveBorrowTask(btn.dataset.id, comment);
        Utils.showToast('已通过');
        Router.navigate('borrow-approvals', { status: statusFilter });
      } catch (e) { Utils.showToast(e.message, 'error'); }
    });
  });

  // Reject
  document.querySelectorAll('.task-reject-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const comment = prompt('驳回原因：');
      try {
        await Api.rejectBorrowTask(btn.dataset.id, comment);
        Utils.showToast('已驳回');
        Router.navigate('borrow-approvals', { status: statusFilter });
      } catch (e) { Utils.showToast(e.message, 'error'); }
    });
  });
});
