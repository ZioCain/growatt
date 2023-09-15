// Copyright (c) 2020-2023 Träger

// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the "Software"),
// to deal in the Software without restriction, including without limitation
// the rights to use, copy, modify, merge, publish, distribute, sublicense,
// and/or sell copies of the Software, and to permit persons to whom the
// Software is furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
// ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
// DEALINGS IN THE SOFTWARE.

const Url = require('url');
const https = require('https');
const debugApi = require('debug')('growatt:api');
const debugVerbose = require('debug')('growatt:verbose');
const Axios = require('axios');
const QUEUE = require('./queue');
const GROWATTTYPE = require('./growatttype');
const PARSEIN = require('./parsein');

const server = 'https://server.growatt.com';
const index = 'index';
const indexbC = 'indexbC';
const timeout = 50000;
const headers = {};

const LOGGERREGISTER = {
  INTERVAL: 4,
  SERVERIP: 17,
  SERVERPORT: 18,
};
const LOGGERFUNCTION = {
  REGISTER: 0,
  SERVERIP: 1,
  SERVERNAME: 2,
  SERVERPORT: 3,
};

const getJSONCircularReplacer = () => {
  const seen = new WeakMap();
  return (key, val) => {
    const value = val;
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return `loop on ${seen.get(value)}`;
      }
      seen.set(value, key);
    }
    return value;
  };
};

