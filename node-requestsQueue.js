'use strict';
const moment = require('moment');
/**
 * очередь активных запросов по договорам к отделениям
 * @type {{}}
 */
let requestsQueue = {};

module.exports.addRequest = addRequest;
module.exports.deleteRequest = deleteRequest;
module.exports.addResponse = addResponse;
module.exports.getResponse = getResponse;
module.exports.deleteRequestFromQueueByIndentureId = deleteRequestFromQueueByIndentureId;

/**
 * @param requestName - имя ивента запроса данных
 * функция вызывается при записи запросе клиентом данных о договоре для продления
 * записывает в объект очереди запросов ключ, по которому туда потом попадёт ответ
 */
function addRequest(requestName) {
  requestsQueue[requestName] = {};
}

/**
 * @param requestName - имя ивента запроса данных
 * будет вызвана при исключении договора из активных (открытых в вебе)
 * будет служить для очистки очереди активных запросов, когда данные по договору уже не нужны/не актуальны
 */
function deleteRequest(requestName) {
  delete requestsQueue[requestName];
}

/**
 * @param responseBody - получает параметром распершеное тело ответа о договоре от отделения
 * при этом тело ответа содержит в себе имя ивента запроса
 * по этому полю и определяется ключ в объекте очереди активных запросов, куда будет записан ответ
 */
function addResponse(responseBody) {
  /**
   * при этом к ответу в объект активных запросов
   * дописываепется серверное время в которое был получен ответ от отделенеия
   * для корректности в дальнейшем вставки продлений
   */
  responseBody.DateNow = new Date();
  /**
   * а остальные поля с типом дата / время отдельно парсятся и форматируются, чтобы получить на выходе "DD.MM.YYYY"
   */
  if (responseBody.DateVykup) {
    responseBody.DateVykup = moment(responseBody.DateVykup, ["DD.MM.YYYY", "YYYY.MM.DD"]).format("DD.MM.YYYY");
  }
  if (responseBody.DateZalog) {
    responseBody.DateZalog = moment(responseBody.DateZalog, ["DD.MM.YYYY", "YYYY.MM.DD"]).format("DD.MM.YYYY");
  }
  if (responseBody.PeriodProlong) {
    responseBody.PeriodProlong.forEach(function (period) {
      if (period.DateToProlong) {

        period.DateToProlong = moment(period.DateToProlong, ["DD.MM.YYYY", "YYYY.MM.DD"]).format("DD.MM.YYYY");
      }
    });
  }
  requestsQueue[responseBody.EventID] = responseBody;
}

/**
 * @param responseName - имя ивента запроса
 * @returns {*} возвращает по полученому в параметре ключу либо тело ответа от отделения, если таковой был
 * либо пустой объект, на этом в дальнейшем базируется логика отработки алгоритмов
 * проверки возможности осуществления
 * операций и корректности запросов с фронта
 */
function getResponse(responseName) {
  if (requestsQueue[responseName]) {
    return requestsQueue[responseName];
  }
  return  {};
}

/**
 * @param indentureId
 * вызывеется в момента инициации с бэка разблокировки на отделении договора
 * получает параметром ид договора, разблокировку которого бэкэнд инициировал
 * и удаляет из объекта активных запросов к отделению все с там ид договора
 */
function deleteRequestFromQueueByIndentureId(indentureId) {
  for (let request in requestsQueue) {
    if (requestsQueue[request].indentureID === indentureId) delete requestsQueue[request];
  }
}






