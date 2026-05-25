Router.register('system-configs', async () => {
  const app = document.getElementById('app');
  const user = Api.getUser();
  if (!user || user.role !== 'SUPER_ADMIN') {
    app.innerHTML = '<div class="empty-state"><p>仅超级管理员可访问系统配置</p></div>';
    return;
  }

  let configs = [];
  try {
    const res = await Api.listSystemConfigs();
    configs = res.data || [];
  } catch (e) {
    app.innerHTML = `<div class="empty-state"><p>${Utils.escapeHtml(e.message)}</p></div>`;
    return;
  }

  const renderField = (item) => {
    if (item.value_type === 'bool') {
      return `
        <label class="switch-row">
          <input type="checkbox" class="config-input" data-key="${item.key}" ${item.value ? 'checked' : ''}>
          <span class="switch-row__label">${item.value ? '已启用' : '已关闭'}</span>
        </label>`;
    }

    if (item.options && item.options.length > 0) {
      return `
        <select class="form-select config-input" data-key="${item.key}">
          ${item.options.map(option => `<option value="${Utils.escapeHtml(option)}" ${item.value === option ? 'selected' : ''}>${Utils.escapeHtml(option)}</option>`).join('')}
        </select>`;
    }

    const inputType = item.value_type === 'int' ? 'number' : 'text';
    const minAttr = item.min_value !== null && item.min_value !== undefined ? `min="${item.min_value}"` : '';
    const maxAttr = item.max_value !== null && item.max_value !== undefined ? `max="${item.max_value}"` : '';
    return `<input type="${inputType}" class="form-input config-input" data-key="${item.key}" value="${Utils.escapeHtml(String(item.value ?? ''))}" ${minAttr} ${maxAttr}>`;
  };

  const isModified = (item) => false; // 不再基于持久化值高亮，改为前端脏状态追踪

  const renderItem = (item) => `
    <div class="config-row" data-key="${item.key}">
      <div class="config-row__info">
        <div class="config-row__label">
          ${Utils.escapeHtml(item.label || item.key)}
          <span class="config-row__default-tag">默认：${Utils.escapeHtml(String(item.default_value))}</span>
        </div>
        <div class="config-row__desc">${Utils.escapeHtml(item.description)}</div>
      </div>
      <div class="config-row__control">
        ${renderField(item)}
      </div>
    </div>`;

  const renderGroup = (title, desc, items) => `
    <div class="card config-card">
      <div class="config-card__head">
        <h3 class="config-card__title">${title}</h3>
        <p class="config-card__desc">${desc}</p>
      </div>
      <div class="config-card__body">
        ${items.map(renderItem).join('')}
      </div>
    </div>`;

  const groupMeta = {
    borrow: {
      title: '借用规则',
      desc: '控制借用单提交的前端校验与后端规则。',
    },
    photo: {
      title: '图片策略',
      desc: '附件上传的压缩参数、缩略图生成与清理保留策略。',
    },
    notification: {
      title: '通知开关',
      desc: '全局通知渠道控制；每个用户可在个人中心设置自己的邮件偏好。',
    },
  };
  const groupedConfigs = Object.entries(groupMeta)
    .map(([group, meta]) => ({ ...meta, items: configs.filter(item => item.group === group) }))
    .filter(section => section.items.length > 0);

  const mainContent = `
    <div class="stack stack--page">
      <div class="page-header">
        <div class="page-header__info">
          <h1 class="page-header__title">系统配置</h1>
          <p class="page-header__desc">配置借用规则、图片策略与保留参数</p>
        </div>
        <div class="page-header__actions">
          <button class="btn btn--primary" id="config-save-btn">保存配置</button>
        </div>
      </div>

      <div class="stack--lg">
        ${groupedConfigs.map(section => renderGroup(section.title, section.desc, section.items)).join('')}
        <div id="config-error" class="form-error hidden"></div>
      </div>
    </div>`;

  app.innerHTML = renderPcLayout('system-configs', mainContent);

  document.getElementById('config-save-btn').addEventListener('click', async () => {
    const errEl = document.getElementById('config-error');
    errEl.classList.add('hidden');

    const values = {};
    document.querySelectorAll('.config-input').forEach(input => {
      const key = input.dataset.key;
      const item = configs.find(config => config.key === key);
      if (!item) return;
      if (item.value_type === 'bool') {
        values[key] = input.checked;
      } else if (item.value_type === 'int') {
        values[key] = Number(input.value);
      } else {
        values[key] = input.value.trim();
      }
    });

    const saveBtn = document.getElementById('config-save-btn');
    try {
      saveBtn.disabled = true;
      saveBtn.textContent = '保存中...';
      await Api.updateSystemConfigs(values);
      await Api.bootstrapSystemConfigs();
      Utils.showToast('系统配置已更新');
      Router.navigate('system-configs');
    } catch (e) {
      errEl.textContent = e.message;
      errEl.classList.remove('hidden');
      saveBtn.disabled = false;
      saveBtn.textContent = '保存配置';
    }
  });

  // 脏状态追踪：记录初始值，用户修改时高亮对应行
  const originalValues = {};
  document.querySelectorAll('.config-input').forEach(input => {
    const key = input.dataset.key;
    const item = configs.find(c => c.key === key);
    if (!item) return;
    const isBool = item.value_type === 'bool';
    originalValues[key] = isBool ? input.checked : input.value;

    const row = input.closest('.config-row');
    const updateDirtyState = () => {
      const currentVal = isBool ? input.checked : input.value;
      if (String(currentVal) !== String(originalValues[key])) {
        row.classList.add('config-row--dirty');
      } else {
        row.classList.remove('config-row--dirty');
      }
    };

    input.addEventListener(isBool ? 'change' : 'input', () => {
      updateDirtyState();
      // 实时更新开关标签
      if (isBool) {
        const label = input.closest('.switch-row')?.querySelector('.switch-row__label');
        if (label) label.textContent = input.checked ? '已启用' : '已关闭';
      }
    });
  });
});
