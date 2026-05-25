function showLocationEditorModal(options) {
  const {
    title,
    confirmText,
    initialData = {},
    onSubmit,
  } = options;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal property-modal">
      <div class="modal__header">
        <div class="stack stack--sm">
          <div class="modal__title">${Utils.escapeHtml(title)}</div>
          <div class="text-sm text-muted">保存后会立即同步到器材录入、详情和筛选项。</div>
        </div>
        <button class="modal__close" type="button" aria-label="关闭">×</button>
      </div>
      <div class="stack stack--lg">
        <div class="form-group">
          <label class="form-label">位置编码</label>
          <input type="text" class="form-input" data-role="code" value="${Utils.escapeHtml(initialData.code || '')}" placeholder="选填">
        </div>
        <div class="form-group">
          <label class="form-label">名称 <span class="form-required">*</span></label>
          <input type="text" class="form-input" data-role="name" value="${Utils.escapeHtml(initialData.name || '')}" placeholder="例如：A楼301">
        </div>
        <div class="asset-form-row">
          <div class="form-group">
            <label class="form-label">楼栋</label>
            <input type="text" class="form-input" data-role="building" value="${Utils.escapeHtml(initialData.building || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">房间</label>
            <input type="text" class="form-input" data-role="room" value="${Utils.escapeHtml(initialData.room || '')}">
          </div>
        </div>
        <div class="asset-form-row">
          <div class="form-group">
            <label class="form-label">柜体</label>
            <input type="text" class="form-input" data-role="cabinet" value="${Utils.escapeHtml(initialData.cabinet || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">层架</label>
            <input type="text" class="form-input" data-role="shelf" value="${Utils.escapeHtml(initialData.shelf || '')}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">备注</label>
          <textarea class="form-textarea property-modal__textarea" data-role="remark" placeholder="选填">${Utils.escapeHtml(initialData.remark || '')}</textarea>
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
  overlay.querySelector('.modal__close').addEventListener('click', close);
  overlay.querySelector('[data-role="cancel"]').addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });

  const submitBtn = overlay.querySelector('[data-role="submit"]');
  const errorEl = overlay.querySelector('[data-role="error"]');
  submitBtn.addEventListener('click', async () => {
    errorEl.classList.add('hidden');
    const data = {
      code: overlay.querySelector('[data-role="code"]').value.trim() || null,
      name: overlay.querySelector('[data-role="name"]').value.trim(),
      building: overlay.querySelector('[data-role="building"]').value.trim() || null,
      room: overlay.querySelector('[data-role="room"]').value.trim() || null,
      cabinet: overlay.querySelector('[data-role="cabinet"]').value.trim() || null,
      shelf: overlay.querySelector('[data-role="shelf"]').value.trim() || null,
      remark: overlay.querySelector('[data-role="remark"]').value.trim() || null,
    };

    if (!data.name) {
      errorEl.textContent = '请填写位置名称';
      errorEl.classList.remove('hidden');
      return;
    }

    submitBtn.disabled = true;
    try {
      await onSubmit(data);
      close();
    } catch (error) {
      errorEl.textContent = error.message;
      errorEl.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
    }
  });

  document.body.appendChild(overlay);
  const nameInput = overlay.querySelector('[data-role="name"]');
  nameInput.focus();
  nameInput.select();
}

