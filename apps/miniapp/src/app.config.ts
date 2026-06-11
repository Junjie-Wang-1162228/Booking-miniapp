export default defineAppConfig({
  pages: ['pages/classes/index', 'pages/bookings/index', 'pages/profile/index'],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#111111',
    navigationBarTitleText: '拳馆约课',
    navigationBarTextStyle: 'white',
    backgroundColor: '#111111'
  },
  tabBar: {
    color: '#8f8f8f',
    selectedColor: '#e73535',
    backgroundColor: '#111111',
    borderStyle: 'black',
    list: [
      { pagePath: 'pages/classes/index', text: '约课' },
      { pagePath: 'pages/bookings/index', text: '我的' },
      { pagePath: 'pages/profile/index', text: '账户' }
    ]
  }
});
