// ===== Borrow Cart Page (Mobile) =====
Router.register('borrow-cart', async () => {
  const app = document.getElementById('app');
  const user = Api.getUser();
  const isAdmin = user && (user.role === 'ASSET_ADMIN' || user.role === 'SUPER_ADMIN');
  const cart = Api.getCart();
  await Api.bootstrapSystemConfigs();
  const maxItems = Api.getSystemConfig('borrow_order_max_items', 20);
  const requirePurpose = Api.getSystemConfig('require_borrow_purpose', false);
  const requireExpectedReturnTime = Api.getSystemConfig('require_expected_return_time', false);

  const isMobile = window.innerWidth <= 768;

  const bodyHtml = `
    <div class="flex-between" style="margin-bottom:20px;">
      <div>
        <h1 style="font-size:1.5rem;">借用清单</h1>
        <p class="text-xs text-muted">最多可添加 ${maxItems} 件设备</p>
      </div>
      <span class="chip chip--active">${cart.length} / ${maxItems}</span>
    </div>

    ${cart.length === 0 ? `
      <div class="empty-state" style="padding:60px 24px;">
        <p style="font-size:1.25rem;margin-bottom:8px;">清单为空</p>
        <p class="text-sm text-muted">请先在器材借用页中将设备加入借用单</p>
        <a href="#asset-list" class="btn btn--primary" style="margin-top:16px;">去选择器材</a>
      </div>
    ` : `
      <div class="asset-grid" id="cart-items">
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

      <div class="card stack--lg" style="margin-top:24px;">
        <h3>借用信息</h3>
        <div class="form-group">
          <label class="form-label">借用说明 / 用途 <span class="form-required">*必填</span></label>
          <textarea id="cart-purpose" class="form-textarea" placeholder="请说明借用原因和用途"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">预计归还日期${requireExpectedReturnTime ? ' <span class="form-required">*必填</span>' : '（选填）'}</label>
          <input type="date" id="cart-return-date" class="form-input" style="max-width:100%;box-sizing:border-box;">
        </div>
        <div class="form-group">
          <label class="form-label">备注（选填）</label>
          <textarea id="cart-remark" class="form-textarea" placeholder="其他信息"></textarea>
        </div>
        <div id="cart-error" class="sr-only" aria-live="polite"></div>
        <button id="cart-submit" class="btn btn--primary btn--full">提交借用单 (${cart.length} 件)</button>
      </div>
    `}`;

  if (isMobile && isAdmin) {
    app.innerHTML = renderMobileAdminShell('borrow-cart', bodyHtml);
  } else if (isMobile) {
    app.innerHTML = renderMobileUserShell('borrow-cart', bodyHtml, { showBottomNav: true });
  } else if (isAdmin) {
    app.innerHTML = renderPcLayout('borrow-cart', bodyHtml);
  } else {
    app.innerHTML = renderUserLayout('borrow-cart', bodyHtml);
  }

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
      errEl.textContent = '';
      const assetIds = cart.map(i => i.id);
      const purpose = document.getElementById('cart-purpose').value.trim() || null;
      const returnDate = document.getElementById('cart-return-date').value || null;
      const remark = document.getElementById('cart-remark').value.trim() || null;

      if (!purpose) {
        showBorrowCartToast(errEl, '请填写借用说明/用途');
        return;
      }
      if (requireExpectedReturnTime && !returnDate) {
        showBorrowCartToast(errEl, '当前系统要求填写预计归还日期');
        return;
      }

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
        if (res.data.equipment_order_id) {
          Router.navigate('order-detail', { id: res.data.equipment_order_id });
        } else {
          Router.navigate('borrow-detail', { id: res.data.id });
        }
      } catch (e) {
        showBorrowCartToast(errEl, e.message);
        submitBtn.disabled = false;
        submitBtn.textContent = `提交借用单 (${cart.length} 件)`;
      }
    });
  }
});

function showBorrowCartToast(target, message) {
  if (!message) return;
  target.textContent = message;
  Utils.showToast(message, 'error');
}

function bindClickableApprovalCards(selector, onActivate) {
  document.querySelectorAll(selector).forEach(card => {
    card.tabIndex = 0;
    const activate = () => {
      if (onActivate) {
        onActivate(card);
        return;
      }
      if (!card.dataset.route || !card.dataset.id) return;
      Router.navigate(card.dataset.route, { id: card.dataset.id });
    };
    card.addEventListener('click', (event) => {
      if (event.target.closest('button, a, input, select, textarea, label, img, [data-no-card-nav]')) {
        return;
      }
      activate();
    });
    card.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      activate();
    });
  });
}

function resolveAdminDetailContext(from, fallbackActive = 'my-orders') {
  if (from === 'borrow-approvals') {
    return {
      active: 'borrow-approvals',
      backHref: 'borrow-approvals',
      backLabel: '返回借出审批',
    };
  }
  if (from === 'return-approvals') {
    return {
      active: 'return-approvals',
      backHref: 'return-approvals',
      backLabel: '返回归还审批',
    };
  }
  return {
    active: fallbackActive,
    backHref: 'my-orders',
    backLabel: '返回我的订单',
  };
}

function renderTimelineHtml(events) {
  if (!events || events.length === 0) {
    return '<p class="text-sm text-muted">暂无时间线记录</p>';
  }
  return `
    <div class="timeline">
      ${events.map(ev => `
        <div class="timeline__item">
          <div class="timeline__dot"></div>
          <div class="timeline__content">
            <span class="text-sm">${Utils.escapeHtml(ev.description || ev.action)}</span>
            <span class="text-xs text-muted">${Utils.formatDateTime(ev.created_at)}</span>
          </div>
        </div>
      `).join('')}
    </div>`;
}

