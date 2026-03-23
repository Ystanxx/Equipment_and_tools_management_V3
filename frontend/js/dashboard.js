// ===== PC Sidebar helper =====
function renderSidebar(active) {
  const user = Api.getUser();
  const isSuper = user && user.role === 'SUPER_ADMIN';
  const isAssetAdmin = user && user.role === 'ASSET_ADMIN';

  let links = [];
  if (isSuper) {
    links = [
      { name: 'dashboard', label: '运营概览', icon: 'home' },
      { type: 'divider', label: '系统管理' },
      { name: 'user-mgmt', label: '用户与注册审核', icon: 'users' },
      { name: 'system-configs', label: '系统配置', icon: 'tag' },
      { name: 'audit-logs', label: '审计日志', icon: 'tag' },
      { type: 'divider', label: '设备管理' },
      { name: 'asset-list', label: '全部设备/工具', icon: 'wrench' },
      { name: 'categories', label: '分类管理', icon: 'tag' },
      { name: 'locations', label: '位置管理', icon: 'mapPin' },
      { type: 'divider', label: '业务处理' },
      { name: 'my-orders', label: '借用单管理', icon: 'box' },
      { name: 'my-returns', label: '归还单管理', icon: 'undo' },
      { name: 'borrow-approvals', label: '借出审批', icon: 'tag' },
      { name: 'return-approvals', label: '归还审批', icon: 'tag' },
    ];
  } else if (isAssetAdmin) {
    links = [
      { name: 'dashboard', label: '工作台', icon: 'home' },
      { type: 'divider', label: '设备管理' },
      { name: 'asset-list', label: '我的设备/工具', icon: 'wrench' },
      { name: 'categories', label: '分类管理', icon: 'tag' },
      { name: 'locations', label: '位置管理', icon: 'mapPin' },
      { type: 'divider', label: '审批处理' },
      { name: 'borrow-approvals', label: '借出审批', icon: 'tag' },
      { name: 'return-approvals', label: '归还审批', icon: 'tag' },
      { type: 'divider', label: '订单查看' },
      { name: 'my-orders', label: '借用单', icon: 'box' },
      { name: 'my-returns', label: '归还单', icon: 'undo' },
    ];
  }

  const roleLabel = isSuper ? '超级管理员' : '设备管理员';

  return `
    <div class="sidebar">
      <div class="sidebar__brand">
        <span class="sidebar__brand-tag">LAB OPS</span>
        <span class="sidebar__brand-title">器材管理</span>
      </div>
      <nav class="sidebar__nav">
        ${links.map(l => {
          if (l.type === 'divider') return `<div class="sidebar__divider">${l.label}</div>`;
          return `<a href="#${l.name}" class="sidebar__link ${active === l.name ? 'sidebar__link--active' : ''}">${Utils.svgIcon(l.icon)} ${l.label}</a>`;
        }).join('')}
      </nav>
      <div style="margin-top:auto;">
        <div class="sidebar__user-info">
          <span class="sidebar__user-name">${Utils.escapeHtml(user?.full_name || '')}</span>
          <span class="sidebar__user-role">${roleLabel}</span>
        </div>
        <a href="javascript:void(0)" class="sidebar__link" onclick="handleLogout()">
          ${Utils.svgIcon('logout')} 退出登录
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

  const isSuper = user.role === 'SUPER_ADMIN';

  // Shared stats
  let totalAssets = 0, borrowedCount = 0, stockCount = 0;
  let pendingBorrowTasks = 0, pendingReturnTasks = 0;
  let pendingRegistrations = 0;
  let recentLogs = [];

  try {
    const assetParams = isSuper ? {} : { admin_id: user.id };
    const [allRes, borrowedRes, stockRes] = await Promise.all([
      Api.listAssets({ ...assetParams, page: 1, page_size: 1 }),
      Api.listAssets({ ...assetParams, status: 'BORROWED', page: 1, page_size: 1 }),
      Api.listAssets({ ...assetParams, in_stock_only: true, page: 1, page_size: 1 }),
    ]);
    totalAssets = allRes.data.total;
    borrowedCount = borrowedRes.data.total;
    stockCount = stockRes.data.total;
  } catch (e) { console.error(e); }

  try {
    const [btRes, rtRes] = await Promise.all([
      Api.listBorrowApprovalTasks({ status: 'PENDING', page: 1, page_size: 1 }),
      Api.listReturnApprovalTasks({ status: 'PENDING', page: 1, page_size: 1 }),
    ]);
    pendingBorrowTasks = btRes.data.total;
    pendingReturnTasks = rtRes.data.total;
  } catch (e) { console.error(e); }

  if (isSuper) {
    try {
      const regRes = await Api.listRegistrations({ status: 'PENDING', page_size: 1 });
      pendingRegistrations = (regRes.data.items || []).length;
    } catch (e) { console.error(e); }
    try {
      const logRes = await Api.listAuditLogs({ page: 1, page_size: 8 });
      recentLogs = logRes.data.items || [];
    } catch (e) { console.error(e); }
  }

  const actionLabels = {
    BORROW_ORDER_CREATE: '提交借用单',
    BORROW_ORDER_DELIVER: '确认交付',
    BORROW_ORDER_CANCEL: '取消借用单',
    BORROW_TASK_APPROVE: '通过借出审批',
    BORROW_TASK_REJECT: '驳回借出审批',
    RETURN_ORDER_CREATE: '提交归还单',
    RETURN_TASK_APPROVE: '通过归还审批',
    RETURN_TASK_REJECT: '驳回归还审批',
    SYSTEM_CONFIG_UPDATE: '更新系统配置',
  };

  // ----- Super Admin Dashboard -----
  if (isSuper) {
    const mainContent = `
      <div class="page-header">
        <div class="page-header__info">
          <h1 class="page-header__title">系统运营概览</h1>
          <p class="page-header__desc">超级管理员工作台 · 全局视角</p>
        </div>
        <div class="page-header__actions"><span class="tag">SUPER ADMIN</span></div>
      </div>

      ${pendingRegistrations > 0 ? `
      <div class="card card--strong" style="border-left:3px solid var(--danger);padding:16px 18px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <h4 style="margin:0 0 4px;">🔔 有 ${pendingRegistrations} 个待审核的注册申请</h4>
          <p class="text-sm text-muted">新用户注册后需要超管审核通过才可使用系统。</p>
        </div>
        <a href="#user-mgmt" class="btn btn--primary btn--sm">立即审核</a>
      </div>` : ''}

      <div class="stat-row">
        <div class="stat-card stat-card--accent"><div class="stat-card__value">${totalAssets}</div><div class="stat-card__label">全局设备总数</div></div>
        <div class="stat-card stat-card--warning"><div class="stat-card__value">${borrowedCount}</div><div class="stat-card__label">借出中</div></div>
        <div class="stat-card stat-card--success"><div class="stat-card__value">${stockCount}</div><div class="stat-card__label">在库可借</div></div>
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
            <a href="#audit-logs" class="text-sm text-accent" style="margin-top:4px;display:inline-block;">查看全部日志 →</a>`}
          </div>
        </div>
        <div class="content-side">
          <div class="card stack--md">
            <h3>系统管理</h3>
            <div class="stack--sm">
              <a href="#user-mgmt" class="btn btn--primary btn--full">用户与注册审核</a>
              <a href="#system-configs" class="btn btn--outline btn--full">系统配置</a>
              <a href="#asset-list" class="btn btn--outline btn--full">全部设备管理</a>
              <a href="#audit-logs" class="btn btn--outline btn--full">审计日志</a>
            </div>
          </div>
          <div class="card stack--md">
            <h3>业务处理</h3>
            <div class="stack--sm">
              <a href="#borrow-approvals" class="btn btn--outline btn--full">借出审批 ${pendingBorrowTasks > 0 ? `<span class="chip chip--danger" style="margin-left:6px;">${pendingBorrowTasks}</span>` : ''}</a>
              <a href="#return-approvals" class="btn btn--outline btn--full">归还审批 ${pendingReturnTasks > 0 ? `<span class="chip chip--danger" style="margin-left:6px;">${pendingReturnTasks}</span>` : ''}</a>
            </div>
          </div>
        </div>
      </div>`;
    app.innerHTML = renderPcLayout('dashboard', mainContent);

  // ----- Asset Admin Dashboard -----
  } else {
    const mainContent = `
      <div class="page-header">
        <div class="page-header__info">
          <h1 class="page-header__title">设备管理工作台</h1>
          <p class="page-header__desc">${Utils.escapeHtml(user.full_name)} · 管理 ${totalAssets} 件设备</p>
        </div>
        <div class="page-header__actions"><span class="tag">ASSET ADMIN</span></div>
      </div>

      <div class="stat-row">
        <div class="stat-card stat-card--accent"><div class="stat-card__value">${totalAssets}</div><div class="stat-card__label">我的设备总数</div></div>
        <div class="stat-card stat-card--warning"><div class="stat-card__value">${borrowedCount}</div><div class="stat-card__label">借出中</div></div>
        <div class="stat-card stat-card--success"><div class="stat-card__value">${stockCount}</div><div class="stat-card__label">在库可借</div></div>
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
            <h3>快捷操作</h3>
            <div class="stack--sm">
              <a href="#asset-list" class="btn btn--primary btn--full">管理我的设备</a>
              <a href="#borrow-approvals" class="btn btn--outline btn--full">处理借出审批 ${pendingBorrowTasks > 0 ? `<span class="chip chip--danger" style="margin-left:6px;">${pendingBorrowTasks}</span>` : ''}</a>
              <a href="#return-approvals" class="btn btn--outline btn--full">处理归还审批 ${pendingReturnTasks > 0 ? `<span class="chip chip--danger" style="margin-left:6px;">${pendingReturnTasks}</span>` : ''}</a>
            </div>
          </div>
        </div>
        <div class="content-side">
          <div class="card stack--md">
            <h3>设备概况</h3>
            <div class="stack--sm">
              <div class="meta-row"><span class="meta-row__label">设备总数</span><span class="meta-row__value">${totalAssets}</span></div>
              <div class="meta-row"><span class="meta-row__label">在库</span><span class="meta-row__value">${stockCount}</span></div>
              <div class="meta-row"><span class="meta-row__label">借出</span><span class="meta-row__value">${borrowedCount}</span></div>
            </div>
            <a href="#asset-form" class="btn btn--secondary btn--full" style="margin-top:8px;">${Utils.svgIcon('plus')} 录入新设备</a>
          </div>
        </div>
      </div>`;
    app.innerHTML = renderPcLayout('dashboard', mainContent);
  }
});
