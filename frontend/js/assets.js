// ===== Asset List Page =====
Router.register('asset-list', async (params) => {
  const app = document.getElementById('app');
  const user = Api.getUser();

  const page = parseInt(params.page) || 1;
  const pageSize = [10, 20, 50, 100].includes(parseInt(params.page_size, 10)) ? parseInt(params.page_size, 10) : 20;
  const keyword = params.keyword || '';
  const statusFilter = params.status || '';

  let assets = [], total = 0, summaryTotal = 0, stockCount = 0;
  try {
    const qp = { page, page_size: pageSize };
    if (keyword) qp.keyword = keyword;
    if (statusFilter) qp.status = statusFilter;
    const summaryQp = { page: 1, page_size: 1 };
    if (keyword) summaryQp.keyword = keyword;
    const stockQp = { page: 1, page_size: 1, status: 'IN_STOCK' };
    if (keyword) stockQp.keyword = keyword;
    const [res, summaryRes, stockRes] = await Promise.all([
      Api.listAssets(qp),
      Api.listAssets(summaryQp),
      Api.listAssets(stockQp),
    ]);
    assets = res.data.items;
    total = res.data.total;
    summaryTotal = summaryRes.data.total;
    stockCount = stockRes.data.total;
  } catch (e) {
    console.error(e);
  }

  renderBorrowAssetList(app, assets, total, page, pageSize, keyword, statusFilter, user, {
    summaryTotal,
    stockCount,
  });
});

Router.register('managed-assets', async (params) => {
  const app = document.getElementById('app');
  const user = Api.getUser();
  if (!user || (user.role !== 'ASSET_ADMIN' && user.role !== 'SUPER_ADMIN')) {
    Router.navigate('asset-list');
    return;
  }

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

  renderManagedAssetList(app, assets, total, page, pageSize, keyword, statusFilter, user);
  if (typeof markManagedAssetsSeen === 'function') {
    markManagedAssetsSeen();
  }
});

