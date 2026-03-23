// ===== Asset List Page =====
Router.register('asset-list', async (params) => {
  const app = document.getElementById('app');
  const user = Api.getUser();
  const isAdmin = user && (user.role === 'ASSET_ADMIN' || user.role === 'SUPER_ADMIN');
  const isMobile = !isAdmin; // Users get mobile view; admins get PC view

  const page = parseInt(params.page) || 1;
  const pageSize = [10, 20, 50, 100].includes(parseInt(params.page_size, 10)) ? parseInt(params.page_size, 10) : 20;
  const keyword = params.keyword || '';
  const statusFilter = params.status || '';

  let assets = [], total = 0;
  try {
    const qp = { page, page_size: pageSize };
    if (keyword) qp.keyword = keyword;
    if (statusFilter) qp.status = statusFilter;
    if (user.role === 'ASSET_ADMIN') qp.admin_id = user.id;
    const res = await Api.listAssets(qp);
    assets = res.data.items;
    total = res.data.total;
  } catch (e) {
    console.error(e);
  }

  if (isAdmin) {
    renderPcAssetList(app, assets, total, page, pageSize, keyword, statusFilter, user);
  } else {
    renderUserAssetList(app, assets, total, page, pageSize, keyword, statusFilter, user);
  }
});

function renderUserAssetList(app, assets, total, page, pageSize, keyword, statusFilter, user) {
  const isMobile = window.innerWidth <= 768;
  const stockCount = assets.filter(a => a.status === 'IN_STOCK').length;
  const maxItems = Api.getSystemConfig('borrow_order_max_items', 20);
  const totalPages = Math.ceil(total / pageSize);

  const bodyHtml = `
    <div class="flex-between" style="margin-bottom:20px;">
      <div>
        <h1 style="font-size:1.5rem;">设备列表</h1>
        <p class="text-xs text-muted">共 ${total} 件设备 · ${stockCount} 件在库可借</p>
      </div>
    </div>

    <div class="flex gap-md" style="margin-bottom:16px;align-items:center;flex-wrap:wrap;">
      <div class="search-bar" style="flex:1 1 100%;min-width:0;">
        ${Utils.svgIcon('search')}
        <input type="text" id="user-search" placeholder="搜索编号、名称、分类" value="${Utils.escapeHtml(keyword)}">
      </div>
      <select id="user-page-size" class="form-select" style="width:132px;max-width:100%;margin-left:auto;flex:0 0 auto;">
        ${[10, 20, 50, 100].map(size => `<option value="${size}" ${pageSize === size ? 'selected' : ''}>每页 ${size} 条</option>`).join('')}
      </select>
    </div>

    <div class="chip-row" style="margin-bottom:20px;">
      <span class="chip ${!statusFilter ? 'chip--active' : 'chip--outline'}" data-status="">全部</span>
      <span class="chip ${statusFilter === 'IN_STOCK' ? 'chip--active' : 'chip--outline'}" data-status="IN_STOCK">在库</span>
      <span class="chip ${statusFilter === 'BORROWED' ? 'chip--active' : 'chip--outline'}" data-status="BORROWED">借出</span>
    </div>

    <div class="asset-grid">
      ${assets.length === 0 ? '<div class="empty-state" style="grid-column:1/-1;"><p>暂无设备</p></div>' :
        assets.map(a => `
          <div class="asset-card" data-id="${a.id}">
            <div class="asset-card__header">
              <div>
                <div class="asset-card__title">${Utils.escapeHtml(a.name)}</div>
                <div class="asset-card__code">${Utils.escapeHtml(a.asset_code)}</div>
              </div>
              ${Utils.statusChip(a.status)}
            </div>
            <div class="asset-card__meta">${Utils.escapeHtml(a.category_name || '-')} · ${Utils.escapeHtml(a.location_name || '-')}</div>
            <div class="asset-card__footer">
              <span class="asset-card__meta">${Utils.escapeHtml(a.brand || '')} ${Utils.escapeHtml(a.model || '')}</span>
              ${a.status === 'IN_STOCK' ? `<button class="btn btn--secondary btn--sm add-cart-btn" data-id="${a.id}" data-code="${Utils.escapeHtml(a.asset_code)}" data-name="${Utils.escapeHtml(a.name)}" data-loc="${Utils.escapeHtml(a.location_name || '')}">加入清单</button>` : ''}
            </div>
          </div>
        `).join('')}
    </div>

    ${totalPages > 1 ? `
      <div class="flex-center gap-sm" style="margin-top:20px;">
        ${page > 1 ? `<button class="btn btn--outline btn--sm" onclick="Router.navigate('asset-list',{page:${page - 1},page_size:${pageSize},keyword:'${keyword}',status:'${statusFilter}'})">上一页</button>` : ''}
        <span class="text-sm text-muted">${page} / ${totalPages}</span>
        ${page < totalPages ? `<button class="btn btn--outline btn--sm" onclick="Router.navigate('asset-list',{page:${page + 1},page_size:${pageSize},keyword:'${keyword}',status:'${statusFilter}'})">下一页</button>` : ''}
      </div>` : ''}`;

  if (isMobile) {
    app.innerHTML = renderMobileUserShell('asset-list', bodyHtml, { showBottomNav: true });
  } else {
    app.innerHTML = renderUserLayout('asset-list', bodyHtml);
  }

  // Search binding
  document.getElementById('user-search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      Router.navigate('asset-list', { keyword: e.target.value, status: statusFilter, page_size: pageSize });
    }
  });
  document.getElementById('user-page-size').addEventListener('change', (e) => {
    Router.navigate('asset-list', { keyword, status: statusFilter, page: 1, page_size: e.target.value });
  });

  // Chip filter
  document.querySelectorAll('.chip-row .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      Router.navigate('asset-list', { keyword, status: chip.dataset.status, page_size: pageSize });
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

function renderRecentDeletedAssetsCard(recentDeleted) {
  return `
    <div class="card stack--md">
      <div class="flex-between">
        <h3>最近删除</h3>
        <span class="tag">可撤回 5 条</span>
      </div>
      <div class="stack--sm">
        ${recentDeleted.length > 0 ? recentDeleted.map(item => `
          <div style="padding:12px;border:1px solid var(--line);border-radius:var(--radius-md);">
            <div class="text-sm" style="font-weight:600;">${Utils.escapeHtml(item.name)}</div>
            <div class="text-xs text-muted" style="margin-top:4px;">${Utils.escapeHtml(item.asset_code)} · 删除于 ${Utils.formatDateTime(item.updated_at)}</div>
            <button class="btn btn--outline btn--sm recent-restore-btn" data-id="${item.id}" style="margin-top:10px;">撤回删除</button>
          </div>
        `).join('') : '<div class="text-sm text-muted">暂无可恢复设备</div>'}
      </div>
    </div>`;
}

function bindRecentRestoreButtons(pageSize = 20, keyword = '', statusFilter = '', page = 1, routeName = 'asset-list') {
  document.querySelectorAll('.recent-restore-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _showApprovalModal('撤回删除', '确认恢复这台最近删除的设备？恢复后会重新回到设备列表。', async () => {
        await Api.restoreAsset(btn.dataset.id);
        Utils.showToast('设备已恢复');
        Router.navigate(routeName, { page_size: pageSize, keyword, status: statusFilter, page });
      });
    });
  });
}

