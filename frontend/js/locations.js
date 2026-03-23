// ===== Locations Management Page =====
Router.register('locations', async () => {
  const app = document.getElementById('app');
  let locations = [];

  try {
    const res = await Api.listLocations({ include_inactive: true });
    locations = res.data || [];
  } catch (e) {
    console.error(e);
  }

  const mainContent = `
    <div class="page-header">
      <div class="page-header__info">
        <h1 class="page-header__title">位置管理</h1>
        <p class="page-header__desc">管理设备存放位置</p>
      </div>
    </div>

    <div class="content-row">
      <div class="content-main">
        <div class="card" style="padding:0;overflow:hidden;">
          <div class="table-wrapper">
            <table class="data-table">
              <thead><tr><th>编码</th><th>名称</th><th>楼栋</th><th>房间</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                ${locations.length === 0 ? '<tr><td colspan="6"><div class="empty-state">暂无位置</div></td></tr>' :
                  locations.map(l => `
                    <tr>
                      <td class="text-sm">${Utils.escapeHtml(l.code || '-')}</td>
                      <td style="font-weight:500;">${Utils.escapeHtml(l.name)}</td>
                      <td class="text-sm">${Utils.escapeHtml(l.building || '-')}</td>
                      <td class="text-sm">${Utils.escapeHtml(l.room || '-')}</td>
                      <td>${l.is_active ? '<span class="chip chip--success">启用</span>' : '<span class="chip chip--disabled">停用</span>'}</td>
                      <td>
                        <button class="btn btn--outline btn--sm loc-edit-btn"
                          data-id="${l.id}" data-code="${Utils.escapeHtml(l.code || '')}"
                          data-name="${Utils.escapeHtml(l.name)}" data-building="${Utils.escapeHtml(l.building || '')}"
                          data-room="${Utils.escapeHtml(l.room || '')}" data-cabinet="${Utils.escapeHtml(l.cabinet || '')}"
                          data-shelf="${Utils.escapeHtml(l.shelf || '')}" data-remark="${Utils.escapeHtml(l.remark || '')}">编辑</button>
                        ${l.is_active ? `<button class="btn btn--outline btn--sm loc-disable-btn" data-id="${l.id}">停用</button>` : ''}
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

  app.innerHTML = renderPcLayout('locations', mainContent);

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

  document.querySelectorAll('.loc-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
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
    btn.addEventListener('click', () => {
      _showApprovalModal('停用位置', '确认停用该存放位置？停用后新建设备将无法选择此位置。', async () => {
        await Api.deleteLocation(btn.dataset.id);
        Utils.showToast('位置已停用');
        Router.navigate('locations');
      });
    });
  });

  document.getElementById('loc-cancel').addEventListener('click', () => {
    document.getElementById('loc-form-title').textContent = '新建位置';
    ['loc-edit-id','loc-code','loc-name','loc-building','loc-room','loc-cabinet','loc-shelf','loc-remark'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('loc-cancel').classList.add('hidden');
  });
});
