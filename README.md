
本文旨在介绍`vue-router`的实现思路，并动手实现一个简化版的`vue-router`。我们先来看一下一般项目中对`vue-router`最基本的一个使用，可以看到，这里定义了四个路由组件,我们只要在根`vue`实例中注入该`router`对象就可以使用了.
```javascript
import VueRouter from 'vue-router';
import Home from '@/components/Home';
import A from '@/components/A';
import B from '@/components/B'
import C from '@/components/C'

Vue.use(VueRouter)

export default new VueRouter.Router({
  // mode: 'history',
  routes: [
    {
      path: '/',
      component: Home
    },
    {
      path: '/a',
      component: A
    },
    {
      path: '/b',
      component: B
    },
    {
      path: '/c',
      component: C
    }
  ]
})
```
`vue-router`提供两个全局组件，`router-view`和`router-link`，前者是用于路由组件的占位，后者用于点击时跳转到指定路由。此外组件内部可以通过`this.$router.push`,`this.$rouer.replace`等api实现路由跳转。本文将实现上述两个全局组件以及`push`和`replace`两个api，调用的时候支持`params`传参，并且支持`hash`和`history`两种模式，忽略其余api、嵌套路由、异步路由、`abstract`路由以及导航守卫等高级功能的实现，这样有助于理解`vue-router`的核心原理。本文的最终代码不建议在生产环境使用，只做一个学习用途，下面我们就来一步步实现它。

### install实现
任何一个`vue`插件都要实现一个`install`方法，通过`Vue.use`调用插件的时候就是在调用插件的`install`方法，那么路由的`install`要做哪些事情呢？首先我们知道 我们会用`new`关键字生成一个`router`实例，就像前面的代码实例一样，然后将其挂载到根`vue`实例上，那么作为一个全局路由，我们当然需要在各个组件中都可以拿到这个`router`实例。另外我们使用了全局组件`router-view`和`router-link`，由于`install`会接收到`Vue`构造函数作为实参，方便我们调用`Vue.component`来注册全局组件。因此，在`install`中主要就做两件事，给各个组件都挂载`router`实例，以及实现`router-view`和`router-link`两个全局组件。下面是代码：
```javascript
const install = (Vue) => {

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
    render(h) { ... }
  })

  Vue.component('router-link', {    
    props: {
      to: String,
      tag: String,
    },
    render(h) { ... }
  })
  this._Vue = Vue;
}
```
这里的`this`代表的就是`vue-router`对象，它有两个属性暴露出来供外界调用，一个是`install`，一个是`Router`构造函数，这样可以保证插件的正确安装以及路由实例化。我们先忽略`Router`构造函数，来看`install`，上面代码中的`this._Vue`是个开始没有定义的属性，他的目的是防止多次安装。我们使用`Vue.mixin`对每个组件的`beforeCreate`钩子做全局混入，目的是让每个组件实例共享`router`实例，即通过`this.$router`拿到路由实例，通过`this.$route`拿到路由状态。需要重点关注的是这行代码：
```javascript
Vue.util.defineReactive(this, '_routeHistory', this._router.history)
```

这行代码利用`vue`的响应式原理，对根`vue`实例注册了一个`_routeHistory`属性，指向路由实例的`history`对象，这样`history`也变成了响应式的。因此一旦路由的`history`发生变化，用到这个值的组件就会触发`render`函数重新渲染，这里的组件就是`router-view`。从这里可以窥察到`vue-router`实现的一个基本思路。上述的代码中对于两个全局组件的`render`函数的实现，因为会依赖于`router`对象，我们先放一放，稍后再来实现它们，下面我们分析一下`Router`构造函数。

### Router构造函数

经过刚才的分析，我们知道`router`实例需要有一个`history`对象，需要一个保存当前路由状态的对象`route`，另外很显然还需要接受路由配置表`routes`，根据`routes`需要一个路由映射表`routerMap`来实现组件搜索，还需要一个变量`mode`判断是什么模式下的路由，需要实现`push`和`replace`两个api，代码如下：
```javascript
const Router = function (options) {
  this.routes = options.routes; // 存放路由配置
  this.mode = options.mode || 'hash';
  this.route = Object.create(null), // 生成路由状态
  this.routerMap = createMap(this.routes) // 生成路由表
  this.history = new RouterHistory(); // 实例化路由历史对象
  this.init(); // 初始化
}

Router.prototype.push = (options) => { ... }

Router.prototype.replace = (options) => { ... }

Router.prototype.init = () => { ... }
```

