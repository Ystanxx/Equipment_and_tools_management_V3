// ===== Notification Center Page =====
Router.register('notifications', async (params) => {
  const app = document.getElementById('app');
  const user = Api.getUser();
  const page = parseInt(params.page) || 1;
  const readFilter = params.is_read; // 'true', 'false', or undefined

  await ensureUnreadCount();

  let notifications = [], total = 0;
  try {
    const qp = { page, page_size: 20 };
    if (readFilter === 'true') qp.is_read = true;
    else if (readFilter === 'false') qp.is_read = false;
    const res = await Api.listNotifications(qp);
    notifications = res.data.items || [];
    total = res.data.total;
  } catch (e) {
    app.innerHTML = `<div class="empty-state"><p>${Utils.escapeHtml(e.message)}</p></div>`;
    return;
  }

  const typeLabels = {
    REGISTRATION: '注册',
    BORROW: '借用',
    RETURN: '归还',
    SYSTEM: '系统',
  };
  const typeColors = {
    REGISTRATION: 'chip--pending',
    BORROW: 'chip--borrowed',
    RETURN: 'chip--stock',
    SYSTEM: 'chip--disabled',
  };

  const notificationCards = notifications.length === 0
    ? '<div class="empty-state"><p>暂无通知</p></div>'
    : notifications.map(n => {
      const typeLabel = typeLabels[n.notification_type] || n.notification_type;
      const typeColor = typeColors[n.notification_type] || '';
      const readClass = n.is_read ? 'notification-card--read' : '';
      const relatedLink = _buildRelatedLink(n);
      return `
        <div class="card notification-card ${readClass}" data-id="${n.id}" style="padding:14px 18px;${n.is_read ? 'opacity:0.7;' : 'border-left:3px solid var(--accent);'}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <span class="chip ${typeColor}" style="font-size:11px;">${typeLabel}</span>
                <strong style="font-size:14px;">${Utils.escapeHtml(n.title)}</strong>
                ${n.is_read ? '' : '<span class="chip chip--danger" style="font-size:10px;">未读</span>'}
              </div>
              <p class="text-sm" style="margin:4px 0 6px;color:var(--text-secondary);">${Utils.escapeHtml(n.content)}</p>
              <div style="display:flex;align-items:center;gap:12px;">
                <span class="text-xs text-muted">${Utils.formatDateTime(n.created_at)}</span>
                ${relatedLink}
              </div>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0;">
              ${n.is_read ? '' : `<button class="btn btn--outline btn--sm mark-read-btn" data-id="${n.id}">标记已读</button>`}
            </div>
          </div>
        </div>`;
    }).join('');

  const filterBtns = [
    { value: '', label: '全部' },
    { value: 'false', label: '未读' },
    { value: 'true', label: '已读' },
  ].map(f => {
    const active = (readFilter || '') === f.value ? 'btn--primary' : 'btn--outline';
    return `<button class="btn ${active} btn--sm filter-read-btn" data-value="${f.value}">${f.label}</button>`;
  }).join('');

  const totalPages = Math.ceil(total / 20);

  const mainContent = `
    <div class="page-header">
      <div class="page-header__info">
        <h1 class="page-header__title">通知中心</h1>
        <p class="page-header__desc">共 ${total} 条通知${_unreadNotificationCount > 0 ? `，${_unreadNotificationCount} 条未读` : ''}</p>
      </div>
      <div class="page-header__actions">
        ${_unreadNotificationCount > 0 ? '<button class="btn btn--primary btn--sm" id="mark-all-read-btn">全部标记已读</button>' : ''}
      </div>
    </div>
    <div class="flex gap-sm" style="margin-bottom:12px;">
      ${filterBtns}
    </div>
    <div class="stack--sm">
      ${notificationCards}
    </div>
    ${totalPages > 1 ? `<div style="text-align:center;margin-top:16px;">
      ${page > 1 ? `<button class="btn btn--outline btn--sm" onclick="Router.navigate('notifications',{page:${page-1},is_read:'${readFilter || ''}'})">上一页</button>` : ''}
      <span class="text-sm text-muted" style="margin:0 12px;">第 ${page} / ${totalPages} 页</span>
      ${page < totalPages ? `<button class="btn btn--outline btn--sm" onclick="Router.navigate('notifications',{page:${page+1},is_read:'${readFilter || ''}'})">下一页</button>` : ''}
    </div>` : ''}`;

  app.innerHTML = renderPcLayout('notifications', mainContent);

  // Event: mark single notification as read
  document.querySelectorAll('.mark-read-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      try {
        await Api.markNotificationRead(id);
        Utils.showToast('已标记为已读');
        Router.navigate('notifications', { page: String(page), is_read: readFilter || '' });
      } catch (err) { Utils.showToast(err.message, 'error'); }
    });
  });

  // Event: mark all as read
  const markAllBtn = document.getElementById('mark-all-read-btn');
  if (markAllBtn) {
    markAllBtn.addEventListener('click', async () => {
      try {
        await Api.markAllNotificationsRead();
        Utils.showToast('全部通知已标记为已读');
        Router.navigate('notifications', { page: String(page), is_read: readFilter || '' });
      } catch (err) { Utils.showToast(err.message, 'error'); }
    });
  }

  // Event: filter by read status
  document.querySelectorAll('.filter-read-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.value;
      Router.navigate('notifications', val ? { is_read: val } : {});
    });
  });

  // Event: click card to navigate to related item
  document.querySelectorAll('.notification-card').forEach(card => {
    card.style.cursor = 'pointer';
    card.addEventListener('click', async () => {
      const id = card.dataset.id;
      const n = notifications.find(x => x.id === id);
      if (!n) return;
      if (!n.is_read) {
        try { await Api.markNotificationRead(id); } catch {}
      }
      const route = _getRelatedRoute(n);
      if (route) Router.navigate(route.name, route.params);
    });
  });
});

function _buildRelatedLink(n) {
  const route = _getRelatedRoute(n);
  if (!route) return '';
  return `<a href="#${route.name}?${new URLSearchParams(route.params).toString()}" class="text-xs text-accent" onclick="event.stopPropagation()">查看详情 →</a>`;
}

function _getRelatedRoute(n) {
  if (!n.related_type || !n.related_id) return null;
  if (n.related_type === 'BorrowOrder') return { name: 'borrow-detail', params: { id: n.related_id } };
  if (n.related_type === 'ReturnOrder') return { name: 'return-detail', params: { id: n.related_id } };
  if (n.related_type === 'RegistrationRequest') return { name: 'user-mgmt', params: {} };
  return null;
}
