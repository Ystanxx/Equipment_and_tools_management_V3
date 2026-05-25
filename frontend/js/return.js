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
    <div class="stack stack--page">
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
              <div class="return-photo-preview upload-preview-grid upload-preview-grid--compact" data-idx="${idx}" style="margin-bottom:8px;"></div>
              <label class="btn btn--outline btn--sm" style="cursor:pointer;">
                ${Utils.svgIcon('plus')} 添加照片
                <input type="file" class="return-photos" data-idx="${idx}" accept="image/jpeg,image/png,image/webp" capture="environment" style="display:none;">
              </label>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="form-group">
        <label class="form-label">备注（选填）</label>
        <textarea id="return-remark" class="form-textarea" placeholder="归还备注"></textarea>
      </div>
      <div id="return-error" class="form-error hidden"></div>
      <button id="return-submit-btn" class="btn btn--primary btn--full">确认提交归还</button>
    </div>`}
    </div>`;

  const isAdmin = user && (user.role === 'ASSET_ADMIN' || user.role === 'SUPER_ADMIN');
  if (isAdmin) {
    app.innerHTML = renderPcLayout('my-orders', formHtml);
  } else {
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      app.innerHTML = renderMobileUserShell('my-orders', formHtml, {
        backHref: `borrow-detail?id=${borrowOrderId}`,
        backLabel: '返回借用单',
        compact: true,
      });
    } else {
      app.innerHTML = renderUserLayout('my-orders', formHtml);
    }
  }

  // Photo accumulation per item (fix: camera returns 1 file at a time)
  const _returnPhotos = {}; // idx -> [{ file, previewUrl, progress, error, stageToken, uploading }]
  let isReturnUploading = false;
  const hasReturnUploading = () => Object.values(_returnPhotos).some((photos) => photos.some((entry) => entry.uploading));
  const hasReturnUploadFailed = () => Object.values(_returnPhotos).some((photos) => photos.some((entry) => entry.error));
  function renderReturnPhotoPreview(idx) {
    const preview = document.querySelector(`.return-photo-preview[data-idx="${idx}"]`);
    if (!preview) return;
    const photos = _returnPhotos[idx] || [];
    preview.innerHTML = '';
    photos.forEach((entry, fi) => {
      preview.appendChild(Utils.createUploadProgressTile(entry, {
        compact: true,
        alt: '归还照片预览',
        onRemove: isReturnUploading ? null : async () => {
          if (entry.stageToken) {
            try {
              await Api.discardStagedAttachment(entry.stageToken);
            } catch (e) {
              Utils.showToast(e.message || '移除照片失败', 'error');
              return;
            }
          }
          Utils.removeUploadPreviewEntry(photos, fi);
          renderReturnPhotoPreview(idx);
        },
      }));
    });
  }
  document.querySelectorAll('.return-photos').forEach(input => {
    input.addEventListener('click', (e) => {
      if (hasReturnUploading()) {
        e.preventDefault();
        Utils.showToast('照片正在上传，请稍候', 'info');
      }
    });
    input.addEventListener('change', () => {
      const idx = input.dataset.idx;
      if (!_returnPhotos[idx]) _returnPhotos[idx] = [];
      const nextEntries = Array.from(input.files).map((file) => {
        const entry = Utils.createUploadPreviewEntry(file);
        entry.stageToken = null;
        entry.uploading = true;
        return entry;
      });
      _returnPhotos[idx].push(...nextEntries);
      input.value = '';
      renderReturnPhotoPreview(idx);
      nextEntries.forEach(async (entry) => {
        entry.error = false;
        try {
          const res = await Api.stageAttachment(entry.file, 'RETURN_ITEM', {
            onProgress: (progress) => {
              entry.progress = progress;
              renderReturnPhotoPreview(idx);
            },
          });
          entry.stageToken = res.data.stage_token;
          entry.progress = 100;
        } catch (e) {
          entry.error = true;
          Utils.showToast(e.message || '归还照片上传失败', 'error');
        } finally {
          entry.uploading = false;
          renderReturnPhotoPreview(idx);
        }
      });
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
      const photoMap = {}; // itemIdx -> { idx, files }
      document.querySelectorAll('.return-check:checked').forEach(cb => {
        const idx = cb.dataset.idx;
        const condition = document.querySelector(`.return-condition[data-idx="${idx}"]`).value;
        const desc = document.querySelector(`.return-damage-desc[data-idx="${idx}"]`)?.value?.trim() || null;
        const photos = _returnPhotos[idx] || [];
        if (photos.length > 0) photoMap[items.length] = { idx, files: photos };
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
        if (!_returnPhotos[idx] || _returnPhotos[idx].length === 0) missingPhoto = true;
      });
      if (missingPhoto) {
        errEl.textContent = '每件归还设备必须上传照片（必填项）';
        errEl.classList.remove('hidden');
        return;
      }
      if (hasReturnUploading()) {
        Utils.showToast('照片正在上传，请稍候', 'info');
        return;
      }
      if (hasReturnUploadFailed()) {
        errEl.textContent = '有归还照片上传失败，请移除后重试';
        errEl.classList.remove('hidden');
        return;
      }

      try {
        isReturnUploading = true;
        submitBtn.disabled = true;
        submitBtn.textContent = '提交中...';
        const res = await Api.createReturnOrder({
          borrow_order_id: borrowOrderId,
          items,
          remark: document.getElementById('return-remark').value.trim() || null,
        });
        // Upload photos for each item
        const roItems = res.data.items || [];
        for (const [itemIdx, photoGroup] of Object.entries(photoMap)) {
          const ri = roItems[parseInt(itemIdx)];
          if (!ri) continue;
          const { idx, files } = photoGroup;
          for (let index = 0; index < files.length; index += 1) {
            const entry = files[index];
            try {
              if (!entry.stageToken) throw new Error('照片仍未上传完成');
              await Api.finalizeStagedAttachment(entry.stageToken, 'ReturnOrderItem', ri.id);
              entry.stageToken = null;
            } catch (e) {
              entry.error = true;
              console.warn('Photo upload failed:', e);
              throw e;
            }
          }
        }
        Utils.showToast('归还单已提交，等待审批');
        if (res.data.equipment_order_id) {
          Router.navigate('order-detail', { id: res.data.equipment_order_id });
        } else {
          Router.navigate('return-detail', { id: res.data.id });
        }
      } catch (e) {
        isReturnUploading = false;
        errEl.textContent = e.message;
        errEl.classList.remove('hidden');
        submitBtn.disabled = false;
        submitBtn.textContent = '确认提交归还';
      }
    });
  }
});


