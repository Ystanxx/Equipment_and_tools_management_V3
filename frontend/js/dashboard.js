// ===== PC Sidebar helper =====
// Global unread notification count cache
let _unreadNotificationCount = 0;
const _mobileTopShellScrollOffsets = {};

async function refreshUnreadCount() {
  try {
    const res = await Api.getUnreadCount();
    _unreadNotificationCount = (res.data && res.data.count) || 0;
  } catch { _unreadNotificationCount = 0; }
}

const MENU_ICON_MAP = {
  dashboard: 'home',
  notifications: 'bell',
  'user-mgmt': 'users',
  'system-configs': 'sliders',
  'audit-logs': 'history',
  'asset-list': 'box',
  categories: 'layers',
  locations: 'mapPin',
  'recent-deleted-assets': 'archiveRestore',
  'my-orders': 'clipboardList',
  'my-returns': 'fileReturn',
  'borrow-approvals': 'clipboardCheck',
  'return-approvals': 'clipboardReturn',
  'borrow-cart': 'clipboardPlus',
};

function menuLink(name, label, extra = {}) {
  return { name, label, icon: MENU_ICON_MAP[name], ...extra };
}

function getAdminLinks(user) {
  if (!user) return [];
  if (user.role === 'SUPER_ADMIN') {
    return [
      menuLink('dashboard', '运营概览'),
      menuLink('notifications', '通知中心', { badge: _unreadNotificationCount > 0 ? `<span class="chip chip--danger" style="margin-left:6px;font-size:11px;min-width:18px;text-align:center;">${_unreadNotificationCount > 99 ? '99+' : _unreadNotificationCount}</span>` : '' }),
      { type: 'divider', label: '系统管理' },
      menuLink('user-mgmt', '用户与注册审核'),
      menuLink('system-configs', '系统配置'),
      menuLink('audit-logs', '审计日志'),
      { type: 'divider', label: '设备管理' },
      menuLink('asset-list', '全部设备/工具'),
      menuLink('categories', '分类管理'),
      menuLink('locations', '位置管理'),
      menuLink('recent-deleted-assets', '最近删除'),
      { type: 'divider', label: '业务处理' },
      menuLink('my-orders', '借用单管理'),
      menuLink('my-returns', '归还单管理'),
      menuLink('borrow-approvals', '借出审批'),
      menuLink('return-approvals', '归还审批'),
    ];
  }
  if (user.role === 'ASSET_ADMIN') {
    return [
      menuLink('dashboard', '工作台'),
      menuLink('notifications', '通知中心', { badge: _unreadNotificationCount > 0 ? `<span class="chip chip--danger" style="margin-left:6px;font-size:11px;min-width:18px;text-align:center;">${_unreadNotificationCount > 99 ? '99+' : _unreadNotificationCount}</span>` : '' }),
      menuLink('asset-list', '我的设备/工具'),
      menuLink('borrow-approvals', '借出审批'),
      menuLink('return-approvals', '归还审批'),
      menuLink('my-orders', '借用单'),
      menuLink('my-returns', '归还单'),
    ];
  }
  return [];
}

function getUserLinks() {
  return [
    menuLink('asset-list', '设备列表'),
    menuLink('borrow-cart', '借用清单'),
    menuLink('my-orders', '借用单'),
    menuLink('my-returns', '归还单'),
  ];
}

function renderMobileTopLink(item, active) {
  const isActive = item.name && active === item.name;
  const href = item.href || (item.name ? `#${item.name}` : 'javascript:void(0)');
  const onclick = item.onclick ? ` onclick="${item.onclick}"` : '';
  const currentAttr = isActive ? ' aria-current="page" data-active="true"' : '';
  return `<a href="${href}" class="mobile-top-shell__link ${isActive ? 'mobile-top-shell__link--active' : ''}"${currentAttr}${onclick}>${Utils.svgIcon(item.icon)} ${item.label}${item.badge || ''}</a>`;
}

function renderMobileTopShell(active, bodyContent, links, options = {}) {
  const { compact = false, menuKey = 'default' } = options;
  const actionLinks = [
    { name: 'profile', label: '个人中心', icon: 'users' },
    { label: '退出', icon: 'logout', onclick: 'handleLogout()' },
  ];
  return `
    <div class="page--mobile">
      <div class="mobile-top-shell" data-menu-key="${menuKey}">
        <div class="mobile-top-shell__brand">LAB OPS</div>
        <div class="mobile-top-shell__menu">
          <div class="mobile-top-shell__scroll">
            ${[...links, ...actionLinks].map(item => renderMobileTopLink(item, active)).join('')}
          </div>
        </div>
      </div>
      <div class="page" style="padding-top:${compact ? '8px' : '20px'};">${bodyContent}</div>
    </div>`;
}

function renderMobileAdminShell(active, bodyContent) {
  const user = Api.getUser();
  const links = getAdminLinks(user).filter(link => link.type !== 'divider');
  const menuKey = user && user.role ? `admin-${user.role}` : 'admin';
  return renderMobileTopShell(active, bodyContent, links, { menuKey });
}

