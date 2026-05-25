// ===== User Management Page =====
Router.register('user-mgmt', async () => {
  const app = document.getElementById('app');
  let users = [], registrations = [];

  try {
    const [usersRes, regRes] = await Promise.all([
      Api.listUsers({ page_size: 100 }),
      Api.listRegistrations({ status: 'PENDING', page_size: 50 }),
    ]);
    users = usersRes.data.items || [];
    registrations = regRes.data.items || [];
  } catch (e) {
    console.error(e);
  }

  const pendingCount = registrations.length;

  const mainContent = `
    <div class="page-header">
      <div class="page-header__info">
        <h1 class="page-header__title">用户管理</h1>
        <p class="page-header__desc">管理用户、角色和注册审核</p>
      </div>
      <div class="page-header__actions">
        ${pendingCount > 0 ? `<span class="chip chip--danger">${pendingCount} 待审核</span>` : ''}
      </div>
    </div>

    <div class="content-row">
      <div class="content-main">
        ${pendingCount > 0 ? `
        <div class="card card--strong stack--md">
          <h3>待审核注册 (${pendingCount})</h3>
          <div class="stack--sm" id="reg-list">
            ${registrations.map(r => `
              <div class="user-row">
                <div class="user-row__info">
                  <span class="user-row__name">${Utils.escapeHtml(r.user?.full_name || '-')} / ${Utils.escapeHtml(r.user?.username || '-')}</span>
                  <span class="user-row__meta">${Utils.escapeHtml(r.user?.email || '-')} · ${Utils.formatDateTime(r.created_at)}</span>
                </div>
                <div class="flex gap-sm">
                  <button class="btn btn--primary btn--sm reg-approve-btn" data-id="${r.id}">通过</button>
                  <button class="btn btn--outline btn--sm reg-reject-btn" data-id="${r.id}">驳回</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>` : ''}

        <div class="card" style="padding:0;overflow:hidden;">
          <div class="table-wrapper">
            <table class="data-table">
              <thead><tr><th>用户名</th><th>姓名</th><th>邮箱</th><th>角色</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                ${users.map(u => `
                  <tr>
                    <td style="font-weight:500;">${Utils.escapeHtml(u.username)}</td>
                    <td>${Utils.escapeHtml(u.full_name)}</td>
                    <td class="text-sm">${Utils.escapeHtml(u.email)}</td>
                    <td><span class="chip chip--outline">${Utils.roleMap[u.role] || u.role}</span></td>
                    <td>${Utils.statusChip(u.status, Utils.userStatusMap)}</td>
                    <td>
                      <select class="form-select role-select" data-id="${u.id}" style="width:120px;padding:6px 10px;font-size:0.75rem;">
                        <option value="USER" ${u.role === 'USER' ? 'selected' : ''}>普通用户</option>
                        <option value="ASSET_ADMIN" ${u.role === 'ASSET_ADMIN' ? 'selected' : ''}>设备管理员</option>
                        ${u.role === 'SUPER_ADMIN' ? '<option value="SUPER_ADMIN" selected>超级管理员</option>' : ''}
                      </select>
                      ${u.status === 'ACTIVE' ? `<button class="btn btn--outline btn--sm user-disable-btn" data-id="${u.id}">停用</button>` : ''}
                      ${u.status === 'DISABLED' ? `<button class="btn btn--outline btn--sm user-enable-btn" data-id="${u.id}">启用</button>` : ''}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="content-side">
        <div class="card stack--md">
          <h3>权限侧栏</h3>
          <p class="text-sm text-muted">V1 只做三类角色管理：普通用户、设备管理员、超级管理员。</p>
          <div class="stack--sm">
            <div class="meta-row"><span class="meta-row__label">普通用户</span><span class="meta-row__value text-sm">借还操作</span></div>
            <div class="meta-row"><span class="meta-row__label">设备管理员</span><span class="meta-row__value text-sm">设备+审批</span></div>
            <div class="meta-row"><span class="meta-row__label">超级管理员</span><span class="meta-row__value text-sm">全部权限</span></div>
          </div>
        </div>
      </div>
    </div>`;

  app.innerHTML = renderPcLayout('user-mgmt', mainContent);

  // Registration approve
  document.querySelectorAll('.reg-approve-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await Api.approveRegistration(btn.dataset.id);
        Utils.showToast('已通过');
        Router.navigate('user-mgmt');
      } catch (e) { Utils.showToast(e.message, 'error'); }
    });
  });

  // Registration reject with modal
  document.querySelectorAll('.reg-reject-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _showApprovalModal('驳回注册申请', '请填写驳回原因（可选）：', async (reason) => {
        await Api.rejectRegistration(btn.dataset.id, reason);
        Utils.showToast('已驳回');
        Router.navigate('user-mgmt');
      });
    });
  });

  // Role change
  document.querySelectorAll('.role-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      try {
        await Api.updateRole(sel.dataset.id, sel.value);
        Utils.showToast('角色已更新');
        Router.navigate('user-mgmt');
      } catch (e) {
        Utils.showToast(e.message, 'error');
        Router.navigate('user-mgmt');
      }
    });
  });

  // Disable user with modal
  document.querySelectorAll('.user-disable-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _showApprovalModal('停用用户', '确认停用该用户？停用后该用户将无法登录。', async () => {
        await Api.updateUserStatus(btn.dataset.id, 'DISABLED');
        Utils.showToast('用户已停用');
        Router.navigate('user-mgmt');
      });
    });
  });

  // Enable user
  document.querySelectorAll('.user-enable-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await Api.updateUserStatus(btn.dataset.id, 'ACTIVE');
        Utils.showToast('用户已启用');
        Router.navigate('user-mgmt');
      } catch (e) { Utils.showToast(e.message, 'error'); }
    });
  });
});
