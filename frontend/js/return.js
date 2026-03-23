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
            <div style="margin-left:28px;margin-top:6px;">
              <label class="form-label">归还照片 <span class="form-required">*必填，每件单独拍照</span></label>
              <input type="file" class="return-photos" data-idx="${idx}" accept="image/jpeg,image/png,image/webp" multiple
                     style="font-size:0.8125rem;">
              <div class="return-photo-preview" data-idx="${idx}" style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;"></div>
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
    app.innerHTML = renderPcLayout('my-returns', formHtml);
  } else {
    app.innerHTML = `<div class="page--mobile"><div class="mobile-back-bar"><a href="#borrow-detail?id=${borrowOrderId}">${Utils.svgIcon('arrowLeft')} 返回借用单</a></div><div class="page" style="padding-top:8px;">${formHtml}</div></div>`;
  }

  // Photo preview on file select
  document.querySelectorAll('.return-photos').forEach(input => {
    input.addEventListener('change', () => {
      const idx = input.dataset.idx;
      const preview = document.querySelector(`.return-photo-preview[data-idx="${idx}"]`);
      if (!preview) return;
      preview.innerHTML = '';
      for (const f of input.files) {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(f);
        img.style.cssText = 'width:60px;height:60px;object-fit:cover;border-radius:6px;border:1px solid var(--border);';
        preview.appendChild(img);
      }
    });
  });

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
      const photoMap = {}; // idx -> FileList
      document.querySelectorAll('.return-check:checked').forEach(cb => {
        const idx = cb.dataset.idx;
        const condition = document.querySelector(`.return-condition[data-idx="${idx}"]`).value;
        const desc = document.querySelector(`.return-damage-desc[data-idx="${idx}"]`)?.value?.trim() || null;
        const fileInput = document.querySelector(`.return-photos[data-idx="${idx}"]`);
        if (fileInput && fileInput.files.length > 0) photoMap[items.length] = fileInput.files;
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

      // Validate photos mandatory per item
      let missingPhoto = false;
      document.querySelectorAll('.return-check:checked').forEach(cb => {
        const idx = cb.dataset.idx;
        const fileInput = document.querySelector(`.return-photos[data-idx="${idx}"]`);
        if (!fileInput || fileInput.files.length === 0) missingPhoto = true;
      });
      if (missingPhoto) {
        errEl.textContent = '每件归还设备必须上传照片（必填项）';
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
        // Upload photos for each item
        const roItems = res.data.items || [];
        for (const [itemIdx, files] of Object.entries(photoMap)) {
          const ri = roItems[parseInt(itemIdx)];
          if (!ri) continue;
          for (const f of files) {
            try { await Api.uploadAttachment(f, 'RETURN_ITEM', 'ReturnOrderItem', ri.id); } catch (e) { console.warn('Photo upload failed:', e); }
          }
        }
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

  // Load photos for each item & timeline
  const itemPhotos = {};
  let timelineEvents = [];
  for (const item of order.items) {
    try {
      const pr = await Api.listAttachments({ related_type: 'ReturnOrderItem', related_id: item.id, photo_type: 'RETURN_ITEM' });
      itemPhotos[item.id] = pr.data || [];
    } catch (e) { /* ignore */ }
  }
  try {
    const tr = await Api.getOrderTimeline(order.id);
    timelineEvents = tr.data || [];
  } catch (e) { /* ignore */ }

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
              <thead><tr><th>编号</th><th>名称</th><th>归还状态</th><th>管理员</th><th>备注</th><th>照片</th></tr></thead>
              <tbody>
                ${order.items.map(i => {
                  const cm = conditionMap[i.condition] || { label: i.condition, class: '' };
                  const photos = itemPhotos[i.id] || [];
                  return `<tr>
                    <td class="text-sm">${Utils.escapeHtml(i.asset_code_snapshot)}</td>
                    <td>${Utils.escapeHtml(i.asset_name_snapshot)}</td>
                    <td><span class="chip ${cm.class}">${cm.label}</span></td>
                    <td class="text-sm">${Utils.escapeHtml(i.admin_name_snapshot)}</td>
                    <td class="text-sm text-muted">${Utils.escapeHtml(i.damage_description || '-')}</td>
                    <td>${photos.length > 0 ? photos.map(p => `<img src="/uploads/${Utils.escapeHtml(p.thumb_path || p.file_path)}" class="photo-gallery__img" style="width:40px;height:40px;" onclick="Utils.openLightbox('/uploads/${Utils.escapeHtml(p.file_path)}')">`).join(' ') : '<span class="text-xs text-muted">无照片</span>'}</td>
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
                      <button class="btn btn--primary btn--sm rt-inline-approve" data-id="${t.id}" style="padding:5px 10px;font-size:0.75rem;">通过</button>
                      <button class="btn btn--danger btn--sm rt-inline-reject" data-id="${t.id}" style="padding:5px 10px;font-size:0.75rem;">驳回</button>
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
          `}
        </div>
      </div>
    </div>`;

  if (isAdmin) {
    app.innerHTML = renderPcLayout('my-returns', detailHtml);
  } else {
    app.innerHTML = `<div class="page--mobile"><div class="mobile-back-bar"><a href="#my-returns">${Utils.svgIcon('arrowLeft')} 返回归还单列表</a></div><div class="page" style="padding-top:8px;">${detailHtml}</div></div>`;
  }

  // Inline approve/reject on return detail
  document.querySelectorAll('.rt-inline-approve').forEach(btn => {
    btn.addEventListener('click', () => {
      _showApprovalModal('通过归还审批', '确认归还设备状态无误？', async (comment) => {
        await Api.approveReturnTask(btn.dataset.id, comment);
        Utils.showToast('已通过');
        Router.navigate('return-detail', { id: order.id });
      });
    });
  });
  document.querySelectorAll('.rt-inline-reject').forEach(btn => {
    btn.addEventListener('click', () => {
      _showApprovalModal('驳回归还审批', '请填写驳回原因：', async (comment) => {
        await Api.rejectReturnTask(btn.dataset.id, comment);
        Utils.showToast('已驳回');
        Router.navigate('return-detail', { id: order.id });
      }, true);
    });
  });
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
          <a href="#my-orders" class="bottom-nav__item">${Utils.svgIcon('tag')}<span>借用单</span></a>
          <a href="#my-returns" class="bottom-nav__item bottom-nav__item--active">${Utils.svgIcon('undo')}<span>归还单</span></a>
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
  const conditionMap = {
    GOOD: { label: '完好', class: 'chip--stock' },
    DAMAGED: { label: '损坏', class: 'chip--damaged' },
    PARTIAL_LOSS: { label: '部分丢失', class: 'chip--warning' },
    FULL_LOSS: { label: '完全丢失', class: 'chip--lost' },
  };

  const taskCards = tasks.map(t => {
    const ts = taskStatusMap[t.status] || { label: t.status, class: '' };
    const itemRows = (t.item_details || []).map(d => {
      const cm = conditionMap[d.condition] || { label: d.condition, class: '' };
      const photoHtml = (d.photos || []).map(p =>
        `<img src="/uploads/${Utils.escapeHtml(p.thumb_path || p.file_path)}" class="photo-gallery__img" style="width:48px;height:48px;" onclick="Utils.openLightbox('/uploads/${Utils.escapeHtml(p.file_path)}')">`
      ).join(' ');
      return `
        <div style="padding:8px 0;border-bottom:1px solid var(--panel);">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <span class="text-sm" style="font-weight:500;">${Utils.escapeHtml(d.asset_code_snapshot)}</span>
              <span class="text-sm text-muted" style="margin-left:8px;">${Utils.escapeHtml(d.asset_name_snapshot)}</span>
            </div>
            <span class="chip ${cm.class}">${cm.label}</span>
          </div>
          ${d.damage_description ? `<div class="text-xs text-muted" style="margin-top:4px;">损坏描述：${Utils.escapeHtml(d.damage_description)}</div>` : ''}
          ${photoHtml ? `<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">${photoHtml}</div>` : ''}
        </div>`;
    }).join('');

    return `
      <div class="card" style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div>
            <a href="#return-detail?id=${t.return_order_id}" style="font-weight:600;font-size:0.9375rem;">${Utils.escapeHtml(t.return_order_no || '查看归还单')}</a>
            <span class="text-sm text-muted" style="margin-left:12px;">申请人：${Utils.escapeHtml(t.applicant_name || '-')}</span>
          </div>
          <span class="chip ${ts.class}">${ts.label}</span>
        </div>
        <div style="background:var(--panel-alt);border-radius:var(--radius-input);padding:10px 14px;margin-bottom:12px;">
          <div class="text-xs text-muted" style="margin-bottom:6px;">归还设备 (${t.item_details?.length || t.item_ids.length} 件)</div>
          ${itemRows || '<div class="text-sm text-muted">加载中...</div>'}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span class="text-xs text-muted">${Utils.formatDateTime(t.created_at)}</span>
          <div style="display:flex;gap:8px;align-items:center;">
            ${t.comment ? `<span class="text-xs text-muted" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;">${Utils.escapeHtml(t.comment)}</span>` : ''}
            ${t.status === 'PENDING' ? `
              <button class="btn btn--primary btn--sm rt-approve-btn" data-id="${t.id}">通过</button>
              <button class="btn btn--danger btn--sm rt-reject-btn" data-id="${t.id}">驳回</button>
            ` : ''}
          </div>
        </div>
      </div>`;
  }).join('');

  const mainContent = `
    <div class="page-header">
      <div class="page-header__info">
        <h1 class="page-header__title">归还审批</h1>
        <p class="page-header__desc">共 ${total} 条任务</p>
      </div>
    </div>
    <div class="flex gap-md" style="margin-bottom:12px;">
      <select id="rt-status-filter" class="form-select" style="width:140px;">
        <option value="PENDING" ${statusFilter === 'PENDING' ? 'selected' : ''}>待审批</option>
        <option value="APPROVED" ${statusFilter === 'APPROVED' ? 'selected' : ''}>已通过</option>
        <option value="REJECTED" ${statusFilter === 'REJECTED' ? 'selected' : ''}>已驳回</option>
        <option value="" ${!statusFilter ? 'selected' : ''}>全部</option>
      </select>
    </div>
    ${taskCards || '<div class="empty-state" style="padding:40px;">暂无审批任务</div>'}`;

  app.innerHTML = renderPcLayout('return-approvals', mainContent);

  document.getElementById('rt-status-filter').addEventListener('change', (e) => {
    Router.navigate('return-approvals', { status: e.target.value });
  });

  // Approve with modal (reuses _showApprovalModal from borrow.js)
  document.querySelectorAll('.rt-approve-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _showApprovalModal('通过归还审批', '确认归还设备状态无误？', async (comment) => {
        await Api.approveReturnTask(btn.dataset.id, comment);
        Utils.showToast('已通过');
        Router.navigate('return-approvals', { status: statusFilter });
      });
    });
  });

  document.querySelectorAll('.rt-reject-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _showApprovalModal('驳回归还审批', '请填写驳回原因：', async (comment) => {
        await Api.rejectReturnTask(btn.dataset.id, comment);
        Utils.showToast('已驳回');
        Router.navigate('return-approvals', { status: statusFilter });
      }, true);
    });
  });
});