// ===== Return Order Detail =====
Router.register('return-detail', async (params) => {
  const app = document.getElementById('app');
  const user = Api.getUser();
  const isAdmin = user && (user.role === 'ASSET_ADMIN' || user.role === 'SUPER_ADMIN');
  const context = isAdmin ? resolveAdminDetailContext(params.from, 'my-orders') : null;

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
    APPROVED: { label: '待入库', class: 'chip--warning' },
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
  const canStockIn = isAdmin && order.status === 'APPROVED';

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
    <div class="stack stack--page">
      <div class="page-header">
        <div class="page-header__info">
          <h1 class="page-header__title">${Utils.escapeHtml(order.order_no)}</h1>
          <p class="page-header__desc">关联借用单：<a href="#borrow-detail?id=${order.borrow_order_id}${isAdmin && context?.active ? `&from=${context.active}` : ''}">${Utils.escapeHtml(order.borrow_order_no || '-')}</a> · ${Utils.formatDateTime(order.created_at)}</p>
        </div>
        <div class="page-header__actions">
          <span class="chip ${sm.class}">${sm.label}</span>
          ${canStockIn ? '<button id="return-stock-in-btn" class="btn btn--primary btn--sm">确认入库</button>' : ''}
          <button class="btn btn--outline btn--sm" onclick="Router.navigate('${isAdmin ? context.backHref : 'my-orders'}')">${isAdmin ? context.backLabel : '返回列表'}</button>
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
      </div>
    </div>`;

  if (isAdmin) {
      app.innerHTML = renderPcLayout(context.active, detailHtml);
  } else {
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      app.innerHTML = renderMobileUserShell('my-orders', detailHtml, {
        backHref: 'my-orders',
        backLabel: '返回我的订单',
        compact: true,
      });
    } else {
      app.innerHTML = renderUserLayout('my-orders', detailHtml);
    }
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

  const stockInBtn = document.getElementById('return-stock-in-btn');
  if (stockInBtn) {
    stockInBtn.addEventListener('click', () => {
      _showApprovalModal('确认入库', `确认归还单 ${order.order_no} 已完成入库？`, async () => {
        await Api.stockInReturnOrder(order.id);
        Utils.showToast('已确认入库');
        Router.navigate('return-detail', { id: order.id });
      });
    });
  }
});


// ===== My Return Orders List =====
Router.register('my-returns', async (params) => {
  Router.navigate('my-orders', params || {});
});


// ===== Admin: Return Approval Tasks =====
Router.register('return-approvals', async (params) => {
  const app = document.getElementById('app');
  const page = parseInt(params.page) || 1;
  const statusFilter = params.status || 'ALL';
  const isMobile = window.innerWidth <= 768;

  const returnApprovalStatusMeta = {
    PENDING: { label: '待审批', desc: '待处理归还审批任务' },
    PENDING_STOCK_IN: { label: '待入库', desc: '查看审批已通过、等待确认入库的归还单' },
    COMPLETED: { label: '已完成', desc: '查看已完成入库的归还记录' },
    ALL: { label: '全部', desc: '查看全部归还审批记录' },
    REJECTED: { label: '已驳回', desc: '查看已驳回归还审批记录' },
  };

  function buildReturnApprovalQuery(currentStatus) {
    const query = { page, page_size: 20 };
    if (currentStatus === 'PENDING') {
      query.status = 'PENDING';
      return query;
    }
    if (currentStatus === 'ALL') {
      return query;
    }
    query.status = currentStatus;
    return query;
  }

  function buildReturnApprovalParams(currentStatus, currentPage = 1) {
    const nextParams = {};
    if (currentStatus && currentStatus !== 'ALL') nextParams.status = currentStatus;
    if (currentPage > 1) nextParams.page = currentPage;
    return nextParams;
  }

  let tasks = [], total = 0;
  try {
    const res = await Api.listReturnApprovalTasks(buildReturnApprovalQuery(statusFilter));
    tasks = res.data.items;
    total = res.data.total;
  } catch (e) { console.error(e); }

  const taskStatusMap = {
    PENDING: { label: '待审批', class: 'chip--pending' },
    APPROVED: { label: '已通过', class: 'chip--success' },
    REJECTED: { label: '已驳回', class: 'chip--danger' },
  };
  const returnStatusMap = {
    PENDING_APPROVAL: { label: '待审核', class: 'chip--pending' },
    PARTIALLY_APPROVED: { label: '部分审批', class: 'chip--warning' },
    APPROVED: { label: '待入库', class: 'chip--warning' },
    REJECTED: { label: '已驳回', class: 'chip--danger' },
    COMPLETED: { label: '已完成', class: 'chip--success' },
  };
  const conditionMap = {
    GOOD: { label: '完好', class: 'chip--stock' },
    DAMAGED: { label: '损坏', class: 'chip--damaged' },
    PARTIAL_LOSS: { label: '部分丢失', class: 'chip--warning' },
    FULL_LOSS: { label: '完全丢失', class: 'chip--lost' },
  };

  async function openReturnApprovalPanel(task) {
    const [orderRes, timelineRes] = await Promise.all([
      Api.getReturnOrder(task.return_order_id),
      Api.getOrderTimeline(task.return_order_id).catch(() => ({ data: [] })),
    ]);
    const order = orderRes.data;
    const timelineEvents = timelineRes.data || [];
    const user = Api.getUser();
    const isAdmin = user && (user.role === 'ASSET_ADMIN' || user.role === 'SUPER_ADMIN');
    const sm = returnStatusMap[order.status] || { label: order.status, class: '' };
    const currentTask = (order.approval_tasks || []).find(t => t.id === task.id) || task;
    const currentTaskMeta = taskStatusMap[currentTask.status] || { label: currentTask.status, class: '' };
    const canApproveTask = isAdmin && currentTask.status === 'PENDING' && (currentTask.approver_id === user.id || user.role === 'SUPER_ADMIN');
    const canStockIn = isAdmin && order.status === 'APPROVED';

    const photosByItem = {};
    await Promise.all((order.items || []).map(async (item) => {
      try {
        const res = await Api.listAttachments({ related_type: 'ReturnOrderItem', related_id: item.id, photo_type: 'RETURN_ITEM' });
        photosByItem[item.id] = res.data || [];
      } catch {
        photosByItem[item.id] = [];
      }
    }));

    const itemRows = (order.items || []).map(item => {
      const cm = conditionMap[item.condition] || { label: item.condition, class: '' };
      const photos = photosByItem[item.id] || [];
      return `
        <div class="approval-panel__item approval-panel__item--stack">
          <div class="approval-panel__item-main">
            <div class="approval-panel__item-title">${Utils.escapeHtml(item.asset_name_snapshot)}</div>
            <div class="approval-panel__item-code">${Utils.escapeHtml(item.asset_code_snapshot)}</div>
          </div>
          <div class="approval-panel__item-meta">
            <span>${Utils.escapeHtml(item.admin_name_snapshot || '-')}</span>
            <span><span class="chip ${cm.class}">${cm.label}</span></span>
          </div>
          ${item.damage_description ? `<div class="approval-panel__item-note">说明：${Utils.escapeHtml(item.damage_description)}</div>` : ''}
          <div class="photo-gallery">
            ${photos.length > 0
              ? photos.map(p => `<img src="/uploads/${Utils.escapeHtml(p.thumb_path || p.file_path)}" class="photo-gallery__img" onclick="Utils.openLightbox('/uploads/${Utils.escapeHtml(p.file_path)}')" data-no-card-nav="true">`).join('')
              : '<span class="text-xs text-muted">无照片</span>'}
          </div>
        </div>
      `;
    }).join('');

    const bodyHtml = `
      <div class="approval-panel__section">
        <div class="approval-panel__grid">
          <div class="approval-panel__field"><span class="approval-panel__label">申请人</span><span class="approval-panel__value">${Utils.escapeHtml(order.applicant_name || '-')}</span></div>
          <div class="approval-panel__field"><span class="approval-panel__label">创建时间</span><span class="approval-panel__value">${Utils.formatDateTime(order.created_at)}</span></div>
          <div class="approval-panel__field"><span class="approval-panel__label">关联借出单</span><span class="approval-panel__value">${Utils.escapeHtml(order.borrow_order_no || '-')}</span></div>
          <div class="approval-panel__field"><span class="approval-panel__label">当前任务</span><span class="approval-panel__value"><span class="chip ${currentTaskMeta.class}">${currentTaskMeta.label}</span></span></div>
          <div class="approval-panel__field"><span class="approval-panel__label">器材数量</span><span class="approval-panel__value">${order.item_count} 件</span></div>
          <div class="approval-panel__field"><span class="approval-panel__label">归还状态</span><span class="approval-panel__value"><span class="chip ${sm.class}">${sm.label}</span></span></div>
        </div>
        ${order.remark ? `<div class="approval-panel__note"><span class="approval-panel__label">备注</span><div class="approval-panel__note-body">${Utils.escapeHtml(order.remark)}</div></div>` : ''}
      </div>
      <div class="approval-panel__section">
        <h4 class="approval-panel__section-title">归还器材</h4>
        <div class="approval-panel__list">${itemRows}</div>
      </div>
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
      ${canStockIn ? '<button class="btn btn--primary approval-panel-stockin-btn" type="button">确认入库</button>' : ''}
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
      _showApprovalModal('通过归还审批', '确认归还设备状态无误？', async (comment) => {
        await Api.approveReturnTask(currentTask.id, comment);
        panel.close();
        Utils.showToast('已通过');
        Router.navigate('return-approvals', buildReturnApprovalParams(statusFilter, page));
      });
    });
    panel.overlay.querySelector('.approval-panel-reject-btn')?.addEventListener('click', () => {
      _showApprovalModal('驳回归还审批', '请填写驳回原因：', async (comment) => {
        await Api.rejectReturnTask(currentTask.id, comment);
        panel.close();
        Utils.showToast('已驳回');
        Router.navigate('return-approvals', buildReturnApprovalParams(statusFilter, page));
      }, true);
    });
    panel.overlay.querySelector('.approval-panel-stockin-btn')?.addEventListener('click', () => {
      _showApprovalModal('确认入库', `确认归还单 ${order.order_no} 已完成入库？`, async () => {
        await Api.stockInReturnOrder(order.id);
        panel.close();
        Utils.showToast('已确认入库');
        Router.navigate('return-approvals', buildReturnApprovalParams(statusFilter, page));
      });
    });
  }

  const taskCards = tasks.map(t => {
    const orderStatusMeta = returnStatusMap[t.return_order_status] || null;
    const ts = orderStatusMeta || taskStatusMap[t.status] || { label: t.status, class: '' };
    const itemRows = (t.item_details || []).map(d => {
      const cm = conditionMap[d.condition] || { label: d.condition, class: '' };
      const primaryPhoto = (d.photos || [])[0];
      const photoHtml = primaryPhoto
        ? `<img src="/uploads/${Utils.escapeHtml(primaryPhoto.thumb_path || primaryPhoto.file_path)}" class="approval-item-row__image photo-gallery__img" data-no-card-nav="true" onclick="Utils.openLightbox('/uploads/${Utils.escapeHtml(primaryPhoto.file_path)}')">`
        : `<div class="approval-item-row__placeholder" data-no-card-nav="true">${Utils.svgIcon('box')}</div>`;
      const extraPhotoCount = Math.max(0, (d.photos || []).length - 1);
      return `
        <div class="approval-item-row">
          <div class="approval-item-row__media" data-no-card-nav="true">
            ${photoHtml}
            ${extraPhotoCount > 0 ? `<span class="approval-item-row__count" data-no-card-nav="true">+${extraPhotoCount}</span>` : ''}
          </div>
          <div class="approval-item-row__body">
            <div class="approval-item-row__header">
              <div>
                <div class="approval-item-row__code">${Utils.escapeHtml(d.asset_code_snapshot)}</div>
                <div class="approval-item-row__name">${Utils.escapeHtml(d.asset_name_snapshot)}</div>
              </div>
              <span class="chip ${cm.class}">${cm.label}</span>
            </div>
            ${d.damage_description ? `<div class="approval-item-row__damage">损坏描述：${Utils.escapeHtml(d.damage_description)}</div>` : ''}
          </div>
        </div>`;
    }).join('');

    return `
      <div class="card approval-task-card approval-task-card--interactive ${t.status === 'PENDING' ? '' : 'approval-task-card--history'}" data-task-id="${t.id}">
        <div class="approval-task-card__head">
          <div>
            <div class="approval-task-card__order">${Utils.escapeHtml(t.return_order_no || '查看归还单')}</div>
            <div class="approval-task-card__applicant">申请人：${Utils.escapeHtml(t.applicant_name || '-')}</div>
          </div>
          <span class="chip ${ts.class}">${ts.label}</span>
        </div>
        <div class="approval-task-card__summary">
          <span class="approval-task-card__stamp">${Utils.formatDateTime(t.created_at)}</span>
          <span class="text-xs text-muted">${t.item_details?.length || t.item_ids.length} 件归还设备</span>
        </div>
        <div class="approval-task-card__items">
          <div class="approval-task-card__items-label">归还设备</div>
          <div class="approval-task-card__mini-list">
            ${itemRows || '<div class="text-sm text-muted">加载中...</div>'}
          </div>
        </div>
        <div class="approval-task-card__footer">
          ${t.comment ? `<div class="approval-task-card__comment">审批意见：${Utils.escapeHtml(t.comment)}</div>` : ''}
          <div class="approval-task-card__action-group">
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
        <p class="page-header__desc">${returnApprovalStatusMeta[statusFilter]?.desc || '查看归还审批记录'} · 共 ${total} 条</p>
      </div>
    </div>
    <div class="card approval-filter-card">
      <div class="approval-filter-card__controls">
      <select id="rt-status-filter" class="form-select approval-filter-card__select">
        <option value="PENDING" ${statusFilter === 'PENDING' ? 'selected' : ''}>待审批</option>
        <option value="PENDING_STOCK_IN" ${statusFilter === 'PENDING_STOCK_IN' ? 'selected' : ''}>待入库</option>
        <option value="COMPLETED" ${statusFilter === 'COMPLETED' ? 'selected' : ''}>已完成</option>
        <option value="ALL" ${statusFilter === 'ALL' ? 'selected' : ''}>全部</option>
        <option value="REJECTED" ${statusFilter === 'REJECTED' ? 'selected' : ''}>已驳回</option>
      </select>
      </div>
    </div>
    ${taskCards || '<div class="empty-state approval-page__empty">暂无审批任务</div>'}`;

  app.innerHTML = isMobile ? renderMobileAdminShell('return-approvals', mainContent) : renderPcLayout('return-approvals', mainContent);

  document.getElementById('rt-status-filter').addEventListener('change', (e) => {
    Router.navigate('return-approvals', buildReturnApprovalParams(e.target.value));
  });

  const taskMap = Object.fromEntries(tasks.map(task => [String(task.id), task]));
  bindClickableApprovalCards('.approval-task-card', (card) => {
    const task = taskMap[card.dataset.taskId];
    if (!task) return;
    openReturnApprovalPanel(task).catch((error) => {
      console.error('打开归还审批详情失败:', error);
      Utils.showToast(error?.message || '打开归还审批详情失败', 'error');
    });
  });

  // Approve with modal (reuses _showApprovalModal from borrow.js)
  document.querySelectorAll('.rt-approve-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _showApprovalModal('通过归还审批', '确认归还设备状态无误？', async (comment) => {
        await Api.approveReturnTask(btn.dataset.id, comment);
        Utils.showToast('已通过');
        Router.navigate('return-approvals', buildReturnApprovalParams(statusFilter, page));
      });
    });
  });

  document.querySelectorAll('.rt-reject-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _showApprovalModal('驳回归还审批', '请填写驳回原因：', async (comment) => {
        await Api.rejectReturnTask(btn.dataset.id, comment);
        Utils.showToast('已驳回');
        Router.navigate('return-approvals', buildReturnApprovalParams(statusFilter, page));
      }, true);
    });
  });
});
