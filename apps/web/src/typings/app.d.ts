/** The global namespace for the app */
declare namespace App {
  /** Theme namespace */
  namespace Theme {
    type ColorPaletteNumber = import('@sa/color').ColorPaletteNumber;

    /** Theme setting */
    interface ThemeSetting {
      /** Theme scheme */
      themeScheme: UnionKey.ThemeScheme;
      /** 界面动效偏好，与系统设置一起保存 */
      motionPreference: UnionKey.MotionPreference;
      /** grayscale mode */
      grayscale: boolean;
      /** colour weakness mode */
      colourWeakness: boolean;
      /** Whether to recommend color */
      recommendColor: boolean;
      /** Theme color */
      themeColor: string;
      /** Other color */
      otherColor: OtherColor;
      /** Whether info color is followed by the primary color */
      isInfoFollowPrimary: boolean;
      /** Layout */
      layout: {
        /** Layout mode */
        mode: UnionKey.ThemeLayoutMode;
        /** Scroll mode */
        scrollMode: UnionKey.ThemeScrollMode;
        /**
         * Whether to reverse the horizontal mix
         *
         * if true, the vertical child level menus in left and horizontal first level menus in top
         */
        reverseHorizontalMix: boolean;
      };
      /** Page */
      page: {
        /** Page animate mode */
        animateMode: UnionKey.ThemePageAnimateMode;
        /** 全局自动刷新间隔（秒） */
        autoRefreshSeconds: 3 | 5 | 10;
      };
      /** Header */
      header: {
        /** Header height */
        height: number;
        /** Header breadcrumb */
        breadcrumb: {
          /** Whether to show the breadcrumb */
          visible: boolean;
          /** Whether to show the breadcrumb icon */
          showIcon: boolean;
        };
        /** Multilingual */
        multilingual: {
          /** Whether to show the multilingual */
          visible: boolean;
        };
        /** Global search */
        globalSearch: {
          /** Whether to show the global search */
          visible: boolean;
        };
      };
      /** Tab */
      tab: {
        /** Whether to show the tab */
        visible: boolean;
        /**
         * Whether to cache the tab
         *
         * If cache, the tabs will get from the local storage when the page is refreshed
         */
        cache: boolean;
        /** Tab height */
        height: number;
        /** Tab mode */
        mode: UnionKey.ThemeTabMode;
      };
      /** Fixed header and tab */
      fixedHeaderAndTab: boolean;
      /** Sider */
      sider: {
        /** Inverted sider */
        inverted: boolean;
        /** Sider width */
        width: number;
        /** Collapsed sider width */
        collapsedWidth: number;
        /** Sider width when the layout is 'vertical-mix' or 'horizontal-mix' */
        mixWidth: number;
        /** Collapsed sider width when the layout is 'vertical-mix' or 'horizontal-mix' */
        mixCollapsedWidth: number;
        /** Child menu width when the layout is 'vertical-mix' or 'horizontal-mix' */
        mixChildMenuWidth: number;
      };
      /** Footer */
      footer: {
        /** Whether to show the footer */
        visible: boolean;
        /** Whether fixed the footer */
        fixed: boolean;
        /** Footer height */
        height: number;
        /** Whether float the footer to the right when the layout is 'horizontal-mix' */
        right: boolean;
      };
      /** Watermark */
      watermark: {
        /** Whether to show the watermark */
        visible: boolean;
        /** Watermark text */
        text: string;
        /** Whether to use user name as watermark text */
        enableUserName: boolean;
      };
      /** define some theme settings tokens, will transform to css variables */
      tokens: {
        light: ThemeSettingToken;
        dark?: {
          [K in keyof ThemeSettingToken]?: Partial<ThemeSettingToken[K]>;
        };
      };
    }

    interface OtherColor {
      info: string;
      success: string;
      warning: string;
      error: string;
    }

    interface ThemeColor extends OtherColor {
      primary: string;
    }

    type ThemeColorKey = keyof ThemeColor;

    type ThemePaletteColor = {
      [key in ThemeColorKey | `${ThemeColorKey}-${ColorPaletteNumber}`]: string;
    };

