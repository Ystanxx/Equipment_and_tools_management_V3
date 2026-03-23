// ===== Categories Management Page =====
Router.register('categories', async () => {
  const app = document.getElementById('app');
  let categories = [];

  try {
    const res = await Api.listCategories({ include_inactive: true });
    categories = res.data || [];
  } catch (e) {
    console.error(e);
  }

  const mainContent = `
    <div class="page-header">
      <div class="page-header__info">
        <h1 class="page-header__title">分类管理</h1>
        <p class="page-header__desc">管理设备/工具的分类标签</p>
      </div>
    </div>

    <div class="content-row">
      <div class="content-main">
        <div class="card" style="padding:0;overflow:hidden;">
          <div class="table-wrapper">
            <table class="data-table">
              <thead><tr><th>名称</th><th>描述</th><th>状态</th><th>操作</th></tr></thead>
              <tbody id="cat-tbody">
                ${categories.length === 0 ? '<tr><td colspan="4"><div class="empty-state">暂无分类</div></td></tr>' :
                  categories.map(c => `
                    <tr data-id="${c.id}">
                      <td style="font-weight:500;">${Utils.escapeHtml(c.name)}</td>
                      <td class="text-sm text-muted">${Utils.escapeHtml(c.description || '-')}</td>
                      <td>${c.is_active ? '<span class="chip chip--success">启用</span>' : '<span class="chip chip--disabled">停用</span>'}</td>
                      <td>
                        <button class="btn btn--outline btn--sm cat-edit-btn" data-id="${c.id}" data-name="${Utils.escapeHtml(c.name)}" data-desc="${Utils.escapeHtml(c.description || '')}">编辑</button>
                        ${c.is_active ? `<button class="btn btn--outline btn--sm cat-disable-btn" data-id="${c.id}">停用</button>` : ''}
                      </td>
                    </tr>
                  `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="content-side">
        <div class="card stack--lg">
          <h3 id="cat-form-title">新建分类</h3>
          <div class="form-group">
            <label class="form-label">分类名称 *</label>
            <input type="text" id="cat-name" class="form-input" placeholder="例如：电学测量">
          </div>
          <div class="form-group">
            <label class="form-label">描述</label>
            <textarea id="cat-desc" class="form-textarea" placeholder="选填"></textarea>
          </div>
          <input type="hidden" id="cat-edit-id" value="">
          <div id="cat-error" class="form-error hidden"></div>
          <button id="cat-submit" class="btn btn--primary btn--full">保存</button>
          <button id="cat-cancel" class="btn btn--outline btn--full hidden">取消编辑</button>
        </div>
      </div>
    </div>`;

  app.innerHTML = renderPcLayout('categories', mainContent);

  // Submit
  document.getElementById('cat-submit').addEventListener('click', async () => {
    const errEl = document.getElementById('cat-error');
    errEl.classList.add('hidden');
    const name = document.getElementById('cat-name').value.trim();
    const desc = document.getElementById('cat-desc').value.trim() || null;
    const editId = document.getElementById('cat-edit-id').value;

    if (!name) { errEl.textContent = '请填写分类名称'; errEl.classList.remove('hidden'); return; }

    try {
      if (editId) {
        await Api.updateCategory(editId, { name, description: desc });
        Utils.showToast('分类已更新');
      } else {
        await Api.createCategory({ name, description: desc });
        Utils.showToast('分类已创建');
      }
      Router.navigate('categories');
    } catch (e) {
      errEl.textContent = e.message;
      errEl.classList.remove('hidden');
    }
  });

  // Edit buttons
  document.querySelectorAll('.cat-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('cat-form-title').textContent = '编辑分类';
      document.getElementById('cat-name').value = btn.dataset.name;
      document.getElementById('cat-desc').value = btn.dataset.desc;
      document.getElementById('cat-edit-id').value = btn.dataset.id;
      document.getElementById('cat-cancel').classList.remove('hidden');
    });
  });

  // Disable buttons with modal
  document.querySelectorAll('.cat-disable-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _showApprovalModal('停用分类', '确认停用该分类？停用后新建设备将无法选择此分类。', async () => {
        await Api.deleteCategory(btn.dataset.id);
        Utils.showToast('分类已停用');
        Router.navigate('categories');
      });
    });
  });

  // Cancel
  document.getElementById('cat-cancel').addEventListener('click', () => {
    document.getElementById('cat-form-title').textContent = '新建分类';
    document.getElementById('cat-name').value = '';
    document.getElementById('cat-desc').value = '';
    document.getElementById('cat-edit-id').value = '';
    document.getElementById('cat-cancel').classList.add('hidden');
  });
});