function showAssetInfoModal(title, message) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__header">
        <div class="modal__title">${Utils.escapeHtml(title)}</div>
        <button class="modal__close" type="button" aria-label="关闭">×</button>
      </div>
      <div class="stack--sm">
        ${message.split('\n').map(line => `<p class="text-sm text-muted">${Utils.escapeHtml(line)}</p>`).join('')}
      </div>
      <div class="modal__footer">
        <button class="btn btn--primary btn--sm" type="button">我知道了</button>
      </div>
    </div>`;

  const close = () => overlay.remove();
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  overlay.querySelector('.modal__close').addEventListener('click', close);
  overlay.querySelector('.btn').addEventListener('click', close);
  document.body.appendChild(overlay);
}

function renderPcAssetList(app, assets, total, page, pageSize, keyword, statusFilter, user) {
  const totalPages = Math.ceil(total / pageSize);
  const isSuper = user.role === 'SUPER_ADMIN';
  const isMobile = window.innerWidth <= 768;

  const tableRows = assets.map(a => `
    <tr>
      <td class="asset-table__code"><a href="#asset-detail?id=${a.id}" style="font-weight:500;">${Utils.escapeHtml(a.asset_code)}</a></td>
      <td class="asset-table__name">${Utils.escapeHtml(a.name)}</td>
      <td class="asset-table__type">${Utils.assetTypeMap[a.asset_type] || a.asset_type}</td>
      <td class="asset-table__category">${Utils.escapeHtml(a.category_name || '-')}</td>
      <td class="asset-table__status">${Utils.statusChip(a.status)}</td>
      <td class="asset-table__admin">${Utils.escapeHtml(a.admin_name || '-')}</td>
      <td class="asset-table__location">${Utils.escapeHtml(a.location_name || '-')}</td>
    </tr>
  `).join('');

  const headerClass = isMobile ? 'page-header asset-list-header asset-list-header--mobile' : 'page-header';
  const headerActions = isMobile
    ? `<button class="btn btn--primary btn--sm asset-list-header__create" onclick="Router.navigate('asset-form')">${Utils.svgIcon('plus')} 新建工具</button>`
    : `<span class="tag">共 ${total} 件</span>
       <button class="btn btn--primary" onclick="Router.navigate('asset-form')">${Utils.svgIcon('plus')} 新建工具</button>`;

  const toolbarHtml = isMobile ? `
    <div class="asset-toolbar asset-toolbar--mobile">
      <div class="search-bar asset-toolbar__search">
        ${Utils.svgIcon('search')}
        <input type="text" id="pc-asset-search" placeholder="搜索编号、名称" value="${Utils.escapeHtml(keyword)}">
      </div>
      <div class="asset-toolbar__filters">
        <select id="pc-status-filter" class="form-select asset-toolbar__filter">
          <option value="">全部状态</option>
          <option value="IN_STOCK" ${statusFilter === 'IN_STOCK' ? 'selected' : ''}>在库</option>
          <option value="BORROWED" ${statusFilter === 'BORROWED' ? 'selected' : ''}>已借出</option>
          <option value="DAMAGED" ${statusFilter === 'DAMAGED' ? 'selected' : ''}>损坏</option>
          <option value="LOST" ${statusFilter === 'LOST' ? 'selected' : ''}>丢失</option>
        </select>
        <select id="pc-page-size" class="form-select asset-toolbar__filter">
          ${[10, 20, 50, 100].map(size => `<option value="${size}" ${pageSize === size ? 'selected' : ''}>每页 ${size} 条</option>`).join('')}
        </select>
      </div>
    </div>`
    : `
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
      <select id="pc-page-size" class="form-select" style="width:128px;">
        ${[10, 20, 50, 100].map(size => `<option value="${size}" ${pageSize === size ? 'selected' : ''}>每页 ${size} 条</option>`).join('')}
      </select>
    </div>`;

  const mainContent = `
    <div class="${headerClass}">
      <div class="page-header__info">
        <h1 class="page-header__title">${isSuper ? '工具管理' : '设备管理'}</h1>
        <p class="page-header__desc">共 ${total} 件设备/工具</p>
      </div>
      <div class="page-header__actions">
        ${headerActions}
      </div>
    </div>

    ${toolbarHtml}

    <div class="content-row">
      <div class="content-main">
          <div class="card" style="padding:0;overflow:hidden;">
          <div class="table-wrapper ${isMobile ? 'table-wrapper--mobile-scroll' : ''}">
            <table class="data-table asset-table ${isMobile ? 'asset-table--mobile' : ''}">
              <thead><tr><th class="asset-table__code">编号</th><th class="asset-table__name">名称</th><th class="asset-table__type">类型</th><th class="asset-table__category">分类</th><th class="asset-table__status">状态</th><th class="asset-table__admin">管理员</th><th class="asset-table__location">位置</th></tr></thead>
              <tbody>${tableRows || '<tr><td colspan="7"><div class="empty-state">暂无数据</div></td></tr>'}</tbody>
            </table>
          </div>
        </div>
        ${totalPages > 1 ? `
          <div class="flex-center gap-sm">
            ${page > 1 ? `<button class="btn btn--outline btn--sm" onclick="Router.navigate('asset-list',{page:${page - 1},page_size:${pageSize},keyword:'${keyword}',status:'${statusFilter}'})">上一页</button>` : ''}
            <span class="text-sm text-muted">${page} / ${totalPages}</span>
            ${page < totalPages ? `<button class="btn btn--outline btn--sm" onclick="Router.navigate('asset-list',{page:${page + 1},page_size:${pageSize},keyword:'${keyword}',status:'${statusFilter}'})">下一页</button>` : ''}
          </div>` : ''}
      </div>

      ${isSuper ? '' : `
      <div class="content-side">
        <div class="card stack--md">
          <h3>编辑范围</h3>
          <p class="text-sm text-muted">你可以编辑自己负责设备的分类、存放位置和基础信息，但不能维护分类字典或位置字典。</p>
        </div>
      </div>`}
    </div>`;

  app.innerHTML = renderPcLayout('asset-list', mainContent);

  // Bindings
  document.getElementById('pc-asset-search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      Router.navigate('asset-list', { keyword: e.target.value, status: statusFilter, page_size: pageSize });
    }
  });
  document.getElementById('pc-status-filter').addEventListener('change', (e) => {
    Router.navigate('asset-list', { keyword, status: e.target.value, page_size: pageSize });
  });
  document.getElementById('pc-page-size').addEventListener('change', (e) => {
    Router.navigate('asset-list', { keyword, status: statusFilter, page: 1, page_size: e.target.value });
  });
}

Router.register('recent-deleted-assets', async () => {
  const app = document.getElementById('app');
  const user = Api.getUser();
  if (!user || user.role !== 'SUPER_ADMIN') {
    app.innerHTML = '<div class="empty-state"><p>仅超级管理员可访问最近删除</p></div>';
    return;
  }

  let recentDeleted = [];
  try {
    const res = await Api.listRecentDeletedAssets();
    recentDeleted = res.data || [];
  } catch (e) {
    app.innerHTML = `<div class="empty-state"><p>${Utils.escapeHtml(e.message)}</p></div>`;
    return;
  }

  const mainContent = `
    <div class="stack stack--page">
      <div class="page-header">
        <div class="page-header__info">
          <h1 class="page-header__title">最近删除</h1>
          <p class="page-header__desc">展示最近 5 台被删除的设备，支持直接撤回。</p>
        </div>
        <div class="page-header__actions">
          <a href="#asset-list" class="btn btn--outline btn--sm">返回设备列表</a>
        </div>
      </div>
      ${renderRecentDeletedAssetsCard(recentDeleted)}
    </div>`;

  app.innerHTML = renderPcLayout('recent-deleted-assets', mainContent);
  bindRecentRestoreButtons(20, '', '', 1, 'recent-deleted-assets');
});

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
    <div class="stack stack--page">
      <div class="page-header">
        <div class="page-header__info">
          <h1 class="page-header__title">${Utils.escapeHtml(asset.name)}</h1>
          <p class="page-header__desc">${Utils.escapeHtml(asset.asset_code)} · ${Utils.assetTypeMap[asset.asset_type] || asset.asset_type} · ${Utils.escapeHtml(asset.category_name || '未分类')}</p>
        </div>
        <div class="page-header__actions">
          ${Utils.statusChip(asset.status)}
          ${asset.status === 'IN_STOCK' ? `<button class="btn btn--primary btn--sm" id="detail-add-cart" data-id="${asset.id}" data-code="${Utils.escapeHtml(asset.asset_code)}" data-name="${Utils.escapeHtml(asset.name)}" data-loc="${Utils.escapeHtml(asset.location_name || '')}">加入借用清单</button>` : ''}
          ${isAdmin ? `<button class="btn btn--secondary btn--sm" onclick="Router.navigate('asset-form',{id:'${asset.id}'})">编辑</button>` : ''}
          ${user.role === 'SUPER_ADMIN' && asset.is_active ? `<button class="btn btn--danger btn--sm" id="asset-delete-btn">删除设备</button>` : ''}
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
      </div>
    </div>`;

  if (isAdmin) {
    app.innerHTML = renderPcLayout('asset-list', detailHtml);
  } else {
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      app.innerHTML = renderMobileUserShell('asset-list', detailHtml, {
        backHref: 'asset-list',
        backLabel: '返回设备列表',
        compact: true,
      });
    } else {
      app.innerHTML = renderUserLayout('asset-list', detailHtml);
    }
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

  const deleteBtn = document.getElementById('asset-delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      _showApprovalModal('删除设备', `确认删除设备“${asset.name}”？最近删除的 5 台设备支持撤回。`, async () => {
        await Api.deleteAsset(asset.id);
        Utils.showToast('设备已删除，可在最近删除中撤回');
        Router.navigate('asset-list');
      });
    });
  }
});

