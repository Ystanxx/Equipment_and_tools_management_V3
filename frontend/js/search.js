/**
 * 输入防抖 — 延迟执行，减少高频触发
 */
function debounce(fn, delay) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

/**
 * AssetSearch — 器材搜索建议工具对象
 *
 * 当前实现：local index provider（页面加载时预取轻量索引，本地匹配）
 * 后期可升级：将 search() 内部替换为请求后端 /assets/search-suggestions?q=xxx，
 *   不需要重写下拉 UI。
 */
const AssetSearch = {
  cacheKey: 'asset_search_index_v1',
  versionKey: 'asset_search_version_v1',

  _index: [],

  /**
   * 确保本地索引存在且为最新版本
   * 失败时不抛异常，不阻塞页面
   */
  async ensureIndex() {
    try {
      let version = null;
      try {
        const liveRes = await Api.getAssetLiveState();
        if (liveRes && liveRes.data && liveRes.data.asset_version) {
          version = String(liveRes.data.asset_version);
        }
      } catch (e) {
        console.warn('获取 asset_version 失败，将直接拉取搜索索引', e);
      }

      // 版本一致 → 使用缓存
      if (version) {
        try {
          const cachedVersion = localStorage.getItem(this.versionKey);
          if (cachedVersion === version) {
            const cached = localStorage.getItem(this.cacheKey);
            if (cached) {
              this._index = JSON.parse(cached);
              return;
            }
          }
        } catch (e) {
          console.warn('读取搜索索引缓存失败，将重新请求', e);
        }
      }

      // 版本不一致或无缓存 → 请求新索引
      try {
        const res = await Api.getAssetSearchIndex();
        this._index = Array.isArray(res.data) ? res.data : [];
      } catch (e) {
        console.warn('搜索索引接口请求失败，搜索建议暂不可用', e);
        this._index = this._index || [];
      }

      // 写入缓存
      if (version) {
        try {
          localStorage.setItem(this.versionKey, version);
          localStorage.setItem(this.cacheKey, JSON.stringify(this._index));
        } catch (e) {
          console.warn('localStorage 写入失败，使用内存缓存', e);
        }
      }
    } catch (e) {
      console.warn('搜索索引初始化失败，搜索建议暂不可用', e);
      this._index = this._index || [];
    }
  },

  /**
   * 标准化字符串 — 小写、去空格、兼容 null/undefined
   */
  normalize(v) {
    if (v == null) return '';
    return String(v).toLowerCase().trim().replace(/\s+/g, '');
  },

  /**
   * 本地搜索匹配
   * @param {string} query 用户输入
   * @param {object} filters { status?, category_id? }
   * @param {number} limit 最多返回条数
   */
  search(query, filters = {}, limit = 5) {
    const q = this.normalize(query);
    if (!q) return [];
    if (!this._index.length) return [];

    let candidates = this._index;

    // 状态筛选：空字符串或空值视为"全部"
    if (filters.status) {
      candidates = candidates.filter(function (item) {
        return item.status === filters.status;
      });
    }

    // 业务分类筛选
    if (filters.category_id) {
      candidates = candidates.filter(function (item) {
        return String(item.category_id) === String(filters.category_id);
      });
    }

    // 打分 + 过滤
    var self = this;
    var scored = [];
    for (var i = 0; i < candidates.length; i++) {
      var s = self.score(candidates[i], q);
      if (s > 0) {
        scored.push({ item: candidates[i], score: s });
      }
    }

    // 排序：分数降序 → 名称短优先 → 编号短优先 → id 字典序兜底
    scored.sort(function (a, b) {
      if (a.score !== b.score) return b.score - a.score;
      var nameLen = a.item.name.length - b.item.name.length;
      if (nameLen !== 0) return nameLen;
      var codeLen = a.item.asset_code.length - b.item.asset_code.length;
      if (codeLen !== 0) return codeLen;
      var idA = String(a.item.id);
      var idB = String(b.item.id);
      if (idA < idB) return -1;
      if (idA > idB) return 1;
      return 0;
    });

    return scored.slice(0, limit).map(function (s) { return s.item; });
  },

  /**
   * 单条匹配打分
   */
  score(item, q) {
    var name = this.normalize(item.name);
    var code = this.normalize(item.asset_code);
    var pyFull = this.normalize(item.pinyin_full);
    var pyInit = this.normalize(item.pinyin_initials);

    if (name === q) return 1000;
    if (name.indexOf(q) === 0) return 900;
    if (name.indexOf(q) !== -1) return 800;
    if (code === q) return 760;
    if (code.indexOf(q) === 0) return 720;
    if (code.indexOf(q) !== -1) return 680;
    if (pyFull.indexOf(q) === 0) return 600;
    if (pyInit.indexOf(q) === 0) return 580;
    if (pyFull.indexOf(q) !== -1) return 500;
    if (pyInit.indexOf(q) !== -1) return 480;
    return 0;
  },
};