function openApprovalPanel({ title, subtitle = '', statusLabel = '', statusClass = '', bodyHtml = '', footerHtml = '' }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay modal-overlay--panel';
  overlay.innerHTML = `
    <div class="modal approval-panel" role="dialog" aria-modal="true">
      <div class="approval-panel__header">
        <div class="approval-panel__header-copy">
          <div class="approval-panel__eyebrow">审批详情</div>
          <h3 class="approval-panel__title">${Utils.escapeHtml(title)}</h3>
          ${subtitle ? `<p class="approval-panel__subtitle">${subtitle}</p>` : ''}
        </div>
        <div class="approval-panel__header-actions">
          ${statusLabel ? `<span class="chip ${statusClass}">${Utils.escapeHtml(statusLabel)}</span>` : ''}
          <button class="modal__close" type="button" aria-label="关闭">×</button>
        </div>
      </div>
      <div class="approval-panel__body">${bodyHtml}</div>
      <div class="approval-panel__footer">
        ${footerHtml}
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('.modal__close').addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  return { overlay, close };
}

async function openBorrowApprovalPanel(task, params = {}) {
  const user = Api.getUser();
  const isAdmin = user && (user.role === 'ASSET_ADMIN' || user.role === 'SUPER_ADMIN');
  const statusFilter = params.status || 'PENDING';
  const page = parseInt(params.page, 10) || 1;

  const [orderRes, timelineRes, photoRes] = await Promise.all([
    Api.getBorrowOrder(task.order_id),
    Api.getOrderTimeline(task.order_id).catch(() => ({ data: [] })),
    Api.listAttachments({ related_type: 'BorrowOrder', related_id: task.order_id, photo_type: 'BORROW_ORDER' }).catch(() => ({ data: [] })),
  ]);
  const order = orderRes.data;
  const timelineEvents = timelineRes.data || [];
  const orderPhotos = photoRes.data || [];

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
  const currentTask = (order.approval_tasks || []).find(t => t.id === task.id) || task;
  const currentTaskMeta = taskStatusMap[currentTask.status] || { label: currentTask.status, class: '' };
  const canApproveTask = isAdmin && currentTask.status === 'PENDING' && (currentTask.approver_id === user.id || user.role === 'SUPER_ADMIN');
  const canDeliver = isAdmin && (order.status === 'READY_FOR_PICKUP' || order.status === 'APPROVED');

  const itemRows = (order.items || []).map(item => `
    <div class="approval-panel__item">
      <div class="approval-panel__item-main">
        <div class="approval-panel__item-title">${Utils.escapeHtml(item.asset_name_snapshot)}</div>
        <div class="approval-panel__item-code">${Utils.escapeHtml(item.asset_code_snapshot)}</div>
      </div>
      <div class="approval-panel__item-meta">
        <span>${Utils.escapeHtml(item.admin_name_snapshot || '-')}</span>
        <span>${Utils.escapeHtml(item.location_name_snapshot || '-')}</span>
      </div>
    </div>
  `).join('');

  const bodyHtml = `
    <div class="approval-panel__section">
      <div class="approval-panel__grid">
        <div class="approval-panel__field"><span class="approval-panel__label">申请人</span><span class="approval-panel__value">${Utils.escapeHtml(order.applicant_name || '-')}</span></div>
        <div class="approval-panel__field"><span class="approval-panel__label">创建时间</span><span class="approval-panel__value">${Utils.formatDateTime(order.created_at)}</span></div>
        <div class="approval-panel__field"><span class="approval-panel__label">器材数量</span><span class="approval-panel__value">${order.item_count} 件</span></div>
        <div class="approval-panel__field"><span class="approval-panel__label">订单状态</span><span class="approval-panel__value"><span class="chip ${sm.class}">${sm.label}</span></span></div>
        <div class="approval-panel__field"><span class="approval-panel__label">当前任务</span><span class="approval-panel__value"><span class="chip ${currentTaskMeta.class}">${currentTaskMeta.label}</span></span></div>
        <div class="approval-panel__field"><span class="approval-panel__label">预计归还</span><span class="approval-panel__value">${Utils.escapeHtml(order.expected_return_date || '-')}</span></div>
      </div>
      ${order.purpose ? `<div class="approval-panel__note"><span class="approval-panel__label">借用用途</span><div class="approval-panel__note-body">${Utils.escapeHtml(order.purpose)}</div></div>` : ''}
      ${order.remark ? `<div class="approval-panel__note"><span class="approval-panel__label">备注</span><div class="approval-panel__note-body">${Utils.escapeHtml(order.remark)}</div></div>` : ''}
    </div>
    <div class="approval-panel__section">
      <h4 class="approval-panel__section-title">器材清单</h4>
      <div class="approval-panel__list">${itemRows}</div>
    </div>
    ${orderPhotos.length > 0 ? `
      <div class="approval-panel__section">
        <h4 class="approval-panel__section-title">借出照片</h4>
        <div class="photo-gallery">
          ${orderPhotos.map(p => `<img src="/uploads/${Utils.escapeHtml(p.thumb_path || p.file_path)}" class="photo-gallery__img" onclick="Utils.openLightbox('/uploads/${Utils.escapeHtml(p.file_path)}')" data-no-card-nav="true">`).join('')}
        </div>
      </div>
    ` : ''}
    <div class="approval-panel__section">
      <h4 class="approval-panel__section-title">审批进度</h4>
      <div class="stack--sm">
        ${(order.approval_tasks || []).map(t => {
          const ts = taskStatusMap[t.status] || { label: t.status, class: '' };
          return `
            <div class="user-row">
              <div class="user-row__info">
                <span class="user-row__name">${Utils.escapeHtml(t.approver_name || '-')}</span>
                <span class="user-row__meta">${t.item_ids.length} 件设备 · ${t.decided_at ? Utils.formatDateTime(t.decided_at) : '待处理'}</span>
                ${t.comment ? `<span class="user-row__meta">${Utils.escapeHtml(t.comment)}</span>` : ''}
              </div>
              <span class="chip ${ts.class}">${ts.label}</span>
            </div>
          `;
        }).join('')}
      </div>
    </div>
    <div class="approval-panel__section">
      <h4 class="approval-panel__section-title">完整时间线</h4>
      ${renderTimelineHtml(timelineEvents)}
    </div>
  `;

  const footerHtml = `
    <button class="btn btn--outline approval-panel-close-btn" type="button">关闭</button>
    ${canDeliver ? '<button class="btn btn--primary approval-panel-deliver-btn" type="button">确认交付</button>' : ''}
    ${canApproveTask ? '<button class="btn btn--danger approval-panel-reject-btn" type="button">驳回</button>' : ''}
    ${canApproveTask ? '<button class="btn btn--primary approval-panel-approve-btn" type="button">通过</button>' : ''}
  `;

  const panel = openApprovalPanel({
    title: order.order_no,
    subtitle: `申请人：${Utils.escapeHtml(order.applicant_name || '-')} · ${Utils.formatDateTime(order.created_at)}`,
    statusLabel: sm.label,
    statusClass: sm.class,
    bodyHtml,
    footerHtml,
  });

  panel.overlay.querySelector('.approval-panel-close-btn')?.addEventListener('click', panel.close);

  panel.overlay.querySelector('.approval-panel-approve-btn')?.addEventListener('click', () => {
    _showApprovalModal('通过借出审批', '确认通过该借出申请？', async (comment) => {
      await Api.approveBorrowTask(currentTask.id, comment);
      panel.close();
      Utils.showToast('已通过');
      Router.navigate('borrow-approvals', { status: statusFilter, page });
    });
  });

  panel.overlay.querySelector('.approval-panel-reject-btn')?.addEventListener('click', () => {
    _showApprovalModal('驳回借出审批', '请填写驳回原因：', async (comment) => {
      await Api.rejectBorrowTask(currentTask.id, comment);
      panel.close();
      Utils.showToast('已驳回');
      Router.navigate('borrow-approvals', { status: statusFilter, page });
    }, true);
  });

  panel.overlay.querySelector('.approval-panel-deliver-btn')?.addEventListener('click', () => {
    _showApprovalModal('确认交付', `确认 ${order.item_count} 件设备已线下交付给 ${order.applicant_name || '申请人'}？`, async () => {
      await Api.deliverBorrowOrder(order.id);
      panel.close();
      Utils.showToast('已确认交付');
      Router.navigate('borrow-approvals', { status: statusFilter, page });
    });
  });
}

const equipmentOrderStatusMap = {
  PENDING_BORROW_APPROVAL: { label: '待借出审批', class: 'chip--pending' },
  BORROW_REJECTED: { label: '借出驳回', class: 'chip--danger' },
  READY_FOR_PICKUP: { label: '待领取', class: 'chip--stock' },
  BORROWED: { label: '借用中', class: 'chip--borrowed' },
  PENDING_RETURN_APPROVAL: { label: '待归还审批', class: 'chip--warning' },
  RETURN_REJECTED: { label: '归还驳回', class: 'chip--danger' },
  PENDING_STOCK_IN: { label: '待入库', class: 'chip--warning' },
  PARTIALLY_RETURNED: { label: '部分归还', class: 'chip--warning' },
  COMPLETED: { label: '已完成', class: 'chip--success' },
  CANCELLED: { label: '已取消', class: 'chip--disabled' },
};

// ===== My Borrow Orders List =====
Router.register('my-orders', async (params) => {
  const app = document.getElementById('app');
  const user = Api.getUser();
  const isAdmin = user && (user.role === 'ASSET_ADMIN' || user.role === 'SUPER_ADMIN');
  const page = parseInt(params.page) || 1;
  const pageSize = 20;
  const isMobile = window.innerWidth <= 768;
  const statusGroup = ['ALL', 'COMPLETED', 'IN_PROGRESS'].includes((params.status_group || '').toUpperCase())
    ? (params.status_group || '').toUpperCase()
    : 'IN_PROGRESS';
  const orderFilterOptions = [
    { value: 'IN_PROGRESS', label: '进行中' },
    { value: 'COMPLETED', label: '已完成' },
    { value: 'ALL', label: '全部' },
  ];
  const orderFilterLabel = orderFilterOptions.find((item) => item.value === statusGroup)?.label || '进行中';

  let orders = [];
  let total = 0;
  try {
    const res = await Api.listEquipmentOrders({ page, page_size: pageSize, mine: true, status_group: statusGroup });
    orders = res.data.items || [];
    total = res.data.total || 0;
  } catch (e) {
    console.error(e);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);

  if (isAdmin) {
    const tableRows = orders.map(order => {
      const statusMeta = equipmentOrderStatusMap[order.status] || { label: order.status, class: '' };
      return `<tr data-id="${order.id}">
        <td><a class="data-table__link" href="#order-detail?id=${order.id}&status_group=${statusGroup}">${Utils.escapeHtml(order.order_no)}</a></td>
        <td>${order.item_count} 件</td>
        <td><span class="chip ${statusMeta.class}">${statusMeta.label}</span></td>
        <td>${Utils.formatDateTime(order.created_at)}</td>
      </tr>`;
    }).join('');

    const mainContent = `
      <div class="page-header">
        <div class="page-header__info">
          <h1 class="page-header__title">我的订单</h1>
          <p class="page-header__desc">展示当前账号提交的完整借用闭环订单 · 当前筛选：${orderFilterLabel}</p>
        </div>
        <div class="page-header__actions">
          <select id="my-orders-status-group" class="form-select">
            ${orderFilterOptions.map((option) => `<option value="${option.value}" ${statusGroup === option.value ? 'selected' : ''}>${option.label}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="card table-card">
        <div class="table-card__head">
          <div>
            <div class="table-card__title">订单列表</div>
            <div class="table-card__desc">按统一订单视图展示借出、归还和入库完整闭环</div>
          </div>
          <span class="tag">${orderFilterLabel} ${total} 条</span>
        </div>
        <div class="table-wrapper">
          <table class="data-table data-table--interactive">
            <thead><tr><th>单号</th><th>器材数量</th><th>状态</th><th>创建时间</th></tr></thead>
            <tbody>${tableRows || '<tr><td colspan="4"><div class="empty-state">暂无记录</div></td></tr>'}</tbody>
          </table>
        </div>
      </div>
      ${totalPages > 1 ? `
        <div class="flex-center gap-sm" style="margin-top:16px;">
          ${currentPage > 1 ? `<button class="btn btn--outline btn--sm" onclick="Router.navigate('my-orders',{page:${currentPage - 1},status_group:'${statusGroup}'})">上一页</button>` : ''}
          <span class="text-sm text-muted">${currentPage} / ${totalPages}</span>
          ${currentPage < totalPages ? `<button class="btn btn--outline btn--sm" onclick="Router.navigate('my-orders',{page:${currentPage + 1},status_group:'${statusGroup}'})">下一页</button>` : ''}
        </div>` : ''}`;
    app.innerHTML = isMobile ? renderMobileAdminShell('my-orders', mainContent) : renderPcLayout('my-orders', mainContent);
    document.getElementById('my-orders-status-group')?.addEventListener('change', (event) => {
      Router.navigate('my-orders', { page: 1, status_group: event.target.value });
    });
    document.querySelectorAll('.data-table--interactive tbody tr[data-id]').forEach((row) => {
      row.addEventListener('click', (event) => {
        if (event.target.closest('a, button')) return;
        Router.navigate('order-detail', { id: row.dataset.id, status_group: statusGroup });
      });
    });
  } else {
    const userBody = `
      <div class="stack--md">
        <div>
          <h1 style="font-size:1.5rem;margin-bottom:8px;">我的订单</h1>
          <p class="text-sm text-muted">展示当前账号提交的完整借用闭环订单 · 当前筛选：${orderFilterLabel}</p>
        </div>
        <div class="card stack--sm" style="padding:16px;">
          <label class="form-label" for="my-orders-status-group-mobile">订单筛选</label>
          <select id="my-orders-status-group-mobile" class="form-select">
            ${orderFilterOptions.map((option) => `<option value="${option.value}" ${statusGroup === option.value ? 'selected' : ''}>${option.label}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="asset-grid">
        ${orders.length === 0 ? '<div class="empty-state" style="grid-column:1/-1;"><p>暂无订单</p></div>' :
          orders.map(order => {
            const statusMeta = equipmentOrderStatusMap[order.status] || { label: order.status, class: '' };
            return `
              <div class="asset-card" data-id="${order.id}" style="cursor:pointer;">
                <div class="asset-card__header">
                  <div>
                    <div class="asset-card__title">${Utils.escapeHtml(order.order_no)}</div>
                    <div class="asset-card__code">${order.item_count} 件器材</div>
                  </div>
                  <span class="chip ${statusMeta.class}">${statusMeta.label}</span>
                </div>
                <div class="asset-card__meta">${Utils.formatDateTime(order.created_at)}</div>
              </div>`;
          }).join('')}
      </div>
      ${totalPages > 1 ? `
        <div class="flex-center gap-sm" style="margin-top:20px;">
          ${currentPage > 1 ? `<button class="btn btn--outline btn--sm" onclick="Router.navigate('my-orders',{page:${currentPage - 1},status_group:'${statusGroup}'})">上一页</button>` : ''}
          <span class="text-sm text-muted">${currentPage} / ${totalPages}</span>
          ${currentPage < totalPages ? `<button class="btn btn--outline btn--sm" onclick="Router.navigate('my-orders',{page:${currentPage + 1},status_group:'${statusGroup}'})">下一页</button>` : ''}
        </div>` : ''}`;

    if (isMobile) {
      app.innerHTML = renderMobileUserShell('my-orders', userBody, { showBottomNav: true });
    } else {
      app.innerHTML = renderUserLayout('my-orders', userBody);
    }

    document.getElementById('my-orders-status-group-mobile')?.addEventListener('change', (event) => {
      Router.navigate('my-orders', { page: 1, status_group: event.target.value });
    });
    document.querySelectorAll('.asset-card[data-id]').forEach(card => {
      card.addEventListener('click', () => Router.navigate('order-detail', { id: card.dataset.id, status_group: statusGroup }));
    });
  }
});

Router.register('order-detail', async (params) => {
  const app = document.getElementById('app');
  const user = Api.getUser();
  const isAdmin = user && (user.role === 'ASSET_ADMIN' || user.role === 'SUPER_ADMIN');
  const isMobile = window.innerWidth <= 768;
  const statusGroup = ['ALL', 'COMPLETED', 'IN_PROGRESS'].includes((params.status_group || '').toUpperCase())
    ? (params.status_group || '').toUpperCase()
    : 'IN_PROGRESS';

  let order = null;
  let timelineEvents = [];
  try {
    const [orderRes, timelineRes] = await Promise.all([
      Api.getEquipmentOrder(params.id),
      Api.getEquipmentOrderTimeline(params.id),
    ]);
    order = orderRes.data;
    timelineEvents = timelineRes.data || [];
  } catch (e) {
    app.innerHTML = `<div class="empty-state"><p>${Utils.escapeHtml(e.message)}</p></div>`;
    return;
  }

  const statusMeta = equipmentOrderStatusMap[order.status] || { label: order.status, class: '' };
  const borrowStage = order.borrow_order;
  const canDeliver = isAdmin && borrowStage && order.status === 'READY_FOR_PICKUP';
  const canCancel = borrowStage && order.applicant_id === user.id && order.status === 'PENDING_BORROW_APPROVAL' && borrowStage.status === 'PENDING_APPROVAL';
  const canReturn = borrowStage && order.applicant_id === user.id && ['BORROWED', 'PARTIALLY_RETURNED', 'RETURN_REJECTED'].includes(order.status);

  const borrowTaskStatusMap = {
    PENDING: { label: '待审批', class: 'chip--pending' },
    APPROVED: { label: '已通过', class: 'chip--success' },
    REJECTED: { label: '已驳回', class: 'chip--danger' },
    SKIPPED: { label: '已跳过', class: 'chip--disabled' },
  };
  const returnItemConditionMap = {
    GOOD: { label: '完好', class: 'chip--stock' },
    DAMAGED: { label: '损坏', class: 'chip--damaged' },
    PARTIAL_LOSS: { label: '部分丢失', class: 'chip--warning' },
    FULL_LOSS: { label: '完全丢失', class: 'chip--lost' },
  };

  const detailHtml = `
    <div class="stack stack--page">
      <div class="page-header">
        <div class="page-header__info">
          <h1 class="page-header__title">${Utils.escapeHtml(order.order_no)}</h1>
          <p class="page-header__desc">申请人：${Utils.escapeHtml(order.applicant_name || '-')} · ${Utils.formatDateTime(order.created_at)}</p>
        </div>
        <div class="page-header__actions">
          <span class="chip ${statusMeta.class}">${statusMeta.label}</span>
          ${canDeliver ? '<button id="order-deliver-btn" class="btn btn--primary btn--sm">确认交付</button>' : ''}
          ${canReturn ? '<button id="order-return-btn" class="btn btn--primary btn--sm">提交归还</button>' : ''}
          ${canCancel ? '<button id="order-cancel-btn" class="btn btn--outline btn--sm">取消订单</button>' : ''}
          <button class="btn btn--outline btn--sm" onclick="Router.navigate('my-orders',{status_group:'${statusGroup}'})">返回列表</button>
        </div>
      </div>

      <div class="content-row">
        <div class="content-main">
          <div class="card order-summary-card stack--md">
            <div class="order-summary-card__head">
              <div class="order-summary-card__copy">
                <h3>订单信息</h3>
                <p class="order-summary-card__desc">当前借用事务的关键信息、用途说明与完成节点</p>
              </div>
              <span class="tag">${Utils.escapeHtml(order.order_no)}</span>
            </div>
            <div class="order-kpi-grid">
              <div class="order-kpi"><div class="order-kpi__label">器材数量</div><div class="order-kpi__value">${order.item_count} 件</div></div>
              <div class="order-kpi"><div class="order-kpi__label">创建时间</div><div class="order-kpi__value">${Utils.formatDateTime(order.created_at)}</div></div>
              <div class="order-kpi"><div class="order-kpi__label">预计归还</div><div class="order-kpi__value">${Utils.escapeHtml(order.expected_return_date || '-')}</div></div>
              <div class="order-kpi"><div class="order-kpi__label">最终完成</div><div class="order-kpi__value">${order.completed_at ? Utils.formatDateTime(order.completed_at) : '-'}</div></div>
            </div>
            ${order.purpose ? `<div><div class="text-xs text-muted">借用用途</div><div class="text-sm">${Utils.escapeHtml(order.purpose)}</div></div>` : ''}
            ${order.remark ? `<div><div class="text-xs text-muted">备注</div><div class="text-sm">${Utils.escapeHtml(order.remark)}</div></div>` : ''}
          </div>

          <div class="card stack--md">
            <h3>器材清单</h3>
            <div class="table-wrapper">
              <table class="data-table">
                <thead><tr><th>编号</th><th>名称</th><th>管理员</th><th>位置</th></tr></thead>
                <tbody>
                  ${order.items.map(item => `
                    <tr>
                      <td class="text-sm">${Utils.escapeHtml(item.asset_code_snapshot)}</td>
                      <td>${Utils.escapeHtml(item.asset_name_snapshot)}</td>
                      <td class="text-sm">${Utils.escapeHtml(item.admin_name_snapshot)}</td>
                      <td class="text-sm">${Utils.escapeHtml(item.location_name_snapshot || '-')}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <div class="card stack--md">
            <div class="flex-between">
              <h3>归还记录</h3>
              <span class="text-xs text-muted">共 ${order.return_orders.length} 次</span>
            </div>
            ${order.return_orders.length === 0 ? '<div class="text-sm text-muted">当前还没有归还记录</div>' : `
              <div class="order-batches">
                ${order.return_orders.map(batch => {
                  const batchStatusKey = batch.status === 'REJECTED'
                    ? 'RETURN_REJECTED'
                    : batch.status === 'COMPLETED'
                      ? 'COMPLETED'
                      : batch.status === 'APPROVED'
                        ? 'PENDING_STOCK_IN'
                        : 'PENDING_RETURN_APPROVAL';
                  const batchStatusMeta = equipmentOrderStatusMap[batchStatusKey] || { label: batch.status, class: '' };
                  const canStockInBatch = isAdmin && batch.status === 'APPROVED';
                  return `
                    <div class="order-batch-card">
                      <div class="order-batch-card__copy">
                        <div class="order-batch-card__name">${Utils.escapeHtml(batch.order_no)}</div>
                        <div class="order-batch-card__meta">${batch.item_count} 件器材 · ${Utils.formatDateTime(batch.created_at)}</div>
                        <div class="order-batch-card__meta">${batch.items.map(item => {
                          const cm = returnItemConditionMap[item.condition] || { label: item.condition, class: '' };
                          return `${Utils.escapeHtml(item.asset_code_snapshot)}（${cm.label}）`;
                        }).join('、')}</div>
                        ${batch.remark ? `<div class="order-batch-card__meta">${Utils.escapeHtml(batch.remark)}</div>` : ''}
                      </div>
                      <div class="order-batch-card__actions">
                        <span class="chip ${batchStatusMeta.class}">${batchStatusMeta.label}</span>
                        ${canStockInBatch ? `<button class="btn btn--primary btn--sm order-stock-in-btn" data-id="${batch.id}" data-order-no="${Utils.escapeHtml(batch.order_no)}">确认入库</button>` : ''}
                        <a href="#return-detail?id=${batch.id}" class="btn btn--outline btn--sm">查看详情</a>
                      </div>
                    </div>`;
                }).join('')}
              </div>`}
          </div>
        </div>

        <div class="content-side">
          ${borrowStage ? `
          <div class="card stack--md">
            <h3>借出审批进度</h3>
            <div class="stack--sm">
              ${borrowStage.approval_tasks.map(task => {
                const taskMeta = borrowTaskStatusMap[task.status] || { label: task.status, class: '' };
                return `
                  <div class="user-row" style="gap:10px;">
                    <div class="user-row__info">
                      <span class="user-row__name">${Utils.escapeHtml(task.approver_name || '-')}</span>
                      <span class="user-row__meta">${task.item_ids.length} 件设备 · ${task.decided_at ? Utils.formatDateTime(task.decided_at) : '待处理'}</span>
                      ${task.comment ? `<span class="user-row__meta">${Utils.escapeHtml(task.comment)}</span>` : ''}
                    </div>
                    <span class="chip ${taskMeta.class}">${taskMeta.label}</span>
                  </div>`;
              }).join('')}
            </div>
          </div>` : ''}

          <div class="card stack--sm">
            <h3>完整时间线</h3>
            ${timelineEvents.length > 0 ? `
              <div class="timeline">
                ${timelineEvents.map(ev => `
                  <div class="timeline__item">
                    <div class="timeline__dot"></div>
                    <div class="timeline__content">
                      <span class="text-sm">${Utils.escapeHtml(ev.description || ev.action)}</span>
                      <span class="text-xs text-muted">${Utils.formatDateTime(ev.created_at)}</span>
                    </div>
                  </div>
                `).join('')}
              </div>` : '<div class="text-sm text-muted">暂无时间线数据</div>'}
          </div>
        </div>
      </div>
    </div>`;

  if (isAdmin && isMobile) {
    app.innerHTML = renderMobileAdminShell('my-orders', detailHtml);
  } else if (isAdmin) {
    app.innerHTML = renderPcLayout('my-orders', detailHtml);
  } else if (isMobile) {
    app.innerHTML = renderMobileUserShell('my-orders', detailHtml, {
      backHref: 'my-orders',
      backLabel: '返回我的订单',
      compact: true,
    });
  } else {
    app.innerHTML = renderUserLayout('my-orders', detailHtml);
  }

  const deliverBtn = document.getElementById('order-deliver-btn');
  if (deliverBtn && borrowStage) {
    deliverBtn.addEventListener('click', () => {
      _showApprovalModal('确认交付', `确认 ${order.item_count} 件设备已线下交付？`, async () => {
        await Api.deliverBorrowOrder(borrowStage.id);
        Utils.showToast('已确认交付');
        Router.navigate('order-detail', { id: order.id });
      });
    });
  }

  const returnBtn = document.getElementById('order-return-btn');
  if (returnBtn && borrowStage) {
    returnBtn.addEventListener('click', () => {
      Router.navigate('return-submit', { borrow_order_id: borrowStage.id });
    });
  }

  const cancelBtn = document.getElementById('order-cancel-btn');
  if (cancelBtn && borrowStage) {
    cancelBtn.addEventListener('click', () => {
      _showApprovalModal('取消订单', '确认取消该借用订单？此操作不可撤销。', async () => {
        await Api.cancelBorrowOrder(borrowStage.id);
        Utils.showToast('订单已取消');
        Router.navigate('my-orders');
      });
    });
  }

  document.querySelectorAll('.order-stock-in-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _showApprovalModal('确认入库', `确认归还批次 ${btn.dataset.orderNo} 已完成入库？`, async () => {
        await Api.stockInReturnOrder(btn.dataset.id);
        Utils.showToast('已确认入库');
        Router.navigate('order-detail', { id: order.id });
      });
    });
  });
});

