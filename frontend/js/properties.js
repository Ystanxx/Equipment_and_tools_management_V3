function renderPropertyRows(items, type) {
  const isAssetType = type === 'asset-type';
  if (!items.length) {
    return `<tr><td colspan="4"><div class="empty-state">暂无${isAssetType ? '资产性质' : '分类'}</div></td></tr>`;
  }

  return items.map((item) => `
    <tr data-id="${item.id}">
      <td class="property-table__name-cell">
        <div class="property-table__name">${Utils.escapeHtml(item.name)}</div>
      </td>
      <td class="property-table__desc-cell">
        <div class="property-table__desc">${item.description ? Utils.escapeHtml(item.description) : '暂无描述'}</div>
      </td>
      <td class="property-table__status-cell">${item.is_active ? '<span class="chip chip--success">启用</span>' : '<span class="chip chip--disabled">停用</span>'}</td>
      <td class="property-table__actions-cell">
        <div class="property-table__actions">
          <button class="btn btn--outline btn--sm property-edit-btn" data-type="${type}" data-id="${item.id}" data-name="${Utils.escapeHtml(item.name)}" data-desc="${Utils.escapeHtml(item.description || '')}">编辑</button>
        ${item.is_active
          ? `<button class="btn btn--outline btn--sm property-disable-btn" data-type="${type}" data-id="${item.id}">停用</button>`
          : `<button class="btn btn--secondary btn--sm property-enable-btn" data-type="${type}" data-id="${item.id}">启用</button>`}
        <button class="btn btn--danger btn--sm property-delete-btn" data-type="${type}" data-id="${item.id}" data-name="${Utils.escapeHtml(item.name)}">删除</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function showPropertyEditorModal(options) {
  const {
    singularLabel,
    title,
    confirmText,
    initialName = '',
    initialDesc = '',
    onSubmit,
  } = options;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal property-modal">
      <div class="modal__header">
        <div class="stack stack--sm">
          <div class="modal__title">${Utils.escapeHtml(title)}</div>
          <div class="text-sm text-muted">保存后会立即同步到器材录入、筛选和统计。</div>
        </div>
        <button class="modal__close" type="button" aria-label="关闭">×</button>
      </div>
      <div class="stack stack--lg">
        <div class="form-group">
          <label class="form-label">${Utils.escapeHtml(singularLabel)}名称 <span class="form-required">*</span></label>
          <input type="text" class="form-input" data-role="name" value="${Utils.escapeHtml(initialName)}" placeholder="请输入${Utils.escapeHtml(singularLabel)}名称">
        </div>
        <div class="form-group">
          <label class="form-label">描述</label>
          <textarea class="form-textarea property-modal__textarea" data-role="desc" placeholder="选填">${Utils.escapeHtml(initialDesc)}</textarea>
        </div>
        <div class="form-error hidden" data-role="error"></div>
      </div>
      <div class="modal__footer">
        <button type="button" class="btn btn--outline" data-role="cancel">取消</button>
        <button type="button" class="btn btn--primary" data-role="submit">${Utils.escapeHtml(confirmText)}</button>
      </div>
    </div>
  `;

  const close = () => overlay.remove();
  const closeBtn = overlay.querySelector('.modal__close');
  const cancelBtn = overlay.querySelector('[data-role="cancel"]');
  const submitBtn = overlay.querySelector('[data-role="submit"]');
  const nameEl = overlay.querySelector('[data-role="name"]');
  const descEl = overlay.querySelector('[data-role="desc"]');
  const errorEl = overlay.querySelector('[data-role="error"]');

  closeBtn.addEventListener('click', close);
  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      close();
    }
  });

  submitBtn.addEventListener('click', async () => {
    errorEl.classList.add('hidden');
    const name = nameEl.value.trim();
    const description = descEl.value.trim() || null;

    if (!name) {
      errorEl.textContent = `请填写${singularLabel}名称`;
      errorEl.classList.remove('hidden');
      return;
    }

    submitBtn.disabled = true;
    try {
      await onSubmit({ name, description });
      close();
    } catch (error) {
      errorEl.textContent = error.message;
      errorEl.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
    }
  });

  document.body.appendChild(overlay);
  nameEl.focus();
  nameEl.select();
}

