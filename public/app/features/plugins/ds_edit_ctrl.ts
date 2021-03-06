import _ from 'lodash';
import { toJS } from 'mobx';
import config from 'app/core/config';
import { coreModule, appEvents } from 'app/core/core';
import { store } from 'app/stores/store';

var datasourceTypes = [];

var defaults = {
  name: '',
  type: 'graphite',
  url: '',
  access: 'proxy',
  jsonData: {},
  secureJsonFields: {},
};

var datasourceCreated = false;

export class DataSourceEditCtrl {
  isNew: boolean;
  datasources: any[];
  current: any;
  types: any;
  testing: any;
  datasourceMeta: any;
  editForm: any;
  gettingStarted: boolean;
  navModel: any;

  /** @ngInject */
  constructor(private $q, private backendSrv, private $routeParams, private $location, private datasourceSrv) {
    if (store.nav.main === null) {
      store.nav.load('cfg', 'datasources');
    }

    this.navModel = toJS(store.nav);
    this.datasources = [];

    this.loadDatasourceTypes().then(() => {
      if (this.$routeParams.id) {
        this.getDatasourceById(this.$routeParams.id);
      } else {
        this.initNewDatasourceModel();
      }
    });
  }

  initNewDatasourceModel() {
    this.isNew = true;
    this.current = _.cloneDeep(defaults);

    // We are coming from getting started
    if (this.$location.search().gettingstarted) {
      this.gettingStarted = true;
      this.current.isDefault = true;
    }

    this.typeChanged();
  }

  loadDatasourceTypes() {
    if (datasourceTypes.length > 0) {
      this.types = datasourceTypes;
      return this.$q.when(null);
    }

    return this.backendSrv.get('/api/plugins', { enabled: 1, type: 'datasource' }).then(plugins => {
      datasourceTypes = plugins;
      this.types = plugins;
    });
  }

  getDatasourceById(id) {
    this.backendSrv.get('/api/datasources/' + id).then(ds => {
      this.isNew = false;
      this.current = ds;

      if (datasourceCreated) {
        datasourceCreated = false;
        this.testDatasource();
      }

      return this.typeChanged();
    });
  }

  userChangedType() {
    // reset model but keep name & default flag
    this.current = _.defaults(
      {
        id: this.current.id,
        name: this.current.name,
        isDefault: this.current.isDefault,
        type: this.current.type,
      },
      _.cloneDeep(defaults)
    );
    this.typeChanged();
  }

  updateNav() {
    store.nav.initDatasourceEditNav(this.current, this.datasourceMeta, 'datasource-settings');
    this.navModel = toJS(store.nav);
  }

  typeChanged() {
    return this.backendSrv.get('/api/plugins/' + this.current.type + '/settings').then(pluginInfo => {
      this.datasourceMeta = pluginInfo;
      this.updateNav();
    });
  }

  updateFrontendSettings() {
    return this.backendSrv.get('/api/frontend/settings').then(settings => {
      config.datasources = settings.datasources;
      config.defaultDatasource = settings.defaultDatasource;
      this.datasourceSrv.init();
    });
  }

  testDatasource() {
    this.datasourceSrv.get(this.current.name).then(datasource => {
      if (!datasource.testDatasource) {
        return;
      }

      this.testing = { done: false, status: 'error' };

      // make test call in no backend cache context
      this.backendSrv
        .withNoBackendCache(() => {
          return datasource
            .testDatasource()
            .then(result => {
              this.testing.message = result.message;
              this.testing.status = result.status;
            })
            .catch(err => {
              if (err.statusText) {
                this.testing.message = 'HTTP Error ' + err.statusText;
              } else {
                this.testing.message = err.message;
              }
            });
        })
        .finally(() => {
          this.testing.done = true;
        });
    });
  }

  saveChanges() {
    if (!this.editForm.$valid) {
      return;
    }

    if (this.current.readOnly) {
      return;
    }

    if (this.current.id) {
      return this.backendSrv.put('/api/datasources/' + this.current.id, this.current).then(result => {
        this.current = result.datasource;
        this.updateNav();
        this.updateFrontendSettings().then(() => {
          this.testDatasource();
        });
      });
    } else {
      return this.backendSrv.post('/api/datasources', this.current).then(result => {
        this.current = result.datasource;
        this.updateFrontendSettings();

        datasourceCreated = true;
        this.$location.path('datasources/edit/' + result.id);
      });
    }
  }

  confirmDelete() {
    this.backendSrv.delete('/api/datasources/' + this.current.id).then(() => {
      this.$location.path('datasources');
    });
  }

  delete(s) {
    appEvents.emit('confirm-modal', {
      title: 'Delete',
      text: 'Are you sure you want to delete this datasource?',
      yesText: 'Delete',
      icon: 'fa-trash',
      onConfirm: () => {
        this.confirmDelete();
      },
    });
  }
}

coreModule.controller('DataSourceEditCtrl', DataSourceEditCtrl);

coreModule.directive('datasourceHttpSettings', function() {
  return {
    scope: {
      current: '=',
      suggestUrl: '@',
    },
    templateUrl: 'public/app/features/plugins/partials/ds_http_settings.html',
    link: {
      pre: function($scope, elem, attrs) {
        $scope.getSuggestUrls = function() {
          return [$scope.suggestUrl];
        };
      },
    },
  };
});