// ===== Borrow Order Detail =====
Router.register('borrow-detail', async (params) => {
  const app = document.getElementById('app');
  const user = Api.getUser();
  const isAdmin = user && (user.role === 'ASSET_ADMIN' || user.role === 'SUPER_ADMIN');
  const context = isAdmin ? resolveAdminDetailContext(params.from, 'my-orders') : null;

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

  // Load borrow order photos & timeline
  let orderPhotos = [];
  let timelineEvents = [];
  try {
    const pr = await Api.listAttachments({ related_type: 'BorrowOrder', related_id: order.id, photo_type: 'BORROW_ORDER' });
    orderPhotos = pr.data || [];
  } catch (e) { /* ignore */ }
  try {
    const tr = await Api.getOrderTimeline(order.id);
    timelineEvents = tr.data || [];
  } catch (e) { /* ignore */ }

  const detailHtml = `
    <div class="stack stack--page">
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
          <button class="btn btn--outline btn--sm" onclick="Router.navigate('${isAdmin ? context.backHref : 'my-orders'}')">${isAdmin ? context.backLabel : '返回列表'}</button>
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
        ${orderPhotos.length > 0 ? `
        <div class="card stack--sm">
          <h3>借出照片</h3>
          <div class="photo-gallery">
            ${orderPhotos.map(p => `<img src="/uploads/${Utils.escapeHtml(p.thumb_path || p.file_path)}" class="photo-gallery__img" onclick="Utils.openLightbox('/uploads/${Utils.escapeHtml(p.file_path)}')">`).join('')}
          </div>
        </div>` : ''}
        </div>

        <div class="content-side">
        <div class="card stack--md">
          <h3>审批进度</h3>
          <div class="stack--sm">
            ${(order.approval_tasks || []).map(t => {
              const ts = taskStatusMap[t.status] || { label: t.status, class: '' };
              const canApproveTask = isAdmin && t.status === 'PENDING' && (t.approver_id === user.id || user.role === 'SUPER_ADMIN');
              return `
                <div class="user-row" style="flex-wrap:wrap;gap:8px;">
                  <div class="user-row__info">
                    <span class="user-row__name">${Utils.escapeHtml(t.approver_name || '-')}</span>
                    <span class="user-row__meta">${t.item_ids.length} 件设备 · ${t.decided_at ? Utils.formatDateTime(t.decided_at) : '待处理'}</span>
                    ${t.comment ? `<span class="user-row__meta text-muted">${Utils.escapeHtml(t.comment)}</span>` : ''}
                  </div>
                  <div style="display:flex;gap:6px;align-items:center;">
                    <span class="chip ${ts.class}">${ts.label}</span>
                    ${canApproveTask ? `
                      <button class="btn btn--primary btn--sm inline-approve-btn" data-id="${t.id}" style="padding:5px 10px;font-size:0.75rem;">通过</button>
                      <button class="btn btn--danger btn--sm inline-reject-btn" data-id="${t.id}" style="padding:5px 10px;font-size:0.75rem;">驳回</button>
                    ` : ''}
                  </div>
                </div>`;
            }).join('')}
          </div>
        </div>

        <div class="card stack--sm">
          <h3>事件时间线</h3>
          ${timelineEvents.length > 0 ? `
          <div class="timeline">
            ${timelineEvents.map(ev => `
              <div class="timeline__item">
                <div class="timeline__dot"></div>
                <div class="timeline__content">
                  <span class="text-sm">${Utils.escapeHtml(ev.description || ev.action)}</span>
                  <span class="text-xs text-muted">${Utils.formatDateTime(ev.created_at)}</span>
                </div>
              </div>`).join('')}
          </div>` : `
          <div class="meta-row"><span class="meta-row__label">创建</span><span class="meta-row__value text-sm">${Utils.formatDateTime(order.created_at)}</span></div>
          ${order.delivered_at ? `<div class="meta-row"><span class="meta-row__label">交付</span><span class="meta-row__value text-sm">${Utils.formatDateTime(order.delivered_at)}</span></div>` : ''}
          `}
          ${order.expected_return_date ? `<div class="meta-row" style="margin-top:8px;"><span class="meta-row__label">预计归还</span><span class="meta-row__value text-sm">${Utils.escapeHtml(order.expected_return_date)}</span></div>` : ''}
        </div>
        </div>
      </div>
    </div>`;

  if (isAdmin) {
    app.innerHTML = renderPcLayout(context.active, detailHtml);
  } else {
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      app.innerHTML = renderMobileUserShell('my-orders', detailHtml, {
        backHref: 'my-orders',
        backLabel: '返回借用单列表',
        compact: true,
      });
    } else {
      app.innerHTML = renderUserLayout('my-orders', detailHtml);
    }
  }

  // Deliver button with modal
  const deliverBtn = document.getElementById('deliver-btn');
  if (deliverBtn) {
    deliverBtn.addEventListener('click', () => {
      _showApprovalModal('确认交付', `确认 ${order.item_count} 件设备已线下交付给 ${order.applicant_name || '申请人'}？`, async (comment) => {
        await Api.deliverBorrowOrder(order.id);
        Utils.showToast('已确认交付');
        Router.navigate('borrow-detail', { id: order.id });
      });
    });
  }

  // Return button
  const returnBtn = document.getElementById('return-btn');
  if (returnBtn) {
    returnBtn.addEventListener('click', () => {
      Router.navigate('return-submit', { borrow_order_id: order.id });
    });
  }

  // Cancel button with modal
  const cancelBtn = document.getElementById('cancel-btn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      _showApprovalModal('取消借用单', '确认取消该借用单？此操作不可撤销。', async () => {
        await Api.cancelBorrowOrder(order.id);
        Utils.showToast('借用单已取消');
        Router.navigate('my-orders');
      });
    });
  }

  // Inline approve/reject buttons on borrow detail
  document.querySelectorAll('.inline-approve-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _showApprovalModal('通过借出审批', '确认通过该借出申请？', async (comment) => {
        await Api.approveBorrowTask(btn.dataset.id, comment);
        Utils.showToast('已通过');
        Router.navigate('borrow-detail', { id: order.id });
      });
    });
  });
  document.querySelectorAll('.inline-reject-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _showApprovalModal('驳回借出审批', '请填写驳回原因：', async (comment) => {
        await Api.rejectBorrowTask(btn.dataset.id, comment);
        Utils.showToast('已驳回');
        Router.navigate('borrow-detail', { id: order.id });
      }, true);
    });
  });
});

