'use strict';

const db = require('../models');
const IRC = require('../helpers/internalResponseCodes');
const sockets = require('../helpers/netSocket');
const config = require('../../config/config');
const requestQueue = require('./requestsQueue');


let activeIndentures = {};
module.exports.addActiveIndenture = addActiveIndenture;
module.exports.deleteActiveIndenture = deleteActiveIndenture;
module.exports.setIndentureTimeById = setIndentureTimeById;
module.exports.checkActiveIndentures = checkActiveIndentures;
module.exports.setActiveFiliationFalse = setActiveFiliationFalse;
module.exports.disableUnlockRequest = disableUnlockRequest;

let activeCabinets = {};
module.exports.addActiveCabinet = addActiveCabinet;
module.exports.deleteActiveCabinet = deleteActiveCabinet;
module.exports.setCabinetTimeByClientId = setCabinetTimeByClientId;
module.exports.checkActiveCabinets = checkActiveCabinets;
module.exports.isCabinetInActive = isCabinetInActive;


/**
 * Получает Ид запрошеного договора и записывает его в объект открытых договоров
 * @param indentureId
 */
function addActiveIndenture(indentureId) {
  activeIndentures[indentureId] = {};
  activeIndentures[indentureId].time = new Date().getTime();
  activeIndentures[indentureId].filiationId = Math.floor(indentureId / 1000000);
  activeIndentures[indentureId].filiationIsActive = true;
  activeIndentures[indentureId].shouldSendUnlockRequest = true;
}

/**
 * Вызывается при обработке payment / success
 * и устанавливает, чтобы принятый в параметрах договор не отправлял
 * запросы на свою разблокировку
 * @param indentureId
 */
function disableUnlockRequest(indentureId) {
  activeIndentures[indentureId].shouldSendUnlockRequest = false;
}

/**
 *  @param key - получаем id договора и вызываем удаление активного договора,
 *  а внутри вызываем очистку очереди запросов по такому договору
 */
function deleteActiveIndenture(key) {
  /**
   * формируем ивент и тело запроса
   */
  let filiationId = Math.floor(key / 1000000);

  let requestBody = {
    'EventType': 'unblockIndenture', // какой ивэнт нужно эмитить серверу
    'indentureID': key,
    'requestType': 6
  };
  /**
   * вызываем эмит разблокировки договора на отделении
   */
  sockets.sendRequestToSocketByFiliationId(filiationId, requestBody);
  db.Log.addLog({
    indentureId: key,
    indentureCs: 0,
    filiationId: filiationId,
    requestType: '6',
    requestBody,
    isOutput: true
  });
  /**
   *  убираем договор из активных
   */
  delete activeIndentures[key];
  /**
   * и затираем запрос в очереди запросов по ид договора
   */
  requestQueue.deleteRequestFromQueueByIndentureId(key);
}

/**
 * При получении с фронтэнда пост запроса отом что была активность -
 * записываем её время для отслеживания неативных "сессий", но
 * если отделение договора стало не онлайн - отправляем на фронт соотв. ответ
 * а если бекэнд уже ранее определил, что сессия истекла - отправляем ошибку, чтобы фронт показал её пользователю
 * и перенаправил его на страницу логина
 * @param indentureId   ид
 * @param activityOccurred  факт наличия ктивности
 * @returns {*}
 */
function setIndentureTimeById(indentureId, activityOccurred) {

  if (activeIndentures[indentureId] && !activeIndentures[indentureId].filiationIsActive) {
    return IRC.FILIATION_NOT_FOUND;
  }
  /**
   * если такой договор активен
   */
  if (activeIndentures[indentureId]) {
    /**
     * если пришла активность true - апдейтим время
     */
    if (activityOccurred) {
      activeIndentures[indentureId].time = new Date().getTime();
    }
    return IRC.OK;
  }
  /**
   * return таймаут только если уже договор удалился в
   *  checkActiveIndentures, который проверяет по интервалу
   *  рамки в настройках (15 сек default)
   */
  return IRC.TIMEOUT;
}

/**
 * Вызывается при старте сервера и будет выполняться раз в время в конфиге (дефолт 15 сек)
 * для отслеживания сессий, которые необходимо раорвать
 */
function checkActiveIndentures() {
  setInterval(function checking() {
    let currentTime = new Date().getTime();
    for (let key in activeIndentures) {
      /**
       * уже прошло unlockInactiveIndenture времени
       */
      if (currentTime - activeIndentures[key].time > config.time.unlockInactiveIndenture) {
        /**
         * и этот договор должен отправлять запросы на разблокировку
         */
        if (activeIndentures[key].shouldSendUnlockRequest === true) {
          deleteActiveIndenture(key);
        }
      }
    }
  }, config.time.checkIndenturesActivityInterval)
}
/**
 * Получает ид отделения и проставляет в объетке активных договоров
 * флаг о том что отделение перешло в offline
 * @param filiationId
 */
function setActiveFiliationFalse(filiationId) {
  if (filiationId !== 0) {
    for (let key in activeIndentures) {
      if (activeIndentures[key].filiationId === filiationId) {
        activeIndentures[key].filiationIsActive = false;
      }
    }
  }
}

/**
 * Получает Ид клиента и записывает его в объект активных кабинетов
 * @param clientId
 */
function addActiveCabinet(clientId, cabinetData) {
  activeCabinets[clientId] = {};
  activeCabinets[clientId].data = cabinetData;
  activeCabinets[clientId].time = new Date().getTime();
}
/**
 * Получает Ид клиента и убирает кабинет из активных
 * @param clientId
 */
function deleteActiveCabinet(clientId) {
  delete activeCabinets[clientId | ""];
}

/**
 * При получении с фронтэнда пост запроса отом что была активность в кабинете -
 * записываем её время для отслеживания неативных "сессий", но
 * если бекэнд уже ранее определил, что сессия истекла - отправляем ошибку, чтобы фронт показал её пользователю
 * и перенаправил его на страницу логина
 * @param сlientId   ид
 * @param activityOccurred  факт наличия ктивности
 * @returns {*}
 */
function setCabinetTimeByClientId(clietnId, activityOccurred) {
  /**
   * если такой кабинет активен
   */
  if (activeCabinets[clietnId]) {
    /**
     * если пришла активность true - апдейтим время
     */
    if (activityOccurred) {
      activeCabinets[clietnId].time = new Date().getTime();
    }
    return IRC.OK;
  }
  /**
   * return таймаут только если уже кабинет удалился в
   *  checkActiveСabinets, который проверяет по интервалу
   *  рамки в настройках (15 сек default)
   */
  return IRC.TIMEOUT;
}

/**
 * Вызывается при старте сервера и будет выполняться раз в время в конфиге (дефолт 15 сек)
 * для отслеживания сессий, которые необходимо раорвать
 */
function checkActiveCabinets() {
  setInterval(function checking() {
    let currentTime = new Date().getTime();
    for (let key in activeCabinets) {
      /**
       * уже прошло unlockInactiveCabinet времени
       */
      if (currentTime - activeCabinets[key].time > config.time.unlockInactiveCabinet) {
        deleteActiveCabinet(key);
      }
    }
  }, config.time.checkCabinetsActivityInterval)
}
/**
 * Проверяет наличие "сессии" для личного кабинета. При наличии таковой
 * возвращает объект кабинета или пустоту если "сессии" нет
 * @param clientId
 * @returns {{}}
 */
function isCabinetInActive(clientId) {
  if (clientId in activeCabinets) {
    return activeCabinets[clientId].data.get();
  }
  else
    return {};
}