function bindPropertySection(options) {
  const {
    type,
    singularLabel,
    listRoute,
    createAction,
    updateAction,
    deleteAction,
  } = options;

  const isMobile = window.innerWidth <= 768;
  const titleEl = document.getElementById(`${type}-form-title`);
  const nameEl = document.getElementById(`${type}-name`);
  const descEl = document.getElementById(`${type}-desc`);
  const editIdEl = document.getElementById(`${type}-edit-id`);
  const errorEl = document.getElementById(`${type}-error`);
  const cancelEl = document.getElementById(`${type}-cancel`);
  const submitEl = document.getElementById(`${type}-submit`);

  if (!isMobile && submitEl && titleEl && nameEl && descEl && editIdEl && errorEl && cancelEl) {
    submitEl.addEventListener('click', async () => {
      errorEl.classList.add('hidden');
      const name = nameEl.value.trim();
      const description = descEl.value.trim() || null;
      const editId = editIdEl.value;

      if (!name) {
        errorEl.textContent = `请填写${singularLabel}名称`;
        errorEl.classList.remove('hidden');
        return;
      }

      try {
        if (editId) {
          await updateAction(editId, { name, description });
          Utils.showToast(`${singularLabel}已更新`);
        } else {
          await createAction({ name, description });
          Utils.showToast(`${singularLabel}已创建`);
        }
        Router.navigate(listRoute);
      } catch (e) {
        errorEl.textContent = e.message;
        errorEl.classList.remove('hidden');
      }
    });
  }

  document.querySelectorAll(`.property-edit-btn[data-type="${type}"]`).forEach((btn) => {
    btn.addEventListener('click', () => {
      if (isMobile) {
        showPropertyEditorModal({
          singularLabel,
          title: `编辑${singularLabel}`,
          confirmText: '保存修改',
          initialName: btn.dataset.name || '',
          initialDesc: btn.dataset.desc || '',
          onSubmit: async ({ name, description }) => {
            await updateAction(btn.dataset.id, { name, description });
            Utils.showToast(`${singularLabel}已更新`);
            Router.navigate(listRoute);
          },
        });
        return;
      }

      titleEl.textContent = `编辑${singularLabel}`;
      nameEl.value = btn.dataset.name;
      descEl.value = btn.dataset.desc;
      editIdEl.value = btn.dataset.id;
      cancelEl.classList.remove('hidden');
    });
  });

  if (isMobile) {
    const createBtn = document.getElementById(`${type}-create`);
    if (createBtn) {
      createBtn.addEventListener('click', () => {
        showPropertyEditorModal({
          singularLabel,
          title: `新建${singularLabel}`,
          confirmText: '创建并保存',
          onSubmit: async ({ name, description }) => {
            await createAction({ name, description });
            Utils.showToast(`${singularLabel}已创建`);
            Router.navigate(listRoute);
          },
        });
      });
    }
  }

  document.querySelectorAll(`.property-disable-btn[data-type="${type}"]`).forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await updateAction(btn.dataset.id, { is_active: false });
        Utils.showToast(`${singularLabel}已停用`);
        Router.navigate(listRoute);
      } catch (e) {
        Utils.showToast(e.message, 'error');
      }
    });
  });

  document.querySelectorAll(`.property-enable-btn[data-type="${type}"]`).forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await updateAction(btn.dataset.id, { is_active: true });
        Utils.showToast(`${singularLabel}已启用`);
        Router.navigate(listRoute);
      } catch (e) {
        Utils.showToast(e.message, 'error');
      }
    });
  });

  document.querySelectorAll(`.property-delete-btn[data-type="${type}"]`).forEach((btn) => {
    btn.addEventListener('click', () => {
      _showApprovalModal(`删除${singularLabel}`, `确认永久删除${singularLabel}“${btn.dataset.name}”？删除后不可恢复。`, async () => {
        await deleteAction(btn.dataset.id);
        Utils.showToast(`${singularLabel}已删除`);
        Router.navigate(listRoute);
      });
    });
  });

  if (!isMobile && cancelEl && titleEl && nameEl && descEl && editIdEl) {
    cancelEl.addEventListener('click', () => {
      titleEl.textContent = `新建${singularLabel}`;
      nameEl.value = '';
      descEl.value = '';
      editIdEl.value = '';
      cancelEl.classList.add('hidden');
    });
  }
}