function bindMobileTopShell() {
  const shell = document.querySelector('.mobile-top-shell');
  const menu = shell?.querySelector('.mobile-top-shell__menu');
  if (!shell || !menu) return;

  const menuKey = shell.dataset.menuKey || 'default';
  const restoreOffset = _mobileTopShellScrollOffsets[menuKey] || 0;

  requestAnimationFrame(() => {
    menu.scrollLeft = restoreOffset;
  });

  menu.onscroll = () => {
    _mobileTopShellScrollOffsets[menuKey] = menu.scrollLeft;
  };
}

function renderSidebar(active) {
  const user = Api.getUser();
  const isSuper = user && user.role === 'SUPER_ADMIN';
  const isAssetAdmin = user && user.role === 'ASSET_ADMIN';
  const links = getAdminLinks(user);

  const roleLabel = isSuper ? '超级管理员' : '设备管理员';

  return `
    <div class="sidebar">
      <div class="sidebar__brand">
        <div class="sidebar__brand-mark">${Utils.svgIcon('brandMark')}</div>
        <div class="sidebar__brand-copy">
          <span class="sidebar__brand-tag">LAB OPS</span>
          <span class="sidebar__brand-title">器材控制台</span>
          <span class="sidebar__brand-subtitle">Equipment Workflow</span>
        </div>
      </div>
      <nav class="sidebar__nav">
        ${links.map(l => {
          if (l.type === 'divider') return `<div class="sidebar__divider">${l.label}</div>`;
          return `<a href="#${l.name}" class="sidebar__link ${active === l.name ? 'sidebar__link--active' : ''}">${Utils.svgIcon(l.icon)} ${l.label}${l.badge || ''}</a>`;
        }).join('')}
      </nav>
      <div class="sidebar__footer">
        <a href="#profile" class="sidebar__user-info sidebar__user-link">
          <span class="sidebar__user-name">${Utils.escapeHtml(user?.full_name || '')}</span>
          <span class="sidebar__user-role">${roleLabel}</span>
        </a>
        <a href="javascript:void(0)" class="sidebar__link" onclick="handleLogout()">
          ${Utils.svgIcon('logout')} 退出登录
        </a>
      </div>
    </div>`;
}

function renderPcLayout(active, mainContent) {
  if (window.innerWidth <= 768) {
    return renderMobileAdminShell(active, mainContent);
  }
  return `
    <div class="layout-pc">
      ${renderSidebar(active)}
      <div class="main-content">${mainContent}</div>
    </div>`;
}

// Pre-fetch unread count before each page render for sidebar badge
async function ensureUnreadCount() {
  if (Api.getToken()) await refreshUnreadCount();
}

// ===== User PC Layout (regular users) =====
function renderUserLayout(active, bodyContent) {
  const user = Api.getUser();
  const links = getUserLinks();
  return `
    <div class="layout-user">
      <nav class="user-nav">
        <span class="user-nav__brand">LAB OPS</span>
        <div class="user-nav__links">
          ${links.map(l => `<a href="#${l.name}" class="user-nav__link ${active === l.name ? 'user-nav__link--active' : ''}">${Utils.svgIcon(l.icon)} ${l.label}</a>`).join('')}
        </div>
        <div class="user-nav__right">
          <span class="user-nav__username">${Utils.escapeHtml(user?.full_name || '')}</span>
          <a href="#profile" class="btn btn--outline btn--sm">${Utils.svgIcon('users')} 个人中心</a>
          <button class="btn btn--outline btn--sm" onclick="handleLogout()">${Utils.svgIcon('logout')} 退出</button>
        </div>
      </nav>
      <div class="user-body">${bodyContent}</div>
    </div>`;
}

function renderMobileUserShell(active, bodyContent, options = {}) {
  const {
    showBottomNav = false,
    backHref = '',
    backLabel = '返回',
    compact = false,
  } = options;

  const links = [];
  if (backHref) {
    links.push({ href: `#${backHref}`, label: Utils.escapeHtml(backLabel), icon: 'arrowLeft' });
  }
  if (showBottomNav) {
    links.push(...getUserLinks());
  }
  return renderMobileTopShell(active, bodyContent, links, { compact, menuKey: 'user' });
}

function buildRouteHref(name, params = {}) {
  const query = new URLSearchParams(params).toString();
  return `#${name}${query ? `?${query}` : ''}`;
}

function renderDashboardStatCard({ value, label, className = '', href = '', hint = '' }) {
  const tagName = href ? 'a' : 'div';
  const hrefAttr = href ? ` href="${href}"` : '';
  const interactiveClass = href ? ' stat-card--interactive' : '';
  const cardClass = `stat-card${interactiveClass} ${className}`.trim();
  return `
    <${tagName}${hrefAttr} class="${cardClass}">
      <div class="stat-card__value">${value}</div>
      <div class="stat-card__label">${label}</div>
      ${hint ? `<div class="stat-card__hint">${hint}</div>` : ''}
    </${tagName}>`;
}

window.renderPcLayout = renderPcLayout;
window.ensureUnreadCount = ensureUnreadCount;
window.renderUserLayout = renderUserLayout;
window.renderMobileUserShell = renderMobileUserShell;
window.renderMobileTopShell = renderMobileTopShell;
window.bindMobileTopShell = bindMobileTopShell;