我们看一下路由表`routerMap`的实现，由于不考虑嵌套等其他情况，实现很简单，如下：

```javascript
const createMap = (routes) => {
  let resMap = Object.create(null);
  routes.forEach(route => {
    resMap[route['path']] = route['component'];
  })
  return resMap;
}
```

`RouterHistory`的实现也很简单，根据前面分析，我们只需要一个`current`属性就可以，如下：

```javascript
const RouterHistory = function (mode) {
  this.current = null; 
}
```

有了路由表和`history`，`router-view`的实现就很容易了，如下：
```javascript
Vue.component('router-view', {
    render(h) {
      let routerMap = this._self.$router.routerMap;
      return h(routerMap[this._self.$route.current])
    }
  })
```
这里的`this`是一个`renderProxy`实例，他有一个属性`_self`可以拿到当前的组件实例，进而访问到`routerMap`，可以看到路由实例`history`的`current`本质上就是我们配置的路由表中的`path`。

接下来我们看一下`Router`要做哪些初始化工作。对于`hash`路由而言，url上`hash`值的改变不会引起页面刷新，但是可以触发一个`hashchange`事件。由于路由`history.current`初始为`null`，因此匹配不到任何一个路由，所以会导致页面刷新加载不出任何路由组件。基于这两点，在`init`方法中，我们需要实现对页面加载完成的监听，以及`hash`变化的监听。对于`history`路由，为了实现浏览器前进后退时准确渲染对应组件，还要监听一个`popstate`事件。代码如下:
```javascript
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
```
当启用`hash`模式的时候，我们要检测url上是否存在`hash`值，没有的话强制赋值一个默认`path`，`hash`路由时会根据`hash`值作为`key`来查找路由表。`fixHash`和`getHash`实现如下：
```javascript
const fixHash = () => {
  if (!location.hash) {
    location.hash = '/';
  }
}
const getHash = () => {
  return location.hash.slice(1) || '/';
}
```
这样在刷新页面和`hash`改变的时候，`current`可以得到赋值和更新，页面能根据`hash`值准确渲染路由。`history`模式也是一样的道理，只是它通过`location.pathname`作为`key`搜索路由组件，另外`history`模式需要去除url上可能存在的`hash`,`removeHash`实现如下：

```javascript
const removeHash = (route) => {
  let url = location.href.split('#')[1]
  if (url) {
    route.current = url;
    history.replaceState({}, null, url)
  }
}
```
我们可以看到当浏览器后退的时候，`history`模式会触发`popstate`事件，这个时候是通过`state`状态去获取`path`的，那么`state`状态从哪里来呢，答案是从`window.history`对象的`pushState`和`replaceState`而来，这两个方法正好可以用来实现`router`的`push`方法和`replace`方法，我们看一下这里它们的实现：

```javascript
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
```

`pushState`和`replaceState`能够实现改变url的值但不引起页面刷新，从而不会导致新请求发生，`pushState`会生成一条历史记录而`replaceState`不会，后者只是替换当前url。在这两个方法执行的时候将`path`存入`state`，这就使得`popstate`触发的时候可以拿到路径从而触发组件渲染了。我们在组件内按照如下方式调用，会将`params`写入`router`实例的`route`属性中，从而在跳转后的组件`B`内通过`this.$route.params`可以访问到传参。
```javascript
 this.$router.push({
    path: '/b',
    params: {
      id: 55
    }
 });

```

### router-link实现
`router-view`的实现很简单，前面已经说过。最后，我们来看一下`router-link`的实现,先放上代码：
```javascript
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
```

`router-link`可以接受两个属性，`to`表示要跳转的路由路径，`tag`表示`router-link`要渲染的标签名，默认为标签。如果是`a`标签，我们为其添加一个`href`属性。我们给标签绑定`click`事件，如果检测到本次跳转为当前路由的话什么都不做直接返回，并且阻止默认行为，否者根据`to`更换路由。`hash`模式下并且是`a`标签时候可以直接利用浏览器的默认行为完成url上`hash`的替换，否者重新为`location.hash`赋值。`history`模式下则利用`pushState`去更新url。