function renderBorrowAssetList(app, assets, total, page, pageSize, keyword, statusFilter, user, summary = {}) {
  const isMobile = window.innerWidth <= 768;
  const isAdmin = user && (user.role === 'ASSET_ADMIN' || user.role === 'SUPER_ADMIN');
  const stockCount = Number.isFinite(summary.stockCount) ? summary.stockCount : assets.filter(a => a.status === 'IN_STOCK').length;
  const summaryTotal = Number.isFinite(summary.summaryTotal) ? summary.summaryTotal : total;
  const maxItems = Api.getSystemConfig('borrow_order_max_items', 20);
  const totalPages = Math.ceil(total / pageSize);
  const getDisplayStatus = (asset) => asset.display_status || asset.status;

  const renderAssetMedia = (asset) => {
    const previewSrc = asset.preview_thumb_path || asset.preview_file_path;
    if (previewSrc) {
      return `<div class="asset-card__media">
        <img src="/uploads/${Utils.escapeHtml(previewSrc)}" alt="${Utils.escapeHtml(asset.name)}" loading="lazy">
      </div>`;
    }
    return `<div class="asset-card__media asset-card__media--placeholder">
      <div class="asset-card__media-icon">${Utils.svgIcon('box')}</div>
      <span class="asset-card__media-text">暂无图片</span>
    </div>`;
  };

  const bodyHtml = `
    <div class="borrow-browser borrow-browser--pc">
      <div class="borrow-browser__header">
        <div>
          <h1 style="font-size:1.5rem;">器材借用</h1>
          <p class="text-xs text-muted">共 ${summaryTotal} 件器材 · ${stockCount} 件在库可借</p>
        </div>
        <div class="borrow-browser__summary">
          <span class="tag">总计 ${summaryTotal} 件</span>
          <span class="chip chip--stock">在库 ${stockCount} 件</span>
        </div>
      </div>

      <div class="card borrow-browser__surface">
        <div class="borrow-browser__toolbar">
          <div class="search-bar borrow-browser__search">
            ${Utils.svgIcon('search')}
            <input type="text" id="user-search" placeholder="搜索编号、名称、分类" value="${Utils.escapeHtml(keyword)}">
          </div>
          <select id="user-page-size" class="form-select borrow-browser__page-size">
            ${[10, 20, 50, 100].map(size => `<option value="${size}" ${pageSize === size ? 'selected' : ''}>每页 ${size} 条</option>`).join('')}
          </select>
        </div>

        <div class="borrow-browser__filters borrow-browser__filters--card chip-row">
          <span class="chip ${!statusFilter ? 'chip--active' : 'chip--outline'}" data-status="">全部</span>
          <span class="chip ${statusFilter === 'IN_STOCK' ? 'chip--active' : 'chip--outline'}" data-status="IN_STOCK">在库</span>
          <span class="chip ${statusFilter === 'BORROWED' ? 'chip--active' : 'chip--outline'}" data-status="BORROWED">借出</span>
        </div>
      </div>

      <div class="asset-grid asset-grid--borrow">
        ${assets.length === 0 ? '<div class="empty-state" style="grid-column:1/-1;"><p>暂无可借器材</p></div>' :
          assets.map(a => `
            <div class="asset-card asset-card--borrow" data-id="${a.id}">
              ${renderAssetMedia(a)}
              <div class="asset-card__body">
                <div class="asset-card__header">
                  <div style="min-width:0;">
                    <div class="asset-card__title">${Utils.escapeHtml(a.name)}</div>
                    <div class="asset-card__code">${Utils.escapeHtml(a.asset_code)} · ${Utils.escapeHtml(a.asset_type_name || '未设置性质')}</div>
                  </div>
                  ${Utils.statusChip(getDisplayStatus(a))}
                </div>
                <div class="asset-card__meta-list">
                  <div class="asset-card__meta"><span class="asset-card__meta-label">分类</span><span>${Utils.escapeHtml(a.category_name || '未分类')}</span></div>
                  <div class="asset-card__meta"><span class="asset-card__meta-label">位置</span><span>${Utils.escapeHtml(a.location_name || '未设置位置')}</span></div>
                  <div class="asset-card__meta"><span class="asset-card__meta-label">规格</span><span>${Utils.escapeHtml((`${a.brand || ''} ${a.model || ''}`).trim() || '暂无品牌 / 型号')}</span></div>
                </div>
                <div class="asset-card__footer">
                  <span class="asset-card__availability ${a.status === 'IN_STOCK' ? 'asset-card__availability--stock' : 'asset-card__availability--disabled'}">${a.status === 'IN_STOCK' ? '在库可借' : '当前不可借'}</span>
                  ${a.status === 'IN_STOCK'
                    ? `<button class="btn btn--secondary btn--sm add-cart-btn" data-id="${a.id}" data-code="${Utils.escapeHtml(a.asset_code)}" data-name="${Utils.escapeHtml(a.name)}" data-loc="${Utils.escapeHtml(a.location_name || '')}">添加到借用单</button>`
                    : `<button class="btn btn--outline btn--sm" disabled>${a.status === 'BORROWED' ? '已借出' : '不可借用'}</button>`}
                </div>
              </div>
            </div>
          `).join('')}
      </div>

      ${totalPages > 1 ? `
        <div class="flex-center gap-sm borrow-browser__pagination">
          ${page > 1 ? `<button class="btn btn--outline btn--sm" onclick="Router.navigate('asset-list',{page:${page - 1},page_size:${pageSize},keyword:'${keyword}',status:'${statusFilter}'})">上一页</button>` : ''}
          <span class="text-sm text-muted">${page} / ${totalPages}</span>
          ${page < totalPages ? `<button class="btn btn--outline btn--sm" onclick="Router.navigate('asset-list',{page:${page + 1},page_size:${pageSize},keyword:'${keyword}',status:'${statusFilter}'})">下一页</button>` : ''}
        </div>` : ''}
    </div>`;

  if (isMobile && isAdmin) {
    app.innerHTML = renderMobileAdminShell('asset-list', bodyHtml);
  } else if (isMobile) {
    app.innerHTML = renderMobileUserShell('asset-list', bodyHtml, { showBottomNav: true });
  } else if (isAdmin) {
    app.innerHTML = renderPcLayout('asset-list', bodyHtml);
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
        Utils.showToast('已添加到借用单');
        btn.textContent = '已添加';
        btn.disabled = true;
      } else {
        Utils.showToast(`已在借用单中或借用单已满 (${maxItems})`, 'error');
      }
    });
  });

  // Card click
  document.querySelectorAll('.asset-card').forEach(card => {
    card.style.cursor = 'pointer';
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      Router.navigate('asset-detail', { id: card.dataset.id, from: 'asset-list' });
    });
  });
}

