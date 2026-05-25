// ===== Login Page =====
Router.register('login', async () => {
  const app = document.getElementById('app');
  const isMobile = window.innerWidth <= 768;

  if (isMobile) {
    app.innerHTML = `
      <div class="login-mobile">
        <div class="login-hero">
          <span class="tag">LAB OPS</span>
          <h1 class="login-hero__title">器材借还</h1>
          <p class="login-hero__desc">研究组内部设备管理，优先适配手机现场拍照与提交。</p>
        </div>

        <div class="card login-card stack--lg" style="margin-top:20px;">
          <div class="stack--sm">
            <h3>安全登录</h3>
            <p class="text-sm text-muted">首次启动默认超级管理员为 admin / admin。</p>
          </div>
          <div class="form-group">
            <label class="form-label">用户名</label>
            <input type="text" id="login-username" class="form-input" placeholder="admin" value="admin">
          </div>
          <div class="form-group">
            <label class="form-label">密码</label>
            <input type="password" id="login-password" class="form-input" placeholder="admin" value="admin">
          </div>
          <div class="login-hint">
            <span class="text-danger">默认超级管理员：admin / admin</span>
            <span class="text-accent text-sm" style="font-weight:500;">PC / 手机均可登录</span>
          </div>
          <button id="login-btn" class="btn btn--primary btn--full">
            ${Utils.svgIcon('arrowRight')}
            登录并进入
          </button>
          <div id="login-error" class="form-error hidden"></div>
        </div>

        <p style="text-align:center;margin-top:16px;">
          <a href="#register" class="text-sm text-accent">还没有账号？去注册</a>
        </p>
      </div>`;
  } else {
    app.innerHTML = `
      <div class="login-pc">
        <div class="login-pc__left">
          <div class="login-hero">
            <span class="tag">DESKTOP CONSOLE</span>
            <h1 style="font-size:3.75rem;font-weight:600;letter-spacing:-0.5px;">器材借还工作台</h1>
            <p class="login-hero__desc" style="font-size:1.125rem;">PC 端用于台账、状态维护与归还审核；手机端用于现场拍照、借还提交与回传。</p>
          </div>

          <div class="card stack--md">
            <h4>登录后会进入哪一端</h4>
            <p class="text-sm text-muted">普通用户默认进入移动端借还界面；管理员与超级管理员进入 PC 管理工作台。</p>
            <div class="flex gap-md">
              <span class="chip chip--active">普通用户</span>
              <span class="chip chip--outline">PC 端, 管理</span>
              <span class="chip chip--outline">管理员</span>
            </div>
          </div>

          <div class="flex gap-lg">
            <div class="card stack--sm" style="flex:1;">
              <h4>移动端</h4>
              <p class="text-xs text-muted">借出、归还、现场拍照与方便拖放的卡片式列表。</p>
            </div>
            <div class="card stack--sm" style="flex:1;">
              <h4>PC 端</h4>
              <p class="text-xs text-muted">工具台账、批量操作、审批 / 归还审核页为主。</p>
            </div>
          </div>
        </div>

        <div class="login-pc__right">
          <div class="login-pc__right-inner">
            <div class="card login-card stack--lg">
              <div class="stack--sm">
                <h3>安全登录</h3>
                <p class="text-sm text-muted">首次启动默认超级管理员为 admin / admin。若已修改密码请使用新凭据登录。</p>
              </div>
              <div class="form-group">
                <label class="form-label">用户名</label>
                <input type="text" id="login-username" class="form-input" placeholder="admin" value="admin">
              </div>
              <div class="form-group">
                <label class="form-label">密码</label>
                <input type="password" id="login-password" class="form-input" placeholder="admin" value="admin">
              </div>
              <div class="login-hint">
                <span class="text-danger text-xs">默认超级管理员：admin / admin</span>
                <span class="text-accent text-xs" style="font-weight:500;">Escape 可清</span>
              </div>
              <button id="login-btn" class="btn btn--primary btn--full">
                → 登录并进入工作台
              </button>
              <div id="login-error" class="form-error hidden"></div>
            </div>

            <p style="text-align:center;">
              <a href="#register" class="text-sm text-accent">还没有账号？去注册</a>
            </p>
          </div>
        </div>
      </div>`;
  }

  // Bind login
  document.getElementById('login-btn').addEventListener('click', handleLogin);
  document.getElementById('login-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
});

async function handleLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.classList.add('hidden');

  if (!username || !password) {
    errEl.textContent = '请输入用户名和密码';
    errEl.classList.remove('hidden');
    return;
  }

  try {
    const res = await Api.login({ username, password });
    Api.setToken(res.data.access_token);
    const meRes = await Api.me();
    Api.setUser(meRes.data);
    await Api.bootstrapSystemConfigs();

    const user = meRes.data;
    if (user.status === 'PENDING') {
      Router.navigate('pending');
    } else if (user.role === 'USER') {
      Router.navigate('asset-list');
    } else {
      Router.navigate('dashboard');
    }
  } catch (e) {
    errEl.textContent = e.message;
    errEl.classList.remove('hidden');
  }
}

