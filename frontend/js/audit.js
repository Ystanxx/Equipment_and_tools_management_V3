// ===== Audit Log Page (Admin) =====
Router.register('audit-logs', async (params) => {
  const app = document.getElementById('app');
  const page = parseInt(params.page) || 1;
  const actionFilter = params.action || '';

  let logs = [], total = 0;
  try {
    const qp = { page, page_size: 50 };
    if (actionFilter) qp.action = actionFilter;
    const res = await Api.listAuditLogs(qp);
    logs = res.data.items;
    total = res.data.total;
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
    RETURN_ORDER_STOCK_IN: '确认入库',
    SYSTEM_CONFIG_UPDATE: '更新系统配置',
  };

  const tableRows = logs.map(l => {
    const label = actionLabels[l.action] || l.action;
    return `<tr>
      <td class="text-sm">${Utils.formatDateTime(l.created_at)}</td>
      <td><span class="chip chip--outline">${Utils.escapeHtml(label)}</span></td>
      <td class="text-sm">${Utils.escapeHtml(l.description || '-')}</td>
      <td class="text-sm text-muted">${l.target_type || '-'}</td>
    </tr>`;
  }).join('');

  const actionOptions = Object.entries(actionLabels).map(([k, v]) =>
    `<option value="${k}" ${actionFilter === k ? 'selected' : ''}>${v}</option>`
  ).join('');

  const mainContent = `
    <div class="page-header">
      <div class="page-header__info">
        <h1 class="page-header__title">审计日志</h1>
        <p class="page-header__desc">共 ${total} 条记录</p>
      </div>
    </div>
    <div class="flex gap-md" style="margin-bottom:4px;">
      <select id="audit-action-filter" class="form-select" style="width:180px;">
        <option value="" ${!actionFilter ? 'selected' : ''}>全部操作</option>
        ${actionOptions}
      </select>
    </div>
    <div class="card" style="padding:0;overflow:hidden;">
      <div class="table-wrapper">
        <table class="data-table">
          <thead><tr><th>时间</th><th>操作</th><th>描述</th><th>目标类型</th></tr></thead>
          <tbody>${tableRows || '<tr><td colspan="4"><div class="empty-state">暂无日志</div></td></tr>'}</tbody>
        </table>
      </div>
    </div>
    ${total > 50 ? `<div style="text-align:center;margin-top:16px;">
      ${page > 1 ? `<button class="btn btn--outline btn--sm" onclick="Router.navigate('audit-logs',{page:${page-1},action:'${actionFilter}'})">上一页</button>` : ''}
      <span class="text-sm text-muted" style="margin:0 12px;">第 ${page} 页</span>
      ${page * 50 < total ? `<button class="btn btn--outline btn--sm" onclick="Router.navigate('audit-logs',{page:${page+1},action:'${actionFilter}'})">下一页</button>` : ''}
    </div>` : ''}`;

  app.innerHTML = renderPcLayout('audit-logs', mainContent);

  document.getElementById('audit-action-filter').addEventListener('change', (e) => {
    Router.navigate('audit-logs', { action: e.target.value });
  });
});