    type BaseToken = Record<string, Record<string, string>>;

    interface ThemeSettingTokenColor {
      /** the progress bar color, if not set, will use the primary color */
      nprogress?: string;
      container: string;
      layout: string;
      inverted: string;
      'base-text': string;
    }

    interface ThemeSettingTokenBoxShadow {
      header: string;
      sider: string;
      tab: string;
    }

    interface ThemeSettingToken {
      colors: ThemeSettingTokenColor;
      boxShadow: ThemeSettingTokenBoxShadow;
    }

    type ThemeTokenColor = ThemePaletteColor & ThemeSettingTokenColor;

    /** Theme token CSS variables */
    type ThemeTokenCSSVars = {
      colors: ThemeTokenColor & { [key: string]: string };
      boxShadow: ThemeSettingTokenBoxShadow & { [key: string]: string };
    };
  }

  /** Global namespace */
  namespace Global {
    type VNode = import('vue').VNode;
    type RouteLocationNormalizedLoaded = import('vue-router').RouteLocationNormalizedLoaded;
    type RouteKey = import('@elegant-router/types').RouteKey;
    type RouteMap = import('@elegant-router/types').RouteMap;
    type RoutePath = import('@elegant-router/types').RoutePath;
    type LastLevelRouteKey = import('@elegant-router/types').LastLevelRouteKey;

    /** The global header props */
    interface HeaderProps {
      /** Whether to show the logo */
      showLogo?: boolean;
      /** Whether to show the menu toggler */
      showMenuToggler?: boolean;
      /** Whether to show the menu */
      showMenu?: boolean;
    }

    /** The global menu */
    type Menu = {
      /**
       * The menu key
       *
       * Equal to the route key
       */
      key: string;
      /** The menu label */
      label: string;
      /** The menu i18n key */
      i18nKey?: I18n.I18nKey | null;
      /** The route key */
      routeKey: RouteKey;
      /** The route path */
      routePath: RoutePath;
      /** The menu icon */
      icon?: () => VNode;
      /** The menu children */
      children?: Menu[];
    };

    type Breadcrumb = Omit<Menu, 'children'> & {
      options?: Breadcrumb[];
    };

    /** Tab route */
    type TabRoute = Pick<RouteLocationNormalizedLoaded, 'name' | 'path' | 'meta'> &
      Partial<Pick<RouteLocationNormalizedLoaded, 'fullPath' | 'query' | 'matched'>>;

    /** The global tab */
    type Tab = {
      /** The tab id */
      id: string;
      /** The tab label */
      label: string;
      /**
       * The new tab label
       *
       * If set, the tab label will be replaced by this value
       */
      newLabel?: string;
      /**
       * The old tab label
       *
       * when reset the tab label, the tab label will be replaced by this value
       */
      oldLabel?: string;
      /** The tab route key */
      routeKey: LastLevelRouteKey;
      /** The tab route path */
      routePath: RouteMap[LastLevelRouteKey];
      /** The tab route full path */
      fullPath: string;
      /** The tab fixed index */
      fixedIndex?: number | null;
      /**
       * Tab icon
       *
       * Iconify icon
       */
      icon?: string;
      /**
       * Tab local icon
       *
       * Local icon
       */
      localIcon?: string;
      /** I18n key */
      i18nKey?: I18n.I18nKey | null;
    };

    /** Form rule */
    type FormRule = import('element-plus').FormItemRule;

    /** The global dropdown key */
    type DropdownKey = 'closeCurrent' | 'closeOther' | 'closeLeft' | 'closeRight' | 'closeAll';
  }

  /**
   * I18n namespace
   *
   * Locales type
   */
  namespace I18n {
    type RouteKey = import('@elegant-router/types').RouteKey;

    type LangType = 'en-US' | 'zh-CN';

    type LangOption = {
      label: string;
      key: LangType;
    };

    type I18nRouteKey = Exclude<RouteKey, 'root' | 'not-found'>;

    type FormMsg = {
      required: string;
      invalid: string;
    };

