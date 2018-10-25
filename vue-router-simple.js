const fixHash = () => {
    if (!location.hash) {
      location.hash = '/';
    }
  }
  
  const removeHash = (route) => {
    let url = location.href.split('#')[1]
    if (url) {
      route.current = url;
      history.replaceState({}, null, url)
    }
  }
  
  const getHash = () => {
    return window.location.hash.slice(1) || '/';
  }
  
  const RouterHistory = function (mode) {
    this.current = null;
    
  }
  
  const Router = function (options) {
    this.routes = options.routes;
    this.mode = options.mode || 'hash';
    this.route = Object.create(null),
    this.routerMap = createMap(this.routes)
    this.history = new RouterHistory();
    this.init();
  }
  Router.prototype.push = function (options) {
  
    this.history.current = options.path;
  
    if (this.mode === 'history') {
      history.pushState({
        path: options.path
      }, null, options.path);
    } else if (this.mode === 'hash') {
      location.hash = options.path;
    }
    this.route.params = {
      ...options.params
    }
  
  }
  
  Router.prototype.replace = function (options) {

    this.history.current = options.path;
  
    if (this.mode === 'history') {
      history.replaceState({
        path: options.path
      }, null, options.path);
    } else if (this.mode === 'hash') {
      location.replace(`#${options.path}`)
    }
    this.route.params = {
      ...options.params
    }
  
  }
  Router.prototype.init = function () {
  
    if (this.mode === 'hash') {
      fixHash()
      window.addEventListener('hashchange', () => {
        this.history.current = getHash();
  
      })
  
      window.addEventListener('load', () => {
        this.history.current = getHash();
      })
  
    }
  
    if (this.mode === 'history') {
      removeHash(this);
      window.addEventListener('load', () => {
        this.history.current = location.pathname;
      })
  
      window.addEventListener('popstate', (e) => {
        if (e.state) {
          this.history.current = e.state.path;
        }
      })
    }
  
  }
  
  const createMap = (routes) => {
    let resMap = Object.create(null);
    routes.forEach(route => {
      resMap[route['path']] = route['component'];
    })
    return resMap;
  
  }
  const install = function (Vue) {
  
    if (this._Vue) {
      return;
    };
    Vue.mixin({
      beforeCreate() {
        if (this.$options && this.$options.router) {
          this._routerRoot = this;
          this._router = this.$options.router;
          Vue.util.defineReactive(this, '_routeHistory', this._router.history)
        } else {
          this._routerRoot = (this.$parent && this.$parent._routerRoot) || this
        }
        Object.defineProperty(this, '$router', {
          get() {
            return this._routerRoot._router;
          }
        })
  
        Object.defineProperty(this, '$route', {
          get() {
            return {
              current: this._routerRoot._routeHistory.current,
              ...this._routerRoot._router.route
            };
          }
        })
  
      }
  
    });
  
  
  
    Vue.component('router-view', {
  
      render(h) {
        let routerMap = this._self.$router.routerMap;
        return h(routerMap[this._self.$route.current])
      }
    })
  
    Vue.component('router-link', {
        
      props: {
        to: String,
        tag: String,
      },
  
      render(h) {
        let mode = this._self.$router.mode;
        let tag = this.tag || 'a';
        let routerHistory = this._self.$router.history;
        return h(tag, {
          attrs: tag === 'a' ? {
            href: mode === 'hash' ? '#' + this.to : this.to,
  
          } : {},
          on: {
            click: (e) => {
  
              if (this.to === routerHistory.current) {
                e.preventDefault();
                return;
              }
  
              routerHistory.current = this.to;
  
              switch (mode) {
                case 'hash':
                  if (tag === 'a') return;
                  location.hash = this.to;
                  break;
  
                case 'history':
                  history.pushState({
                    path: this.to
                  }, null, this.to);
                  break;
  
                default:
  
              }
              e.preventDefault();
  
            }
          },
          style: {
            cursor: 'pointer'
          }
        }, this.$slots.default)
      }
    })
    this._Vue = Vue;
  }
  
  export default {
    Router,
    install
  }
  
