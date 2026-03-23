// ===== Asset List Page =====
Router.register('asset-list', async (params) => {
  const app = document.getElementById('app');
  const user = Api.getUser();
  const isAdmin = user && (user.role === 'ASSET_ADMIN' || user.role === 'SUPER_ADMIN');
  const isMobile = !isAdmin; // Users get mobile view; admins get PC view

  const page = parseInt(params.page) || 1;
  const keyword = params.keyword || '';
  const statusFilter = params.status || '';

  let assets = [], total = 0, categories = [];
  try {
    const qp = { page, page_size: 20 };
    if (keyword) qp.keyword = keyword;
    if (statusFilter) qp.status = statusFilter;
    if (user.role === 'ASSET_ADMIN') qp.admin_id = user.id;
    const res = await Api.listAssets(qp);
    assets = res.data.items;
    total = res.data.total;
    if (isAdmin) {
      const catRes = await Api.listCategories();
      categories = catRes.data || [];
    }
  } catch (e) {
    console.error(e);
  }

  if (isMobile) {
    renderMobileAssetList(app, assets, total, page, keyword, statusFilter, user);
  } else {
    renderPcAssetList(app, assets, total, page, keyword, statusFilter, categories, user);
  }
});

function renderMobileAssetList(app, assets, total, page, keyword, statusFilter, user) {
  const stockCount = assets.filter(a => a.status === 'IN_STOCK').length;
  const maxItems = Api.getSystemConfig('borrow_order_max_items', 20);
  app.innerHTML = `
    <div class="page--mobile has-bottom-nav">
      <div class="page" style="padding-top:20px;">
        <div class="flex-between" style="margin-bottom:16px;">
          <div>
            <h1 style="font-size:1.625rem;">工具列表</h1>
            <p class="text-xs text-muted">在库设备可借出</p>
          </div>
          <button class="btn btn--icon btn--outline">${Utils.svgIcon('bell')}</button>
        </div>

        <div class="card card--strong stack--md" style="margin-bottom:16px;">
          <div class="flex-between">
            <h4>在库提醒</h4>
            <span class="chip chip--stock">${stockCount} 台在库</span>
          </div>
          <p class="text-xs text-muted">点击在库设备下方的"加入清单"按钮，添加到借用清单后提交借用。</p>
        </div>

        <div class="search-bar" style="margin-bottom:12px;">
          ${Utils.svgIcon('search')}
          <input type="text" id="mobile-search" placeholder="搜索编号、名称、分类" value="${Utils.escapeHtml(keyword)}">
        </div>

        <div class="chip-row" style="margin-bottom:16px;">
          <span class="chip ${!statusFilter ? 'chip--active' : 'chip--outline'}" data-status="">全部</span>
          <span class="chip ${statusFilter === 'IN_STOCK' ? 'chip--active' : 'chip--outline'}" data-status="IN_STOCK">在库</span>
          <span class="chip ${statusFilter === 'BORROWED' ? 'chip--active' : 'chip--outline'}" data-status="BORROWED">借出</span>
        </div>

        <div class="stack--md" id="asset-cards">
          ${assets.length === 0 ? '<div class="empty-state"><p>暂无设备</p></div>' :
            assets.map(a => `
              <div class="asset-card" data-id="${a.id}">
                <div class="asset-card__header">
                  <div>
                    <div class="asset-card__title">${Utils.escapeHtml(a.name)}</div>
                    <div class="asset-card__code">${Utils.escapeHtml(a.asset_code)}</div>
                  </div>
                  ${Utils.statusChip(a.status)}
                </div>
                <div class="asset-card__footer">
                  <span class="asset-card__meta">${Utils.escapeHtml(a.category_name || '-')} / ${Utils.escapeHtml(a.location_name || '-')}</span>
                  ${a.status === 'IN_STOCK' ? `<button class="btn btn--secondary btn--sm add-cart-btn" data-id="${a.id}" data-code="${Utils.escapeHtml(a.asset_code)}" data-name="${Utils.escapeHtml(a.name)}" data-loc="${Utils.escapeHtml(a.location_name || '')}">加入清单</button>` : ''}
                </div>
              </div>
            `).join('')}
        </div>
      </div>

      <nav class="bottom-nav">
        <a href="#asset-list" class="bottom-nav__item bottom-nav__item--active">${Utils.svgIcon('box')}<span>设备</span></a>
        <a href="#borrow-cart" class="bottom-nav__item">${Utils.svgIcon('wrench')}<span>清单(${Api.getCart().length})</span></a>
        <a href="#my-orders" class="bottom-nav__item">${Utils.svgIcon('tag')}<span>借用单</span></a>
        <a href="#my-returns" class="bottom-nav__item">${Utils.svgIcon('undo')}<span>归还单</span></a>
      </nav>
    </div>`;

  // Search binding
  document.getElementById('mobile-search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      Router.navigate('asset-list', { keyword: e.target.value, status: statusFilter });
    }
  });

  // Chip filter
  document.querySelectorAll('.chip-row .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      Router.navigate('asset-list', { keyword, status: chip.dataset.status });
    });
  });

  // Add to cart
  document.querySelectorAll('.add-cart-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const ok = Api.addToCart({
        id: btn.dataset.id,
        asset_code: btn.dataset.code,
        name: btn.dataset.name,
        location_name: btn.dataset.loc,
      });
      if (ok) {
        Utils.showToast('已加入借用清单');
        btn.textContent = '已加入';
        btn.disabled = true;
        // Update cart count in bottom nav
        const cartNav = document.querySelector('.bottom-nav a[href="#borrow-cart"] span');
        if (cartNav) cartNav.textContent = `清单(${Api.getCart().length})`;
      } else {
        Utils.showToast(`已在清单中或清单已满 (${maxItems})`, 'error');
      }
    });
  });

  // Card click
  document.querySelectorAll('.asset-card').forEach(card => {
    card.style.cursor = 'pointer';
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      Router.navigate('asset-detail', { id: card.dataset.id });
    });
  });
}

