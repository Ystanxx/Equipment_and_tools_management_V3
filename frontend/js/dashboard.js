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
  let pendingBorrowTasks = 0, pendingReturnTasks = 0;
  let recentLogs = [];
  try {
    const [allRes, borrowedRes, stockRes] = await Promise.all([
      Api.listAssets({ page: 1, page_size: 1 }),
      Api.listAssets({ status: 'BORROWED', page: 1, page_size: 1 }),
      Api.listAssets({ in_stock_only: true, page: 1, page_size: 1 }),
    ]);
    totalAssets = allRes.data.total;
    borrowedCount = borrowedRes.data.total;
    stockCount = stockRes.data.total;
  } catch (e) { console.error(e); }

  try {
    const [btRes, rtRes, logRes] = await Promise.all([
      Api.listBorrowApprovalTasks({ status: 'PENDING', page: 1, page_size: 1 }),
      Api.listReturnApprovalTasks({ status: 'PENDING', page: 1, page_size: 1 }),
      Api.listAuditLogs({ page: 1, page_size: 8 }),
    ]);
    pendingBorrowTasks = btRes.data.total;
    pendingReturnTasks = rtRes.data.total;
    recentLogs = logRes.data.items || [];
  } catch (e) { console.error(e); }

  const actionLabels = {
    BORROW_ORDER_CREATE: '提交借用单',
    BORROW_ORDER_DELIVER: '确认交付',
    BORROW_ORDER_CANCEL: '取消借用单',
    BORROW_TASK_APPROVE: '通过借出审批',
    BORROW_TASK_REJECT: '驳回借出审批',
    RETURN_ORDER_CREATE: '提交归还单',
    RETURN_TASK_APPROVE: '通过归还审批',
    RETURN_TASK_REJECT: '驳回归还审批',
  };

  const mainContent = `
    <div class="page-header">
      <div class="page-header__info">
        <h1 class="page-header__title">设备运营概览</h1>
        <p class="page-header__desc">全量数据汇总，便于运营决策。</p>
      </div>
      <div class="page-header__actions">
        <span class="tag">LAB OPS V1</span>
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

    <div class="stat-row" style="margin-top:0;">
      <div class="stat-card" style="border-left:3px solid var(--accent);">
        <div class="stat-card__value">${pendingBorrowTasks}</div>
        <div class="stat-card__label">待处理借出审批</div>
        ${pendingBorrowTasks > 0 ? '<a href="#borrow-approvals" class="text-xs text-accent">去处理 →</a>' : ''}
      </div>
      <div class="stat-card" style="border-left:3px solid var(--warning);">
        <div class="stat-card__value">${pendingReturnTasks}</div>
        <div class="stat-card__label">待处理归还审批</div>
        ${pendingReturnTasks > 0 ? '<a href="#return-approvals" class="text-xs text-accent">去处理 →</a>' : ''}
      </div>
    </div>

    <div class="content-row">
      <div class="content-main">
        <div class="card stack--md">
          <h3>最近操作记录</h3>
          ${recentLogs.length === 0 ? '<p class="text-sm text-muted">暂无记录</p>' : `
          <div class="table-wrapper">
            <table class="data-table">
              <thead><tr><th>时间</th><th>操作</th><th>描述</th></tr></thead>
              <tbody>
                ${recentLogs.map(l => `<tr>
                  <td class="text-sm text-muted">${Utils.formatDateTime(l.created_at)}</td>
                  <td><span class="chip chip--outline">${Utils.escapeHtml(actionLabels[l.action] || l.action)}</span></td>
                  <td class="text-sm">${Utils.escapeHtml(l.description || '-')}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
          ${user.role === 'SUPER_ADMIN' ? '<a href="#audit-logs" class="text-sm text-accent" style="margin-top:4px;display:inline-block;">查看全部日志 →</a>' : ''}`}
        </div>
      </div>
      <div class="content-side">
        <div class="card stack--md">
          <h3>快捷入口</h3>
          <div class="stack--sm">
            <a href="#asset-list" class="btn btn--primary btn--full">工具管理</a>
            <a href="#my-orders" class="btn btn--outline btn--full">借用单</a>
            <a href="#my-returns" class="btn btn--outline btn--full">归还单</a>
          </div>
        </div>
      </div>
    </div>`;

  app.innerHTML = renderPcLayout('dashboard', mainContent);
});
