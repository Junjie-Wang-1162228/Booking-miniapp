export default defineAppConfig({
  cloud: true,
  pages: ['pages/classes/index', 'pages/bookings/index', 'pages/profile/index', 'pages/class-detail/index', 'pages/ops/index'],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#111111',
    navigationBarTitleText: '真知格斗',
    navigationBarTextStyle: 'white',
    backgroundColor: '#111111'
  },
  tabBar: {
    color: '#8f8f8f',
    selectedColor: '#e31b23',
    backgroundColor: '#111111',
    borderStyle: 'black',
    list: [
      {
        pagePath: 'pages/classes/index',
        text: '约课',
        iconPath: 'assets/tabs/classes.png',
        selectedIconPath: 'assets/tabs/classes-active.png'
      },
      {
        pagePath: 'pages/bookings/index',
        text: '预约',
        iconPath: 'assets/tabs/bookings.png',
        selectedIconPath: 'assets/tabs/bookings-active.png'
      },
      {
        pagePath: 'pages/profile/index',
        text: '账户',
        iconPath: 'assets/tabs/profile.png',
        selectedIconPath: 'assets/tabs/profile-active.png'
      }
    ]
  }
} as unknown as Parameters<typeof defineAppConfig>[0]);