function renderPcAssetList(app, assets, total, page, keyword, statusFilter, categories, user) {
  const totalPages = Math.ceil(total / 20);

  const tableRows = assets.map(a => `
    <tr>
      <td><a href="#asset-detail?id=${a.id}" style="font-weight:500;">${Utils.escapeHtml(a.asset_code)}</a></td>
      <td>${Utils.escapeHtml(a.name)}</td>
      <td>${Utils.assetTypeMap[a.asset_type] || a.asset_type}</td>
      <td>${Utils.escapeHtml(a.category_name || '-')}</td>
      <td>${Utils.statusChip(a.status)}</td>
      <td>${Utils.escapeHtml(a.admin_name || '-')}</td>
      <td>${Utils.escapeHtml(a.location_name || '-')}</td>
    </tr>
  `).join('');

  const mainContent = `
    <div class="page-header">
      <div class="page-header__info">
        <h1 class="page-header__title">工具与分类</h1>
        <p class="page-header__desc">共 ${total} 件设备/工具</p>
      </div>
      <div class="page-header__actions">
        <span class="tag">共 ${total} 件</span>
        <button class="btn btn--primary" onclick="Router.navigate('asset-form')">${Utils.svgIcon('plus')} 新建工具</button>
      </div>
    </div>

    <div class="flex gap-md" style="margin-bottom:4px;">
      <div class="search-bar" style="flex:1;">
        ${Utils.svgIcon('search')}
        <input type="text" id="pc-asset-search" placeholder="搜索编号、名称" value="${Utils.escapeHtml(keyword)}">
      </div>
      <select id="pc-status-filter" class="form-select" style="width:140px;">
        <option value="">全部状态</option>
        <option value="IN_STOCK" ${statusFilter === 'IN_STOCK' ? 'selected' : ''}>在库</option>
        <option value="BORROWED" ${statusFilter === 'BORROWED' ? 'selected' : ''}>已借出</option>
        <option value="DAMAGED" ${statusFilter === 'DAMAGED' ? 'selected' : ''}>损坏</option>
        <option value="LOST" ${statusFilter === 'LOST' ? 'selected' : ''}>丢失</option>
      </select>
    </div>

    <div class="content-row">
      <div class="content-main">
        <div class="card" style="padding:0;overflow:hidden;">
          <div class="table-wrapper">
            <table class="data-table">
              <thead><tr><th>编号</th><th>名称</th><th>类型</th><th>分类</th><th>状态</th><th>管理员</th><th>位置</th></tr></thead>
              <tbody>${tableRows || '<tr><td colspan="7"><div class="empty-state">暂无数据</div></td></tr>'}</tbody>
            </table>
          </div>
        </div>
        ${totalPages > 1 ? `
          <div class="flex-center gap-sm">
            ${page > 1 ? `<button class="btn btn--outline btn--sm" onclick="Router.navigate('asset-list',{page:${page - 1},keyword:'${keyword}',status:'${statusFilter}'})">上一页</button>` : ''}
            <span class="text-sm text-muted">${page} / ${totalPages}</span>
            ${page < totalPages ? `<button class="btn btn--outline btn--sm" onclick="Router.navigate('asset-list',{page:${page + 1},keyword:'${keyword}',status:'${statusFilter}'})">下一页</button>` : ''}
          </div>` : ''}
      </div>

      <div class="content-side">
        <div class="card stack--md">
          <h3>工具表单</h3>
          <p class="text-sm text-muted">点击"新建工具"按钮或在表格中点击编号查看详情。</p>
          <button class="btn btn--primary btn--full" onclick="Router.navigate('asset-form')">${Utils.svgIcon('plus')} 新建工具</button>
        </div>
        <div class="card stack--md">
          <h3>分类管理</h3>
          <div class="stack--sm">
            ${categories.map(c => `<div class="text-sm">${Utils.escapeHtml(c.name)}</div>`).join('') || '<div class="text-sm text-muted">暂无分类</div>'}
          </div>
          <button class="btn btn--outline btn--sm btn--full" onclick="Router.navigate('categories')">管理分类</button>
        </div>
      </div>
    </div>`;

  app.innerHTML = renderPcLayout('asset-list', mainContent);

  // Bindings
  document.getElementById('pc-asset-search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      Router.navigate('asset-list', { keyword: e.target.value, status: statusFilter });
    }
  });
  document.getElementById('pc-status-filter').addEventListener('change', (e) => {
    Router.navigate('asset-list', { keyword, status: e.target.value });
  });
}

