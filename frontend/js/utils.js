const Utils = {
  statusMap: {
    IN_STOCK: { label: '在库', class: 'chip--stock' },
    PENDING_BORROW_APPROVAL: { label: '待借出审核', class: 'chip--pending' },
    READY_FOR_PICKUP: { label: '待领取', class: 'chip--pending' },
    BORROWED: { label: '已借出', class: 'chip--borrowed' },
    PENDING_RETURN_APPROVAL: { label: '待归还审核', class: 'chip--pending' },
    LOST: { label: '丢失', class: 'chip--lost' },
    DAMAGED: { label: '损坏', class: 'chip--damaged' },
    DISABLED: { label: '停用', class: 'chip--disabled' },
  },

  userStatusMap: {
    PENDING: { label: '待审核', class: 'chip--pending' },
    ACTIVE: { label: '正常', class: 'chip--success' },
    DISABLED: { label: '停用', class: 'chip--disabled' },
  },

  roleMap: {
    USER: '普通用户',
    ASSET_ADMIN: '设备管理员',
    SUPER_ADMIN: '超级管理员',
  },

  statusChip(status, map) {
    const m = (map || this.statusMap)[status] || { label: status, class: '' };
    return `<span class="chip ${m.class}">${m.label}</span>`;
  },

  formatDate(str) {
    if (!str) return '-';
    const d = new Date(str);
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  },

  formatDateTime(str) {
    if (!str) return '-';
    const d = new Date(str);
    return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  },

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  createUploadPreviewEntry(file) {
    return {
      file,
      previewUrl: URL.createObjectURL(file),
      progress: 0,
      error: false,
    };
  },

  releaseUploadPreviewEntries(entries) {
    (entries || []).forEach((entry) => {
      if (!entry || !entry.previewUrl) return;
      URL.revokeObjectURL(entry.previewUrl);
      entry.previewUrl = null;
    });
  },

  removeUploadPreviewEntry(entries, index) {
    const [removed] = (entries || []).splice(index, 1);
    if (!removed) return;
    this.releaseUploadPreviewEntries([removed]);
  },

  createUploadProgressTile(entry, options = {}) {
    const tile = document.createElement('div');
    tile.className = `upload-progress-tile${options.compact ? ' upload-progress-tile--compact' : ''}${entry.error ? ' upload-progress-tile--error' : ''}`;

    const img = document.createElement('img');
    img.className = 'upload-progress-tile__img';
    img.src = entry.previewUrl;
    img.alt = options.alt || '上传预览';
    tile.appendChild(img);

    const progress = Math.max(0, Math.min(100, Math.round(entry.progress || 0)));
    if (entry.error || progress < 100) {
      const overlay = document.createElement('div');
      overlay.className = 'upload-progress-tile__overlay';

      const mask = document.createElement('div');
      mask.className = 'upload-progress-tile__mask';
      mask.style.height = entry.error ? '100%' : `${100 - progress}%`;

      const value = document.createElement('div');
      value.className = 'upload-progress-tile__value';
      value.textContent = entry.error ? '失败' : `${progress}%`;

      overlay.appendChild(mask);
      overlay.appendChild(value);
      tile.appendChild(overlay);
    }

    if (typeof options.onRemove === 'function') {
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'upload-progress-tile__remove';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        options.onRemove();
      });
      tile.appendChild(removeBtn);
    }

    return tile;
  },

  showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    let removed = false;
    let hideTimer = null;
    let startY = null;
    let currentOffset = 0;

    const removeToast = () => {
      if (removed) return;
      removed = true;
      if (hideTimer) clearTimeout(hideTimer);
      toast.classList.add('toast--dismissed');
      setTimeout(() => toast.remove(), 180);
    };

    const resetToastPosition = () => {
      currentOffset = 0;
      toast.classList.remove('toast--dragging');
      toast.style.setProperty('--toast-offset-y', '0px');
      toast.style.setProperty('--toast-opacity', '1');
    };

    hideTimer = setTimeout(removeToast, 3000);

    toast.addEventListener('touchstart', (event) => {
      if (event.touches.length !== 1) return;
      startY = event.touches[0].clientY;
      currentOffset = 0;
      toast.classList.add('toast--dragging');
    }, { passive: true });

    toast.addEventListener('touchmove', (event) => {
      if (startY === null || event.touches.length !== 1) return;
      const deltaY = event.touches[0].clientY - startY;
      if (deltaY >= 0) return;
      currentOffset = deltaY;
      toast.style.setProperty('--toast-offset-y', `${deltaY}px`);
      toast.style.setProperty('--toast-opacity', String(Math.max(0.25, 1 - Math.abs(deltaY) / 120)));
    }, { passive: true });

    const endSwipe = () => {
      if (startY === null) return;
      const shouldDismiss = currentOffset <= -44;
      startY = null;
      if (shouldDismiss) {
        removeToast();
      } else {
        resetToastPosition();
      }
    };

    toast.addEventListener('touchend', endSwipe, { passive: true });
    toast.addEventListener('touchcancel', () => {
      startY = null;
      resetToastPosition();
    }, { passive: true });
  },

  openLightbox(src) {
    const overlay = document.createElement('div');
    overlay.className = 'lightbox-overlay';
    overlay.innerHTML = `<img src="${src}">`;
    overlay.addEventListener('click', () => overlay.remove());
    document.body.appendChild(overlay);
  },

  svgIcon(name) {
    const icons = {
      brandMark: '<svg xmlns="http://www.w3.org/2000/svg" width="46" height="46" viewBox="0 0 46 46" fill="none"><rect x="1" y="1" width="44" height="44" rx="13" fill="#F5D7C7"/><rect x="1" y="1" width="44" height="44" rx="13" stroke="#D8C2B1"/><path d="M14 16.5 23 11l9 5.5v12L23 34l-9-5.5v-12Z" stroke="#C96D3B" stroke-width="1.9" stroke-linejoin="round"/><path d="m14.8 16.2 8.2 4.8 8.2-4.8M23 20.9v13" stroke="#C96D3B" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><circle cx="34" cy="12" r="4" fill="#C96D3B"/><path d="M32.2 12h3.6M34 10.2v3.6" stroke="#FFF8F1" stroke-width="1.4" stroke-linecap="round"/></svg>',
      search: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
      bell: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
      plus: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',
      arrowRight: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>',
      home: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
      box: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>',
      wrench: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
      mapPin: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
      users: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
      sliders: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M2 14h4"/><path d="M10 8h4"/><path d="M18 16h4"/></svg>',
      history: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l4 2"/></svg>',
      layers: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 16 9 5 9-5"/></svg>',
      archiveRestore: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8"/><path d="M9 14h-2v-2"/><path d="m7 12-2 2 2 2"/><path d="M7 14h7a2 2 0 1 0 0-4h-2"/></svg>',
      logout: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
      tag: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/></svg>',
      arrowLeft: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>',
      undo: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>',
      clipboardPlus: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="3" width="8" height="4" rx="1"/><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"/><path d="M12 11v6"/><path d="M9 14h6"/></svg>',
      clipboardList: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="3" width="8" height="4" rx="1"/><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"/><path d="M9 12h6"/><path d="M9 16h6"/></svg>',
      clipboardCheck: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="3" width="8" height="4" rx="1"/><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"/><path d="m9.5 14.5 1.8 1.8 3.7-4"/></svg>',
      fileReturn: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M10 17H8v-2"/><path d="m8 15-2 2 2 2"/><path d="M8 17h6a2 2 0 0 0 0-4h-1"/></svg>',
      clipboardReturn: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="3" width="8" height="4" rx="1"/><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"/><path d="M10 16H8v-2"/><path d="m8 14-2 2 2 2"/><path d="M8 16h6a2 2 0 0 0 0-4h-1"/></svg>',
    };
    return icons[name] || '';
  },
};
