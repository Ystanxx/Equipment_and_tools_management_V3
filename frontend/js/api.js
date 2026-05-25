function resolveApiBase() {
  if (window.location.protocol === 'file:') {
    return 'http://127.0.0.1:8000/api/v1';
  }
  return '/api/v1';
}

const API_BASE = resolveApiBase();
const SYSTEM_CONFIG_CACHE_KEY = 'system_configs';

const Api = {
  getToken() { return localStorage.getItem('token'); },
  setToken(t) { localStorage.setItem('token', t); },
  clearToken() { localStorage.removeItem('token'); },

  getUser() {
    const u = localStorage.getItem('user');
    return u ? JSON.parse(u) : null;
  },
  setUser(u) { localStorage.setItem('user', JSON.stringify(u)); },
  clearUser() {
    localStorage.removeItem('user');
    this.clearSystemConfigCache();
  },

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

    if (res.status === 401) {
      this.clearToken();
      this.clearUser();
      Router.navigate('login');
      throw new Error('登录已过期');
    }

    const json = await this.parseResponse(res);
    if (!res.ok) {
      throw new Error(json.detail || json.message || '请求失败');
    }
    return json;
  },

  async parseResponse(res) {
    const text = await res.text();
    if (!text) return {};

    try {
      return JSON.parse(text);
    } catch {
      const lowered = text.trim().toLowerCase();
      if (lowered.startsWith('<!doctype') || lowered.startsWith('<html')) {
        throw new Error(`接口 ${res.url} 返回了 HTML 页面。通常是直接打开了前端文件，或者后端仍在运行旧版本代码，请完整重启服务。`);
      }
      throw new Error(`接口返回了非 JSON 响应，状态码 ${res.status}`);
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

  // Registration
  listRegistrations(params) { return this.get('/registration-requests', params); },
  approveRegistration(id) { return this.post(`/registration-requests/${id}/approve`); },
  rejectRegistration(id, reason) { return this.post(`/registration-requests/${id}/reject`, { reason }); },

  // Users
  listUsers(params) { return this.get('/users', params); },
  getUserById(id) { return this.get(`/users/${id}`); },
  updateRole(id, role) { return this.put(`/users/${id}/role`, { role }); },
  updateUserStatus(id, status) { return this.put(`/users/${id}/status`, { status }); },

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
  getAsset(id) { return this.get(`/assets/${id}`); },
  createAsset(data) { return this.post('/assets', data); },
  updateAsset(id, data) { return this.put(`/assets/${id}`, data); },
  updateAssetAdmin(id, adminId) { return this.put(`/assets/${id}/admin`, { admin_id: adminId }); },

  // Borrow Orders
  createBorrowOrder(data) { return this.post('/borrow-orders', data); },
  listBorrowOrders(params) { return this.get('/borrow-orders', params); },
  getBorrowOrder(id) { return this.get(`/borrow-orders/${id}`); },
  deliverBorrowOrder(id) { return this.post(`/borrow-orders/${id}/deliver`); },
  cancelBorrowOrder(id) { return this.post(`/borrow-orders/${id}/cancel`); },

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

  // Attachments
  async uploadAttachment(file, photoType, relatedType, relatedId) {
    const form = new FormData();
    form.append('file', file);
    form.append('photo_type', photoType);
    form.append('related_type', relatedType);
    form.append('related_id', relatedId);
    const headers = {};
    const token = this.getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(API_BASE + '/attachments', { method: 'POST', headers, body: form });
    if (res.status === 401) { this.clearToken(); this.clearUser(); Router.navigate('login'); throw new Error('登录已过期'); }
    const json = await this.parseResponse(res);
    if (!res.ok) throw new Error(json.detail || '上传失败');
    return json;
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
  changePassword(oldPassword, newPassword) { return this.put('/auth/password', { old_password: oldPassword, new_password: newPassword }); },

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
