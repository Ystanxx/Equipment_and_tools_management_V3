// ===== Login Page =====
Router.register('login', async () => {
  const app = document.getElementById('app');

  app.innerHTML = `
    <div class="login-page">
      <div class="login-page__card">
        <div class="login-page__header">
          <div class="login-page__logo">LAB OPS</div>
          <h1 class="login-page__title">器材管理系统</h1>
        </div>
        <div class="auth-form">
          <div class="form-group">
            <label class="form-label">用户名</label>
            <input type="text" id="login-username" class="form-input" placeholder="请输入用户名">
          </div>
          <div class="form-group">
            <label class="form-label">密码</label>
            <input type="password" id="login-password" class="form-input" placeholder="请输入密码">
          </div>
          <div class="auth-form__remember">
            <label class="switch-row" for="login-remember">
              <input type="checkbox" id="login-remember">
              <span>30天免登录</span>
            </label>
          </div>
          <div class="auth-form__actions">
            <div id="login-error" class="sr-only" aria-live="polite"></div>
            <button id="login-btn" class="btn btn--primary btn--full auth-form__submit">登录</button>
          </div>
        </div>
        <div class="login-page__footer">
          <a href="#register" class="text-sm text-accent">还没有账号？注册新用户</a>
        </div>
      </div>
      <p class="login-page__copyright text-xs text-muted">当前版本 v1.7.4</p>
    </div>`;

  // Bind login
  document.getElementById('login-btn').addEventListener('click', handleLogin);
  document.getElementById('login-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
  document.getElementById('login-username').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('login-password').focus();
  });
});

async function handleLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const rememberMe = document.getElementById('login-remember').checked;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';

  if (!username || !password) {
    showAuthToast(errEl, '请输入用户名和密码');
    return;
  }

  try {
    const res = await Api.login({ username, password, remember_me: rememberMe });
    Api.setToken(res.data.access_token, { remember: rememberMe, expiresAt: res.data.expires_at });
    const meRes = await Api.me();
    Api.setUser(meRes.data);
    await Api.bootstrapSystemConfigs();
    if (typeof startInventoryStateSync === 'function') {
      startInventoryStateSync();
    }

    const user = meRes.data;
    if (user.status === 'PENDING') {
      Router.navigate('pending');
    } else if (user.role === 'USER') {
      Router.navigate('asset-list');
    } else {
      Router.navigate('dashboard');
    }
  } catch (e) {
    showAuthToast(errEl, e.message);
  }
}

// ===== Register Page =====
Router.register('register', async () => {
  const app = document.getElementById('app');
  const isMobile = window.innerWidth <= 768;

  app.innerHTML = `
    <div class="login-page">
      <div class="login-page__card" style="max-width:480px;">
        <div class="login-page__header">
          <div class="login-page__logo">LAB OPS</div>
          <h1 class="login-page__title">注册账号</h1>
          <p class="login-page__subtitle">填写信息后提交，等待管理员审核通过即可使用</p>
        </div>
        <div class="auth-form">
          <div class="auth-form__grid">
            <div class="form-group">
              <label class="form-label">用户名 *</label>
              <input type="text" id="reg-username" class="form-input" placeholder="用户名">
            </div>
            <div class="form-group">
              <label class="form-label">姓名 *</label>
              <input type="text" id="reg-fullname" class="form-input" placeholder="真实姓名">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">邮箱 *</label>
            <input type="email" id="reg-email" class="form-input" placeholder="your@email.com">
          </div>
          <div class="form-group">
            <label class="form-label">密码 *</label>
            <input type="password" id="reg-password" class="form-input" placeholder="至少6位">
          </div>
          <div class="auth-form__grid">
            <div class="form-group">
              <label class="form-label">手机号（选填）</label>
              <input type="text" id="reg-phone" class="form-input" placeholder="手机号">
            </div>
            <div class="form-group">
              <label class="form-label">部门 / 实验室（选填）</label>
              <input type="text" id="reg-department" class="form-input" placeholder="部门">
            </div>
          </div>
          <div class="auth-form__actions">
            <div id="reg-error" class="sr-only" aria-live="polite"></div>
            <button id="reg-btn" class="btn btn--primary btn--full auth-form__submit">提交注册</button>
          </div>
        </div>
        <div class="login-page__footer">
          <a href="#login" class="text-sm text-accent">已有账号？返回登录</a>
        </div>
      </div>
    </div>`;

  document.getElementById('reg-btn').addEventListener('click', async () => {
    const errEl = document.getElementById('reg-error');
    errEl.textContent = '';

    const data = {
      username: document.getElementById('reg-username').value.trim(),
      full_name: document.getElementById('reg-fullname').value.trim(),
      email: document.getElementById('reg-email').value.trim(),
      password: document.getElementById('reg-password').value,
      phone: document.getElementById('reg-phone').value.trim() || null,
      department: document.getElementById('reg-department').value.trim() || null,
    };

    if (!data.username || !data.full_name || !data.email || !data.password) {
      showAuthToast(errEl, '请填写所有必填项');
      return;
    }

    try {
      await Api.register(data);
      Utils.showToast('注册成功，请等待管理员审核', 'success');
      Router.navigate('login');
    } catch (e) {
      showAuthToast(errEl, e.message);
    }
  });
});

