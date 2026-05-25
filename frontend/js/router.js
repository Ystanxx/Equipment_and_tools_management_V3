const Router = {
  routes: {},
  currentRoute: null,
  loadingTimer: null,
  routeProgressEl: null,

  register(name, handler) {
    this.routes[name] = handler;
  },

  ensureRouteProgress() {
    if (this.routeProgressEl) return this.routeProgressEl;
    const progress = document.createElement('div');
    progress.className = 'route-progress hidden';
    progress.innerHTML = '<div class="route-progress__bar"></div>';
    document.body.appendChild(progress);
    this.routeProgressEl = progress;
    return progress;
  },

  showRouteProgress() {
    const progress = this.ensureRouteProgress();
    progress.classList.remove('hidden');
  },

  hideRouteProgress() {
    if (!this.routeProgressEl) return;
    this.routeProgressEl.classList.add('hidden');
  },

  navigate(name, params = {}) {
    const hash = '#' + name + (Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '');
    if (window.location.hash === hash) {
      this.resolve();
    } else {
      window.location.hash = hash;
    }
  },

  parseHash() {
    const hash = window.location.hash.slice(1) || 'login';
    const [name, queryString] = hash.split('?');
    const params = {};
    if (queryString) {
      new URLSearchParams(queryString).forEach((v, k) => { params[k] = v; });
    }
    return { name, params };
  },

  getDefaultRoute(user) {
    if (!user) return 'login';
    if (user.status === 'PENDING') return 'pending';
    return user.role === 'USER' ? 'asset-list' : 'dashboard';
  },

  async resolve() {
    const { name, params } = this.parseHash();
    this.currentRoute = name;

    // Auth guard
    const publicRoutes = ['login', 'register'];
    const token = Api.getToken();
    const user = Api.getUser();

    if (token && user && publicRoutes.includes(name)) {
      return this.navigate(this.getDefaultRoute(user));
    }

    if (!publicRoutes.includes(name) && !token) {
      return this.navigate('login');
    }

    // Pending user guard
    if (token && user && user.status === 'PENDING' && name !== 'pending' && name !== 'login' && name !== 'register') {
      return this.navigate('pending');
    }

    // 在渲染前刷新导航气泡，确保侧栏和移动菜单状态一致。
    if (token && user && typeof ensureNavigationState === 'function') {
      await ensureNavigationState(user);
    }

    const handler = this.routes[name];
    if (handler) {
      const app = document.getElementById('app');
      const hasExistingContent = app && app.childElementCount > 0;
      clearTimeout(this.loadingTimer);
      if (!hasExistingContent) {
        app.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>';
      } else {
        this.loadingTimer = setTimeout(() => this.showRouteProgress(), 160);
      }
      try {
        await handler(params);
        if (typeof bindMobileTopShell === 'function') {
          bindMobileTopShell();
        }
        window.scrollTo(0, 0);
      } catch (e) {
        console.error('Route error:', e);
        app.innerHTML = `<div class="empty-state"><p>页面加载失败: ${Utils.escapeHtml(e.message)}</p></div>`;
      } finally {
        clearTimeout(this.loadingTimer);
        this.hideRouteProgress();
      }
    } else {
      document.getElementById('app').innerHTML = '<div class="empty-state"><p>页面不存在</p></div>';
    }
  },

  init() {
    window.addEventListener('hashchange', () => this.resolve());
    this.resolve();
  },
};

let _inventoryStateSyncTimer = null;
let _inventoryStateSyncBusy = false;
let _lastInventoryAssetVersion = '';
const LIVE_INVENTORY_REFRESH_ROUTES = new Set([
  'dashboard',
  'asset-list',
  'managed-assets',
  'asset-detail',
  'my-orders',
  'order-detail',
  'borrow-approvals',
  'return-approvals',
  'borrow-detail',
  'return-detail',
]);

function shouldSilentlyRefreshCurrentRoute() {
  if (!LIVE_INVENTORY_REFRESH_ROUTES.has(Router.currentRoute)) return false;
  if (document.querySelector('.modal-overlay')) return false;
  const activeTag = document.activeElement?.tagName;
  if (activeTag && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag)) return false;
  return true;
}

async function pollInventoryState(force = false) {
  if (_inventoryStateSyncBusy) return;
  if (!Api.getToken()) return;

  _inventoryStateSyncBusy = true;
  try {
    const res = await Api.getAssetLiveState();
    const assetVersion = res.data?.asset_version || '';
    if (!assetVersion) return;

    if (force || !_lastInventoryAssetVersion) {
      _lastInventoryAssetVersion = assetVersion;
      return;
    }

    if (assetVersion === _lastInventoryAssetVersion) return;

    _lastInventoryAssetVersion = assetVersion;
    if (typeof ensureNavigationState === 'function') {
      await ensureNavigationState(Api.getUser());
    }
    window.dispatchEvent(new CustomEvent('inventory-state-sync', { detail: res.data || {} }));

    if (shouldSilentlyRefreshCurrentRoute()) {
      await Router.resolve();
    }
  } catch (error) {
    console.warn('静默库存同步失败', error);
  } finally {
    _inventoryStateSyncBusy = false;
  }
}

function startInventoryStateSync() {
  if (_inventoryStateSyncTimer) return;
  void pollInventoryState(true);
  _inventoryStateSyncTimer = window.setInterval(() => {
    void pollInventoryState();
  }, 10000);
}

function stopInventoryStateSync() {
  if (_inventoryStateSyncTimer) {
    clearInterval(_inventoryStateSyncTimer);
    _inventoryStateSyncTimer = null;
  }
  _lastInventoryAssetVersion = '';
}

window.startInventoryStateSync = startInventoryStateSync;
window.stopInventoryStateSync = stopInventoryStateSync;

// Determine initial route after user info
window.addEventListener('DOMContentLoaded', async () => {
  const token = Api.getToken();
  if (token) {
    try {
      const res = await Api.me();
      Api.setUser(res.data);
      await Api.bootstrapSystemConfigs();
    } catch {
      Api.clearToken();
      Api.clearUser();
    }
  }
  Router.init();
  if (Api.getToken()) {
    startInventoryStateSync();
  }
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && Api.getToken()) {
    void pollInventoryState();
  }
});
