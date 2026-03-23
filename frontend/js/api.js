function resolveApiBase() {
  if (window.location.protocol === 'file:') {
    return 'http://127.0.0.1:8000/api/v1';
  }
  return '/api/v1';
}

const API_BASE = resolveApiBase();
const SYSTEM_CONFIG_CACHE_KEY = 'system_configs';
const AUTH_EXPIRES_AT_KEY = 'auth_expires_at';

const Api = {
  getAuthValue(key) {
    return sessionStorage.getItem(key) || localStorage.getItem(key);
  },
  getAuthStorage() {
    if (sessionStorage.getItem('token')) return sessionStorage;
    if (localStorage.getItem('token')) return localStorage;
    return null;
  },
  clearAuthState() {
    ['token', 'user', AUTH_EXPIRES_AT_KEY].forEach((key) => {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    });
    this.clearSystemConfigCache();
  },
  isAuthExpired() {
    const expiresAt = this.getAuthValue(AUTH_EXPIRES_AT_KEY);
    if (!expiresAt) return false;
    const expiresAtMs = Date.parse(expiresAt);
    if (Number.isNaN(expiresAtMs)) return false;
    if (Date.now() < expiresAtMs) return false;
    this.clearAuthState();
    return true;
  },
  getToken() {
    if (this.isAuthExpired()) return null;
    return this.getAuthValue('token');
  },
  setToken(t, options = {}) {
    const storage = options.remember ? localStorage : sessionStorage;
    sessionStorage.removeItem('token');
    localStorage.removeItem('token');
    sessionStorage.removeItem('user');
    localStorage.removeItem('user');
    sessionStorage.removeItem(AUTH_EXPIRES_AT_KEY);
    localStorage.removeItem(AUTH_EXPIRES_AT_KEY);
    storage.setItem('token', t);
    if (options.expiresAt) storage.setItem(AUTH_EXPIRES_AT_KEY, options.expiresAt);
  },
  clearToken() { this.clearAuthState(); },

  getUser() {
    if (this.isAuthExpired()) return null;
    const u = this.getAuthValue('user');
    return u ? JSON.parse(u) : null;
  },
  setUser(u) {
    const storage = this.getAuthStorage() || sessionStorage;
    sessionStorage.removeItem('user');
    localStorage.removeItem('user');
    storage.setItem('user', JSON.stringify(u));
  },
  clearUser() { this.clearAuthState(); },

  getSystemConfigCache() {
    const raw = localStorage.getItem(SYSTEM_CONFIG_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  },
  setSystemConfigCache(configs) { localStorage.setItem(SYSTEM_CONFIG_CACHE_KEY, JSON.stringify(configs)); },
  clearSystemConfigCache() { localStorage.removeItem(SYSTEM_CONFIG_CACHE_KEY); },
  getSystemConfig(key, fallback = null) {
    const configs = this.getSystemConfigCache();
    return Object.prototype.hasOwnProperty.call(configs, key) ? configs[key] : fallback;
  },

  async request(method, path, body = null, params = null) {
    let url = API_BASE + path;
    if (params) {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => {
        if (v !== null && v !== undefined && v !== '') qs.append(k, v);
      });
      const s = qs.toString();
      if (s) url += '?' + s;
    }

    const headers = { 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const opts = { method, headers };
    if (body && method !== 'GET') opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    const json = await this.parseResponse(res);

    if (res.status === 401) {
      const isLoginRequest = path === '/auth/login';
      if (!isLoginRequest && token) {
        this.clearToken();
        this.clearUser();
        Router.navigate('login');
      }
      throw new Error(json.detail || json.message || (isLoginRequest ? '用户名或密码错误' : '登录已过期'));
    }

    if (!res.ok) {
      throw new Error(json.detail || json.message || '请求失败');
    }
    return json;
  },

  async parseResponse(res) {
    const text = await res.text();
    return this.parseTextResponse(text, res.status, res.url);
  },

  parseTextResponse(text, status, url) {
    if (!text) return {};

    try {
      return JSON.parse(text);
    } catch {
      const lowered = text.trim().toLowerCase();
      if (lowered.startsWith('<!doctype') || lowered.startsWith('<html')) {
        throw new Error(`接口 ${url} 返回了 HTML 页面。通常是直接打开了前端文件，或者后端仍在运行旧版本代码，请完整重启服务。`);
      }
      throw new Error(`接口返回了非 JSON 响应，状态码 ${status}`);
    }
  },

  get(path, params) { return this.request('GET', path, null, params); },
  post(path, body) { return this.request('POST', path, body); },
  put(path, body) { return this.request('PUT', path, body); },
  del(path) { return this.request('DELETE', path); },

  // Auth
  register(data) { return this.post('/auth/register', data); },
  login(data) { return this.post('/auth/login', data); },
  me() { return this.get('/auth/me'); },
  updateMyEmailPreference(emailNotificationsEnabled) {
    return this.put('/auth/preferences/email', {
      email_notifications_enabled: emailNotificationsEnabled,
    });
  },

  // Registration
  listRegistrations(params) { return this.get('/registration-requests', params); },
  approveRegistration(id) { return this.post(`/registration-requests/${id}/approve`); },
  rejectRegistration(id, reason) { return this.post(`/registration-requests/${id}/reject`, { reason }); },

  // Users
  listUsers(params) { return this.get('/users', params); },
  getUserById(id) { return this.get(`/users/${id}`); },
  updateUserProfile(id, data) { return this.put(`/users/${id}/profile`, data); },
  updateRole(id, role) { return this.put(`/users/${id}/role`, { role }); },
  updateUserStatus(id, status) { return this.put(`/users/${id}/status`, { status }); },

  // Asset Types
  listAssetTypes(params) { return this.get('/asset-types', params); },
  createAssetType(data) { return this.post('/asset-types', data); },
  updateAssetType(id, data) { return this.put(`/asset-types/${id}`, data); },
  deleteAssetType(id) { return this.del(`/asset-types/${id}`); },

  // Categories
  listCategories(params) { return this.get('/asset-categories', params); },
  createCategory(data) { return this.post('/asset-categories', data); },
  updateCategory(id, data) { return this.put(`/asset-categories/${id}`, data); },
  deleteCategory(id) { return this.del(`/asset-categories/${id}`); },

  // Locations
  listLocations(params) { return this.get('/storage-locations', params); },
  createLocation(data) { return this.post('/storage-locations', data); },
  updateLocation(id, data) { return this.put(`/storage-locations/${id}`, data); },
  deleteLocation(id) { return this.del(`/storage-locations/${id}`); },

  // Assets
  listAssets(params) { return this.get('/assets', params); },
  getAssetLiveState() { return this.get('/assets/live-state'); },
  listRecentDeletedAssets(limit = 5) { return this.get('/assets/deleted/recent', { limit }); },
  getAsset(id) { return this.get(`/assets/${id}`); },
  createAsset(data) { return this.post('/assets', data); },
  updateAsset(id, data) { return this.put(`/assets/${id}`, data); },
  updateAssetAdmin(id, adminId) { return this.put(`/assets/${id}/admin`, { admin_id: adminId }); },
  deleteAsset(id) { return this.del(`/assets/${id}`); },
  restoreAsset(id) { return this.post(`/assets/${id}/restore`); },

  // Borrow Orders
  createBorrowOrder(data) { return this.post('/borrow-orders', data); },
  listBorrowOrders(params) { return this.get('/borrow-orders', params); },
  getBorrowOrder(id) { return this.get(`/borrow-orders/${id}`); },
  deliverBorrowOrder(id) { return this.post(`/borrow-orders/${id}/deliver`); },
  cancelBorrowOrder(id) { return this.post(`/borrow-orders/${id}/cancel`); },

  // Unified Equipment Orders
  listEquipmentOrders(params) { return this.get('/equipment-orders', params); },
  getEquipmentOrder(id) { return this.get(`/equipment-orders/${id}`); },
  getEquipmentOrderTimeline(id) { return this.get(`/equipment-orders/${id}/timeline`); },

  // Borrow Approval Tasks
  listBorrowApprovalTasks(params) { return this.get('/borrow-approval-tasks', params); },
  approveBorrowTask(id, comment) { return this.post(`/borrow-approval-tasks/${id}/approve`, { comment }); },
  rejectBorrowTask(id, comment) { return this.post(`/borrow-approval-tasks/${id}/reject`, { comment }); },

  // Cart (client-side localStorage)
  getCart() { return JSON.parse(localStorage.getItem('borrow_cart') || '[]'); },
  addToCart(asset) {
    const cart = this.getCart();
    const maxItems = this.getSystemConfig('borrow_order_max_items', 20);
    if (cart.find(i => i.id === asset.id)) return false;
    if (cart.length >= maxItems) return false;
    cart.push({ id: asset.id, asset_code: asset.asset_code, name: asset.name, location_name: asset.location_name || '' });
    localStorage.setItem('borrow_cart', JSON.stringify(cart));
    return true;
  },
  removeFromCart(assetId) {
    const cart = this.getCart().filter(i => i.id !== assetId);
    localStorage.setItem('borrow_cart', JSON.stringify(cart));
  },
  clearCart() { localStorage.removeItem('borrow_cart'); },

  // Return Orders
  createReturnOrder(data) { return this.post('/return-orders', data); },
  listReturnOrders(params) { return this.get('/return-orders', params); },
  getReturnOrder(id) { return this.get(`/return-orders/${id}`); },
  stockInReturnOrder(id) { return this.post(`/return-orders/${id}/stock-in`); },

  // Attachments
  async stageAttachment(file, photoType, options = {}) {
    const form = new FormData();
    form.append('file', file);
    form.append('photo_type', photoType);
    const headers = {};
    const token = this.getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const uploadUrl = API_BASE + '/attachments/stage';
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', uploadUrl, true);
      Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));

      if (onProgress) {
        onProgress(0);
        xhr.upload.addEventListener('progress', (event) => {
          if (!event.lengthComputable) return;
          const percent = Math.min(100, Math.max(0, Math.round((event.loaded / event.total) * 100)));
          onProgress(percent);
        });
      }

      xhr.onload = () => {
        let json = {};
        try {
          json = this.parseTextResponse(xhr.responseText || xhr.response || '', xhr.status, uploadUrl);
        } catch (error) {
          reject(error);
          return;
        }

        if (xhr.status === 401) {
          this.clearToken();
          this.clearUser();
          Router.navigate('login');
          reject(new Error('登录已过期'));
          return;
        }

        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(json.detail || '上传失败'));
          return;
        }

        if (onProgress) onProgress(100);
        resolve(json);
      };

      xhr.onerror = () => reject(new Error('上传失败，请检查网络连接'));
      xhr.onabort = () => reject(new Error('上传已取消'));
      xhr.send(form);
    });
  },
  async uploadAttachment(file, photoType, relatedType, relatedId, options = {}) {
    const form = new FormData();
    form.append('file', file);
    form.append('photo_type', photoType);
    form.append('related_type', relatedType);
    form.append('related_id', relatedId);
    const headers = {};
    const token = this.getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const uploadUrl = API_BASE + '/attachments';
    const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', uploadUrl, true);
      Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));

      if (onProgress) {
        onProgress(0);
        xhr.upload.addEventListener('progress', (event) => {
          if (!event.lengthComputable) return;
          const percent = Math.min(100, Math.max(0, Math.round((event.loaded / event.total) * 100)));
          onProgress(percent);
        });
      }

      xhr.onload = () => {
        let json = {};
        try {
          json = this.parseTextResponse(xhr.responseText || xhr.response || '', xhr.status, uploadUrl);
        } catch (error) {
          reject(error);
          return;
        }

        if (xhr.status === 401) {
          this.clearToken();
          this.clearUser();
          Router.navigate('login');
          reject(new Error('登录已过期'));
          return;
        }

        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(json.detail || '上传失败'));
          return;
        }

        if (onProgress) onProgress(100);
        resolve(json);
      };

      xhr.onerror = () => reject(new Error('上传失败，请检查网络连接'));
      xhr.onabort = () => reject(new Error('上传已取消'));
      xhr.send(form);
    });
  },
  async finalizeStagedAttachment(stageToken, relatedType, relatedId) {
    const form = new FormData();
    form.append('stage_token', stageToken);
    form.append('related_type', relatedType);
    form.append('related_id', relatedId);
    const token = this.getToken();
    const headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const url = API_BASE + '/attachments/finalize';

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: form,
    });
    const json = await this.parseResponse(res);
    if (res.status === 401) {
      this.clearToken();
      this.clearUser();
      Router.navigate('login');
      throw new Error(json.detail || '登录已过期');
    }
    if (!res.ok) {
      throw new Error(json.detail || json.message || '附件确认失败');
    }
    return json;
  },
  async discardStagedAttachment(stageToken) {
    return this.request('DELETE', `/attachments/stage/${stageToken}`);
  },
  listAttachments(params) { return this.get('/attachments', params); },

  // Audit Logs
  listAuditLogs(params) { return this.get('/audit-logs', params); },
  getOrderTimeline(orderId) { return this.get(`/audit-logs/order-timeline/${orderId}`); },

  // Return Approval Tasks
  listReturnApprovalTasks(params) { return this.get('/return-approval-tasks', params); },
  approveReturnTask(id, comment) { return this.post(`/return-approval-tasks/${id}/approve`, { comment }); },
  rejectReturnTask(id, comment) { return this.post(`/return-approval-tasks/${id}/reject`, { comment }); },

  // Auth - password
  async changePassword(oldPassword, newPassword) {
    const payload = { old_password: oldPassword, new_password: newPassword };
    try {
      return await this.put('/auth/password', payload);
    } catch (error) {
      if (error.message === 'Method Not Allowed') {
        return this.post('/auth/password', payload);
      }
      throw error;
    }
  },

  // Notifications
  listNotifications(params) { return this.get('/notifications', params); },
  getUnreadCount() { return this.get('/notifications/unread-count'); },
  markNotificationRead(id) { return this.post(`/notifications/${id}/read`); },
  markAllNotificationsRead() { return this.post('/notifications/read-all'); },

  // System Configs
  listSystemConfigs() { return this.get('/system-configs'); },
  updateSystemConfigs(values) { return this.put('/system-configs', { values }); },
  async bootstrapSystemConfigs() {
    if (!this.getToken()) {
      this.clearSystemConfigCache();
      return {};
    }
    try {
      const res = await this.listSystemConfigs();
      const cache = {};
      (res.data || []).forEach(item => { cache[item.key] = item.value; });
      this.setSystemConfigCache(cache);
      return cache;
    } catch (error) {
      console.warn('加载系统配置失败，已回退默认配置', error);
      this.clearSystemConfigCache();
      return {};
    }
  },
};