// ===== Admin: Approval Tasks Page =====
Router.register('borrow-approvals', async (params) => {
  const app = document.getElementById('app');
  const page = parseInt(params.page) || 1;
  const statusFilter = params.status || (params.history === '1' ? 'ALL' : 'PENDING');
  const isMobile = window.innerWidth <= 768;

  const borrowApprovalStatusMeta = {
    PENDING: { label: '待审批', desc: '待处理借出审批任务' },
    READY_FOR_PICKUP: { label: '待交付', desc: '查看审批已通过、等待线下交付的借用单' },
    ALL: { label: '全部', desc: '查看全部借出审批记录' },
    APPROVED: { label: '已通过', desc: '查看已通过借出审批记录' },
    REJECTED: { label: '已驳回', desc: '查看已驳回借出审批记录' },
    SKIPPED: { label: '已跳过', desc: '查看已跳过借出审批记录' },
  };

  function buildBorrowApprovalQuery(currentStatus) {
    const query = { page, page_size: 20 };
    if (currentStatus === 'PENDING') {
      query.status = 'PENDING';
      return query;
    }
    if (currentStatus === 'READY_FOR_PICKUP') {
      return null;
    }
    if (currentStatus === 'ALL') {
      return query;
    }
    query.status = currentStatus;
    query.history_only = true;
    return query;
  }

  function buildBorrowApprovalParams(currentStatus, currentPage = 1) {
    const nextParams = {};
    if (currentStatus && currentStatus !== 'PENDING') nextParams.status = currentStatus;
    if (currentPage > 1) nextParams.page = currentPage;
    return nextParams;
  }

  let tasks = [], total = 0;
  let deliveryOrders = [];
  try {
    if (statusFilter === 'READY_FOR_PICKUP') {
      const res = await Api.listBorrowOrders({ page, page_size: 20, status: 'READY_FOR_PICKUP', managed: true });
      deliveryOrders = res.data.items || [];
      total = res.data.total || 0;
    } else {
      const res = await Api.listBorrowApprovalTasks(buildBorrowApprovalQuery(statusFilter));
      tasks = res.data.items;
      total = res.data.total;
    }
  } catch (e) { console.error(e); }

  const taskStatusMap = {
    PENDING: { label: '待审批', class: 'chip--pending' },
    APPROVED: { label: '已通过', class: 'chip--success' },
    REJECTED: { label: '已驳回', class: 'chip--danger' },
    SKIPPED: { label: '已跳过', class: 'chip--disabled' },
  };

  const taskCards = statusFilter === 'READY_FOR_PICKUP'
    ? deliveryOrders.map(order => {
      const statusMeta = borrowStatusMap.READY_FOR_PICKUP;
      const itemRows = (order.items || []).map(item => `
        <div class="approval-task-card__mini-item">
          <div class="approval-task-card__mini-main">
            <div class="approval-task-card__mini-code">${Utils.escapeHtml(item.asset_code_snapshot)}</div>
            <div class="approval-task-card__mini-name">${Utils.escapeHtml(item.asset_name_snapshot)}</div>
          </div>
          <span class="approval-task-card__mini-meta">${Utils.escapeHtml(item.location_name_snapshot || '-')}</span>
        </div>
      `).join('');

      return `
        <div class="card approval-task-card approval-task-card--interactive approval-task-card--history" data-order-id="${order.id}" data-order-stage="delivery">
          <div class="approval-task-card__head">
            <div>
              <div class="approval-task-card__order">${Utils.escapeHtml(order.order_no)}</div>
              <div class="approval-task-card__applicant">申请人：${Utils.escapeHtml(order.applicant_name || '-')}</div>
            </div>
            <span class="chip ${statusMeta.class}">${statusMeta.label}</span>
          </div>
          <div class="approval-task-card__summary">
            <span class="approval-task-card__stamp">${Utils.formatDateTime(order.created_at)}</span>
            <span class="text-xs text-muted">${order.item_count} 件设备</span>
          </div>
          <div class="approval-task-card__items">
            <div class="approval-task-card__items-label">设备清单</div>
            <div class="approval-task-card__mini-list">
              ${itemRows || '<div class="text-sm text-muted">暂无设备明细</div>'}
            </div>
          </div>
          <div class="approval-task-card__footer">
            <div class="approval-task-card__comment">审批已全部通过，等待线下交付。</div>
            <div class="approval-task-card__action-group">
              <button class="btn btn--primary btn--sm task-deliver-btn" data-id="${order.id}">确认交付</button>
            </div>
          </div>
        </div>`;
    })
    : tasks.map(t => {
      const ts = taskStatusMap[t.status] || { label: t.status, class: '' };
      const itemRows = (t.item_details || []).map(d => `
        <div class="approval-task-card__mini-item">
          <div class="approval-task-card__mini-main">
          <div class="approval-task-card__mini-code">${Utils.escapeHtml(d.asset_code_snapshot)}</div>
          <div class="approval-task-card__mini-name">${Utils.escapeHtml(d.asset_name_snapshot)}</div>
        </div>
        <span class="approval-task-card__mini-meta">${Utils.escapeHtml(d.location_name_snapshot || '-')}</span>
      </div>
    `).join('');

    return `
      <div class="card approval-task-card approval-task-card--interactive ${t.status === 'PENDING' ? '' : 'approval-task-card--history'}" data-task-id="${t.id}">
        <div class="approval-task-card__head">
          <div>
            <div class="approval-task-card__order">${Utils.escapeHtml(t.order_no || '查看借用单')}</div>
            <div class="approval-task-card__applicant">申请人：${Utils.escapeHtml(t.applicant_name || '-')}</div>
          </div>
          <span class="chip ${ts.class}">${ts.label}</span>
        </div>
        <div class="approval-task-card__summary">
          <span class="approval-task-card__stamp">${Utils.formatDateTime(t.created_at)}</span>
          <span class="text-xs text-muted">${t.item_details?.length || t.item_ids.length} 件设备</span>
        </div>
        <div class="approval-task-card__items">
          <div class="approval-task-card__items-label">设备清单</div>
          <div class="approval-task-card__mini-list">
            ${itemRows || '<div class="text-sm text-muted">加载中...</div>'}
          </div>
        </div>
        <div class="approval-task-card__footer">
          ${t.comment ? `<div class="approval-task-card__comment">审批意见：${Utils.escapeHtml(t.comment)}</div>` : ''}
          <div class="approval-task-card__action-group">
            ${t.status === 'PENDING' ? `
              <button class="btn btn--primary btn--sm task-approve-btn" data-id="${t.id}">通过</button>
              <button class="btn btn--danger btn--sm task-reject-btn" data-id="${t.id}">驳回</button>
            ` : ''}
          </div>
          </div>
        </div>`;
    }).join('');

  const mainContent = `
    <div class="page-header">
      <div class="page-header__info">
        <h1 class="page-header__title">借出审批</h1>
        <p class="page-header__desc">${borrowApprovalStatusMeta[statusFilter]?.desc || '查看借出审批记录'} · 共 ${total} 条</p>
      </div>
    </div>
    <div class="card approval-filter-card">
      <div class="approval-filter-card__controls">
        <select id="task-status-filter" class="form-select approval-filter-card__select">
          <option value="PENDING" ${statusFilter === 'PENDING' ? 'selected' : ''}>待审批</option>
          <option value="READY_FOR_PICKUP" ${statusFilter === 'READY_FOR_PICKUP' ? 'selected' : ''}>待交付</option>
          <option value="ALL" ${statusFilter === 'ALL' ? 'selected' : ''}>全部</option>
          <option value="APPROVED" ${statusFilter === 'APPROVED' ? 'selected' : ''}>已通过</option>
          <option value="REJECTED" ${statusFilter === 'REJECTED' ? 'selected' : ''}>已驳回</option>
          <option value="SKIPPED" ${statusFilter === 'SKIPPED' ? 'selected' : ''}>已跳过</option>
        </select>
      </div>
    </div>
    ${taskCards || '<div class="empty-state approval-page__empty">暂无审批任务</div>'}`;

  app.innerHTML = isMobile ? renderMobileAdminShell('borrow-approvals', mainContent) : renderPcLayout('borrow-approvals', mainContent);

  document.getElementById('task-status-filter').addEventListener('change', (e) => {
    Router.navigate('borrow-approvals', buildBorrowApprovalParams(e.target.value));
  });

  if (statusFilter === 'READY_FOR_PICKUP') {
    const orderMap = Object.fromEntries(deliveryOrders.map(order => [String(order.id), order]));
    bindClickableApprovalCards('.approval-task-card', (card) => {
      const order = orderMap[card.dataset.orderId];
      if (!order) return;
      openBorrowApprovalPanel({
        id: `delivery-${order.id}`,
        order_id: order.id,
        status: 'APPROVED',
        approver_id: Api.getUser()?.id,
        item_ids: [],
        created_at: order.created_at,
      }, { status: statusFilter, page });
    });
  } else {
    const taskMap = Object.fromEntries(tasks.map(task => [String(task.id), task]));
    bindClickableApprovalCards('.approval-task-card', (card) => {
      const task = taskMap[card.dataset.taskId];
      if (!task) return;
      openBorrowApprovalPanel(task, { status: statusFilter, page });
    });
  }

  // Approve with modal
  document.querySelectorAll('.task-approve-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _showApprovalModal('通过借出审批', '确认通过该借出申请？', async (comment) => {
        await Api.approveBorrowTask(btn.dataset.id, comment);
        Utils.showToast('已通过');
        Router.navigate('borrow-approvals', buildBorrowApprovalParams(statusFilter, page));
      });
    });
  });

  // Reject with modal
  document.querySelectorAll('.task-reject-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _showApprovalModal('驳回借出审批', '请填写驳回原因：', async (comment) => {
        await Api.rejectBorrowTask(btn.dataset.id, comment);
        Utils.showToast('已驳回');
        Router.navigate('borrow-approvals', buildBorrowApprovalParams(statusFilter, page));
      }, true);
    });
  });

  document.querySelectorAll('.task-deliver-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _showApprovalModal('确认交付', '确认该借用单已完成线下交付？', async () => {
        await Api.deliverBorrowOrder(btn.dataset.id);
        Utils.showToast('已确认交付');
        Router.navigate('borrow-approvals', buildBorrowApprovalParams(statusFilter, page));
      });
    });
  });
});

