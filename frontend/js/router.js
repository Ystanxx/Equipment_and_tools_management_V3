const Router = {
  routes: {},
  currentRoute: null,

  register(name, handler) {
    this.routes[name] = handler;
  },

  navigate(name, params = {}) {
    const hash = '#' + name + (Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '');
    window.location.hash = hash;
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

  async resolve() {
    const { name, params } = this.parseHash();
    this.currentRoute = name;

    // Auth guard
    const publicRoutes = ['login', 'register'];
    const token = Api.getToken();
    const user = Api.getUser();

    if (!publicRoutes.includes(name) && !token) {
      return this.navigate('login');
    }

    // Pending user guard
    if (token && user && user.status === 'PENDING' && name !== 'pending' && name !== 'login' && name !== 'register') {
      return this.navigate('pending');
    }

    const handler = this.routes[name];
    if (handler) {
      const app = document.getElementById('app');
      app.innerHTML = '<div class="loading-center"><div class="spinner"></div></div>';
      try {
        await handler(params);
      } catch (e) {
        console.error('Route error:', e);
        app.innerHTML = `<div class="empty-state"><p>页面加载失败: ${Utils.escapeHtml(e.message)}</p></div>`;
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

// Determine initial route after user info
(async function initApp() {
  const token = Api.getToken();
  if (token) {
    try {
      const res = await Api.me();
      Api.setUser(res.data);
    } catch {
      Api.clearToken();
      Api.clearUser();
    }
  }
  Router.init();
})();