// ===== Dashboard Page =====
Router.register('dashboard', async () => {
  const app = document.getElementById('app');
  const user = Api.getUser();

  if (!user || user.role === 'USER') {
    return Router.navigate('asset-list');
  }

  await ensureUnreadCount();
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
      <div class="dashboard-shell">
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

      <div class="stat-row stat-row--dashboard stat-row--dashboard-primary">
        ${renderDashboardStatCard({
          value: totalAssets,
          label: '全局设备总数',
          className: 'stat-card--accent stat-card--metric-total',
          href: buildRouteHref('asset-list'),
          hint: '查看全部设备',
        })}
        ${renderDashboardStatCard({
          value: borrowedCount,
          label: '借出中',
          className: 'stat-card--warning stat-card--metric-borrowed',
          href: buildRouteHref('asset-list', { status: 'BORROWED' }),
          hint: '查看借出设备',
        })}
        ${renderDashboardStatCard({
          value: stockCount,
          label: '在库可借',
          className: 'stat-card--success stat-card--metric-stock',
          href: buildRouteHref('asset-list', { status: 'IN_STOCK' }),
          hint: '查看在库设备',
        })}
      </div>

      <div class="stat-row stat-row--dashboard" style="margin-top:0;">
        ${renderDashboardStatCard({
          value: pendingBorrowTasks,
          label: '待处理借出审批',
          className: 'stat-card--accent',
          href: buildRouteHref('borrow-approvals', { status: 'PENDING' }),
          hint: '进入审批队列',
        })}
        ${renderDashboardStatCard({
          value: pendingReturnTasks,
          label: '待处理归还审批',
          className: 'stat-card--warning',
          href: buildRouteHref('return-approvals', { status: 'PENDING' }),
          hint: '进入审批队列',
        })}
      </div>

      <div class="card stack--md">
        <div class="flex-between gap-md" style="align-items:flex-start;">
          <div>
            <h3>最近操作记录</h3>
            <p class="text-sm text-muted" style="margin-top:6px;">展示最近 8 条系统关键操作，便于快速回看。</p>
          </div>
          <a href="#audit-logs" class="btn btn--outline btn--sm">查看全部日志</a>
        </div>
        ${recentLogs.length === 0 ? '<p class="text-sm text-muted">暂无记录</p>' : `
        <div class="table-wrapper">
          <table class="data-table">
            <thead><tr><th style="width:180px;">时间</th><th style="width:190px;">操作</th><th>描述</th></tr></thead>
            <tbody>
              ${recentLogs.map(l => `<tr>
                <td class="text-sm text-muted">${Utils.formatDateTime(l.created_at)}</td>
                <td><span class="chip chip--outline">${Utils.escapeHtml(actionLabels[l.action] || l.action)}</span></td>
                <td class="text-sm">${Utils.escapeHtml(l.description || '-')}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`}
      </div>
      </div>`;
    app.innerHTML = renderPcLayout('dashboard', mainContent);

  // ----- Asset Admin Dashboard -----
  } else {
    const mainContent = `
      <div class="dashboard-shell">
      <div class="page-header">
        <div class="page-header__info">
          <h1 class="page-header__title">设备管理工作台</h1>
          <p class="page-header__desc">${Utils.escapeHtml(user.full_name)} · 管理 ${totalAssets} 件设备</p>
        </div>
        <div class="page-header__actions"><span class="tag">ASSET ADMIN</span></div>
      </div>

      <div class="stat-row stat-row--dashboard stat-row--dashboard-primary">
        ${renderDashboardStatCard({
          value: totalAssets,
          label: '我的设备总数',
          className: 'stat-card--accent stat-card--metric-total',
          href: buildRouteHref('asset-list'),
          hint: '查看设备清单',
        })}
        ${renderDashboardStatCard({
          value: borrowedCount,
          label: '借出中',
          className: 'stat-card--warning stat-card--metric-borrowed',
          href: buildRouteHref('asset-list', { status: 'BORROWED' }),
          hint: '查看借出设备',
        })}
        ${renderDashboardStatCard({
          value: stockCount,
          label: '在库可借',
          className: 'stat-card--success stat-card--metric-stock',
          href: buildRouteHref('asset-list', { status: 'IN_STOCK' }),
          hint: '查看在库设备',
        })}
      </div>

      <div class="stat-row stat-row--dashboard" style="margin-top:0;">
        ${renderDashboardStatCard({
          value: pendingBorrowTasks,
          label: '待处理借出审批',
          className: 'stat-card--accent',
          href: buildRouteHref('borrow-approvals', { status: 'PENDING' }),
          hint: '进入审批队列',
        })}
        ${renderDashboardStatCard({
          value: pendingReturnTasks,
          label: '待处理归还审批',
          className: 'stat-card--warning',
          href: buildRouteHref('return-approvals', { status: 'PENDING' }),
          hint: '进入审批队列',
        })}
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
      </div>
      </div>`;
    app.innerHTML = renderPcLayout('dashboard', mainContent);
  }
});