function renderManagedAssetList(app, assets, total, page, pageSize, keyword, statusFilter, user) {
  renderPcAssetList(app, assets, total, page, pageSize, keyword, statusFilter, user, {
    activeRoute: 'managed-assets',
    title: '我的器材',
    description: user.role === 'SUPER_ADMIN' ? '查看并维护全部器材' : '仅展示你负责维护的器材',
    routeName: 'managed-assets',
    createLabel: '新建器材',
    showBorrower: true,
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

function renderPcAssetList(app, assets, total, page, pageSize, keyword, statusFilter, user, options = {}) {
  const totalPages = Math.ceil(total / pageSize);
  const isSuper = user.role === 'SUPER_ADMIN';
  const isMobile = window.innerWidth <= 768;
  const activeRoute = options.activeRoute || 'managed-assets';
  const routeName = options.routeName || activeRoute;
  const title = options.title || '我的器材';
  const description = options.description || '查看并维护当前管理范围内的器材';
  const createLabel = options.createLabel || '新建器材';
  const showBorrower = Boolean(options.showBorrower);

  const tableRows = assets.map(a => `
    <tr data-asset-id="${a.id}" tabindex="0" role="link" aria-label="查看${Utils.escapeHtml(a.name)}详情">
      <td class="asset-table__name">
        <div class="asset-table__cell-main">${Utils.escapeHtml(a.name)}</div>
      </td>
      <td class="asset-table__code">
        <div class="asset-table__cell-sub asset-table__cell-sub--code">${Utils.escapeHtml(a.asset_code)}</div>
      </td>
      <td class="asset-table__type">${Utils.escapeHtml(a.asset_type_name || '-')}</td>
      <td class="asset-table__category">${Utils.escapeHtml(a.category_name || '-')}</td>
      <td class="asset-table__status">${Utils.statusChip(a.display_status || a.status)}</td>
      ${showBorrower ? `<td class="asset-table__borrower">${Utils.escapeHtml(a.borrower_name || '-')}</td>` : ''}
      <td class="asset-table__admin">${Utils.escapeHtml(a.admin_name || '-')}</td>
      <td class="asset-table__location">${Utils.escapeHtml(a.location_name || '-')}</td>
    </tr>
  `).join('');

  const tableHead = `<tr>
    <th class="asset-table__name">名称</th>
    <th class="asset-table__code">编号</th>
    <th class="asset-table__type">性质</th>
    <th class="asset-table__category">分类</th>
    <th class="asset-table__status">状态</th>
    ${showBorrower ? '<th class="asset-table__borrower">借出人</th>' : ''}
    <th class="asset-table__admin">管理员</th>
    <th class="asset-table__location">位置</th>
  </tr>`;
  const columnCount = showBorrower ? 8 : 7;

  const headerClass = isMobile ? 'page-header asset-list-header asset-list-header--mobile' : 'page-header';
  const headerActions = isMobile
    ? `<button class="btn btn--primary btn--sm asset-list-header__create" onclick="Router.navigate('asset-form',{from:'${activeRoute}'})">${Utils.svgIcon('plus')} ${createLabel}</button>`
    : `<span class="tag">共 ${total} 件</span>
       <button class="btn btn--primary" onclick="Router.navigate('asset-form',{from:'${activeRoute}'})">${Utils.svgIcon('plus')} ${createLabel}</button>`;

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
    <div class="card asset-toolbar asset-toolbar--desktop asset-toolbar-panel">
      <div class="search-bar asset-toolbar__search">
        ${Utils.svgIcon('search')}
        <input type="text" id="pc-asset-search" placeholder="搜索编号、名称" value="${Utils.escapeHtml(keyword)}">
      </div>
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
    </div>`;

  const mainContent = `
    <div class="${headerClass}">
      <div class="page-header__info">
        <h1 class="page-header__title">${title}</h1>
        <p class="page-header__desc">${description} · 共 ${total} 件</p>
      </div>
      <div class="page-header__actions">
        ${headerActions}
      </div>
    </div>

    ${toolbarHtml}

    <div class="content-row">
      <div class="content-main">
          <div class="table-card asset-table-card">
          <div class="table-card__head asset-table-card__head">
            <div>
              <div class="table-card__title">器材列表</div>
              <div class="table-card__desc">点击整行查看设备详情、库存照片和流转信息。</div>
            </div>
            <span class="tag">当前 ${assets.length} / 共 ${total} 件</span>
          </div>
          <div class="table-wrapper ${isMobile ? 'table-wrapper--mobile-scroll' : ''}">
            <table class="data-table data-table--interactive asset-table ${isMobile ? 'asset-table--mobile' : ''} ${showBorrower ? 'asset-table--with-borrower' : ''}">
              <thead>${tableHead}</thead>
              <tbody>${tableRows || `<tr><td colspan="${columnCount}"><div class="empty-state">暂无数据</div></td></tr>`}</tbody>
            </table>
          </div>
        </div>
        ${totalPages > 1 ? `
          <div class="flex-center gap-sm">
            ${page > 1 ? `<button class="btn btn--outline btn--sm" onclick="Router.navigate('${routeName}',{page:${page - 1},page_size:${pageSize},keyword:'${keyword}',status:'${statusFilter}'})">上一页</button>` : ''}
            <span class="text-sm text-muted">${page} / ${totalPages}</span>
            ${page < totalPages ? `<button class="btn btn--outline btn--sm" onclick="Router.navigate('${routeName}',{page:${page + 1},page_size:${pageSize},keyword:'${keyword}',status:'${statusFilter}'})">下一页</button>` : ''}
          </div>` : ''}
      </div>

      ${isSuper ? '' : `
      <div class="content-side">
        <div class="card stack--md">
          <h3>编辑范围</h3>
          <p class="text-sm text-muted">你可以编辑自己负责设备的资产性质、分类、存放位置和基础信息，但不能维护属性字典或位置字典。</p>
        </div>
      </div>`}
    </div>`;

  app.innerHTML = renderPcLayout(activeRoute, mainContent);

  // Bindings
  document.getElementById('pc-asset-search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      Router.navigate(routeName, { keyword: e.target.value, status: statusFilter, page_size: pageSize });
    }
  });
  document.getElementById('pc-status-filter').addEventListener('change', (e) => {
    Router.navigate(routeName, { keyword, status: e.target.value, page_size: pageSize });
  });
  document.getElementById('pc-page-size').addEventListener('change', (e) => {
    Router.navigate(routeName, { keyword, status: statusFilter, page: 1, page_size: e.target.value });
  });
  document.querySelectorAll('.asset-table tbody tr[data-asset-id]').forEach((row) => {
    const openDetail = () => Router.navigate('asset-detail', { id: row.dataset.assetId, from: activeRoute });
    row.addEventListener('click', (event) => {
      if (event.target.closest('a,button,input,select,textarea,label')) return;
      openDetail();
    });
    row.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openDetail();
    });
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
          <a href="#managed-assets" class="btn btn--outline btn--sm">返回我的器材</a>
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
  const fromRoute = params.from === 'managed-assets' ? 'managed-assets' : 'asset-list';

  let asset = null;
  try {
    const res = await Api.getAsset(params.id);
    asset = res.data;
  } catch (e) {
    app.innerHTML = `<div class="empty-state"><p>${Utils.escapeHtml(e.message)}</p></div>`;
    return;
  }
  const canEditAsset = isAdmin && (user.role === 'SUPER_ADMIN' || String(asset.admin_id) === String(user.id));

  // Load inventory photos
  let inventoryPhotos = [];
  try {
    const pr = await Api.listAttachments({ related_type: 'Asset', related_id: asset.id, photo_type: 'INVENTORY' });
    inventoryPhotos = pr.data || [];
  } catch (e) { /* ignore */ }

  const detailHtml = `
    <div class="stack stack--page">
      <div class="page-header">
        <div class="page-header__info">
          <h1 class="page-header__title">${Utils.escapeHtml(asset.name)}</h1>
        <p class="page-header__desc">${Utils.escapeHtml(asset.asset_code)} · ${Utils.escapeHtml(asset.asset_type_name || '未设置性质')} · ${Utils.escapeHtml(asset.category_name || '未分类')}</p>
        </div>
        <div class="page-header__actions">
          ${Utils.statusChip(asset.display_status || asset.status)}
          ${asset.status === 'IN_STOCK' ? `<button class="btn btn--primary btn--sm" id="detail-add-cart" data-id="${asset.id}" data-code="${Utils.escapeHtml(asset.asset_code)}" data-name="${Utils.escapeHtml(asset.name)}" data-loc="${Utils.escapeHtml(asset.location_name || '')}">加入借用清单</button>` : ''}
          ${canEditAsset ? `<button class="btn btn--secondary btn--sm" onclick="Router.navigate('asset-form',{id:'${asset.id}',from:'${fromRoute}'})">编辑</button>` : ''}
          ${user.role === 'SUPER_ADMIN' && asset.is_active ? `<button class="btn btn--danger btn--sm" id="asset-delete-btn">删除设备</button>` : ''}
          <button class="btn btn--outline btn--sm" onclick="Router.navigate('${fromRoute}')">返回列表</button>
        </div>
      </div>

      <div class="content-row content-row--stretch">
        <div class="content-main">
          <div class="card stack--md">
            <h3>基本信息</h3>
            <div class="stack--sm">
              <div class="meta-row"><span class="meta-row__label">编号</span><span class="meta-row__value">${Utils.escapeHtml(asset.asset_code)}</span></div>
              <div class="meta-row"><span class="meta-row__label">名称</span><span class="meta-row__value">${Utils.escapeHtml(asset.name)}</span></div>
              <div class="meta-row"><span class="meta-row__label">资产性质</span><span class="meta-row__value">${Utils.escapeHtml(asset.asset_type_name || '-')}</span></div>
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
        </div>
        <div class="content-side">
          <div class="card stack--md asset-detail__photo-card">
            <h3>库存照片</h3>
            <div id="asset-photo-gallery" class="photo-gallery asset-detail__photo-gallery">
              ${inventoryPhotos.length > 0 ? inventoryPhotos.map(p =>
                `<img src="/uploads/${Utils.escapeHtml(p.thumb_path || p.file_path)}" class="photo-gallery__img" onclick="Utils.openLightbox('/uploads/${Utils.escapeHtml(p.file_path)}')">`
              ).join('') : '<p class="text-sm text-muted">暂无照片</p>'}
            </div>
            ${canEditAsset ? `
            <div class="form-group asset-detail__photo-upload">
              <label class="form-label">上传库存照片</label>
              <input type="file" id="asset-photo-upload" accept="image/jpeg,image/png,image/webp" multiple style="font-size:0.8125rem;">
              <div id="asset-upload-preview" class="upload-preview-grid upload-preview-grid--compact" style="margin-top:6px;"></div>
              <button class="btn btn--secondary btn--sm" id="asset-upload-btn" style="margin-top:8px;">选择照片</button>
            </div>` : ''}
          </div>
        </div>
      </div>
      ${asset.description ? `<div class="card stack--sm"><h3>描述</h3><p class="text-sm">${Utils.escapeHtml(asset.description)}</p></div>` : ''}
      ${asset.remark ? `<div class="card stack--sm"><h3>备注</h3><p class="text-sm">${Utils.escapeHtml(asset.remark)}</p></div>` : ''}
    </div>`;

  if (isAdmin) {
    app.innerHTML = renderPcLayout(fromRoute, detailHtml);
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
    let detailUploadEntries = [];
    let isDetailUploading = false;
    const hasDetailUploading = () => detailUploadEntries.some((entry) => entry.uploading);

    const renderDetailUploadPreview = () => {
      const preview = document.getElementById('asset-upload-preview');
      if (!preview) return;
      preview.innerHTML = '';
      detailUploadEntries.forEach((entry, index) => {
        preview.appendChild(Utils.createUploadProgressTile(entry, {
          compact: true,
          alt: `${asset.name} 上传预览`,
          onRemove: isDetailUploading ? null : () => {
            Utils.removeUploadPreviewEntry(detailUploadEntries, index);
            renderDetailUploadPreview();
          },
        }));
      });
      uploadBtn.textContent = hasDetailUploading()
        ? `上传中 ${detailUploadEntries.filter((entry) => entry.progress >= 100 && !entry.error).length}/${detailUploadEntries.length}`
        : '选择照片';
    };

    const autoUploadDetailPhotos = async (files) => {
      if (!files.length) return;
      isDetailUploading = true;
      Utils.releaseUploadPreviewEntries(detailUploadEntries);
      const nextEntries = files.map((file) => {
        const entry = Utils.createUploadPreviewEntry(file);
        entry.uploading = true;
        return entry;
      });
      detailUploadEntries = nextEntries;
      renderDetailUploadPreview();
      let failed = false;
      for (const entry of nextEntries) {
        entry.error = false;
        try {
          await Api.uploadAttachment(entry.file, 'INVENTORY', 'Asset', asset.id, {
            onProgress: (progress) => {
              entry.progress = progress;
              renderDetailUploadPreview();
            },
          });
          entry.progress = 100;
        } catch (e) {
          entry.error = true;
          failed = true;
          console.warn('Upload failed:', e);
        } finally {
          entry.uploading = false;
          renderDetailUploadPreview();
        }
      }
      isDetailUploading = false;
      if (failed) {
        uploadBtn.textContent = '选择照片';
        Utils.showToast('部分照片上传失败，请重试', 'error');
        renderDetailUploadPreview();
        return;
      }
      Utils.showToast('照片上传成功');
      Utils.releaseUploadPreviewEntries(detailUploadEntries);
      Router.navigate('asset-detail', { id: asset.id, from: fromRoute });
    };

    photoInput.addEventListener('change', () => {
      const files = Array.from(photoInput.files);
      photoInput.value = '';
      autoUploadDetailPhotos(files);
    });
    photoInput.addEventListener('click', (e) => {
      if (hasDetailUploading()) {
        e.preventDefault();
        Utils.showToast('照片正在上传，请稍候', 'info');
      }
    });

    uploadBtn.addEventListener('click', async () => {
      if (hasDetailUploading()) {
        Utils.showToast('照片正在上传，请稍候', 'info');
        return;
      }
      photoInput.click();
    });
  }

  const deleteBtn = document.getElementById('asset-delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      _showApprovalModal('删除设备', `确认删除设备“${asset.name}”？最近删除的 5 台设备支持撤回。`, async () => {
        await Api.deleteAsset(asset.id);
        Utils.showToast('设备已删除，可在最近删除中撤回');
        Router.navigate(fromRoute);
      });
    });
  }
});

// ===== Asset Form Page =====
Router.register('asset-form', async (params) => {
  const app = document.getElementById('app');
  const user = Api.getUser();
  const isEdit = !!params.id;
  const fromRoute = params.from === 'asset-list' ? 'asset-list' : 'managed-assets';
  const canEditAdminField = user.role === 'SUPER_ADMIN';
  const shouldShowAdminField = canEditAdminField || user.role === 'ASSET_ADMIN';
  const editableStatusOptions = ['IN_STOCK', 'DAMAGED', 'LOST', 'DISABLED'];
  const workflowManagedStatuses = ['PENDING_BORROW_APPROVAL', 'BORROWED', 'PENDING_RETURN_APPROVAL'];
  let asset = null, assetTypes = [], categories = [], locations = [], admins = [];

  try {
    const [typeRes, catRes, locRes] = await Promise.all([
      Api.listAssetTypes(),
      Api.listCategories(),
      Api.listLocations(),
    ]);
    assetTypes = typeRes.data || [];
    categories = catRes.data || [];
    locations = locRes.data || [];

    if (user.role === 'SUPER_ADMIN') {
      const usersRes = await Api.listUsers({ page_size: 100 });
      admins = (usersRes.data.items || []).filter(u => u.role === 'ASSET_ADMIN' || u.role === 'SUPER_ADMIN');
    }

    if (isEdit) {
      const res = await Api.getAsset(params.id);
      asset = res.data;
      if (user.role === 'ASSET_ADMIN' && String(asset.admin_id) !== String(user.id)) {
        Utils.showToast('只能编辑自己负责的设备', 'error');
        Router.navigate('managed-assets');
        return;
      }
    }
  } catch (e) {
    app.innerHTML = `<div class="empty-state"><p>${Utils.escapeHtml(e.message)}</p></div>`;
    return;
  }

  const isWorkflowManagedStatus = isEdit && workflowManagedStatuses.includes(asset?.status);
  const getStatusOptionLabel = (value) => {
    if (isEdit && value === asset?.status && asset?.display_status && asset.display_status !== asset.status) {
      return Utils.statusMap[asset.display_status]?.label || asset.display_status;
    }
    return Utils.statusMap[value]?.label || value;
  };
  const statusOptionValues = isWorkflowManagedStatus
    ? [asset.status, ...editableStatusOptions.filter(value => value !== asset.status)]
    : editableStatusOptions;
  const renderSelectOptions = (items, selectedId, placeholder) => {
    const selectedValue = selectedId == null ? '' : String(selectedId);
    const placeholderOption = `<option value="" disabled ${selectedValue ? '' : 'selected'} hidden>${placeholder}</option>`;
    const itemOptions = items.map(item => `
      <option value="${item.id}" ${selectedValue === String(item.id) ? 'selected' : ''}>${Utils.escapeHtml(item.name)}</option>
    `).join('');
    return placeholderOption + itemOptions;
  };
  const renderAdminOptions = () => {
    const selectedValue = asset?.admin_id == null ? '' : String(asset.admin_id);
    const placeholderOption = `<option value="" disabled ${selectedValue ? '' : 'selected'} hidden>请选择管理员</option>`;
    const adminOptions = admins.map(admin => `
      <option value="${admin.id}" ${selectedValue === String(admin.id) ? 'selected' : ''}>${Utils.escapeHtml(admin.full_name)} (${Utils.escapeHtml(admin.username)})</option>
    `).join('');
    return placeholderOption + adminOptions;
  };
  const resolveReadonlyAdminLabel = () => {
    if (asset?.admin_name) return asset.admin_name;
    if (user?.full_name && user?.username) return `${user.full_name} (${user.username})`;
    return user?.full_name || user?.username || '当前登录管理员';
  };

  const formHtml = `
    <div class="stack stack--page">
      <div class="page-header">
        <div class="page-header__info">
          <h1 class="page-header__title">${isEdit ? '编辑设备/工具' : '录入新设备/工具'}</h1>
          <p class="page-header__desc">${isEdit ? '修改设备信息' : '填写设备信息并上传库存照片'}</p>
        </div>
        <div class="page-header__actions">
          <button class="btn btn--outline btn--sm" onclick="Router.navigate('${fromRoute}')">返回列表</button>
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
          <div class="asset-form-row ${isEdit ? 'asset-form-row--triple' : ''}">
            ${isEdit ? `
            <div class="form-group" style="flex:1;">
              <label class="form-label">状态 <span class="form-required">*必填</span></label>
              <select id="af-status" class="form-select" ${isWorkflowManagedStatus ? 'disabled' : ''}>
                ${statusOptionValues.map(value => `<option value="${value}" ${asset?.status === value ? 'selected' : ''}>${getStatusOptionLabel(value)}</option>`).join('')}
              </select>
              <div class="text-xs text-muted">${isWorkflowManagedStatus ? '当前状态由借还流程维护，暂不可手动修改。' : '可手动维护在库、损坏、丢失、停用状态。'}</div>
            </div>` : ''}
            <div class="form-group" style="flex:1;">
              <label class="form-label">资产性质 <span class="form-required">*必填</span></label>
              <select id="af-type" class="form-select">
                ${renderSelectOptions(assetTypes, asset?.asset_type_id, '请选择资产性质')}
              </select>
            </div>
            <div class="form-group" style="flex:1;">
              <label class="form-label">分类 <span class="form-required">*必填</span></label>
              <select id="af-category" class="form-select">
                ${renderSelectOptions(categories, asset?.category_id, '请选择分类')}
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">存放位置 <span class="form-required">*必填</span></label>
            <select id="af-location" class="form-select">
              ${renderSelectOptions(locations, asset?.location_id, '请选择位置')}
            </select>
          </div>
          ${shouldShowAdminField ? `
          <div class="form-group">
            <label class="form-label">设备管理员 ${canEditAdminField ? '<span class="form-required">*必填，超管必须指定</span>' : ''}</label>
            ${canEditAdminField ? `
            <select id="af-admin" class="form-select">
              ${renderAdminOptions()}
            </select>
            ` : `
            <input type="text" class="form-input" value="${Utils.escapeHtml(resolveReadonlyAdminLabel())}" disabled>
            <div class="text-xs text-muted">设备管理员仅可维护自己负责的设备，不能在此修改归属。</div>
            `}
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
          <button id="af-submit" class="btn btn--primary btn--full">${isEdit ? '保存修改' : '确认创建'}</button>
        </div>
        ${isEdit ? `
        <div class="content-side">
          <div class="card stack--sm">
            <h3>库存照片</h3>
            <p class="text-sm text-muted">请在设备详情页上传/管理库存照片。</p>
            <a href="#asset-detail?id=${params.id}&from=${fromRoute}" class="btn btn--outline btn--sm btn--full">查看设备详情</a>
          </div>
        </div>` : ''}
      </div>
    </div>`;

  app.innerHTML = renderPcLayout(fromRoute, formHtml);

  const ruleInfoBtn = document.getElementById('asset-rule-info-btn');
  if (ruleInfoBtn) {
    ruleInfoBtn.addEventListener('click', () => {
      showAssetInfoModal('编号规则', '编号由名称拼音首字母自动生成，格式如 LSD-001。\n编号一旦生成不可复用或回收。');
    });
  }

  // Photo preview for new asset
  const photoInput = document.getElementById('af-photos');
  const selectedPhotos = [];
  let isAssetCreating = false;
  const hasAssetPhotoUploading = () => selectedPhotos.some((entry) => entry.uploading);
  const hasAssetPhotoFailed = () => selectedPhotos.some((entry) => entry.error);
  const renderAssetPhotoPreview = () => {
    const preview = document.getElementById('af-photo-preview');
    if (!preview) return;
    preview.innerHTML = '';
    const maxPhotos = 3;

    selectedPhotos.forEach((entry, index) => {
      const tile = Utils.createUploadProgressTile(entry, {
        alt: '库存照片预览',
        onRemove: isAssetCreating ? null : async () => {
          if (entry.stageToken) {
            try {
              await Api.discardStagedAttachment(entry.stageToken);
            } catch (e) {
              Utils.showToast(e.message || '移除照片失败', 'error');
              return;
            }
          }
          Utils.removeUploadPreviewEntry(selectedPhotos, index);
          renderAssetPhotoPreview();
        },
      });
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
    photoInput.addEventListener('click', (e) => {
      if (hasAssetPhotoUploading()) {
        e.preventDefault();
        Utils.showToast('照片正在上传，请稍候', 'info');
      }
    });
    photoInput.addEventListener('change', () => {
      const remaining = 3 - selectedPhotos.length;
      const nextFiles = Array.from(photoInput.files).slice(0, remaining);
      if (photoInput.files.length > nextFiles.length) {
        Utils.showToast('库存照片最多上传 3 张', 'info');
      }
      photoInput.value = '';
      if (nextFiles.length === 0) {
        renderAssetPhotoPreview();
        return;
      }
      const nextEntries = nextFiles.map((file) => {
        const entry = Utils.createUploadPreviewEntry(file);
        entry.stageToken = null;
        entry.uploading = true;
        return entry;
      });
      selectedPhotos.push(...nextEntries);
      renderAssetPhotoPreview();
      nextEntries.forEach(async (entry) => {
        entry.error = false;
        try {
          const res = await Api.stageAttachment(entry.file, 'INVENTORY', {
            onProgress: (progress) => {
              entry.progress = progress;
              renderAssetPhotoPreview();
            },
          });
          entry.stageToken = res.data.stage_token;
          entry.progress = 100;
        } catch (e) {
          entry.error = true;
          Utils.showToast(e.message || '库存照片上传失败', 'error');
        } finally {
          entry.uploading = false;
          renderAssetPhotoPreview();
        }
      });
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

    const typeEl = document.getElementById('af-type');
    if (typeEl) data.asset_type_id = typeEl.value || null;

    if (isEdit) {
      const statusEl = document.getElementById('af-status');
      if (statusEl && !statusEl.disabled) data.status = statusEl.value;
    }

    if (user.role === 'SUPER_ADMIN') {
      const adminEl = document.getElementById('af-admin');
      if (adminEl) data.admin_id = adminEl.value || null;
    }

    // Validation
    if (!data.name) { errEl.textContent = '请填写设备名称'; errEl.classList.remove('hidden'); return; }
    if (!data.asset_type_id) { errEl.textContent = '请选择资产性质'; errEl.classList.remove('hidden'); return; }
    if (!data.category_id) { errEl.textContent = '请选择分类'; errEl.classList.remove('hidden'); return; }
    if (!data.location_id) { errEl.textContent = '请选择存放位置'; errEl.classList.remove('hidden'); return; }
    if (user.role === 'SUPER_ADMIN' && !data.admin_id) { errEl.textContent = '超管必须指定设备管理员'; errEl.classList.remove('hidden'); return; }
    if (!isEdit) {
      if (selectedPhotos.length === 0) { errEl.textContent = '请上传库存照片（必填）'; errEl.classList.remove('hidden'); return; }
      if (hasAssetPhotoUploading()) { Utils.showToast('照片正在上传，请稍候', 'info'); return; }
      if (hasAssetPhotoFailed()) { errEl.textContent = '有库存照片上传失败，请移除后重试'; errEl.classList.remove('hidden'); return; }
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
        isAssetCreating = true;
        const res = await Api.createAsset(data);
        assetId = res.data.id;
        if (selectedPhotos.length > 0) {
          let failed = false;
          for (let index = 0; index < selectedPhotos.length; index += 1) {
            const entry = selectedPhotos[index];
            try {
              if (!entry.stageToken) throw new Error('照片仍未上传完成');
              await Api.finalizeStagedAttachment(entry.stageToken, 'Asset', assetId);
              entry.stageToken = null;
            } catch (e) {
              entry.error = true;
              failed = true;
              console.warn('Photo finalize failed:', e);
            }
            submitBtn.textContent = `确认中 ${index + 1}/${selectedPhotos.length}`;
            renderAssetPhotoPreview();
          }
          if (failed) {
            isAssetCreating = false;
            submitBtn.disabled = false;
            submitBtn.textContent = '确认创建';
            errEl.textContent = '设备已创建，但部分库存照片确认失败，请进入设备详情补传。';
            errEl.classList.remove('hidden');
            Utils.showToast('部分库存照片确认失败', 'error');
            return;
          }
        }
        Utils.releaseUploadPreviewEntries(selectedPhotos);
        Utils.showToast('设备创建成功');
      }
      Router.navigate('asset-detail', { id: assetId, from: fromRoute });
    } catch (e) {
      isAssetCreating = false;
      errEl.textContent = e.message;
      errEl.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.textContent = isEdit ? '保存修改' : '确认创建';
    }
  });
});