// ===== Asset Detail Page =====
Router.register('asset-detail', async (params) => {
  const app = document.getElementById('app');
  const user = Api.getUser();
  const isAdmin = user && (user.role === 'ASSET_ADMIN' || user.role === 'SUPER_ADMIN');

  let asset = null;
  try {
    const res = await Api.getAsset(params.id);
    asset = res.data;
  } catch (e) {
    app.innerHTML = `<div class="empty-state"><p>${Utils.escapeHtml(e.message)}</p></div>`;
    return;
  }

  // Load inventory photos
  let inventoryPhotos = [];
  let admins = [];
  try {
    const pr = await Api.listAttachments({ related_type: 'Asset', related_id: asset.id, photo_type: 'INVENTORY' });
    inventoryPhotos = pr.data || [];
  } catch (e) { /* ignore */ }
  if (user.role === 'SUPER_ADMIN') {
    try {
      const usersRes = await Api.listUsers({ page_size: 100 });
      admins = (usersRes.data.items || []).filter(u => u.role === 'ASSET_ADMIN' || u.role === 'SUPER_ADMIN');
    } catch (e) { /* ignore */ }
  }

  const detailHtml = `
    <div class="page-header">
      <div class="page-header__info">
        <h1 class="page-header__title">${Utils.escapeHtml(asset.name)}</h1>
        <p class="page-header__desc">${Utils.escapeHtml(asset.asset_code)} · ${Utils.assetTypeMap[asset.asset_type] || asset.asset_type} · ${Utils.escapeHtml(asset.category_name || '未分类')}</p>
      </div>
      <div class="page-header__actions">
        ${Utils.statusChip(asset.status)}
        ${asset.status === 'IN_STOCK' ? `<button class="btn btn--primary btn--sm" id="detail-add-cart" data-id="${asset.id}" data-code="${Utils.escapeHtml(asset.asset_code)}" data-name="${Utils.escapeHtml(asset.name)}" data-loc="${Utils.escapeHtml(asset.location_name || '')}">加入借用清单</button>` : ''}
        ${isAdmin ? `<button class="btn btn--secondary btn--sm" onclick="Router.navigate('asset-form',{id:'${asset.id}'})">编辑</button>` : ''}
        <button class="btn btn--outline btn--sm" onclick="Router.navigate('asset-list')">返回列表</button>
      </div>
    </div>

    <div class="content-row">
      <div class="content-main">
        <div class="card stack--md">
          <h3>基本信息</h3>
          <div class="stack--sm">
            <div class="meta-row"><span class="meta-row__label">编号</span><span class="meta-row__value">${Utils.escapeHtml(asset.asset_code)}</span></div>
            <div class="meta-row"><span class="meta-row__label">名称</span><span class="meta-row__value">${Utils.escapeHtml(asset.name)}</span></div>
            <div class="meta-row"><span class="meta-row__label">类型</span><span class="meta-row__value">${Utils.assetTypeMap[asset.asset_type] || asset.asset_type}</span></div>
            <div class="meta-row"><span class="meta-row__label">分类</span><span class="meta-row__value">${Utils.escapeHtml(asset.category_name || '-')}</span></div>
            <div class="meta-row"><span class="meta-row__label">位置</span><span class="meta-row__value">${Utils.escapeHtml(asset.location_name || '-')}</span></div>
            <div class="meta-row"><span class="meta-row__label">管理员</span><span class="meta-row__value">${Utils.escapeHtml(asset.admin_name || '-')}</span></div>
            <div class="meta-row"><span class="meta-row__label">品牌</span><span class="meta-row__value">${Utils.escapeHtml(asset.brand || '-')}</span></div>
            <div class="meta-row"><span class="meta-row__label">型号</span><span class="meta-row__value">${Utils.escapeHtml(asset.model || '-')}</span></div>
            <div class="meta-row"><span class="meta-row__label">序列号</span><span class="meta-row__value">${Utils.escapeHtml(asset.serial_number || '-')}</span></div>
            <div class="meta-row"><span class="meta-row__label">入库日期</span><span class="meta-row__value">${Utils.formatDate(asset.entry_date)}</span></div>
            <div class="meta-row"><span class="meta-row__label">创建时间</span><span class="meta-row__value">${Utils.formatDateTime(asset.created_at)}</span></div>
          </div>
        </div>
        ${asset.description ? `<div class="card stack--sm"><h3>描述</h3><p class="text-sm">${Utils.escapeHtml(asset.description)}</p></div>` : ''}
        ${asset.remark ? `<div class="card stack--sm"><h3>备注</h3><p class="text-sm">${Utils.escapeHtml(asset.remark)}</p></div>` : ''}
      </div>
      <div class="content-side">
        <div class="card stack--md">
          <h3>库存照片</h3>
          <div id="asset-photo-gallery" class="photo-gallery" style="margin-bottom:8px;">
            ${inventoryPhotos.length > 0 ? inventoryPhotos.map(p =>
              `<img src="/uploads/${Utils.escapeHtml(p.thumb_path || p.file_path)}" class="photo-gallery__img" onclick="Utils.openLightbox('/uploads/${Utils.escapeHtml(p.file_path)}')">`
            ).join('') : '<p class="text-sm text-muted">暂无照片</p>'}
          </div>
          ${isAdmin ? `
          <div class="form-group" style="margin-top:8px;">
            <label class="form-label">上传库存照片</label>
            <input type="file" id="asset-photo-upload" accept="image/jpeg,image/png,image/webp" multiple style="font-size:0.8125rem;">
            <div id="asset-upload-preview" style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;"></div>
            <button class="btn btn--secondary btn--sm" id="asset-upload-btn" style="margin-top:8px;" disabled>上传</button>
          </div>` : ''}
        </div>
        ${user.role === 'SUPER_ADMIN' ? `
        <div class="card stack--md">
          <h3>管理员分配</h3>
          <p class="text-sm text-muted" style="margin-bottom:4px;">当前管理员：${Utils.escapeHtml(asset.admin_name || '未分配')}</p>
          <div class="form-group">
            <select id="asset-admin-select" class="form-select">
              ${admins.map(a => `<option value="${a.id}" ${asset.admin_id === a.id ? 'selected' : ''}>${Utils.escapeHtml(a.full_name)} (${Utils.escapeHtml(a.username)})</option>`).join('')}
            </select>
            <button class="btn btn--secondary btn--sm" id="asset-admin-change-btn">变更管理员</button>
          </div>
        </div>` : ''}
      </div>
    </div>`;

  if (isAdmin) {
    app.innerHTML = renderPcLayout('asset-list', detailHtml);
  } else {
    app.innerHTML = `<div class="page--mobile"><div class="mobile-back-bar"><a href="#asset-list">${Utils.svgIcon('arrowLeft')} 返回设备列表</a></div><div class="page" style="padding-top:8px;">${detailHtml}</div></div>`;
  }

  // Add to cart button
  const addCartBtn = document.getElementById('detail-add-cart');
  if (addCartBtn) {
    addCartBtn.addEventListener('click', () => {
      const ok = Api.addToCart({ id: addCartBtn.dataset.id, asset_code: addCartBtn.dataset.code, name: addCartBtn.dataset.name, location_name: addCartBtn.dataset.loc });
      if (ok) { Utils.showToast('已加入借用清单'); addCartBtn.textContent = '已加入'; addCartBtn.disabled = true; }
      else { Utils.showToast(`已在清单中或清单已满 (${Api.getSystemConfig('borrow_order_max_items', 20)})`, 'error'); }
    });
  }

  // Photo upload for admin
  const photoInput = document.getElementById('asset-photo-upload');
  const uploadBtn = document.getElementById('asset-upload-btn');
  if (photoInput && uploadBtn) {
    photoInput.addEventListener('change', () => {
      const preview = document.getElementById('asset-upload-preview');
      preview.innerHTML = '';
      for (const f of photoInput.files) {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(f);
        img.style.cssText = 'width:60px;height:60px;object-fit:cover;border-radius:6px;border:1px solid var(--line);';
        preview.appendChild(img);
      }
      uploadBtn.disabled = photoInput.files.length === 0;
    });
    uploadBtn.addEventListener('click', async () => {
      uploadBtn.disabled = true;
      uploadBtn.textContent = '上传中...';
      for (const f of photoInput.files) {
        try { await Api.uploadAttachment(f, 'INVENTORY', 'Asset', asset.id); } catch (e) { console.warn('Upload failed:', e); }
      }
      Utils.showToast('照片上传成功');
      Router.navigate('asset-detail', { id: asset.id });
    });
  }

  // Super admin: change device admin
  const adminChangeBtn = document.getElementById('asset-admin-change-btn');
  if (adminChangeBtn) {
    adminChangeBtn.addEventListener('click', async () => {
      const sel = document.getElementById('asset-admin-select');
      if (!sel || !sel.value) return;
      try {
        adminChangeBtn.disabled = true;
        adminChangeBtn.textContent = '变更中...';
        await Api.updateAssetAdmin(asset.id, sel.value);
        Utils.showToast('管理员已变更');
        Router.navigate('asset-detail', { id: asset.id });
      } catch (e) {
        Utils.showToast(e.message, 'error');
        adminChangeBtn.disabled = false;
        adminChangeBtn.textContent = '变更管理员';
      }
    });
  }
});