// ===== Asset Form Page =====
Router.register('asset-form', async (params) => {
  const app = document.getElementById('app');
  const user = Api.getUser();
  const isEdit = !!params.id;
  const editableStatusOptions = ['IN_STOCK', 'DAMAGED', 'LOST', 'DISABLED'];
  const workflowManagedStatuses = ['PENDING_BORROW_APPROVAL', 'BORROWED', 'PENDING_RETURN_APPROVAL'];
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

  const isWorkflowManagedStatus = isEdit && workflowManagedStatuses.includes(asset?.status);
  const statusOptionValues = isWorkflowManagedStatus
    ? [asset.status, ...editableStatusOptions.filter(value => value !== asset.status)]
    : editableStatusOptions;

  const formHtml = `
    <div class="stack stack--page">
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
          <div class="card stack--md asset-form-card">
            <div class="asset-form-card__header">
              <h3>基本信息</h3>
              <button class="btn btn--outline btn--sm asset-form__rule-btn" id="asset-rule-info-btn" type="button" aria-label="查看编号规则">i</button>
            </div>
          <div class="form-group">
            <label class="form-label">设备/工具名称 <span class="form-required">*必填</span></label>
            <input type="text" id="af-name" class="form-input" value="${Utils.escapeHtml(asset?.name || '')}" placeholder="例如：数字示波器">
          </div>
          <div class="asset-form-row">
            <div class="form-group" style="flex:1;">
              ${isEdit ? `
              <label class="form-label">状态 <span class="form-required">*必填</span></label>
              <select id="af-status" class="form-select" ${isWorkflowManagedStatus ? 'disabled' : ''}>
                ${statusOptionValues.map(value => `<option value="${value}" ${asset?.status === value ? 'selected' : ''}>${Utils.statusMap[value]?.label || value}</option>`).join('')}
              </select>
              <div class="text-xs text-muted">${isWorkflowManagedStatus ? '当前状态由借还流程维护，暂不可手动修改。' : '可手动维护在库、损坏、丢失、停用状态。'}</div>
              ` : `
              <label class="form-label">类型 <span class="form-required">*必填</span></label>
              <select id="af-type" class="form-select">
                <option value="DEVICE" ${asset?.asset_type === 'DEVICE' ? 'selected' : ''}>设备</option>
                <option value="TOOL" ${asset?.asset_type === 'TOOL' ? 'selected' : ''}>工具</option>
              </select>`}
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

          <div class="card stack--md asset-form-card">
            <h3>补充信息（选填）</h3>
          <div class="asset-form-row">
            <div class="form-group" style="flex:1;"><label class="form-label">品牌</label><input type="text" id="af-brand" class="form-input" value="${Utils.escapeHtml(asset?.brand || '')}" placeholder="例如：Tektronix"></div>
            <div class="form-group" style="flex:1;"><label class="form-label">型号</label><input type="text" id="af-model" class="form-input" value="${Utils.escapeHtml(asset?.model || '')}" placeholder="例如：TDS1012"></div>
          </div>
          <div class="asset-form-row">
            <div class="form-group" style="flex:1;"><label class="form-label">序列号</label><input type="text" id="af-serial" class="form-input" value="${Utils.escapeHtml(asset?.serial_number || '')}"></div>
            <div class="form-group" style="flex:1;"><label class="form-label">入库日期</label><input type="date" id="af-date" class="form-input form-input--date" value="${asset?.entry_date || ''}"></div>
          </div>
          <div class="form-group"><label class="form-label">描述</label><textarea id="af-desc" class="form-textarea" placeholder="设备详细说明">${Utils.escapeHtml(asset?.description || '')}</textarea></div>
          <div class="form-group"><label class="form-label">备注</label><textarea id="af-remark" class="form-textarea" placeholder="其他信息">${Utils.escapeHtml(asset?.remark || '')}</textarea></div>
        </div>

        ${!isEdit ? `
          <div class="card asset-photo-card">
            <h3>库存照片 <span class="form-required">*必填，拍照留痕</span></h3>
            <div class="asset-photo-card__content">
              <p class="text-sm text-muted">上传设备入库时的照片，作为基准对比。支持 jpg/png/webp，建议 1 张，最多 3 张。</p>
              <input type="file" id="af-photos" accept="image/jpeg,image/png,image/webp" multiple hidden>
              <div id="af-photo-preview" class="asset-photo-slots"></div>
            </div>
          </div>` : ''}

          <div id="af-error" class="form-error hidden"></div>
          <button id="af-submit" class="btn btn--primary btn--full">${isEdit ? '保存修改' : '创建并上传照片'}</button>
        </div>
        ${isEdit ? `
        <div class="content-side">
          <div class="card stack--sm">
            <h3>库存照片</h3>
            <p class="text-sm text-muted">请在设备详情页上传/管理库存照片。</p>
            <a href="#asset-detail?id=${params.id}" class="btn btn--outline btn--sm btn--full">查看设备详情</a>
          </div>
        </div>` : ''}
      </div>
    </div>`;

  app.innerHTML = renderPcLayout('asset-list', formHtml);

  const ruleInfoBtn = document.getElementById('asset-rule-info-btn');
  if (ruleInfoBtn) {
    ruleInfoBtn.addEventListener('click', () => {
      showAssetInfoModal('编号规则', '编号由名称拼音首字母自动生成，格式如 LSD-001。\n编号一旦生成不可复用或回收。');
    });
  }

  // Photo preview for new asset
  const photoInput = document.getElementById('af-photos');
  const selectedPhotos = [];
  const renderAssetPhotoPreview = () => {
    const preview = document.getElementById('af-photo-preview');
    if (!preview) return;
    preview.innerHTML = '';
    const maxPhotos = 3;

    selectedPhotos.forEach((file, index) => {
      const tile = document.createElement('div');
      tile.className = 'asset-photo-slot asset-photo-slot--filled';

      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.className = 'asset-photo-slot__img';

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'asset-photo-slot__remove';
      delBtn.textContent = '×';
      delBtn.addEventListener('click', () => {
        selectedPhotos.splice(index, 1);
        renderAssetPhotoPreview();
      });

      tile.appendChild(img);
      tile.appendChild(delBtn);
      preview.appendChild(tile);
    });

    if (selectedPhotos.length < maxPhotos) {
      const addLabel = document.createElement('label');
      addLabel.className = 'asset-photo-slot asset-photo-slot--add';
      addLabel.htmlFor = 'af-photos';
      addLabel.innerHTML = `
        <span class="asset-photo-slot__plus">+</span>
        <span class="asset-photo-slot__text">选择图像</span>`;
      preview.appendChild(addLabel);
    }

    while (preview.children.length < maxPhotos) {
      const emptySlot = document.createElement('div');
      emptySlot.className = 'asset-photo-slot asset-photo-slot--empty';
      preview.appendChild(emptySlot);
    }
  };
  if (photoInput) {
    renderAssetPhotoPreview();
    photoInput.addEventListener('change', () => {
      const remaining = 3 - selectedPhotos.length;
      const nextFiles = Array.from(photoInput.files).slice(0, remaining);
      nextFiles.forEach((file) => selectedPhotos.push(file));
      if (photoInput.files.length > nextFiles.length) {
        Utils.showToast('库存照片最多上传 3 张', 'info');
      }
      photoInput.value = '';
      renderAssetPhotoPreview();
    });
  }

  document.getElementById('af-submit').addEventListener('click', async () => {
    const errEl = document.getElementById('af-error');
    errEl.classList.add('hidden');

    const data = {
      name: document.getElementById('af-name').value.trim(),
      category_id: document.getElementById('af-category').value || null,
      location_id: document.getElementById('af-location').value || null,
      brand: document.getElementById('af-brand').value.trim() || null,
      model: document.getElementById('af-model').value.trim() || null,
      serial_number: document.getElementById('af-serial').value.trim() || null,
      entry_date: document.getElementById('af-date').value || null,
      description: document.getElementById('af-desc').value.trim() || null,
      remark: document.getElementById('af-remark').value.trim() || null,
    };

    if (isEdit) {
      const statusEl = document.getElementById('af-status');
      if (statusEl && !statusEl.disabled) data.status = statusEl.value;
    } else {
      data.asset_type = document.getElementById('af-type').value;
    }

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
      if (selectedPhotos.length === 0) { errEl.textContent = '请上传库存照片（必填）'; errEl.classList.remove('hidden'); return; }
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
        if (selectedPhotos.length > 0) {
          for (const file of selectedPhotos) {
            try { await Api.uploadAttachment(file, 'INVENTORY', 'Asset', assetId); } catch (e) { console.warn('Photo upload failed:', e); }
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