    type Schema = {
      system: {
        title: string;
        updateTitle: string;
        updateContent: string;
        updateConfirm: string;
        updateCancel: string;
      };
      common: {
        action: string;
        add: string;
        addSuccess: string;
        back: string;
        backToHome: string;
        batchDelete: string;
        cancel: string;
        close: string;
        check: string;
        expandColumn: string;
        columnSetting: string;
        config: string;
        confirm: string;
        delete: string;
        deleteSuccess: string;
        confirmDelete: string;
        edit: string;
        warning: string;
        error: string;
        index: string;
        keywordSearch: string;
        moreFilters: string;
        collapseFilters: string;
        selectedFilters: string;
        logout: string;
        logoutConfirm: string;
        lookForward: string;
        modify: string;
        modifySuccess: string;
        noData: string;
        operate: string;
        pleaseCheckValue: string;
        refresh: string;
        reset: string;
        search: string;
        switch: string;
        tip: string;
        trigger: string;
        update: string;
        updateSuccess: string;
        yesOrNo: {
          yes: string;
          no: string;
        };
      };
      request: {
        logout: string;
        logoutMsg: string;
        logoutWithModal: string;
        logoutWithModalMsg: string;
        refreshToken: string;
        tokenExpired: string;
      };
      theme: {
        themeSchema: { title: string } & Record<UnionKey.ThemeScheme, string>;
        grayscale: string;
        colourWeakness: string;
        layoutMode: { title: string; reverseHorizontalMix: string } & Record<UnionKey.ThemeLayoutMode, string>;
        recommendColor: string;
        recommendColorDesc: string;
        themeColor: {
          title: string;
          followPrimary: string;
        } & Record<Theme.ThemeColorKey, string>;
        scrollMode: { title: string } & Record<UnionKey.ThemeScrollMode, string>;
        page: {
          animate: string;
          autoRefresh: string;
          refreshSeconds: string;
          mode: { title: string } & Record<UnionKey.ThemePageAnimateMode, string>;
        };
        fixedHeaderAndTab: string;
        header: {
          height: string;
          breadcrumb: {
            visible: string;
            showIcon: string;
          };
          multilingual: {
            visible: string;
          };
          globalSearch: {
            visible: string;
          };
        };
        tab: {
          visible: string;
          cache: string;
          height: string;
          mode: { title: string } & Record<UnionKey.ThemeTabMode, string>;
        };
        sider: {

          width: string;
          collapsedWidth: string;
          mixWidth: string;
          mixCollapsedWidth: string;
          mixChildMenuWidth: string;
        };
        footer: {
          visible: string;
          fixed: string;
          height: string;
          right: string;
        };
        watermark: {
          visible: string;
          text: string;
          enableUserName: string;
        };
        motion: {
          title: string;
          hint: string;
          full: string;
          fullDescription: string;

          reduced: string;
          reducedDescription: string;
          activeFull: string;
          activeReduced: string;
        };
        themeDrawerTitle: string;
        pageFunTitle: string;
        configOperation: {
          saveConfig: string;
          saveHint: string;
          saveSuccessMsg: string;
          saveErrorMsg: string;
          resetConfig: string;
          resetSuccessMsg: string;
        };
      };
      route: Record<string, string>;
      page: {
        scriptSettings: {
          monitorDescription: string;
          pollingMode: string;
          serialPolling: string;
          concurrentPolling: string;
          concurrentEnvironments: string;
          concurrencyRange: string;
          concurrencyHint: string;
          loginTitle: string;
          loginMaxAttempts: string;
          loginTimeoutMinutes: string;
          loginTimeoutHint: string;
          loginCooldownMinutes: string;
          loginCooldownHint: string;
          loginCooldownRange: string;
          loginRetryHint: string;
          environmentSyncMinutes: string;
          environmentSyncHint: string;
          environmentSyncRange: string;
          balanceFreshMinutes: string;
          balanceFreshHint: string;
          balanceFreshRange: string;
          qrWaitMinutes: string;
          qrWaitHint: string;
          qrWaitRange: string;
          sliderOffsetPx: string;
          sliderOffsetHint: string;
          captchaTitle: string;
          captchaProvider: string;
          captchaNone: string;
          captchaTtshitu: string;
          captchaUsername: string;
          captchaPassword: string;
          captchaRequired: string;
          loadFailed: string;
          tab3Url: string;
        };
        collector: {
          columnLabel: string;
          state: string;
          runtimeShort: string;
          loginShort: string;
          accountShort: string;
          associationShort: string;
          associated: string;
          unassociated: string;
          associatedSites: string;
          channelCode: string;
          channelName: string;
          quota: string;
          paymentPassword: string;
          paymentPasswordKeep: string;
          paymentPasswordHint: string;
          editAccount: string;
          loginAccount: string;
          loginPassword: string;
          appId: string;
          appIdsHint: string;
          batchRefreshAppIds: string;
          appIdsRefreshQueued: string;
          passwordKeep: string;
          passwordHint: string;
          credentialsHint: string;
          credentialsSaved: string;
          credentialsFailed: string;
          credentialsRetry: string;
          credentialsTooLong: string;
          add: string;
          edit: string;
          name: string;
          endpoint: string;
          endpointInvalid: string;
          apiKey: string;
          keyHint: string;
          keyKeep: string;
          saved: string;
          environmentCount: string;
          environmentStatisticsScope: string;
          linkedEnvironmentCount: string;
          abnormal: string;
          accountStatus: string;
          money: string;
          connection: string;
          online: string;
          offline: string;
          error: string;
          normal: string;
          restricted: string;
          judicial: string;
          unknown: string;
          available: string;
          unavailable: string;
          pending: string;
          partial: string;
          details: string;
          sync: string;
          syncing: string;
          deleteTitle: string;
          deleteConfirm: string;
          deleted: string;
          back: string;
          environments: string;
          detailsDescription: string;
          profileNo: string;
          group: string;
          profileName: string;
          environment: string;
          receiptPayment: string;
          receiptLimit: string;
          paymentLimit: string;
          unlimited: string;
          restrictionImage: string;
          judicialImage: string;
          evidenceLoading: string;
          evidenceFailed: string;
          lastSync: string;
          accountDetails: string;
          monitoringLogs: string;
          monitoringLogsHint: string;
          monitoringLogsEmpty: string;
          monitoringLogsFailed: string;
          lastSeen: string;
          errorDetail: string;
          keyword: string;
          environmentKeyword: string;
          staleHint: string;
          loginState: string;
          loginHealthy: string;
          loginDegraded: string;
          loginAuthExpired: string;
          loginPasswordRejected: string;
          loginCaptcha: string;
          loginEnvUnavailable: string;
          runtimeState: string;
          runtimeRunning: string;
          runtimeError: string;
          runtimePendingLogin: string;
          runtimeIdle: string;
          monitoring: string;
          monitoringOn: string;
          monitoringOff: string;
          mode: string;
          modeOff: string;
          modeMonitor: string;
          modeTransfer: string;
          modeOffHint: string;
          modeMonitorHint: string;
          modeTransferHint: string;
          modeInvalid: string;
          modeInvalidHint: string;
          modePausedHint: string;
          modePermissionHint: string;
          batchModeMixed: string;
          batchUpdated: string;
          batchModePartial: string;
          selectedCount: string;
          clearSelection: string;
        };
        site: {
          siteColumn: string;
          dataStatus: string;
          waitingData: string;
          staleData: string;
          freshData: string;
          channelCount: string;
          groupCount: string;
          orderCount: string;
          dataListHint: string;
          backToSites: string;
          channelManagement: string;
          orderManagement: string;
          noRateSamples: string;
          amountHint: string;
          metricDefinition: string;
          tableStructure: string;
          dataStale: string;
          dataFresh: string;
          waitingSync: string;
          coverage: string;
          channels: string;
          pollingGroups: string;
          orders: string;
          code: string;
          paymentType: string;
          plugin: string;
          effectiveStatus: string;
          enabled: string;
          disabled: string;
          unavailable: string;
          dayStatus: string;
          channelEnabled: string;
          members: string;
          mode: string;
          sequential: string;
          weighted: string;
          firstAvailable: string;
          weight: string;
          position: string;
          orderId: string;
          merchantId: string;
          channelCode: string;
          subchannelCode: string;
          amount: string;
          orderFilters: {
            site: string;
            allSites: string;
            orderId: string;
            orderIdPlaceholder: string;
            merchantId: string;
            merchantIdPlaceholder: string;
            amount: string;
            allStatuses: string;
            amountSummary: string;
            createdFrom: string;
            createdTo: string;
            more: string;
            collapse: string;
            minAmount: string;
            maxAmount: string;
            rangeSeparator: string;
            invalidAmount: string;
            invalidRange: string;
          };
          realAmount: string;
          sourceStatus: string;
          orderStatus: string;
          paymentStatus: string;
          paymentStatuses: Record<'unpaid' | 'paid' | 'refunded' | 'frozen' | 'preauthorized' | 'unknown', string>;
          success: string;
          failed: string;
          processing: string;
          excluded: string;
          occurredAt: string;
          paidAt: string;
          dateRange: string;
          successRate: string;
          failureRate: string;
          successAmount: string;
          syncHistory: string;
          syncRunning: string;
          syncSuccess: string;
          syncFailed: string;
          syncCount: string;
          syncStarted: string;
          syncCompleted: string;
          statistics: string;
          siteTotal: string;
          onlineCount: string;
          offlineCount: string;
          connectionAttention: string;
          channelDescription: string;
          channelTodayCollection: string;
          channelTotalCollection: string;
          channelOrderBreakdown: string;
          channelTodayUnavailable: string;
          orderTotalScope: string;
          pollingGroupOrderScope: string;
          channelRateMinutes: string;
          channelRateDay: string;
          channelRateFormula: string;
          unknownOrderCount: string;
          readOnlyHint: string;
          orderDetails: string;
          noSyncRows: string;
          viewData: string;
          viewChannels: string;
          viewGroups: string;
          viewOrders: string;
          title: string;
          add: string;
          edit: string;
          save: string;
          details: string;
          searchHint: string;
          name: string;
          baseUrl: string;
          dbHost: string;
          dbPort: string;
          dbName: string;
          dbUser: string;
          dbPassword: string;
          passwordHint: string;
          passwordEditPlaceholder: string;
          passwordSaved: string;
          passwordMissing: string;
          tablePrefix: string;
          prefixHint: string;
          prefixInvalid: string;
          timezone: string;
          urlInvalid: string;
          editHint: string;
          connectionStatus: string;
          structureStatus: string;
          lastHeartbeat: string;
          pending: string;
          online: string;
          offline: string;
          error: string;
          unknown: string;
          compatible: string;
          incompatible: string;
          selectSite: string;
          selectHint: string;
          loadFailed: string;
          retry: string;
          adapterVersion: string;
          siteVersion: string;
          mappingVersion: string;
          detectedPrefix: string;
          noPrefix: string;
          candidatePrefixes: string;
          compatibilityChecks: string;
          checkResult: string;
          checkPassed: string;
          checkFailed: string;
          missingTable: string;
          requiredColumns: string;
          missingColumns: string;
          structureMatched: string;
          structureMissing: string;
          structureAmbiguous: string;
          structureNotFound: string;
          lastSync: string;
          lastError: string;
          structureReport: string;
          database: string;
          checkedAt: string;
          tableName: string;
          columns: string;
          noReport: string;
          probeHint: string;
          automationStatus: string;
          automationEnabled: string;
          automationStopped: string;
          automationUpdating: string;
          automationEnable: string;
          automationStop: string;
          automationHint: string;
          automationEnableSuccess: string;
          automationStopSuccess: string;
          deleteTitle: string;
          deleteWarning: string;
          deleteConsequences: string;
          deleteSourceUnaffected: string;
          deletePasswordHint: string;
          currentPassword: string;
          currentPasswordPlaceholder: string;
          confirmDelete: string;
          connectingHint: string;
          syncingHint: string;
          connectedHint: string;
          savedConnecting: string;
          configHint: string;
          candidates: string;
          siteDetails: string;
          connectionDetails: string;
        };
        login: {
          common: {
            brandEyebrow: string;
            brandHeadlineFirst: string;
            brandHeadlineSecond: string;
            brandDescription: string;
            brandPlatformName: string;
            workspaceKicker: string;
            loginIntro: string;
            greeting: string;
            accountLabel: string;
            passwordLabel: string;
            submitLogin: string;
            rememberAccount: string;
            userNamePlaceholder: string;
            phonePlaceholder: string;
            codePlaceholder: string;
            passwordPlaceholder: string;
            confirmPasswordPlaceholder: string;
            codeLogin: string;
            confirm: string;
            back: string;
            validateSuccess: string;
            loginSuccess: string;
            welcomeBack: string;
          };
          pwdLogin: {
            title: string;
            rememberMe: string;
            forgetPassword: string;
            register: string;
            otherAccountLogin: string;
            otherLoginMode: string;
            superAdmin: string;
            admin: string;
            user: string;
          };
          codeLogin: {
            title: string;
            getCode: string;
            reGetCode: string;
            sendCodeSuccess: string;
            imageCodePlaceholder: string;
          };
          register: {
            title: string;
            agreement: string;
            protocol: string;
            policy: string;
          };
          resetPwd: {
            title: string;
          };
          bindWeChat: {
            title: string;
          };
        };
        manage: {
          common: {
            status: {
              enable: string;
              disable: string;
            };
          };
          role: {
            title: string;
            roleName: string;
            roleCode: string;
            roleStatus: string;
            roleDesc: string;
            form: {
              roleName: string;
              roleCode: string;
              roleStatus: string;
              roleDesc: string;
            };
            addRole: string;
            editRole: string;
            menuAuth: string;
            apiAuth: string;
            apiControllers: Record<
              'StrategyController' | 'SiteChannelController' | 'AccountController' | 'TelegramController' | 'MfaController' | 'TransferController' | 'SiteController' | 'RoleController' | 'MenuController' | 'AuthorizationController' | 'UserController' | 'LoginLogController' | 'EndpointController' | 'OperationLogController' | 'NotificationController',
              string
            >;
            apiResources: Record<
              'strategy' | 'adjustment' | 'site' | 'collector' | 'account' | 'account-binding' | 'fund-account' | 'settlement' | 'telegram' | 'system-setting' | 'transfer-rule' | 'transfer-request' | 'payee' | 'role' | 'route' | 'authorization' | 'user' | 'login-log' | 'api-endpoint' | 'operation-log' | 'notification',
              string
            >;
            apiActions: Record<
              'read' | 'create' | 'update' | 'delete' | 'test' | 'retry' | 'resolve' | 'cancel' | 'assign-users' | 'assign-routes' | 'assign-permission',
              string
            >;
            apiSummaries: Record<
              'Retrieve Paginated Roles' | 'Update a Role' | 'Create a New Role' | 'Delete a Role' | 'Authorized Routes' | 'Delete a Route' | 'Routes' | 'Create a New Route' | 'Update a Route' | 'Assign Users to Role' | 'Assign Routes to Role' | 'Assign Permissions to Role' | 'Update a User' | 'Retrieve Paginated Users' | 'Delete a User' | 'Create a New User' | 'Retrieve Paginated Login Logs' | 'Retrieve Paginated Api Endpoints' | 'Endpoints' | 'Authorized API-Endpoints' | 'Retrieve Paginated Operation Logs',
              string
            >;
            apiPermissionLabel: string;
            buttonAuth: string;
          };
          user: {
            title: string;
            userName: string;
            userGender: string;
            nickName: string;
            userPhone: string;
            userEmail: string;
            userStatus: string;
            userRole: string;
            form: {
              userName: string;
              userGender: string;
              nickName: string;
              userPhone: string;
              userEmail: string;
              userStatus: string;
              userRole: string;
            };
            addUser: string;
            editUser: string;
            gender: {
              male: string;
              female: string;
            };
          };
          menu: {
            home: string;
            title: string;
            id: string;
            parentId: string;
            menuType: string;
            menuName: string;
            routeName: string;
            routePath: string;
            pathParam: string;
            layout: string;
            page: string;
            i18nKey: string;
            icon: string;
            localIcon: string;
            iconTypeTitle: string;
            order: string;
            constant: string;
            keepAlive: string;
            href: string;
            hideInMenu: string;
            activeMenu: string;
            multiTab: string;
            fixedIndexInTab: string;
            query: string;
            button: string;
            buttonCode: string;
            buttonDesc: string;
            menuStatus: string;
            form: {
              home: string;
              menuType: string;
              menuName: string;
              routeName: string;
              routePath: string;
              pathParam: string;
              layout: string;
              page: string;
              i18nKey: string;
              icon: string;
              localIcon: string;
              order: string;
              keepAlive: string;
              href: string;
              hideInMenu: string;
              activeMenu: string;
              multiTab: string;
              fixedInTab: string;
              fixedIndexInTab: string;
              queryKey: string;
              queryValue: string;
              button: string;
              buttonCode: string;
              buttonDesc: string;
              menuStatus: string;
            };
            addMenu: string;
            editMenu: string;
            addChildMenu: string;
            type: {
              directory: string;
              menu: string;
            };
            iconType: {
              iconify: string;
              local: string;
            };
          };
        };
      };
      form: {
        required: string;
        userName: FormMsg;
        phone: FormMsg;
        pwd: FormMsg;
        confirmPwd: FormMsg;
        code: FormMsg;
        email: FormMsg;
      };
      dropdown: Record<Global.DropdownKey, string>;
      icon: {
        themeConfig: string;
        themeSchema: string;
        lang: string;
        fullscreen: string;
        fullscreenExit: string;
        reload: string;
        collapse: string;
        expand: string;
        pin: string;
        unpin: string;
      };
      datatable: {
        itemCount: string;
      };
    };