// ===== Asset Form Page =====
Router.register('asset-form', async (params) => {
  const app = document.getElementById('app');
  const user = Api.getUser();
  const isEdit = !!params.id;
  let asset = null, categories = [], locations = [], admins = [];

  try {
    const [catRes, locRes] = await Promise.all([
      Api.listCategories(),
      Api.listLocations(),
    ]);
    categories = catRes.data || [];
    locations = locRes.data || [];

    if (user.role === 'SUPER_ADMIN') {
      const usersRes = await Api.listUsers({ page_size: 100 });
      admins = (usersRes.data.items || []).filter(u => u.role === 'ASSET_ADMIN' || u.role === 'SUPER_ADMIN');
    }

    if (isEdit) {
      const res = await Api.getAsset(params.id);
      asset = res.data;
    }
  } catch (e) {
    app.innerHTML = `<div class="empty-state"><p>${Utils.escapeHtml(e.message)}</p></div>`;
    return;
  }

  const formHtml = `
    <div class="page-header">
      <div class="page-header__info">
        <h1 class="page-header__title">${isEdit ? '编辑设备/工具' : '录入新设备/工具'}</h1>
        <p class="page-header__desc">${isEdit ? '修改设备信息' : '填写设备信息并上传库存照片'}</p>
      </div>
      <div class="page-header__actions">
        <button class="btn btn--outline btn--sm" onclick="Router.navigate('asset-list')">返回列表</button>
      </div>
    </div>

    <div class="content-row">
      <div class="content-main">
        <div class="card stack--lg">
          <h3>基本信息</h3>
          <div class="form-group">
            <label class="form-label">设备/工具名称 <span class="form-required">*必填</span></label>
            <input type="text" id="af-name" class="form-input" value="${Utils.escapeHtml(asset?.name || '')}" placeholder="例如：数字示波器">
          </div>
          <div class="flex gap-md">
            <div class="form-group" style="flex:1;">
              <label class="form-label">类型 <span class="form-required">*必填</span></label>
              <select id="af-type" class="form-select">
                <option value="DEVICE" ${asset?.asset_type === 'DEVICE' ? 'selected' : ''}>设备</option>
                <option value="TOOL" ${asset?.asset_type === 'TOOL' ? 'selected' : ''}>工具</option>
              </select>
            </div>
            <div class="form-group" style="flex:1;">
              <label class="form-label">分类 <span class="form-required">*必填</span></label>
              <select id="af-category" class="form-select">
                <option value="">请选择分类</option>
                ${categories.map(c => `<option value="${c.id}" ${asset?.category_id === c.id ? 'selected' : ''}>${Utils.escapeHtml(c.name)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">存放位置 <span class="form-required">*必填</span></label>
            <select id="af-location" class="form-select">
              <option value="">请选择位置</option>
              ${locations.map(l => `<option value="${l.id}" ${asset?.location_id === l.id ? 'selected' : ''}>${Utils.escapeHtml(l.name)}</option>`).join('')}
            </select>
          </div>
          ${user.role === 'SUPER_ADMIN' ? `
          <div class="form-group">
            <label class="form-label">设备管理员 <span class="form-required">*必填，超管必须指定</span></label>
            <select id="af-admin" class="form-select">
              <option value="">请选择管理员</option>
              ${admins.map(a => `<option value="${a.id}" ${asset?.admin_id === a.id ? 'selected' : ''}>${Utils.escapeHtml(a.full_name)} (${Utils.escapeHtml(a.username)})</option>`).join('')}
            </select>
          </div>` : ''}
        </div>

        <div class="card stack--lg">
          <h3>补充信息（选填）</h3>
          <div class="flex gap-md">
            <div class="form-group" style="flex:1;"><label class="form-label">品牌</label><input type="text" id="af-brand" class="form-input" value="${Utils.escapeHtml(asset?.brand || '')}" placeholder="例如：Tektronix"></div>
            <div class="form-group" style="flex:1;"><label class="form-label">型号</label><input type="text" id="af-model" class="form-input" value="${Utils.escapeHtml(asset?.model || '')}" placeholder="例如：TDS1012"></div>
          </div>
          <div class="flex gap-md">
            <div class="form-group" style="flex:1;"><label class="form-label">序列号</label><input type="text" id="af-serial" class="form-input" value="${Utils.escapeHtml(asset?.serial_number || '')}"></div>
            <div class="form-group" style="flex:1;"><label class="form-label">入库日期</label><input type="date" id="af-date" class="form-input" value="${asset?.entry_date || ''}"></div>
          </div>
          <div class="form-group"><label class="form-label">描述</label><textarea id="af-desc" class="form-textarea" placeholder="设备详细说明">${Utils.escapeHtml(asset?.description || '')}</textarea></div>
          <div class="form-group"><label class="form-label">备注</label><textarea id="af-remark" class="form-textarea" placeholder="其他信息">${Utils.escapeHtml(asset?.remark || '')}</textarea></div>
        </div>

        ${!isEdit ? `
        <div class="card stack--lg">
          <h3>库存照片 <span class="form-required">*必填，拍照留痕</span></h3>
          <p class="text-sm text-muted" style="margin-top:-8px;">上传设备入库时的照片，作为基准对比。支持 jpg/png/webp。</p>
          <div class="form-group">
            <input type="file" id="af-photos" accept="image/jpeg,image/png,image/webp" multiple style="font-size:0.8125rem;">
            <div id="af-photo-preview" style="display:flex;gap:6px;flex-wrap:wrap;"></div>
          </div>
        </div>` : ''}

        <div id="af-error" class="form-error hidden"></div>
        <button id="af-submit" class="btn btn--primary btn--full" style="margin-top:4px;">${isEdit ? '保存修改' : '创建并上传照片'}</button>
      </div>
      <div class="content-side">
        <div class="card stack--sm">
          <h3>编号规则</h3>
          <p class="text-sm text-muted">编号由名称拼音首字母自动生成，格式如 LSD-001。</p>
          <p class="text-sm text-muted">编号一旦生成不可复用或回收。</p>
        </div>
        <div class="card stack--sm">
          <h3>管理员规则</h3>
          <p class="text-sm text-muted">超管创建设备时必须指定设备管理员。</p>
          <p class="text-sm text-muted">设备管理员创建时自动绑定自己。</p>
        </div>
        ${isEdit ? `
        <div class="card stack--sm">
          <h3>库存照片</h3>
          <p class="text-sm text-muted">请在设备详情页上传/管理库存照片。</p>
          <a href="#asset-detail?id=${params.id}" class="btn btn--outline btn--sm btn--full">查看设备详情</a>
        </div>` : ''}
      </div>
    </div>`;

  app.innerHTML = renderPcLayout('asset-list', formHtml);

  // Photo preview for new asset
  const photoInput = document.getElementById('af-photos');
  if (photoInput) {
    photoInput.addEventListener('change', () => {
      const preview = document.getElementById('af-photo-preview');
      preview.innerHTML = '';
      for (const f of photoInput.files) {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(f);
        img.style.cssText = 'width:70px;height:70px;object-fit:cover;border-radius:8px;border:1px solid var(--line);';
        preview.appendChild(img);
      }
    });
  }

  document.getElementById('af-submit').addEventListener('click', async () => {
    const errEl = document.getElementById('af-error');
    errEl.classList.add('hidden');

    const data = {
      name: document.getElementById('af-name').value.trim(),
      asset_type: document.getElementById('af-type').value,
      category_id: document.getElementById('af-category').value || null,
      location_id: document.getElementById('af-location').value || null,
      brand: document.getElementById('af-brand').value.trim() || null,
      model: document.getElementById('af-model').value.trim() || null,
      serial_number: document.getElementById('af-serial').value.trim() || null,
      entry_date: document.getElementById('af-date').value || null,
      description: document.getElementById('af-desc').value.trim() || null,
      remark: document.getElementById('af-remark').value.trim() || null,
    };

    if (user.role === 'SUPER_ADMIN') {
      const adminEl = document.getElementById('af-admin');
      if (adminEl) data.admin_id = adminEl.value || null;
    }

    // Validation
    if (!data.name) { errEl.textContent = '请填写设备名称'; errEl.classList.remove('hidden'); return; }
    if (!data.category_id) { errEl.textContent = '请选择分类'; errEl.classList.remove('hidden'); return; }
    if (!data.location_id) { errEl.textContent = '请选择存放位置'; errEl.classList.remove('hidden'); return; }
    if (user.role === 'SUPER_ADMIN' && !data.admin_id) { errEl.textContent = '超管必须指定设备管理员'; errEl.classList.remove('hidden'); return; }
    if (!isEdit) {
      const pInput = document.getElementById('af-photos');
      if (!pInput || pInput.files.length === 0) { errEl.textContent = '请上传库存照片（必填）'; errEl.classList.remove('hidden'); return; }
    }

    const submitBtn = document.getElementById('af-submit');
    try {
      submitBtn.disabled = true;
      submitBtn.textContent = isEdit ? '保存中...' : '创建中...';
      let assetId;
      if (isEdit) {
        await Api.updateAsset(params.id, data);
        assetId = params.id;
        Utils.showToast('更新成功');
      } else {
        const res = await Api.createAsset(data);
        assetId = res.data.id;
        // Upload inventory photos
        const pInput = document.getElementById('af-photos');
        if (pInput && pInput.files.length > 0) {
          for (const f of pInput.files) {
            try { await Api.uploadAttachment(f, 'INVENTORY', 'Asset', assetId); } catch (e) { console.warn('Photo upload failed:', e); }
          }
        }
        Utils.showToast('设备创建成功');
      }
      Router.navigate('asset-detail', { id: assetId });
    } catch (e) {
      errEl.textContent = e.message;
      errEl.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.textContent = isEdit ? '保存修改' : '创建并上传照片';
    }
  });
});