// ===== Properties Management Page =====
Router.register('properties', async () => {
  const app = document.getElementById('app');
  const user = Api.getUser();
  if (!user || user.role !== 'SUPER_ADMIN') {
    Utils.showToast('只有超级管理员可以管理属性', 'error');
    return Router.navigate(user && user.role === 'USER' ? 'asset-list' : 'dashboard');
  }

  let assetTypes = [];
  let categories = [];
  try {
    const [typeRes, categoryRes] = await Promise.all([
      Api.listAssetTypes({ include_inactive: true }),
      Api.listCategories({ include_inactive: true }),
    ]);
    assetTypes = typeRes.data || [];
    categories = categoryRes.data || [];
  } catch (e) {
    console.error(e);
  }

  const isMobile = window.innerWidth <= 768;
  const renderSectionHeadActions = (type, label, count) => isMobile
    ? `
      <div class="property-section-card__aside">
        <span class="tag">共 ${count} 项</span>
        <button type="button" class="btn btn--outline btn--sm property-section-card__action" id="${type}-create">新建${label}</button>
      </div>
    `
    : `<span class="tag">共 ${count} 项</span>`;

  const bodyContent = `
    <div class="page-header property-page__header">
      <div class="page-header__info">
        <h1 class="page-header__title">属性管理</h1>
        <p class="page-header__desc">统一维护资产性质与业务分类，供器材录入、筛选和统计使用。</p>
      </div>
    </div>

    <div class="content-row content-row--stretch property-page">
      <div class="content-main stack stack--page">
        <div class="table-card property-section-card">
          <div class="table-card__head property-section-card__head">
            <div class="property-section-card__meta">
              <h3 class="table-card__title">资产性质</h3>
              <p class="table-card__desc">建议用于区分固定资产与非固定资产，影响器材入库、筛选与统计。</p>
            </div>
            ${renderSectionHeadActions('asset-type', '资产性质', assetTypes.length)}
          </div>
          <div class="table-wrapper">
            <table class="data-table property-table">
              <thead><tr><th>名称</th><th>描述</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>${renderPropertyRows(assetTypes, 'asset-type')}</tbody>
            </table>
          </div>
        </div>

        <div class="table-card property-section-card">
          <div class="table-card__head property-section-card__head">
            <div class="property-section-card__meta">
              <h3 class="table-card__title">业务分类</h3>
              <p class="table-card__desc">用于区分设备、手动工具、电动工具等业务类别，决定页面展示与筛选维度。</p>
            </div>
            ${renderSectionHeadActions('category', '业务分类', categories.length)}
          </div>
          <div class="table-wrapper">
            <table class="data-table property-table">
              <thead><tr><th>名称</th><th>描述</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>${renderPropertyRows(categories, 'category')}</tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="content-side property-page__side stack stack--page${isMobile ? ' hidden' : ''}">
        <div class="card property-editor-card stack--lg">
          <div class="property-editor-card__head">
            <span class="property-editor-card__eyebrow">资产性质</span>
            <h3 id="asset-type-form-title">新建资产性质</h3>
            <p class="text-sm text-muted">用于定义器材的管理性质，建议保持命名稳定，避免频繁修改。</p>
          </div>
          <div class="form-group">
            <label class="form-label">资产性质名称 *</label>
            <input type="text" id="asset-type-name" class="form-input" placeholder="例如：固定资产">
          </div>
          <div class="form-group">
            <label class="form-label">描述</label>
            <textarea id="asset-type-desc" class="form-textarea" placeholder="选填"></textarea>
          </div>
          <input type="hidden" id="asset-type-edit-id" value="">
          <div id="asset-type-error" class="form-error hidden"></div>
          <button id="asset-type-submit" class="btn btn--primary btn--full">保存</button>
          <button id="asset-type-cancel" class="btn btn--outline btn--full hidden">取消编辑</button>
        </div>

        <div class="card property-editor-card stack--lg">
          <div class="property-editor-card__head">
            <span class="property-editor-card__eyebrow">业务分类</span>
            <h3 id="category-form-title">新建业务分类</h3>
            <p class="text-sm text-muted">建议按器材使用方式划分，便于借用、盘点与审批时快速识别。</p>
          </div>
          <div class="form-group">
            <label class="form-label">分类名称 *</label>
            <input type="text" id="category-name" class="form-input" placeholder="例如：电动工具">
          </div>
          <div class="form-group">
            <label class="form-label">描述</label>
            <textarea id="category-desc" class="form-textarea" placeholder="选填"></textarea>
          </div>
          <input type="hidden" id="category-edit-id" value="">
          <div id="category-error" class="form-error hidden"></div>
          <button id="category-submit" class="btn btn--primary btn--full">保存</button>
          <button id="category-cancel" class="btn btn--outline btn--full hidden">取消编辑</button>
        </div>
      </div>
    </div>
  `;

  if (isMobile) {
    app.innerHTML = renderMobileAdminShell('properties', bodyContent);
  } else {
    app.innerHTML = renderPcLayout('properties', bodyContent);
  }

  bindPropertySection({
    type: 'asset-type',
    singularLabel: '资产性质',
    listRoute: 'properties',
    createAction: (data) => Api.createAssetType(data),
    updateAction: (id, data) => Api.updateAssetType(id, data),
    deleteAction: (id) => Api.deleteAssetType(id),
  });

  bindPropertySection({
    type: 'category',
    singularLabel: '业务分类',
    listRoute: 'properties',
    createAction: (data) => Api.createCategory(data),
    updateAction: (id, data) => Api.updateCategory(id, data),
    deleteAction: (id) => Api.deleteCategory(id),
  });
});
