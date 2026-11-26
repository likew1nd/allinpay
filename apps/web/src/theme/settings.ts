/** Default theme settings */
export const themeSettings: App.Theme.ThemeSetting = {
  themeScheme: 'light',
  motionPreference: 'full',
  grayscale: false,
  colourWeakness: false,
  recommendColor: false,
  themeColor: '#007aff',
  otherColor: {
    info: '#007aff',
    success: '#0066cc',
    warning: '#926100',
    error: '#d70015'
  },
  isInfoFollowPrimary: true,
  layout: {
    mode: 'vertical',
    scrollMode: 'content',
    reverseHorizontalMix: false
  },
  page: {
    animateMode: 'fade-slide',
    autoRefreshSeconds: 5
  },
  header: {
    height: 66,
    breadcrumb: {
      visible: true,
      showIcon: false
    },
    multilingual: {
      visible: false
    },
    globalSearch: {
      visible: true
    }
  },
  tab: {
    visible: false,
    cache: true,
    height: 44,
    mode: 'chrome'
  },
  fixedHeaderAndTab: true,
  sider: {
    inverted: false,
    width: 212,
    collapsedWidth: 64,
    mixWidth: 90,
    mixCollapsedWidth: 64,
    mixChildMenuWidth: 200
  },
  footer: {
    visible: false,
    fixed: false,
    height: 48,
    right: true
  },
  watermark: {
    visible: false,
    text: '森林科技',
    enableUserName: false
  },
  tokens: {
    light: {
      colors: {
        container: 'rgb(255, 255, 255)',
        layout: 'rgb(239, 246, 255)',
        inverted: 'rgb(25, 48, 79)',
        'base-text': 'rgb(51, 65, 85)'
      },
      boxShadow: {
        header: '0 1px 2px rgb(29, 29, 31, 0.06)',
        sider: '2px 0 8px 0 rgb(29, 29, 31, 0.05)',
        tab: '0 1px 2px rgb(29, 29, 31, 0.05)'
      }
    },
    dark: {
      colors: {
        container: 'rgb(23, 37, 58)',
        layout: 'rgb(15, 27, 45)',
        'base-text': 'rgb(219, 231, 247)'
      }
    }
  }
};

/**
 * Override theme settings
 *
 * If publish new version, use `overrideThemeSettings` to override certain theme settings
 */
export const overrideThemeSettings: Partial<App.Theme.ThemeSetting> = {
  themeColor: themeSettings.themeColor,
  tokens: themeSettings.tokens,
  header: themeSettings.header,
  sider: themeSettings.sider,
  tab: themeSettings.tab,
  footer: themeSettings.footer
};
