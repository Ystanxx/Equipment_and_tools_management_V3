// ===== Borrow Cart Page (Mobile) =====
Router.register('borrow-cart', async () => {
  const app = document.getElementById('app');
  const cart = Api.getCart();
  await Api.bootstrapSystemConfigs();
  const maxItems = Api.getSystemConfig('borrow_order_max_items', 20);
  const requirePurpose = Api.getSystemConfig('require_borrow_purpose', false);
  const requireExpectedReturnTime = Api.getSystemConfig('require_expected_return_time', false);

  app.innerHTML = `
    <div class="page--mobile has-bottom-nav">
      <div class="page" style="padding-top:20px;">
        <div class="flex-between" style="margin-bottom:16px;">
          <div>
            <h1 style="font-size:1.625rem;">借用清单</h1>
            <p class="text-xs text-muted">最多可添加 ${maxItems} 件设备</p>
          </div>
          <span class="chip chip--active">${cart.length} / ${maxItems}</span>
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
              <label class="form-label">借用说明 / 用途 ${requirePurpose ? '<span class="form-required">*必填</span>' : '<span class="text-xs text-muted">选填</span>'}</label>
              <textarea id="cart-purpose" class="form-textarea" placeholder="请说明借用原因和用途"></textarea>
            </div>
            <div class="form-group">
              <label class="form-label">预计归还日期${requireExpectedReturnTime ? ' <span class="form-required">*必填</span>' : '（选填）'}</label>
              <input type="date" id="cart-return-date" class="form-input">
            </div>
            <div class="form-group">
              <label class="form-label">备注（选填）</label>
              <textarea id="cart-remark" class="form-textarea" placeholder="其他信息"></textarea>
            </div>
            <div class="form-group">
              <label class="form-label">借出照片 <span class="form-required">*必填，拍照留痕</span></label>
              <input type="file" id="cart-photos" accept="image/jpeg,image/png,image/webp" multiple style="font-size:0.8125rem;">
              <p class="text-xs text-muted" style="margin-top:4px;">支持 jpg/png/webp，可多选，用于记录借出时设备状态</p>
              <div id="cart-photo-preview" style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;"></div>
            </div>
            <div id="cart-error" class="form-error hidden"></div>
            <button id="cart-submit" class="btn btn--primary btn--full">提交借用单 (${cart.length} 件)</button>
          </div>
        `}
      </div>

      <nav class="bottom-nav">
        <a href="#asset-list" class="bottom-nav__item">${Utils.svgIcon('box')}<span>设备</span></a>
        <a href="#borrow-cart" class="bottom-nav__item bottom-nav__item--active">${Utils.svgIcon('wrench')}<span>清单(${cart.length})</span></a>
        <a href="#my-orders" class="bottom-nav__item">${Utils.svgIcon('tag')}<span>借用单</span></a>
        <a href="#my-returns" class="bottom-nav__item">${Utils.svgIcon('undo')}<span>归还单</span></a>
      </nav>
    </div>`;

  // Photo preview
  const cartPhotos = document.getElementById('cart-photos');
  if (cartPhotos) {
    cartPhotos.addEventListener('change', () => {
      const preview = document.getElementById('cart-photo-preview');
      if (!preview) return;
      preview.innerHTML = '';
      for (const f of cartPhotos.files) {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(f);
        img.style.cssText = 'width:60px;height:60px;object-fit:cover;border-radius:6px;border:1px solid var(--line);';
        preview.appendChild(img);
      }
    });
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
      errEl.classList.add('hidden');
      const assetIds = cart.map(i => i.id);
      const purpose = document.getElementById('cart-purpose').value.trim() || null;
      const returnDate = document.getElementById('cart-return-date').value || null;
      const remark = document.getElementById('cart-remark').value.trim() || null;
      const photoInput = document.getElementById('cart-photos');

      if (requirePurpose && !purpose) {
        errEl.textContent = '当前系统要求填写借用说明/用途';
        errEl.classList.remove('hidden');
        return;
      }
      if (requireExpectedReturnTime && !returnDate) {
        errEl.textContent = '当前系统要求填写预计归还日期';
        errEl.classList.remove('hidden');
        return;
      }
      if (!photoInput || photoInput.files.length === 0) {
        errEl.textContent = '请上传借出照片（必填项，用于拍照留痕）';
        errEl.classList.remove('hidden');
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
        // Upload photos
        if (photoInput && photoInput.files.length > 0) {
          for (const f of photoInput.files) {
            try { await Api.uploadAttachment(f, 'BORROW_ORDER', 'BorrowOrder', res.data.id); } catch (e) { console.warn('Photo upload failed:', e); }
          }
        }
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
            <span class="chip ${statusFilter === 'COMPLETED' ? 'chip--active' : 'chip--outline'}" data-status="COMPLETED">已完成</span>
            <span class="chip ${statusFilter === 'CANCELLED' ? 'chip--active' : 'chip--outline'}" data-status="CANCELLED">已取消</span>
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
          <a href="#my-orders" class="bottom-nav__item bottom-nav__item--active">${Utils.svgIcon('tag')}<span>借用单</span></a>
          <a href="#my-returns" class="bottom-nav__item">${Utils.svgIcon('undo')}<span>归还单</span></a>
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
    </div>`;

  if (isAdmin) {
    app.innerHTML = renderPcLayout('my-orders', detailHtml);
  } else {
    app.innerHTML = `<div class="page--mobile"><div class="mobile-back-bar"><a href="#my-orders">${Utils.svgIcon('arrowLeft')} 返回借用单列表</a></div><div class="page" style="padding-top:8px;">${detailHtml}</div></div>`;
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
  const statusFilter = params.status || 'PENDING';

  let tasks = [], total = 0;
  try {
    const res = await Api.listBorrowApprovalTasks({ page, page_size: 20, status: statusFilter });
    tasks = res.data.items;
    total = res.data.total;
  } catch (e) { console.error(e); }

  const taskStatusMap = {
    PENDING: { label: '待审批', class: 'chip--pending' },
    APPROVED: { label: '已通过', class: 'chip--success' },
    REJECTED: { label: '已驳回', class: 'chip--danger' },
    SKIPPED: { label: '已跳过', class: 'chip--disabled' },
  };

  const taskCards = tasks.map(t => {
    const ts = taskStatusMap[t.status] || { label: t.status, class: '' };
    const itemRows = (t.item_details || []).map(d =>
      `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--panel-alt);">
        <div>
          <span class="text-sm" style="font-weight:500;">${Utils.escapeHtml(d.asset_code_snapshot)}</span>
          <span class="text-sm text-muted" style="margin-left:8px;">${Utils.escapeHtml(d.asset_name_snapshot)}</span>
        </div>
        <span class="text-xs text-muted">${Utils.escapeHtml(d.location_name_snapshot || '')}</span>
      </div>`
    ).join('');

    return `
      <div class="card" style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div>
            <a href="#borrow-detail?id=${t.order_id}" style="font-weight:600;font-size:0.9375rem;">${Utils.escapeHtml(t.order_no || '查看借用单')}</a>
            <span class="text-sm text-muted" style="margin-left:12px;">申请人：${Utils.escapeHtml(t.applicant_name || '-')}</span>
          </div>
          <span class="chip ${ts.class}">${ts.label}</span>
        </div>
        <div style="background:var(--panel-alt);border-radius:var(--radius-input);padding:10px 14px;margin-bottom:12px;">
          <div class="text-xs text-muted" style="margin-bottom:6px;">设备清单 (${t.item_details?.length || t.item_ids.length} 件)</div>
          ${itemRows || '<div class="text-sm text-muted">加载中...</div>'}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span class="text-xs text-muted">${Utils.formatDateTime(t.created_at)}</span>
          <div style="display:flex;gap:8px;align-items:center;">
            ${t.comment ? `<span class="text-xs text-muted" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;">${Utils.escapeHtml(t.comment)}</span>` : ''}
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
        <p class="page-header__desc">共 ${total} 条任务</p>
      </div>
    </div>
    <div class="flex gap-md" style="margin-bottom:12px;">
      <select id="task-status-filter" class="form-select" style="width:140px;">
        <option value="PENDING" ${statusFilter === 'PENDING' ? 'selected' : ''}>待审批</option>
        <option value="APPROVED" ${statusFilter === 'APPROVED' ? 'selected' : ''}>已通过</option>
        <option value="REJECTED" ${statusFilter === 'REJECTED' ? 'selected' : ''}>已驳回</option>
        <option value="" ${!statusFilter ? 'selected' : ''}>全部</option>
      </select>
    </div>
    ${taskCards || '<div class="empty-state" style="padding:40px;">暂无审批任务</div>'}`;

  app.innerHTML = renderPcLayout('borrow-approvals', mainContent);

  document.getElementById('task-status-filter').addEventListener('change', (e) => {
    Router.navigate('borrow-approvals', { status: e.target.value });
  });

  // Approve with modal
  document.querySelectorAll('.task-approve-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _showApprovalModal('通过借出审批', '确认通过该借出申请？', async (comment) => {
        await Api.approveBorrowTask(btn.dataset.id, comment);
        Utils.showToast('已通过');
        Router.navigate('borrow-approvals', { status: statusFilter });
      });
    });
  });

  // Reject with modal
  document.querySelectorAll('.task-reject-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _showApprovalModal('驳回借出审批', '请填写驳回原因：', async (comment) => {
        await Api.rejectBorrowTask(btn.dataset.id, comment);
        Utils.showToast('已驳回');
        Router.navigate('borrow-approvals', { status: statusFilter });
      }, true);
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