// ===== Register Page =====
Router.register('register', async () => {
  const app = document.getElementById('app');
  const isMobile = window.innerWidth <= 768;

  const formHtml = `
    <div class="card stack--lg">
      <div class="stack--sm">
        <h3>注册账号</h3>
        <p class="text-sm text-muted">填写基本信息后提交，等待管理员审核通过即可使用。</p>
      </div>
      <div class="form-group">
        <label class="form-label">用户名 *</label>
        <input type="text" id="reg-username" class="form-input" placeholder="用户名">
      </div>
      <div class="form-group">
        <label class="form-label">姓名 *</label>
        <input type="text" id="reg-fullname" class="form-input" placeholder="真实姓名">
      </div>
      <div class="form-group">
        <label class="form-label">邮箱 *</label>
        <input type="email" id="reg-email" class="form-input" placeholder="your@email.com">
      </div>
      <div class="form-group">
        <label class="form-label">密码 *</label>
        <input type="password" id="reg-password" class="form-input" placeholder="至少6位">
      </div>
      <div class="form-group">
        <label class="form-label">手机号</label>
        <input type="text" id="reg-phone" class="form-input" placeholder="选填">
      </div>
      <div class="form-group">
        <label class="form-label">部门 / 实验室</label>
        <input type="text" id="reg-department" class="form-input" placeholder="选填">
      </div>
      <button id="reg-btn" class="btn btn--primary btn--full">提交注册</button>
      <div id="reg-error" class="form-error hidden"></div>
    </div>
    <p style="text-align:center;margin-top:16px;">
      <a href="#login" class="text-sm text-accent">已有账号？去登录</a>
    </p>`;

  if (isMobile) {
    app.innerHTML = `
      <div class="login-mobile">
        <div class="login-hero">
          <span class="tag">LAB OPS</span>
          <h1 class="login-hero__title">注册账号</h1>
          <p class="login-hero__desc">填写基本信息后提交，等待管理员审核。</p>
        </div>
        ${formHtml}
      </div>`;
  } else {
    app.innerHTML = `
      <div class="login-pc">
        <div class="login-pc__left">
          <div class="login-hero">
            <span class="tag">REGISTER</span>
            <h1 style="font-size:3.75rem;font-weight:600;letter-spacing:-0.5px;">创建账号</h1>
            <p class="login-hero__desc" style="font-size:1.125rem;">注册后等待管理员审核通过即可登录使用。普通用户默认进入移动端借还界面。</p>
          </div>
          <div class="card stack--md">
            <h4>注册流程</h4>
            <ol style="padding-left:18px;font-size:0.875rem;color:var(--muted);line-height:1.8;">
              <li>填写用户名、姓名、邮箱、密码</li>
              <li>提交后进入待审核状态</li>
              <li>管理员审核通过后即可登录</li>
            </ol>
          </div>
        </div>
        <div class="login-pc__right">
          <div class="login-pc__right-inner">
            ${formHtml}
          </div>
        </div>
      </div>`;
  }

  document.getElementById('reg-btn').addEventListener('click', async () => {
    const errEl = document.getElementById('reg-error');
    errEl.classList.add('hidden');

    const data = {
      username: document.getElementById('reg-username').value.trim(),
      full_name: document.getElementById('reg-fullname').value.trim(),
      email: document.getElementById('reg-email').value.trim(),
      password: document.getElementById('reg-password').value,
      phone: document.getElementById('reg-phone').value.trim() || null,
      department: document.getElementById('reg-department').value.trim() || null,
    };

    if (!data.username || !data.full_name || !data.email || !data.password) {
      errEl.textContent = '请填写所有必填项';
      errEl.classList.remove('hidden');
      return;
    }

    try {
      await Api.register(data);
      Utils.showToast('注册成功，请等待管理员审核', 'success');
      Router.navigate('login');
    } catch (e) {
      errEl.textContent = e.message;
      errEl.classList.remove('hidden');
    }
  });
});

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
  const user = Api.getUser();
  if (!user) return Router.navigate('login');

  await ensureUnreadCount();

  const isAdmin = user.role === 'ASSET_ADMIN' || user.role === 'SUPER_ADMIN';
  const roleLabel = Utils.roleMap[user.role] || user.role;

  const mainContent = `
    <div class="page-header">
      <div class="page-header__info">
        <h1 class="page-header__title">个人中心</h1>
        <p class="page-header__desc">查看账户信息与修改密码</p>
      </div>
    </div>

    <div class="content-row">
      <div class="content-main">
        <div class="card stack--md">
          <h3>账户信息</h3>
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

  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    app.innerHTML = `
      <div class="mobile-back-bar">
        <a href="#${isAdmin ? 'dashboard' : 'asset-list'}" class="mobile-back-bar__link">${Utils.svgIcon('arrowLeft')} 返回</a>
        <span class="mobile-back-bar__title">个人中心</span>
      </div>
      <div style="padding:12px;">${mainContent}</div>`;
  } else {
    app.innerHTML = renderPcLayout('profile', mainContent);
  }

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
  Api.clearToken();
  Api.clearUser();
  Router.navigate('login');
}