// ===== Shared Approval Modal =====
function _showApprovalModal(title, desc, onConfirm, requireComment = false) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__header">
        <h3 class="modal__title">${Utils.escapeHtml(title)}</h3>
        <button class="modal__close" id="modal-close">&times;</button>
      </div>
      <p class="text-sm text-muted" style="margin-bottom:12px;">${Utils.escapeHtml(desc)}</p>
      <div class="form-group">
        <label class="form-label">审批意见${requireComment ? '' : '（选填）'}</label>
        <textarea id="modal-comment" class="form-textarea" placeholder="填写审批意见..." style="min-height:60px;"></textarea>
      </div>
      <div id="modal-error" class="form-error hidden"></div>
      <div class="modal__footer">
        <button class="btn btn--outline btn--sm" id="modal-cancel">取消</button>
        <button class="btn btn--primary btn--sm" id="modal-confirm">确认</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.querySelector('#modal-close').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#modal-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#modal-confirm').addEventListener('click', async () => {
    const comment = overlay.querySelector('#modal-comment').value.trim() || null;
    if (requireComment && !comment) {
      const err = overlay.querySelector('#modal-error');
      err.textContent = '请填写原因';
      err.classList.remove('hidden');
      return;
    }
    const btn = overlay.querySelector('#modal-confirm');
    btn.disabled = true;
    btn.textContent = '处理中...';
    try {
      await onConfirm(comment);
      overlay.remove();
    } catch (e) {
      Utils.showToast(e.message, 'error');
      btn.disabled = false;
      btn.textContent = '确认';
    }
  });
}
