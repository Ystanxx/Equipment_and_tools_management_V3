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
          <span>${item.value ? '已启用' : '已关闭'}</span>
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

  const renderGroup = (title, desc, items) => `
    <div class="card stack--lg">
      <div class="stack--sm">
        <h3>${title}</h3>
        <p class="text-sm text-muted">${desc}</p>
      </div>
      <div class="stack--md">
        ${items.map(item => `
          <div class="form-group">
            <label class="form-label">${Utils.escapeHtml(item.label || item.key)}</label>
            <p class="text-xs text-muted" style="margin-bottom:4px;">键名：${Utils.escapeHtml(item.key)}</p>
            <p class="text-xs text-muted" style="margin-bottom:8px;">${Utils.escapeHtml(item.description)}</p>
            ${renderField(item)}
            <p class="text-xs text-muted" style="margin-top:6px;">默认值：${Utils.escapeHtml(String(item.default_value))}</p>
          </div>
        `).join('')}
      </div>
    </div>`;

  const groupMeta = {
    borrow: {
      title: '借用规则',
      desc: '这些配置会直接影响前端表单校验与后端借用单创建规则。',
    },
    photo: {
      title: '图片策略',
      desc: '附件上传时会按这里的参数统一压缩、生成缩略图，并为后续清理保留配置入口。',
    },
    notification: {
      title: '通知开关',
      desc: '当前先提供渠道级配置，后续可继续接入站内通知和邮件发送能力。',
    },
  };
  const groupedConfigs = Object.entries(groupMeta)
    .map(([group, meta]) => ({ ...meta, items: configs.filter(item => item.group === group) }))
    .filter(section => section.items.length > 0);

  const mainContent = `
    <div class="page-header">
      <div class="page-header__info">
        <h1 class="page-header__title">系统配置</h1>
        <p class="page-header__desc">配置借用规则、图片策略与保留参数</p>
      </div>
      <div class="page-header__actions">
        <button class="btn btn--primary" id="config-save-btn">保存配置</button>
      </div>
    </div>

    <div class="content-row">
      <div class="content-main stack--lg">
        ${groupedConfigs.map(section => renderGroup(section.title, section.desc, section.items)).join('')}
        <div id="config-error" class="form-error hidden"></div>
      </div>

      <div class="content-side">
        <div class="card stack--sm">
          <h3>生效说明</h3>
          <p class="text-sm text-muted">保存后，新提交的借用单和新上传的图片将立即使用最新配置。</p>
        </div>
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
});