    type GetI18nKey<T extends Record<string, unknown>, K extends keyof T = keyof T> = K extends string
      ? T[K] extends Record<string, unknown>
        ? `${K}.${GetI18nKey<T[K]>}`
        : K
      : never;

    type I18nKey = GetI18nKey<Schema>;

    type TranslateOptions<Locales extends string> = import('vue-i18n').TranslateOptions<Locales>;

    interface $T {
      (key: I18nKey): string;
      (key: I18nKey, plural: number, options?: TranslateOptions<LangType>): string;
      (key: I18nKey, defaultMsg: string, options?: TranslateOptions<I18nKey>): string;
      (key: I18nKey, list: unknown[], options?: TranslateOptions<I18nKey>): string;
      (key: I18nKey, list: unknown[], plural: number): string;
      (key: I18nKey, list: unknown[], defaultMsg: string): string;
      (key: I18nKey, named: Record<string, unknown>, options?: TranslateOptions<LangType>): string;
      (key: I18nKey, named: Record<string, unknown>, plural: number): string;
      (key: I18nKey, named: Record<string, unknown>, defaultMsg: string): string;
    }
  }

  /** Service namespace */
  namespace Service {
    /** Other baseURL key */
    type OtherBaseURLKey = 'demo';

    interface ServiceConfigItem {
      /** The backend service base url */
      baseURL: string;
      /** The proxy pattern of the backend service base url */
      proxyPattern: string;
    }

    interface OtherServiceConfigItem extends ServiceConfigItem {
      key: OtherBaseURLKey;
    }

    /** The backend service config */
    interface ServiceConfig extends ServiceConfigItem {
      /** Other backend service config */
      other: OtherServiceConfigItem[];
    }

    interface SimpleServiceConfig extends Pick<ServiceConfigItem, 'baseURL'> {
      other: Record<OtherBaseURLKey, string>;
    }

    /** The backend service response data */
    type Response<T = unknown> = {
      /** The backend service response code */
      code: number;
      /** The backend service response message */
      message: string;
      /** The backend service response data */
      data: T;
    };

    /** The demo backend service response data */
    type DemoResponse<T = unknown> = {
      /** The backend service response code */
      status: string;
      /** The backend service response message */
      message: string;
      /** The backend service response data */
      result: T;
    };
  }
}
