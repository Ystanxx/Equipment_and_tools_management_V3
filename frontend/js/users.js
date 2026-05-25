// ===== User Management Page =====
Router.register('user-mgmt', async () => {
  const app = document.getElementById('app');
  const currentUser = Api.getUser();
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
        <p class="page-header__desc">管理成员资料、角色状态与注册审核</p>
      </div>
      <div class="page-header__actions">
        ${pendingCount > 0 ? `<span class="chip chip--danger">${pendingCount} 待审核</span>` : ''}
      </div>
    </div>

    <div class="content-row">
      <div class="content-main">
        ${pendingCount > 0 ? `
        <div class="table-card">
          <div class="table-card__head">
            <div>
              <div class="table-card__title">待审核注册</div>
              <div class="table-card__desc">新成员提交注册后，会在这里集中处理审核。</div>
            </div>
            <span class="tag">共 ${pendingCount} 项</span>
          </div>
          <div class="stack--sm user-registration-list" id="reg-list">
            ${registrations.map(r => `
              <div class="user-row">
                <div class="user-row__info">
                  <span class="user-row__name">${Utils.escapeHtml(r.user?.full_name || '-')} / ${Utils.escapeHtml(r.user?.username || '-')}</span>
                  <span class="user-row__meta">${Utils.escapeHtml(r.user?.email || '-')} · ${Utils.formatDateTime(r.created_at)}</span>
                </div>
                <div class="user-row__actions">
                  <button class="btn btn--primary btn--sm reg-approve-btn" data-id="${r.id}">通过</button>
                  <button class="btn btn--outline btn--sm reg-reject-btn" data-id="${r.id}">驳回</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>` : ''}

        <div class="table-card">
          <div class="table-card__head">
            <div>
              <div class="table-card__title">成员列表</div>
              <div class="table-card__desc">统一维护成员资料、角色和启停状态。</div>
            </div>
            <span class="tag">共 ${users.length} 人</span>
          </div>
          <div class="table-wrapper">
            <table class="data-table user-table">
              <colgroup>
                <col style="width:180px;">
                <col style="width:150px;">
                <col style="width:340px;">
                <col style="width:170px;">
                <col style="width:132px;">
                <col style="width:344px;">
              </colgroup>
              <thead><tr><th>用户名</th><th>姓名</th><th>邮箱</th><th>角色</th><th class="user-table__status-head">状态</th><th class="user-table__actions-head">操作</th></tr></thead>
              <tbody>
                ${users.map(u => `
                  <tr>
                    <td>
                      <div class="user-table__identity">
                        <span class="user-table__username">${Utils.escapeHtml(u.username)}</span>
                        ${u.id === currentUser?.id ? '<span class="chip chip--outline user-table__self-chip">当前</span>' : ''}
                      </div>
                    </td>
                    <td>${Utils.escapeHtml(u.full_name)}</td>
                    <td class="text-sm">${Utils.escapeHtml(u.email)}</td>
                    <td><span class="chip chip--outline">${Utils.roleMap[u.role] || u.role}</span></td>
                    <td class="user-table__status-cell">${Utils.statusChip(u.status, Utils.userStatusMap)}</td>
                    <td class="user-table__actions-cell">
                      <div class="user-table__actions">
                        <button class="btn btn--outline btn--sm user-table__action-btn user-profile-edit-btn" data-id="${u.id}">编辑资料</button>
                        <select class="form-select user-table__role-select role-select" data-id="${u.id}" ${u.id === currentUser?.id ? 'disabled' : ''}>
                          <option value="USER" ${u.role === 'USER' ? 'selected' : ''}>普通用户</option>
                          <option value="ASSET_ADMIN" ${u.role === 'ASSET_ADMIN' ? 'selected' : ''}>设备管理员</option>
                          <option value="SUPER_ADMIN" ${u.role === 'SUPER_ADMIN' ? 'selected' : ''}>超级管理员</option>
                        </select>
                        ${u.id !== currentUser?.id && u.status === 'ACTIVE'
                          ? `<button class="btn btn--outline btn--sm user-table__action-btn user-disable-btn" data-id="${u.id}">停用</button>`
                          : u.id !== currentUser?.id && u.status === 'DISABLED'
                            ? `<button class="btn btn--outline btn--sm user-table__action-btn user-enable-btn" data-id="${u.id}">启用</button>`
                            : '<span class="user-table__action-placeholder"></span>'}
                      </div>
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
          <p class="text-sm text-muted">成员资料编辑已整合到本页；系统始终至少保留一个可用超级管理员账号。</p>
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

  document.querySelectorAll('.user-profile-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetUser = users.find((item) => String(item.id) === String(btn.dataset.id));
      if (!targetUser) return;
      openUserProfileEditorModal(targetUser, async (updatedUser) => {
        if (String(updatedUser.id) === String(currentUser?.id)) {
          Api.setUser(updatedUser);
        }
        Router.navigate('user-mgmt');
      });
    });
  });
});