// ===== Locations Management Page =====
Router.register('locations', async () => {
  const app = document.getElementById('app');
  const user = Api.getUser();
  if (!user || user.role !== 'SUPER_ADMIN') {
    Utils.showToast('只有超级管理员可以管理位置', 'error');
    return Router.navigate(user && user.role === 'USER' ? 'asset-list' : 'dashboard');
  }
  let locations = [];
  const isMobile = window.innerWidth <= 768;

  try {
    const res = await Api.listLocations({ include_inactive: true });
    locations = res.data || [];
  } catch (e) {
    console.error(e);
  }

  const renderHeadAside = isMobile
    ? `
      <div class="property-section-card__aside">
        <span class="tag">共 ${locations.length} 项</span>
        <button type="button" class="btn btn--outline btn--sm property-section-card__action" id="loc-create">新建位置</button>
      </div>
    `
    : `<span class="tag">共 ${locations.length} 项</span>`;

  const mainContent = `
    <div class="page-header property-page__header">
      <div class="page-header__info">
        <h1 class="page-header__title">位置管理</h1>
        <p class="page-header__desc">统一维护设备存放位置，供器材录入、详情展示和筛选使用。</p>
      </div>
    </div>

    <div class="content-row content-row--stretch">
      <div class="content-main">
        <div class="table-card property-section-card">
          <div class="table-card__head property-section-card__head">
            <div class="property-section-card__meta">
              <h3 class="table-card__title">位置列表</h3>
              <p class="table-card__desc">建议按楼栋、房间和柜体层架维护，便于器材定位与盘点。</p>
            </div>
            ${renderHeadAside}
          </div>
          <div class="table-wrapper">
            <table class="data-table location-table">
              <thead><tr><th>编码</th><th>名称</th><th>楼栋</th><th>房间</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                ${locations.length === 0 ? '<tr><td colspan="6"><div class="empty-state">暂无位置</div></td></tr>' :
                  locations.map(l => `
                    <tr>
                      <td class="location-table__code-cell"><div class="location-table__code">${Utils.escapeHtml(l.code || '-')}</div></td>
                      <td class="location-table__name-cell"><div class="location-table__name">${Utils.escapeHtml(l.name)}</div></td>
                      <td class="location-table__meta-cell">${Utils.escapeHtml(l.building || '-')}</td>
                      <td class="location-table__meta-cell">${Utils.escapeHtml(l.room || '-')}</td>
                      <td class="location-table__status-cell">${l.is_active ? '<span class="chip chip--success">启用</span>' : '<span class="chip chip--disabled">停用</span>'}</td>
                      <td class="location-table__actions-cell">
                        <div class="location-table__actions">
                        <button class="btn btn--outline btn--sm loc-edit-btn"
                          data-id="${l.id}" data-code="${Utils.escapeHtml(l.code || '')}"
                          data-name="${Utils.escapeHtml(l.name)}" data-building="${Utils.escapeHtml(l.building || '')}"
                          data-room="${Utils.escapeHtml(l.room || '')}" data-cabinet="${Utils.escapeHtml(l.cabinet || '')}"
                          data-shelf="${Utils.escapeHtml(l.shelf || '')}" data-remark="${Utils.escapeHtml(l.remark || '')}">编辑</button>
                        ${l.is_active
                          ? `<button class="btn btn--outline btn--sm loc-disable-btn" data-id="${l.id}">停用</button>`
                          : `<button class="btn btn--secondary btn--sm loc-enable-btn" data-id="${l.id}">启用</button>`}
                        <button class="btn btn--danger btn--sm loc-delete-btn" data-id="${l.id}" data-name="${Utils.escapeHtml(l.name)}">删除</button>
                        </div>
                      </td>
                    </tr>
                  `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="content-side property-page__side ${isMobile ? 'hidden' : ''}">
        <div class="card stack--lg">
          <h3 id="loc-form-title">新建位置</h3>
          <div class="form-group"><label class="form-label">位置编码</label><input type="text" id="loc-code" class="form-input" placeholder="选填"></div>
          <div class="form-group"><label class="form-label">名称 *</label><input type="text" id="loc-name" class="form-input" placeholder="例如：A楼301"></div>
          <div class="flex gap-md">
            <div class="form-group" style="flex:1;"><label class="form-label">楼栋</label><input type="text" id="loc-building" class="form-input"></div>
            <div class="form-group" style="flex:1;"><label class="form-label">房间</label><input type="text" id="loc-room" class="form-input"></div>
          </div>
          <div class="flex gap-md">
            <div class="form-group" style="flex:1;"><label class="form-label">柜体</label><input type="text" id="loc-cabinet" class="form-input"></div>
            <div class="form-group" style="flex:1;"><label class="form-label">层架</label><input type="text" id="loc-shelf" class="form-input"></div>
          </div>
          <div class="form-group"><label class="form-label">备注</label><textarea id="loc-remark" class="form-textarea"></textarea></div>
          <input type="hidden" id="loc-edit-id" value="">
          <div id="loc-error" class="form-error hidden"></div>
          <button id="loc-submit" class="btn btn--primary btn--full">保存</button>
          <button id="loc-cancel" class="btn btn--outline btn--full hidden">取消编辑</button>
        </div>
      </div>
    </div>`;

  app.innerHTML = isMobile ? renderMobileAdminShell('locations', mainContent) : renderPcLayout('locations', mainContent);

  if (!isMobile) {
    document.getElementById('loc-submit').addEventListener('click', async () => {
      const errEl = document.getElementById('loc-error');
      errEl.classList.add('hidden');
      const data = {
        code: document.getElementById('loc-code').value.trim() || null,
        name: document.getElementById('loc-name').value.trim(),
        building: document.getElementById('loc-building').value.trim() || null,
        room: document.getElementById('loc-room').value.trim() || null,
        cabinet: document.getElementById('loc-cabinet').value.trim() || null,
        shelf: document.getElementById('loc-shelf').value.trim() || null,
        remark: document.getElementById('loc-remark').value.trim() || null,
      };
      const editId = document.getElementById('loc-edit-id').value;

      if (!data.name) { errEl.textContent = '请填写位置名称'; errEl.classList.remove('hidden'); return; }

      try {
        if (editId) {
          await Api.updateLocation(editId, data);
          Utils.showToast('位置已更新');
        } else {
          await Api.createLocation(data);
          Utils.showToast('位置已创建');
        }
        Router.navigate('locations');
      } catch (e) {
        errEl.textContent = e.message;
        errEl.classList.remove('hidden');
      }
    });
  }

  if (isMobile) {
    document.getElementById('loc-create')?.addEventListener('click', () => {
      showLocationEditorModal({
        title: '新建位置',
        confirmText: '创建并保存',
        onSubmit: async (data) => {
          await Api.createLocation(data);
          Utils.showToast('位置已创建');
          Router.navigate('locations');
        },
      });
    });
  }

  document.querySelectorAll('.loc-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (isMobile) {
        showLocationEditorModal({
          title: '编辑位置',
          confirmText: '保存修改',
          initialData: {
            code: btn.dataset.code,
            name: btn.dataset.name,
            building: btn.dataset.building,
            room: btn.dataset.room,
            cabinet: btn.dataset.cabinet,
            shelf: btn.dataset.shelf,
            remark: btn.dataset.remark,
          },
          onSubmit: async (data) => {
            await Api.updateLocation(btn.dataset.id, data);
            Utils.showToast('位置已更新');
            Router.navigate('locations');
          },
        });
        return;
      }

      document.getElementById('loc-form-title').textContent = '编辑位置';
      document.getElementById('loc-edit-id').value = btn.dataset.id;
      document.getElementById('loc-code').value = btn.dataset.code;
      document.getElementById('loc-name').value = btn.dataset.name;
      document.getElementById('loc-building').value = btn.dataset.building;
      document.getElementById('loc-room').value = btn.dataset.room;
      document.getElementById('loc-cabinet').value = btn.dataset.cabinet;
      document.getElementById('loc-shelf').value = btn.dataset.shelf;
      document.getElementById('loc-remark').value = btn.dataset.remark;
      document.getElementById('loc-cancel').classList.remove('hidden');
    });
  });

  document.querySelectorAll('.loc-disable-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await Api.updateLocation(btn.dataset.id, { is_active: false });
        Utils.showToast('位置已停用');
        Router.navigate('locations');
      } catch (e) { Utils.showToast(e.message, 'error'); }
    });
  });

  // Enable buttons
  document.querySelectorAll('.loc-enable-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await Api.updateLocation(btn.dataset.id, { is_active: true });
        Utils.showToast('位置已启用');
        Router.navigate('locations');
      } catch (e) { Utils.showToast(e.message, 'error'); }
    });
  });

  document.querySelectorAll('.loc-delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _showApprovalModal('删除位置', `确认永久删除位置“${btn.dataset.name}”？删除后不可恢复。`, async () => {
        await Api.deleteLocation(btn.dataset.id);
        Utils.showToast('位置已删除');
        Router.navigate('locations');
      });
    });
  });

  if (!isMobile) {
    document.getElementById('loc-cancel').addEventListener('click', () => {
      document.getElementById('loc-form-title').textContent = '新建位置';
      ['loc-edit-id','loc-code','loc-name','loc-building','loc-room','loc-cabinet','loc-shelf','loc-remark'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('loc-cancel').classList.add('hidden');
    });
  }
});
