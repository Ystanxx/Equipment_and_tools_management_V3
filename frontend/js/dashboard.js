// ===== PC Sidebar helper =====
function renderSidebar(active) {
  const user = Api.getUser();
  const isSuper = user && user.role === 'SUPER_ADMIN';
  const isAdmin = user && (user.role === 'ASSET_ADMIN' || user.role === 'SUPER_ADMIN');

  const links = [
    { name: 'dashboard', label: '首页', icon: 'home', show: isAdmin },
    { name: 'asset-list', label: '工具管理', icon: 'wrench', show: isAdmin },
    { name: 'my-orders', label: '借用单', icon: 'box', show: isAdmin },
    { name: 'my-returns', label: '归还单', icon: 'box', show: isAdmin },
    { name: 'borrow-approvals', label: '借出审批', icon: 'tag', show: isAdmin },
    { name: 'return-approvals', label: '归还审批', icon: 'tag', show: isAdmin },
    { name: 'audit-logs', label: '审计日志', icon: 'tag', show: isSuper },
    { name: 'categories', label: '分类管理', icon: 'tag', show: isAdmin },
    { name: 'locations', label: '位置管理', icon: 'mapPin', show: isAdmin },
    { name: 'user-mgmt', label: '用户管理', icon: 'users', show: isSuper },
  ];

  return `
    <div class="sidebar">
      <div class="sidebar__brand">
        <span class="sidebar__brand-tag">LAB OPS</span>
        <span class="sidebar__brand-title">工具管理</span>
      </div>
      <nav class="sidebar__nav">
        ${links.filter(l => l.show).map(l => `
          <a href="#${l.name}" class="sidebar__link ${active === l.name ? 'sidebar__link--active' : ''}">
            ${Utils.svgIcon(l.icon)} ${l.label}
          </a>
        `).join('')}
      </nav>
      <div style="margin-top:auto;">
        <div class="text-xs text-muted" style="margin-bottom:8px;">已登录：${Utils.escapeHtml(user?.full_name || '')}</div>
        <a href="javascript:void(0)" class="sidebar__link" onclick="handleLogout()">
          ${Utils.svgIcon('logout')} 退出
        </a>
      </div>
    </div>`;
}

function renderPcLayout(active, mainContent) {
  return `
    <div class="layout-pc">
      ${renderSidebar(active)}
      <div class="main-content">${mainContent}</div>
    </div>`;
}

// ===== Dashboard Page =====
Router.register('dashboard', async () => {
  const app = document.getElementById('app');
  const user = Api.getUser();

  if (!user || user.role === 'USER') {
    return Router.navigate('asset-list');
  }

  let totalAssets = 0, borrowedCount = 0, stockCount = 0;
  try {
    const allRes = await Api.listAssets({ page: 1, page_size: 1 });
    totalAssets = allRes.data.total;
    const borrowedRes = await Api.listAssets({ status: 'BORROWED', page: 1, page_size: 1 });
    borrowedCount = borrowedRes.data.total;
    const stockRes = await Api.listAssets({ in_stock_only: true, page: 1, page_size: 1 });
    stockCount = stockRes.data.total;
  } catch (e) {
    console.error(e);
  }

  const mainContent = `
    <div class="page-header">
      <div class="page-header__info">
        <h1 class="page-header__title">设备运营概览</h1>
        <p class="page-header__desc">全量数据汇总，便于运营决策。</p>
      </div>
      <div class="page-header__actions">
        <span class="tag">工作台 V1</span>
      </div>
    </div>

    <div class="stat-row">
      <div class="stat-card stat-card--accent">
        <div class="stat-card__value">${totalAssets}</div>
        <div class="stat-card__label">总设备数</div>
      </div>
      <div class="stat-card stat-card--warning">
        <div class="stat-card__value">${borrowedCount}</div>
        <div class="stat-card__label">借出中</div>
      </div>
      <div class="stat-card stat-card--success">
        <div class="stat-card__value">${stockCount}</div>
        <div class="stat-card__label">在库可借</div>
      </div>
    </div>

    <div class="content-row">
      <div class="content-main">
        <div class="card stack--md">
          <h3>最近借出设备</h3>
          <p class="text-sm text-muted">借出流程将在第二阶段实现。</p>
        </div>
      </div>
      <div class="content-side">
        <div class="card stack--md">
          <h3>下一步接入</h3>
          <ol style="padding-left:18px;font-size:0.875rem;color:var(--muted);line-height:1.8;">
            <li>借用清单与借出流程</li>
            <li>审批拆分与通知推送</li>
            <li>归还流程与逐件拍照</li>
          </ol>
          <a href="#asset-list" class="btn btn--primary btn--full" style="margin-top:8px;">进入工具管理</a>
        </div>
      </div>
    </div>`;

  app.innerHTML = renderPcLayout('dashboard', mainContent);
});