module.exports = class growatt {
  constructor(conf) {
    this.config = conf;
    debugApi('constructor in config:', this.config);
    if (typeof this.config !== 'object') this.config = {};
    if (typeof this.config.timeout === 'undefined') this.config.timeout = timeout;
    if (typeof this.config.headers === 'undefined') this.config.headers = headers;
    if (typeof this.config.server === 'undefined' || this.config.server === '') this.config.server = server;
    if (typeof this.config.indexCandI === 'undefined') this.config.indexCandI = false;
    this.queue = new QUEUE();
    this.connected = false;
    this.cookie = '';
    const httpsAgent = new https.Agent({ rejectUnauthorized: false });
    this.axios = Axios.create({
      baseURL: this.config.server,
      timeout: this.config.timeout,
      headers: this.config.headers,
      httpsAgent,
    });
    if (typeof this.config.lifeSignCallback !== 'undefined') this.lifeSignCallback = this.config.lifeSignCallback;
    debugApi('constructor config:', this.config);
  }

  #getUrl(path) {
    return this.config.server + path;
  }

  getIndex() {
    return this.config.indexCandI ? indexbC : index;
  }

  isConnected() {
    return this.connected;
  }

  extractSession() {
    let session = '';
    if (this.cookie) {
      const lines = this.cookie.split(';');
      lines.forEach(val => {
        if (val.startsWith('JSESSIONID')) {
          [, session] = val.split('=');
        }
      });
    }
    return session;
  }

  /**
   * Create headers for HTTP request
   * @param {boolean} login Whether it's a login HTTP request
   * @returns The object with the necessary headers
   */
  makeCallHeader(login) {
    const head = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36',
      Connection: 'keep-alive',
    };
    if (login) {
      //
    } else {
      head.cookie = this.cookie;
      head.Referer = `${this.config.server}/${this.getIndex()};jsessionid=${this.extractSession()}`;
    }
    return head;
  }

  /**
   * Login to the server using user and password
   * @param {string} user The user
   * @param {string} password The password
   * @returns Promise with object holding success or reject if fails
   */
  login(user, password) {
    return new Promise((resolve, reject) => {
      debugApi('login:', 'user:', user, 'password:', '*no*');
      const params = new Url.URLSearchParams({ account: user, password, validateCode: '' });
      this.connected = false;
      if (this.lifeSignCallback) this.lifeSignCallback();
      this.axios
        .post(this.#getUrl('/login'), params.toString(), { headers: this.makeCallHeader(true) })
        .then(res => {
          debugVerbose('login result:', res);
          if (res.data && res.data.result && res.data.result === 1) {
            this.cookie = res.headers['set-cookie'].toString();
            this.connected = true;
            debugApi('login resolve:', res.data);
            resolve(res.data);
          } else if (res.data && res.data.result) {
            debugApi('login reject:', res.data);
            reject(new Error(JSON.stringify(res.data, getJSONCircularReplacer())));
          } else {
            debugApi('login reject');
            if (res.request.path.match('errorMess')) {
              reject(new Error(`The server sent an unexpected response: ${res.request.path}`));
            } else {
              reject(new Error('The server sent an unexpected response, a fatal error has occurred'));
            }
          }
        })
        .catch(e => {
          debugApi('login err:', JSON.stringify(e, getJSONCircularReplacer(), '  '));
          reject(e);
        });
    });
  }

  demoLogin() {
    return new Promise((resolve, reject) => {
      debugApi('demoLogin:');
      this.connected = false;
      if (this.lifeSignCallback) this.lifeSignCallback();
      this.axios
        .get(this.#getUrl('/login/toViewExamlePlant'), { headers: this.makeCallHeader(true) })
        .then(res => {
          debugVerbose('Session:', this.axios);
          debugVerbose('demoLogin result:', res);
          this.cookie = res.headers['set-cookie'].toString();
          if (this.cookie.includes('JSESSIONID')) {
            this.connected = true;
            debugApi('demoLogin resolve');
            resolve({ result: 1, msg: 'OK' });
          } else {
            debugApi('demoLogin reject no JSESSIONID');
            if (res.request.path.match('errorMess')) {
              reject(new Error(`The server sent an unexpected response: ${res.request.path}`));
            } else {
              reject(new Error('The server sent an unexpected response, a fatal error has occurred'));
            }
          }
        })
        .catch(e => {
          debugApi('demoLogin err:', JSON.stringify(e, getJSONCircularReplacer(), '  '));
          reject(e);
        });
    });
  }

  sharePlantLogin(key) {
    return new Promise((resolve, reject) => {
      debugApi('sharePlantLogin:', 'key:', key);
      this.connected = false;
      if (this.lifeSignCallback) this.lifeSignCallback();
      this.axios
        .get(this.#getUrl(`/login/toSharePlant/${key}`), {
          validateStatus(status) {
            return (status >= 200 && status < 300) || status === 302;
          },
          maxRedirects: 0,
          headers: this.makeCallHeader(true),
        })
        .then(res => {
          debugVerbose('sharePlantLogin result:', res);
          this.cookie = res.headers['set-cookie'].toString();
          if (this.cookie.includes('JSESSIONID')) {
            this.connected = true;
            debugApi('sharePlantLogin resolve');
            resolve({ result: 1, msg: 'OK' });
          } else {
            debugApi('sharePlantLogin reject no JSESSIONID');
            if (res.request.path.match('errorMess')) {
              reject(new Error(`The server sent an unexpected response: ${res.request.path}`));
            } else {
              reject(new Error('The server sent an unexpected response, a fatal error has occurred'));
            }
          }
        })
        .catch(e => {
          debugApi('sharePlantLogin err:', JSON.stringify(e, getJSONCircularReplacer(), '  '));
          reject(e);
        });
    });
  }

  /**
   * Logs you out of the system.
   * Even if you don't logout you'll still be able to login
   * @returns Promise with result
   */
  logout() {
    return new Promise((resolve, reject) => {
      debugApi('logout:');
      if (this.lifeSignCallback) this.lifeSignCallback();
      this.axios
        .get(this.#getUrl('/logout'), { headers: this.makeCallHeader() })
        .then(res => {
          debugVerbose('logout result:', res);
          this.cookie = '';
          this.connected = false;
          debugApi('logout resolve');
          resolve({ result: 1, msg: 'OK' });
        })
        .catch(e => {
          debugApi('logout err:', JSON.stringify(e, getJSONCircularReplacer(), '  '));
          reject(e);
        });
    });
  }

  /**
   * Get the list of plants available for current user
   * @returns Promise with list of plants
   */
  getPlantList() {
    return new Promise((resolve, reject) => {
      debugApi('getPlantList:');
      if (this.lifeSignCallback) this.lifeSignCallback();
      this.axios
        .post(this.#getUrl(`/${this.getIndex()}/getPlantListTitle`), null, { headers: this.makeCallHeader() })
        .then(res => {
          debugVerbose('getPlantList result:', res);
          if (Array.isArray(res.data)) {
            debugApi('getPlantList resolve:', res.data);
            resolve(res.data);
          } else {
            this.connected = false;
            debugApi('getPlantList reject');
            if (res.request.path.match('errorMess')) {
              reject(new Error(`The server sent an unexpected response: ${res.request.path}`));
            } else {
              reject(new Error('The server sent an unexpected response, a fatal error has occurred'));
            }
          }
        })
        .catch(e => {
          this.connected = false;
          debugApi('getPlantList err:', JSON.stringify(e, getJSONCircularReplacer(), '  '));
          reject(e);
        });
    });
  }

  /**
   * Get the detailed list of devices attached to given plant
   * @param {number} plantId The plantID
   * @param {number} [currPage=1] The page of the list of devices to request
   * @returns The list of devices
   */
  getDevicesByPlantList(plantId, currPage=1) {
    return new Promise((resolve, reject) => {
      const params = new Url.URLSearchParams({ plantId, currPage });
      debugApi('getDevicesByPlantList:', 'plantId:', plantId, 'currPage:', currPage);
      if (this.lifeSignCallback) this.lifeSignCallback();
      this.axios
        .post(this.#getUrl('/panel/getDevicesByPlantList'), params.toString(), { headers: this.makeCallHeader() })
        .then(res => {
          debugVerbose('getDevicesByPlantList result:', res);
          if (res.data && res.data.result && res.data.result === 1) {
            debugApi('getDevicesByPlantList resolve:', res.data);
            resolve(res.data);
          } else if (res.data && res.data.result) {
            debugApi('getDevicesByPlantList reject:', res.data);
            reject(new Error(JSON.stringify(res.data, getJSONCircularReplacer())));
          } else {
            debugApi('getDevicesByPlantList reject');
            if (res.request.path.match('errorMess')) {
              reject(new Error(`The server sent an unexpected response: ${res.request.path}`));
            } else {
              reject(new Error('The server sent an unexpected response, a fatal error has occurred'));
            }
          }
        })
        .catch(e => {
          this.connected = false;
          debugApi('getDevicesByPlantList err:', JSON.stringify(e, getJSONCircularReplacer(), '  '));
          reject(e);
        });
    });
  }

  /**
   * Get available data for given plant
   * @param {number} plantId The plant ID
   * @returns The plant data
   */
  getPlantData(plantId) {
    return new Promise((resolve, reject) => {
      const params = new Url.URLSearchParams({ plantId });
      debugApi('getPlantData:', 'plantId:', plantId);
      if (this.lifeSignCallback) this.lifeSignCallback();
      this.axios
        .post(this.#getUrl('/panel/getPlantData'), params.toString(), { headers: this.makeCallHeader() })
        .then(res => {
          debugVerbose('getPlantData result:', res);
          if (res.data && res.data.result && res.data.result === 1) {
            debugApi('getPlantData resolve:', res);
            resolve(res.data);
          } else if (res.data && res.data.result) {
            debugApi('getPlantData reject:', res.data);
            reject(new Error(JSON.stringify(res.data, getJSONCircularReplacer())));
          } else {
            debugApi('getPlantData reject');
            if (res.request.path.match('errorMess')) {
              reject(new Error(`The server sent an unexpected response: ${res.request.path}`));
            } else {
              reject(new Error('The server sent an unexpected response, a fatal error has occurred'));
            }
          }
        })
        .catch(e => {
          this.connected = false;
          debugApi('getPlantData err:', JSON.stringify(e, getJSONCircularReplacer(), '  '));
          reject(e);
        });
    });
  }

  /**
   * Get fault logs for given day, optionally filtered by the device serial
   * @param {number} plantId The plantId
   * @param {string} date The year, month, date to retrieve data for. Date can be one the following formats: YYYY, YYYY-MM, YYYY-MM-DD
   * @param {string} [deviceSn=''] The device serial number
   * @returns The list of faults
   */
  getPlantFaultLog(plantId, date, deviceSn='') {
    return new Promise((resolve, reject) => {
      const type = 4 - date.toString().split("-").length; // type = 1-day, 2-month, 3-year
      const params = new Url.URLSearchParams({
        plantId,
        date,
        deviceSn,
        toPageNum: 1,
        type
      });
      if (this.lifeSignCallback) this.lifeSignCallback();
      this.axios
        .post(this.#getUrl('/log/getNewPlantFaultLog'), params.toString(), { headers: this.makeCallHeader() })
        .then(res => {
          debugVerbose('getNewPlantFaultLog result:', res);
          if (res.data && res.data.result && res.data.result === 1) {
            debugApi('getNewPlantFaultLog resolve:', res);
            resolve(res.data);
          } else if (res.data && res.data.result) {
            debugApi('getPlantData reject:', res.data);
            reject(new Error(JSON.stringify(res.data, getJSONCircularReplacer())));
          } else {
            debugApi('getNewPlantFaultLog reject');
            if (res.request.path.match('errorMess')) {
              reject(new Error(`The server sent an unexpected response: ${res.request.path}`));
            } else {
              reject(new Error('The server sent an unexpected response, a fatal error has occurred'));
            }
          }
        })
        .catch(e => {
          this.connected = false;
          debugApi('getPlantData err:', JSON.stringify(e, getJSONCircularReplacer(), '  '));
          reject(e);
        });
    });
  }

  /**
   * Retrieve current weather at the plant location
   * @param {number} plantId The plant ID
   * @returns The weather
   */
  getWeatherByPlantId(plantId) {
    return new Promise((resolve, reject) => {
      debugApi('getWeatherByPlantId:', 'plantId:', plantId);
      const params = new Url.URLSearchParams({ plantId });
      if (this.lifeSignCallback) this.lifeSignCallback();
      this.axios
        .post(this.#getUrl(`/${this.getIndex()}/getWeatherByPlantId`), params.toString(), { headers: this.makeCallHeader() })
        .then(res => {
          debugVerbose('getWeatherByPlantId result:', res);
          if (res.data && res.data.result && res.data.result === 1) {
            debugApi('getWeatherByPlantId resolve:', res.data);
            resolve(res.data);
          } else if (res.data && res.data.result) {
            debugApi('getWeatherByPlantId reject:', res.data);
            reject(new Error(JSON.stringify(res.data, getJSONCircularReplacer())));
          } else {
            debugApi('getWeatherByPlantId reject');
            if (res.request.path.match('errorMess')) {
              reject(new Error(`The server sent an unexpected response: ${res.request.path}`));
            } else {
              reject(new Error('The server sent an unexpected response, a fatal error has occurred'));
            }
          }
        })
        .catch(e => {
          this.connected = false;
          debugApi('getWeatherByPlantId err:', JSON.stringify(e, getJSONCircularReplacer(), '  '));
          reject(e);
        });
    });
  }

  /**
   * Get the list of devices for given plant, with little details.
   * @param {number} plantId The plant ID
   * @returns List of devices in format: { result: 1, obj: { [type of device]: [ [ '[device serial number]', '[device alias]', '0' ] ] } }
   */
  getDevicesByPlant(plantId) {
    return new Promise((resolve, reject) => {
      debugApi('getDevicesByPlant:', 'plantId:', plantId);
      const params = new Url.URLSearchParams({ plantId });
      if (this.lifeSignCallback) this.lifeSignCallback();
      this.axios
        .post(this.#getUrl('/panel/getDevicesByPlant'), params.toString(), { headers: this.makeCallHeader() })
        .then(res => {
          debugVerbose('getDevicesByPlant result:', res);
          if (res.data && res.data.result && res.data.result === 1) {
            debugApi('getDevicesByPlant resolve:', res.data);
            resolve(res.data);
          } else if (res.data && res.data.result) {
            debugApi('getDevicesByPlant reject:', res.data);
            reject(new Error(JSON.stringify(res.data, getJSONCircularReplacer())));
          } else {
            debugApi('getDevicesByPlant reject');
            if (res.request.path.match('errorMess')) {
              reject(new Error(`The server sent an unexpected response: ${res.request.path}`));
            } else {
              reject(new Error('The server sent an unexpected response, a fatal error has occurred'));
            }
          }
        })
        .catch(e => {
          this.connected = false;
          debugApi('getDevicesByPlant err:', JSON.stringify(e, getJSONCircularReplacer(), '  '));
          reject(e);
        });
    });
  }

  /**
   *
   * @param {string} type The type of device
   * @param {number} plantId The plant ID
   * @param {string} sn The device serial number
   * @param {number} [invId=''] The inv Id, only used when type=singleBackflow
   * @returns
   */
  getTotalData(type, plantId, sn, invId='') {
    return new Promise((resolve, reject) => {
      debugApi('getTotalData:', 'type', type, 'plantId:', plantId, 'sn:', sn);
      const splitID = sn.split('_');
      const params =
        GROWATTTYPE[type].addrParam && GROWATTTYPE[type].invIdParam
          ? new Url.URLSearchParams({
              plantId,
              [GROWATTTYPE[type].snParam]: splitID[0],
              [GROWATTTYPE[type].addrParam]: splitID[1],
              [GROWATTTYPE[type].invIdParam]: invId,
            })
          : new Url.URLSearchParams({ plantId, [GROWATTTYPE[type].snParam]: sn });
      if (this.lifeSignCallback) this.lifeSignCallback();
      this.axios
        .post(this.#getUrl(GROWATTTYPE[type].getTotalData), params.toString(), { headers: this.makeCallHeader() })
        .then(res => {
          debugVerbose('getTotalData result:', res);
          if (res.data && res.data.result && res.data.result === 1) {
            debugApi('getTotalData resolve:', res.data);
            resolve(res.data);
          } else if (res.data && res.data.result) {
            debugApi('getTotalData reject:', res.data);
            reject(new Error(JSON.stringify(res.data, getJSONCircularReplacer())));
          } else {
            debugApi('getTotalData reject');
            if (res.request.path.match('errorMess')) {
              reject(new Error(`The server sent an unexpected response: ${res.request.path}`));
            } else {
              reject(new Error('The server sent an unexpected response, a fatal error has occurred'));
            }
          }
        })
        .catch(e => {
          this.connected = false;
          debugApi('getTotalData err:', JSON.stringify(e, getJSONCircularReplacer(), '  '));
          reject(e);
        });
    });
  }

  /**
   * Retrieve historic data for specific device
   * @param {string} type The device type
   * @param {string} sn The device serial number
   * @param {Date} startDate The start date
   * @param {Date} endDate The end date, max interval for dates is 10 days
   * @param {number} start Starting index for pagination
   * @param {boolean} allDatasets Whether return all datas or just the first
   * @returns History data
   */
  getHistory(type, sn, startDate, endDate, start, allDatasets) {
    return new Promise((resolve, reject) => {
      debugApi('getHistory:', 'type', type, 'sn:', sn, 'startDate:', startDate, 'endDate:', endDate, 'start:', start, 'allDatasets:', allDatasets);
      if (!GROWATTTYPE[type].getHistory) {
        reject("This device type doesn't support history");
      } else {
        const params = new Url.URLSearchParams({
          [GROWATTTYPE[type].snParam]: sn,
          startDate: startDate.toISOString().substring(0, 10),
          endDate: endDate.toISOString().substring(0, 10),
          start,
        });
        if (this.lifeSignCallback) this.lifeSignCallback();
        this.axios
          .post(this.#getUrl(GROWATTTYPE[type].getHistory), params.toString(), {
            headers: this.makeCallHeader(),
          })
          .then(res => {
            debugVerbose('getHistory result:', res);
            if (res.data && res.data.result && res.data.result === 1) {
              debugApi('getHistory resolve:', res.data);
              if (res.data.obj && res.data.obj.datas && res.data.obj.datas[0]) {
                if (allDatasets) {
                  res.data.obj.datas.forEach(data => this.correctTime(data));
                  debugApi('getHistory resolve:', res.data.obj.datas);
                  resolve(res.data.obj.datas);
                } else {
                  this.correctTime(res.data.obj.datas[0]);
                  debugApi('getHistory resolve:', res.data.obj.datas[0]);
                  resolve(res.data.obj.datas[0]);
                }
              } else {
                debugApi('getHistory cant find the data');
                resolve({});
              }
            } else if (res.data && res.data.result) {
              debugApi('getHistory reject:', res.data);
              reject(new Error(JSON.stringify(res.data, getJSONCircularReplacer())));
            } else {
              debugApi('getHistory reject');
              if (res.request.path.match('errorMess')) {
                reject(new Error(`The server sent an unexpected response: ${res.request.path}`));
              } else {
                reject(new Error('The server sent an unexpected response, a fatal error has occurred'));
              }
            }
          })
          .catch(e => {
            this.connected = false;
            debugApi('getHistory err:', JSON.stringify(e, getJSONCircularReplacer(), '  '));
            reject(e);
          });
      }
    });
  }

  getDeviceChart(device, date, timeframe=GROWATTTYPE.CHART_TIMEFRAME.DAY, param=GROWATTTYPE.CHART_PARAM.ENERGY){
    const extraCookies = {
      memoryDeviceType: [{"key": device.plantId, "value": device.deviceTypeName}],
      memoryDeviceSn: [{"key": device.plantId, "value": device.deviceTypeName+"%"+device.sn}],
      selectedPlantId: device.plantId
    };
    for(const cookey in extraCookies){
      if(!this.cookie.includes(cookey))
        this.cookie += ","+ cookey+"="+ encodeURIComponent( JSON.stringify(extraCookies[cookey]) )+"; Path=/";
    }
	  switch(timeframe){
      case GROWATTTYPE.CHART_TIMEFRAME.DAY:
        return this.#getDeviceDayChart(device.plantId, device.sn, date.toISOString().slice(0,10), param);
      case GROWATTTYPE.CHART_TIMEFRAME.MONTH:
        return this.#getDeviceMonthChart(device.plantId, device.sn, date.toISOString().slice(0,7), param);
      case GROWATTTYPE.CHART_TIMEFRAME.YEAR:
        return this.#getDeviceYearChart(device.plantId, device.sn, date.getFullYear(), param);
      case GROWATTTYPE.CHART_TIMEFRAME.TOTAL:
        return this.#getDeviceTotalChart(device.plantId, device.sn, date.getFullYear(), param);
    }
  }

  #getDeviceDayChart(plantId, deviceSn, date, param){
    return new Promise((resolve, reject) => {
      debugApi('getDeviceChart:', {plantId, deviceSn, date, param});
      const params = new Url.URLSearchParams({
        plantId,
        date,
        jsonData: JSON.stringify([{
          type: "plant",
          sn: deviceSn,
          params: param
        }])
      });
      if (this.lifeSignCallback) this.lifeSignCallback();
      this.axios
        .post(this.#getUrl('/energy/compare/getDevicesDayChart'), params.toString(), { headers: this.makeCallHeader() })
        .then(res => {
          debugVerbose('getDeviceDayChart result:', res);
          if (res.data && res.data.result && res.data.result === 1) {
            debugApi('getDeviceDayChart resolve:', res.data);
            resolve(res.data);
          } else if (res.data && res.data.result) {
            debugApi('getDeviceDayChart reject:', res.data);
            reject(new Error(JSON.stringify(res.data, getJSONCircularReplacer())));
          } else {
            debugApi('getDeviceDayChart reject');
            if (res.request.path.match('errorMess')) {
              reject(new Error(`The server sent an unexpected response: ${res.request.path}`));
            } else {
              reject(new Error('The server sent an unexpected response, a fatal error has occurred'));
            }
          }
        })
        .catch(e => {
          this.connected = false;
          debugApi('getDeviceDayChart err:', JSON.stringify(e, getJSONCircularReplacer(), '  '));
          reject(e);
        });
    });
  }
  #getDeviceMonthChart(plantId, deviceSn, date, param){}
  #getDeviceYearChart(plantId, deviceSn, date, param){}
  #getDeviceTotalChart(plantId, deviceSn, date, param){}

  getStatusData(type, plantId, sn) {
    return new Promise((resolve, reject) => {
      debugApi('getStatusData:', 'type', type, 'plantId:', plantId, 'sn', sn);
      const splitSn = sn.split('_');
      const params = GROWATTTYPE[type].addrParam
        ? new Url.URLSearchParams({ plantId, [GROWATTTYPE[type].snParam]: splitSn[0], [GROWATTTYPE[type].addrParam]: splitSn[1] })
        : new Url.URLSearchParams({ plantId, [GROWATTTYPE[type].snParam]: sn });
      if (this.lifeSignCallback) this.lifeSignCallback();
      this.axios
        .post(this.#getUrl(GROWATTTYPE[type].getStatusData), params.toString(), { headers: this.makeCallHeader() })
        .then(res => {
          debugVerbose('getStatusData result:', res);
          if (res.data && res.data.result && res.data.result === 1) {
            debugApi('getStatusData resolve:', res.data);
            resolve(res.data);
          } else if (res.data && res.data.result) {
            debugApi('getStatusData reject:', res.data);
            reject(new Error(JSON.stringify(res.data, getJSONCircularReplacer())));
          } else {
            debugApi('getStatusData reject');
            if (res.request.path.match('errorMess')) {
              reject(new Error(`The server sent an unexpected response: ${res.request.path}`));
            } else {
              reject(new Error('The server sent an unexpected response, a fatal error has occurred'));
            }
          }
        })
        .catch(e => {
          this.connected = false;
          debugApi('getStatusData err:', JSON.stringify(e, getJSONCircularReplacer(), '  '));
          reject(e);
        });
    });
  }

  /**
   * Get data useful for a chart for given day
   * @param {string} type The type of device
   * @param {string} date The date in format YYYY-MM-DD
   * @param {number} plantId The plantId
   * @param {string} deviceSn The device serial number
   * @returns The data to plot a chart
   */
  getEnergyDay(type, date, plantId, deviceSn) {
    return new Promise((resolve, reject) => {
      if(!GROWATTTYPE[type].getEnergyDay) reject("Not implmented yet or not available for this type of device");
      debugApi('getEnergyDay:', 'date', date, 'plantId:', plantId, 'deviceSn', deviceSn);
      const params = new Url.URLSearchParams({
        date,
        plantId,
        mixSn: deviceSn
      });
      if (this.lifeSignCallback) this.lifeSignCallback();
      this.axios
        .post(this.#getUrl(GROWATTTYPE[type].getEnergyDay), params.toString(), { headers: this.makeCallHeader() })
        .then(res => {
          debugVerbose('getEnergyDay result:', res);
          if (res.data && res.data.result && res.data.result === 1) {
            debugApi('getEnergyDay resolve:', res.data);
            resolve(res.data);
          } else if (res.data && res.data.result) {
            debugApi('getEnergyDay reject:', res.data);
            reject(new Error(JSON.stringify(res.data, getJSONCircularReplacer())));
          } else {
            debugApi('getEnergyDay reject');
            if (res.request.path.match('errorMess')) {
              reject(new Error(`The server sent an unexpected response: ${res.request.path}`));
            } else {
              reject(new Error('The server sent an unexpected response, a fatal error has occurred'));
            }
          }
        })
        .catch(e => {
          this.connected = false;
          debugApi('getEnergyDay err:', JSON.stringify(e, getJSONCircularReplacer(), '  '));
          reject(e);
        });
    });
  }

  getDataLoggerRegister(dataLogSn, addr) {
    const param = { action: 'readDatalogParam', dataLogSn, paramType: 'set_any_reg', addr };
    return this.comDataLogger(param);
  }

  setDataLoggerRegister(dataLogSn, addr, value) {
    const param = { action: 'setDatalogParam', dataLogSn, paramType: LOGGERFUNCTION.REGISTER, param_1: addr, param_2: value };
    return this.comDataLogger(param);
  }

  setDataLoggerParam(dataLogSn, paramType, value) {
    const param = { action: 'setDatalogParam', dataLogSn, paramType, param_1: value, param_2: '' };
    return this.comDataLogger(param);
  }

  setDataLoggerRestart(dataLogSn) {
    const param = { action: 'restartDatalog', dataLogSn };
    return this.comDataLogger(param);
  }

  checkDataLoggerFirmware(type, version) {
    const param = { action: 'checkFirmwareVersion', deviceTypeIndicate: type, firmwareVersion: version };
    return this.comDataLogger(param);
  }

  comDataLogger(param) {
    return new Promise((resolve, reject) => {
      debugApi('comDataLogger:', param);
      const params = new Url.URLSearchParams(param);
      if (this.lifeSignCallback) this.lifeSignCallback();
      this.axios
        .post(this.#getUrl('/ftp.do'), params.toString(), { headers: this.makeCallHeader() })
        .then(res => {
          debugVerbose('comDataLogger result:', res);
          if (res.data && typeof res.data.success !== 'undefined') {
            debugApi('comDataLogger resolve:', JSON.stringify(res.data, getJSONCircularReplacer()));
            resolve(res.data);
          } else if (res.data) {
            debugApi('comDataLogger reject:', res.data);
            reject(new Error(JSON.stringify(res.data, getJSONCircularReplacer())));
          } else {
            debugApi('comDataLogger reject');
            if (res.request.path.match('errorMess')) {
              reject(new Error(`The server sent an unexpected response: ${res.request.path}`));
            } else {
              reject(new Error('The server sent an unexpected response, a fatal error has occurred'));
            }
          }
        })
        .catch(e => {
          this.connected = false;
          debugApi('comDataLogger err:', JSON.stringify(e, getJSONCircularReplacer(), '  '));
          reject(e);
        });
    });
  }

  // eslint-disable-next-line class-methods-use-this
  getInverterCommunication(type) {
    debugApi('getInverterCommunication:', 'type', type);
    const ret = {};
    if (typeof GROWATTTYPE[type].comInverter === 'object')
      Object.keys(GROWATTTYPE[type].comInverter).forEach(key => {
        ret[key] = { name: GROWATTTYPE[type].comInverter[key].name, param: {} };
        Object.assign(ret[key].param, GROWATTTYPE[type].comInverter[key].param);
        if (GROWATTTYPE[type].comInverter[key].isSubread) {
          ret[key].isSubread = GROWATTTYPE[type].comInverter[key].isSubread;
        }
        if (GROWATTTYPE[type].comInverter[key].subRead) {
          ret[key].subRead = [];
          Object.assign(ret[key].subRead, GROWATTTYPE[type].comInverter[key].subRead);
        }
      });
    debugApi('getInverterCommunication: return', 'ret', ret);
    return ret;
  }

  getInverterSetting(type, func, serialNum) {
    debugApi('getInverterSetting:', 'type', type, 'func', func, 'serialNum', serialNum);
    const param = { url: { action: '', paramId: '', serialNum, startAddr: -1, endAddr: -1 }, action: 'readParam', base: 'comInverter', func };
    return this.comInverter(type, param, this.parseRetDate);
  }

  setInverterSetting(type, func, serialNum, val) {
    debugApi('setInverterSetting:', 'type', type, 'func', func, 'serialNum', serialNum, 'val', val);
    const param = { url: { action: '', serialNum, type: '' }, val, action: 'writeParam', base: 'comInverter', func };
    return this.comInverter(type, param, this.parseRetDate);
  }

  comInverter(type, paramorgi) {
    // eslint-disable-next-line no-async-promise-executor
    return new Promise(async (resolve, reject) => {
      debugApi('comInverter:', 'type', type, 'paramorgi', paramorgi);
      let checkRet = null;
      const param = paramorgi.url;
      const gt = GROWATTTYPE[type];
      let OK = true;
      try {
        if (typeof paramorgi.action === 'string') {
          if (typeof gt === 'object' && typeof gt[paramorgi.action] === 'string') {
            param.action = gt[paramorgi.action];
          } else {
            throw new Error(`The action ${paramorgi.action} is unknown for invertertype ${type}`);
          }
        }
        if (typeof paramorgi.base === 'string' && typeof gt[paramorgi.base] === 'object' && typeof gt[paramorgi.base][paramorgi.func] === 'object') {
          const b = gt[paramorgi.base][paramorgi.func];
          if (typeof param.paramId !== 'undefined' && typeof b.paramId === 'string') {
            param.paramId = b.paramId;
            checkRet = b.parseRet;
          }
          if (typeof param.type !== 'undefined' && typeof b.type === 'string') {
            param.type = b.type;
            if (typeof paramorgi.val === 'object' && typeof b.param === 'object') {
              const p = b.param;
              Object.keys(p).forEach(name => {
                if (typeof paramorgi.val[name] !== 'undefined') {
                  let ok = true;
                  [param[name], ok] = PARSEIN[p[name].type](paramorgi.val[name]);
                  if (!ok) {
                    throw new Error(
                      `The value ${p[name].name} is incorrect for ${p[name].type} for function ${paramorgi.func} on invertertype ${type}`
                    );
                  }
                } else {
                  throw new Error(`The value ${p[name].name} is missing for send function ${paramorgi.func} on invertertype ${type}`);
                }
              });
            }
          }
        } else {
          throw new Error(`The function ${paramorgi.func} is unknown for invertertype ${type}`);
        }
      } catch (e) {
        OK = false;
        reject(e);
      }
      if (!OK) {
        return;
      }
      const [qresolve, qreject] = await this.queue.addTask(resolve, reject);
      if (!this.isConnected()) {
        qreject(new Error(`The server is not connected`));
        return;
      }
      debugApi('comInverter:', 'param', param);
      const params = new Url.URLSearchParams(param);
      this.axios
        .post(this.#getUrl('/tcpSet.do'), params.toString(), { headers: this.makeCallHeader() })
        .then(res => {
          debugVerbose('comInverter result:', res);
          if (res.data && typeof res.data.success !== 'undefined') {
            debugApi('comInverter resolve:', JSON.stringify(res.data, getJSONCircularReplacer()));
            if (typeof res.data.msg !== 'undefined' && res.data.msg === '') {
              this.queue.taskFinished();
              this.comInverter(type, paramorgi, checkRet)
                .then(r => {
                  qresolve(r);
                })
                .catch(e => {
                  qreject(e);
                });
            } else if (typeof checkRet !== 'undefined' && checkRet !== null) {
              checkRet(res.data, qresolve);
            } else {
              qresolve(res.data);
            }
          } else if (res.data) {
            debugApi('comInverter reject:', res.data);
            qreject(new Error(JSON.stringify(res.data, getJSONCircularReplacer())));
          } else {
            debugApi('comInverter reject');
            if (res.request.path.match('errorMess')) {
              qreject(new Error(`The server sent an unexpected response: ${res.request.path}`));
            } else {
              qreject(new Error('The server sent an unexpected response, a fatal error has occurred'));
            }
          }
        })
        .catch(e => {
          debugApi('comInverter err:', JSON.stringify(e, getJSONCircularReplacer(), '  '));
          qreject(e);
        });
    });
  }

  getDataLoggers() {
    async function doIt(resolve, reject) {
      let loggers = [];
      const plants = await this.getPlantList().catch(e => {
        debugApi('getDataLoggers getPlantList err:', e);
        reject(e);
      });
      if (plants) {
        // eslint-disable-next-line no-restricted-syntax
        for (const plant of plants) {
          let res = {};
          let curPage = 0;
          do {
            curPage += 1;
            // eslint-disable-next-line no-await-in-loop
            res = await this.getDataLogger(plant.id, curPage).catch(e => {
              debugApi('getDataLoggers getDataLogger err:', e);
              reject(e);
            });
            if (res.datas) {
              loggers = loggers.concat(res.datas);
            }
            curPage += 1;
            if (res.currPage) {
              curPage = res.currPage;
            }
          } while (!!res.currPage && !!res.pages && res.currPage < res.pages);
        }
      }
      resolve(loggers);
    }
    return new Promise(doIt.bind(this));
  }

  getDataLogger(plantId, currPage = 1) {
    return new Promise((resolve, reject) => {
      debugApi('getDataLogger:', plantId, currPage);
      const params = new Url.URLSearchParams({ datalogSn: '', plantId, currPage });
      if (this.lifeSignCallback) this.lifeSignCallback();
      this.axios
        .post(this.#getUrl('/device/getDatalogList'), params.toString(), { headers: this.makeCallHeader() })
        .then(res => {
          debugVerbose('getDataLogger result:', res);
          if (res.data && typeof res.data === 'object') {
            debugApi('getDataLogger resolve:', res.data);
            resolve(res.data);
          } else {
            debugApi('getDataLogger reject');
            if (res.request.path.match('errorMess')) {
              reject(new Error(`The server sent an unexpected response: ${res.request.path}`));
            } else {
              reject(new Error('The server sent an unexpected response, a fatal error has occurred'));
            }
          }
        })
        .catch(e => {
          this.connected = false;
          debugApi('getDataLogger err:', JSON.stringify(e, getJSONCircularReplacer(), '  '));
          reject(e);
        });
    });
  }

  /* eslint-disable-next-line class-methods-use-this */
  correctTime(struct) {
    function makeTime(time) {
      if (
        typeof time.year !== 'undefined' &&
        typeof time.month !== 'undefined' &&
        typeof time.dayOfMonth !== 'undefined' &&
        typeof time.hourOfDay !== 'undefined' &&
        typeof time.minute !== 'undefined' &&
        typeof time.second !== 'undefined'
      ) {
        return new Date(time.year, time.month, time.dayOfMonth, time.hourOfDay, time.minute, time.second).toISOString();
      }
      return new Date().toISOString();
    }
    if (typeof struct.time !== 'undefined') {
      struct.time = makeTime(struct.time);
    }
    if (typeof struct.calendar !== 'undefined') {
      struct.calendar = makeTime(struct.calendar);
    }
  }

  getAllPlantData(opt) {
    /* eslint-disable-next-line no-async-promise-executor */
    return new Promise(async (resolve, reject) => {
      let options = opt;
      debugApi('getAllPlantData', 'options:', options);
      const result = {};
      if (typeof options !== 'object') {
        options = {};
      }
      if (typeof options.plantData === 'undefined') {
        options.plantData = true;
      }
      if (typeof options.deviceData === 'undefined') {
        options.deviceData = true;
      }
      if (typeof options.weather === 'undefined') {
        options.weather = true;
      }
      debugApi('getAllPlantData', 'options:', options);
      const plants = await this.getPlantList().catch(e => {
        debugApi('getAllPlantData getPlantList err:', e);
        reject(e);
      });
      if (plants) {
        for (let i = 0; i < plants.length; i += 1) {
          const plant = plants[i];
          if (typeof options.plantId === 'undefined' || plant.id.toString() === options.plantId.toString()) {
            result[plant.id] = plant;
            if (options.plantData) {
              result[plant.id].plantData = {};
              /* eslint-disable-next-line no-await-in-loop */
              const plantData = await this.getPlantData(plant.id).catch(e => {
                debugApi('getAllPlantData getPlantData err:', e);
                reject(e);
              });
              if (plantData && plantData.obj) {
                result[plant.id].plantData = plantData.obj;
              }
            }
            if (options.weather) {
              result[plant.id].weather = {};
              /* eslint-disable-next-line no-await-in-loop */
              const weather = await this.getWeatherByPlantId(plant.id).catch(e => {
                debugApi('getAllPlantData getWeatherByPlantId err:', e);
                reject(e);
              });
              if (weather && weather.obj) {
                result[plant.id].weather = weather.obj;
              }
            }
            /* eslint-disable-next-line no-await-in-loop */
            result[plant.id].devices = await this.getAllPlantDeviceData(plant.id, options).catch(e => {
              debugApi('getAllPlantData getAllPlantDeviceData err:', e);
              reject(e);
            });

            if (options.deviceData) {
              /* eslint-disable-next-line no-await-in-loop */
              const devices = await this.getDevicesByPlantList(plant.id, 1).catch(e => {
                debugApi('getAllPlantData getDevicesByPlantList err:', e);
                reject(e);
              });
              if (devices && devices.obj && devices.obj.datas) {
                if (devices.obj.pages && devices.obj.pages > 1) {
                  for (let p = 1; p < devices.obj.pages; p += 1) {
                    /* eslint-disable-next-line no-await-in-loop */
                    const devicesPlus = await this.getDevicesByPlantList(plant.id, p).catch(e => {
                      debugApi('getAllPlantData getDevicesByPlantList err:', e);
                      reject(e);
                    });
                    devices.obj.datas = devices.obj.datas.concat(devicesPlus.obj.datas);
                  }
                }
                for (let n = 0; n < devices.obj.datas.length; n += 1) {
                  const devData = devices.obj.datas[n];
                  if (!result[plant.id].devices) {
                    result[plant.id].devices = {};
                  }
                  if (!result[plant.id].devices[devData.sn] && devData.plantId) {
                    /* eslint-disable-next-line no-await-in-loop */
                    result[plant.id].devices[devData.sn] = await this.getPlantDeviceData(
                      devData.plantId,
                      devData.deviceTypeName,
                      devData.sn,
                      0,
                      options
                    ).catch(e => {
                      debugApi(`getAllPlantDeviceData getPlantDeviceData ${devData.deviceTypeName} err:`, e);
                      reject(e);
                    });
                  }
                  if (!result[plant.id].devices[devData.sn]) {
                    result[plant.id].devices[devData.sn] = {};
                  }
                  result[plant.id].devices[devData.sn].deviceData = devData;
                }
              }
            }
          }
        }
      }
      debugVerbose('getAllPlantData resolve:', JSON.stringify(result, getJSONCircularReplacer(), '  '));
      resolve(result);
    });
  }

  getAllPlantDeviceData(plantId, opt) {
    /* eslint-disable-next-line no-async-promise-executor */
    return new Promise(async (resolve, reject) => {
      let options = opt;
      debugApi('getAllPlantDeviceData:', 'plantId:', plantId, 'options:', options);
      let result = {};
      if (typeof options !== 'object') {
        options = {};
      }
      if (typeof options.deviceTyp === 'undefined') {
        options.deviceTyp = false;
      }
      debugApi('getAllPlantDeviceData', 'options:', options);
      const device = await this.getDevicesByPlant(plantId).catch(e => {
        debugApi('getAllPlantDeviceData getDevicesByPlant err:', e);
        reject(e);
      });
      if (device && device.obj) {
        result = {};
        const objs = Object.keys(device.obj);
        for (let o = 0; o < objs.length; o += 1) {
          const growattType = objs[o];
          if (growattType !== '' && GROWATTTYPE[growattType]) {
            for (let a = 0; a < device.obj[growattType].length; a += 1) {
              if (device.obj[growattType][a].length > 2) {
                let serialNr = device.obj[growattType][a][0];
                const invId = device.obj[growattType][a][3];
                if (GROWATTTYPE[growattType].atIndex) {
                  serialNr += `@${device.obj[growattType][a][GROWATTTYPE[growattType].atIndex]}`;
                }
                /* eslint-disable-next-line no-await-in-loop */
                result[serialNr] = await this.getPlantDeviceData(plantId, growattType, serialNr, invId, options).catch(e => {
                  debugApi(`getAllPlantDeviceData getPlantDeviceData ${growattType} err:`, e);
                  reject(e);
                });
                if (options.deviceType) {
                  result[serialNr][growattType] = device.obj[growattType][a];
                }
              }
            }
          }
        }
      }
      debugVerbose('getAllPlantDeviceData resolve:', JSON.stringify(result, getJSONCircularReplacer(), '  '));
      resolve(result);
    });
  }

  getPlantDeviceData(plantId, growattType, serialNr, invId, opt) {
    /* eslint-disable-next-line no-async-promise-executor */
    return new Promise(async (resolve, reject) => {
      let options = opt;
      debugApi('getPlantDeviceData:', 'plantId', plantId, 'growattType', growattType, 'serialNr', serialNr, 'invId', invId, 'options:', options);
      let result = {};
      if (typeof options !== 'object') {
        options = {};
      }
      if (typeof options.totalData === 'undefined') {
        options.totalData = true;
      }
      if (typeof options.statusData === 'undefined') {
        options.statusData = true;
      }
      if (typeof options.growattType === 'undefined') {
        options.growattType = true;
      }
      if (typeof options.historyLast === 'undefined') {
        options.historyLast = true;
      }
      if (typeof options.historyAll === 'undefined') {
        options.historyAll = false;
      }
      if (typeof options.historyLastStartDate === 'undefined') {
        options.historyLastStartDate = new Date(new Date().setDate(new Date().getDate() - 1));
      }
      if (typeof options.historyLastEndDate === 'undefined') {
        options.historyLastEndDate = new Date(new Date().setDate(new Date().getDate() + 1));
      }
      if (typeof options.historyStart === 'undefined') {
        options.historyStart = 0;
      }
      debugApi('getPlantDeviceData', 'options:', options);
      result = {};
      if (growattType !== '' && GROWATTTYPE[growattType]) {
        if (options.growattType) {
          result.growattType = growattType;
        }
        if (options.totalData) {
          const totalData = await this.getTotalData(growattType, plantId, serialNr, invId).catch(e => {
            debugApi(`getPlantDeviceData getTotalData ${growattType} err:`, e);
            reject(e);
          });
          if (totalData && totalData.obj) {
            result.totalData = totalData.obj;
          }
        }
        if (options.statusData && GROWATTTYPE[growattType].getStatusData) {
          const statusData = await this.getStatusData(growattType, plantId, serialNr).catch(e => {
            debugApi(`getPlantDeviceData getStatusData ${growattType} err:`, e);
            reject(e);
          });
          if (statusData && statusData.obj) {
            result.statusData = statusData.obj;
          }
        }
        if (options.historyLast || options.historyAll) {
          const historyLast = await this.getHistory(
            growattType,
            serialNr,
            options.historyLastStartDate,
            options.historyLastEndDate,
            options.historyStart,
            options.historyAll
          ).catch(e => {
            debugApi(`getPlantDeviceData getHistory ${growattType} err:`, e);
            reject(e);
          });
          if (historyLast) {
            if (options.historyAll) {
              result.historyAll = historyLast;
            } else {
              result.historyLast = historyLast;
            }
          }
        }
      }
      debugVerbose('getPlantDeviceData resolve:', JSON.stringify(result, getJSONCircularReplacer(), '  '));
      resolve(result);
    });
  }
};

module.exports.LOGGERREGISTER = LOGGERREGISTER;
module.exports.LOGGERFUNCTION = LOGGERFUNCTION;
module.exports.TYPES = GROWATTTYPE.TYPES;
module.exports.CHART_PARAMS = GROWATTTYPE.CHART_PARAM;
module.exports.CHART_TIMEFRAME = GROWATTTYPE.CHART_TIMEFRAME;