function showAuthToast(target, message) {
  if (!message) return;
  target.textContent = message;
  Utils.showToast(message, 'error');
}

// ===== Pending Approval Page =====
Router.register('pending', async () => {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="pending-page">
      <div class="pending-page__icon">⏳</div>
      <h2 class="pending-page__title">账号审核中</h2>
      <p class="pending-page__desc">您的注册申请已提交，请等待管理员审核通过后再登录使用。</p>
      <button class="btn btn--outline" onclick="Api.clearToken();Api.clearUser();Router.navigate('login');">返回登录</button>
    </div>`;
});

// ===== Profile Page =====
Router.register('profile', async () => {
  const app = document.getElementById('app');
  await Api.bootstrapSystemConfigs();
  let user = Api.getUser();
  if (!user) return Router.navigate('login');

  await ensureUnreadCount();

  const isAdmin = user.role === 'ASSET_ADMIN' || user.role === 'SUPER_ADMIN';
  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  const isMobile = window.innerWidth <= 768;
  const roleLabel = Utils.roleMap[user.role] || user.role;
  const isGlobalEmailEnabled = Boolean(Api.getSystemConfig('enable_email_notifications', false));
  const emailPreferenceTip = isGlobalEmailEnabled
    ? '系统邮件通道已开启，关键业务变更会按你的个人偏好发送到注册邮箱。'
    : '系统邮件通道当前由超级管理员全局关闭；你仍可先保存个人偏好，待全局开启后生效。';

  const accountCardHtml = `
    <div class="card stack--md">
      <div class="flex-between gap-sm" style="align-items:flex-start;">
        <div>
          <h3>${isSuperAdmin ? '我的资料' : '账户信息'}</h3>
          ${isSuperAdmin ? '<p class="text-sm text-muted" style="margin-top:6px;">可直接维护自己的用户名、姓名与邮箱。</p>' : ''}
        </div>
        ${isSuperAdmin ? '<button class="btn btn--outline btn--sm" id="profile-edit-self-btn">编辑我的资料</button>' : ''}
      </div>
      <div class="stack--sm">
        <div class="meta-row"><span class="meta-row__label">用户名</span><span class="meta-row__value">${Utils.escapeHtml(user.username)}</span></div>
        <div class="meta-row"><span class="meta-row__label">姓名</span><span class="meta-row__value">${Utils.escapeHtml(user.full_name)}</span></div>
        <div class="meta-row"><span class="meta-row__label">邮箱</span><span class="meta-row__value">${Utils.escapeHtml(user.email)}</span></div>
        <div class="meta-row"><span class="meta-row__label">角色</span><span class="meta-row__value">${roleLabel}</span></div>
        ${user.phone ? `<div class="meta-row"><span class="meta-row__label">手机</span><span class="meta-row__value">${Utils.escapeHtml(user.phone)}</span></div>` : ''}
        ${user.department ? `<div class="meta-row"><span class="meta-row__label">部门</span><span class="meta-row__value">${Utils.escapeHtml(user.department)}</span></div>` : ''}
        ${user.employee_id ? `<div class="meta-row"><span class="meta-row__label">工号</span><span class="meta-row__value">${Utils.escapeHtml(user.employee_id)}</span></div>` : ''}
        <div class="meta-row"><span class="meta-row__label">注册时间</span><span class="meta-row__value">${Utils.formatDateTime(user.created_at)}</span></div>
      </div>
    </div>`;

  const mainContent = `
    <div class="page-header">
      <div class="page-header__info">
        <h1 class="page-header__title">个人中心</h1>
        <p class="page-header__desc">${isSuperAdmin ? '管理个人资料与安全设置' : '查看账户信息与修改密码'}</p>
      </div>
    </div>

    <div class="content-row">
      <div class="content-main">
        ${accountCardHtml}

        <div class="card stack--md">
          <div class="stack--sm">
            <h3>通知偏好</h3>
            <p class="text-sm text-muted">邮件会发送到当前账户邮箱：${Utils.escapeHtml(user.email)}</p>
          </div>
          <div class="preference-card">
            <label class="switch-row switch-row--between" for="profile-email-notify">
              <span class="preference-card__copy">
                <span class="preference-card__title">邮件通知</span>
                <span class="preference-card__hint">${Utils.escapeHtml(emailPreferenceTip)}</span>
              </span>
              <input type="checkbox" id="profile-email-notify" ${user.email_notifications_enabled ? 'checked' : ''}>
            </label>
          </div>
        </div>

        <div class="card stack--md">
          <h3>修改密码</h3>
          <div class="form-group">
            <label class="form-label">原密码 *</label>
            <input type="password" id="pwd-old" class="form-input" placeholder="请输入当前密码">
          </div>
          <div class="form-group">
            <label class="form-label">新密码 *</label>
            <input type="password" id="pwd-new" class="form-input" placeholder="至少6位">
          </div>
          <div class="form-group">
            <label class="form-label">确认新密码 *</label>
            <input type="password" id="pwd-confirm" class="form-input" placeholder="再次输入新密码">
          </div>
          <div id="pwd-error" class="form-error hidden"></div>
          <button class="btn btn--primary" id="pwd-save-btn">保存新密码</button>
        </div>
      </div>

      <div class="content-side">
        <div class="card stack--sm">
          <h3>账户操作</h3>
          <button class="btn btn--outline btn--full" onclick="handleLogout()">退出登录</button>
        </div>
      </div>
    </div>`;

  if (isMobile && !isAdmin) {
    app.innerHTML = renderMobileUserShell('profile', mainContent, {
      backHref: 'asset-list',
      backLabel: '返回',
      compact: true,
    });
  } else if (isAdmin) {
    app.innerHTML = renderPcLayout('profile', mainContent);
  } else {
    app.innerHTML = renderUserLayout('profile', mainContent);
  }

  document.getElementById('profile-edit-self-btn')?.addEventListener('click', () => {
    openUserProfileEditorModal(user, async (updatedUser) => {
      Api.setUser(updatedUser);
      user = updatedUser;
      Router.navigate('profile');
    });
  });

  document.getElementById('profile-email-notify').addEventListener('change', async (event) => {
    const input = event.currentTarget;
    const targetEnabled = input.checked;
    input.disabled = true;

    try {
      const res = await Api.updateMyEmailPreference(targetEnabled);
      Api.setUser(res.data);
      if (!isGlobalEmailEnabled && targetEnabled) {
        Utils.showToast('个人邮件偏好已保存，当前仍受系统全局开关控制', 'info');
      } else {
        Utils.showToast(targetEnabled ? '邮件通知已开启' : '邮件通知已关闭', 'success');
      }
    } catch (e) {
      input.checked = !targetEnabled;
      Utils.showToast(e.message, 'error');
    } finally {
      input.disabled = false;
    }
  });

  document.getElementById('pwd-save-btn').addEventListener('click', async () => {
    const errEl = document.getElementById('pwd-error');
    errEl.classList.add('hidden');

    const oldPwd = document.getElementById('pwd-old').value;
    const newPwd = document.getElementById('pwd-new').value;
    const confirmPwd = document.getElementById('pwd-confirm').value;

    if (!oldPwd || !newPwd || !confirmPwd) {
      errEl.textContent = '请填写所有密码字段';
      errEl.classList.remove('hidden');
      return;
    }
    if (newPwd.length < 6) {
      errEl.textContent = '新密码长度不能少于6位';
      errEl.classList.remove('hidden');
      return;
    }
    if (newPwd !== confirmPwd) {
      errEl.textContent = '两次输入的新密码不一致';
      errEl.classList.remove('hidden');
      return;
    }

    try {
      document.getElementById('pwd-save-btn').disabled = true;
      await Api.changePassword(oldPwd, newPwd);
      Utils.showToast('密码修改成功');
      document.getElementById('pwd-old').value = '';
      document.getElementById('pwd-new').value = '';
      document.getElementById('pwd-confirm').value = '';
    } catch (e) {
      errEl.textContent = e.message;
      errEl.classList.remove('hidden');
    } finally {
      document.getElementById('pwd-save-btn').disabled = false;
    }
  });
});

// ===== Logout helper =====
function handleLogout() {
  if (typeof stopInventoryStateSync === 'function') {
    stopInventoryStateSync();
  }
  Api.clearToken();
  Api.clearUser();
  Router.navigate('login');
}

function openUserProfileEditorModal(targetUser, onSaved) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal__header">
        <div class="modal__title">编辑资料</div>
        <button class="modal__close" type="button" aria-label="关闭">×</button>
      </div>
      <div class="stack--md">
        <div class="form-group">
          <label class="form-label">用户名</label>
          <input type="text" id="profile-edit-username" class="form-input" value="${Utils.escapeHtml(targetUser.username)}">
        </div>
        <div class="form-group">
          <label class="form-label">姓名</label>
          <input type="text" id="profile-edit-fullname" class="form-input" value="${Utils.escapeHtml(targetUser.full_name)}">
        </div>
        <div class="form-group">
          <label class="form-label">邮箱</label>
          <input type="email" id="profile-edit-email" class="form-input" value="${Utils.escapeHtml(targetUser.email)}">
        </div>
        <div id="profile-edit-error" class="form-error hidden"></div>
      </div>
      <div class="modal__footer">
        <button class="btn btn--outline btn--sm" type="button" data-action="cancel">取消</button>
        <button class="btn btn--primary btn--sm" type="button" data-action="save">保存</button>
      </div>
    </div>`;

  const close = () => overlay.remove();
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  overlay.querySelector('.modal__close')?.addEventListener('click', close);
  overlay.querySelector('[data-action="cancel"]')?.addEventListener('click', close);
  overlay.querySelector('[data-action="save"]')?.addEventListener('click', async () => {
    const errorEl = overlay.querySelector('#profile-edit-error');
    const saveBtn = overlay.querySelector('[data-action="save"]');
    const payload = {
      username: overlay.querySelector('#profile-edit-username').value.trim(),
      full_name: overlay.querySelector('#profile-edit-fullname').value.trim(),
      email: overlay.querySelector('#profile-edit-email').value.trim(),
    };

    if (!payload.username || !payload.full_name || !payload.email) {
      errorEl.textContent = '请完整填写用户名、姓名和邮箱';
      errorEl.classList.remove('hidden');
      return;
    }

    try {
      saveBtn.disabled = true;
      const res = await Api.updateUserProfile(targetUser.id, payload);
      Utils.showToast('资料已更新', 'success');
      await onSaved(res.data);
      close();
    } catch (error) {
      errorEl.textContent = error.message;
      errorEl.classList.remove('hidden');
    } finally {
      saveBtn.disabled = false;
    }
  });

  document.body.appendChild(overlay);
}
