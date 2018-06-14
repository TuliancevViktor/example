'use strict';

const net = require('net');
const Iconv = require('iconv').Iconv;
const moment = require('moment');
const _ = require('lodash');
const Promise = require('bluebird');
const config = require('../../config/config');
const db = require('../models');
const tracker = require('./activeItems');
const requestQueue = require('./requestsQueue');
const crypt = require('./crypt');

let activeSockets = {};
let server;

module.exports.findSocketByFiliationId = findSocketByFiliationId;
module.exports.sendRequestToSocketByFiliationId = sendRequestToSocketByFiliationId;
module.exports.createCheckerOfResponse = createCheckerOfResponse;
module.exports.initNetSocket = initNetSocket;
module.exports.closeSocketServer = closeSocketServer;

/**
 * Функция, которая тушит tcp сервер и высвобождает ресурсы
 * @param cb
 */
function closeSocketServer(cb) {
  server.unref();
  server.close(cb);
}
/**
 * Функция создания сокет сервера запускается в момент запуска web
 */
function initNetSocket() {
  /**
   * создаём tcp сервер
   */
  server = net.createServer((socket) => {

    /**
     * setKeepAlive сокет раз в 5 минут
     */
    socket.setKeepAlive(true, 5 * 60 * 1000);
    socket.reqQueue = [];
    socket.part = '';

    /**
     * при обнаружении попытки приконектиться сокетом отделения :
     * он не валидный, и не авторизмрованный, и не пробовал авторизоваться
     * Шторм не правильно подсвечивает переменную ниже из-за кода по таймауту
     */
    let isValidSocketTimeOut = false;
    /**
     * сокет должен пропробовать авторизоваться
     */
    setTimeout(function () {
      if (!isValidSocketTimeOut) {
        if (socket.server._connections != 0) {
          killSocket(socket, '{"error" : "112 you should try to authorize yourself"}');
        }
      }
    }, config.time.connectionTimeout);

    socket.on('data', Promise.coroutine(function *(data) {
        try {
          let iconv = new Iconv('windows-1251', 'UTF-8');
          /**
           * пришло сообщение и можем его расшифровать - обрабатываем
           * авторизованый сокет и он уже будет слать только разные ответы
           */
          if (socket.decodeKey && socket.decodeKey != 99) {
            socket.part += (iconv.convert(data).toString());


            let records = crypt.decode(socket.part, socket.decodeKey);


            /**
             * decode возвращает массив распарсеных json или просто false, если это была
             * только часть json
             *  если масив -> обрабатываем каждую из них
             */
            if (records[0] !== false) {
              Promise.each(records, Promise.coroutine(function *(data) {
                console.log(data);
                if (!data.EventID) {
                  return console.log("impossible to parse message");
                }
                /**
                 * иначе всё распарсилось как знакомый формат сообщений - можно обрабатывать
                 * проверяем это ответ на запрос по договору
                 */
                if (data.EventID.indexOf('dataFromFiliation') !== -1) {
                  /**
                   * записываем что пришёл ответ на запрос по одному договору
                   */
                  return requestQueue.addResponse(data);
                }
                /**
                 * иначе это продление или деактивированние договора
                 */
                if (data.EventID.indexOf('prolongation') !== -1) {
                  db.Log.addLog({
                    indentureId: data.indentureID ? data.indentureID : 0,
                    indentureCs: 0,
                    filiationId: socket.lombardId,
                    requestType: '10',
                    requestBody: data,
                    isOutput: false
                  });
                  /**
                   * а раз это ответ на продление проверим прошло ли оно успешно
                   */
                  if (!data.ErrorCode) {
                    db.Prolongation.setProlongationReceivedByFiliation(data.EventID);
                  }
                }
              }));
              socket.part = '';
              /**
               * тут сразу же исходя из того что от отделения пришло что либо - значит он готов
               * к обработке новых данных, таким образом проверим очередь отправки
               */
              sendFirstReqFromQueue(socket.lombardId);
            }
            else {
              console.log(`                fail wait                `);
            }
          } else {
            /**
             *считаем что сокет пытается авторизоваться
             */
            socket.decodeKey = config.defaultDecodeKey;
            /**
             * получили и расшифровали
             */
            let records = crypt.decode(iconv.convert(data).toString(), socket.decodeKey);
            /**
             * decode возвращает массив распарсеных json обрабатываем каждую из них
             */
            Promise.each(records, Promise.coroutine(function *(data) {
              /**
               * логгируем как запрос авторизации
               */
              db.Log.addLog({
                indentureId: 0,
                indentureCs: 0,
                filiationId: data.ID,
                requestType: '7',
                requestBody: data,
                isOutput: false
              });

              let filiationInBase = false;
              /**
               * проверяем есть ли ломбард с таким ид и паролем в базе
               */
              if (isNumeric(data.ID) && data.Password) {
                filiationInBase = yield db.Filiation.checkFiliation(data.ID, data.Password);
              }
              /**
               *не нашли - отключаем сокет
               */
              if (!filiationInBase) {
                isValidSocketTimeOut = true;
                killSocket(socket, '{"error" : "211 get out, wrong password"}');
                return;
              }
              /**
               * если коннект с таким ломбардИд уже есть отключаем теперешний
               */
              let foundSocket = findSocketByFiliationId(data.ID);
              if (foundSocket) {
                isValidSocketTimeOut = true;
                killSocket(socket, '{"error" : "121 we already have same filiation"}');
                return;
              }
              /**
               * Если есть из чего  - формируем для сокета начало очереди отправки запросов из
               * неотправленых продлений
               * потом будем в необходимых местах вызывать функцию отправки первого из очереди запросов
               * Выывать её будем в случаях:
               *  - сокет стал валидным
               *  - получи из сокета какое-либо сообщение
               *  - записали что то в сокет
               */
              let requests = yield db.Prolongation.byFiliationAndNeedToSend(data.ID);
              yield Promise.each(requests, Promise.coroutine(function *(request) {
                request = request.get();
                request.DateNow = moment(request.DateNow).format("DD.MM.YYYY HH:mm:ss");
                request.DateProlong = moment(request.DateProlong).format("DD.MM.YYYY HH:mm:ss");
                request.DateToProlong = moment(request.DateToProlong).format("DD.MM.YYYY");
                socket.reqQueue.push(request);
              }));
              /**
               * записываем сокет в активные
               */
              socket.lombardId = data.ID;
              socket.decodeKey = data.Key;

              activeSockets[data.ID] = socket;
              isValidSocketTimeOut = true;
              /**
               * и сразу проверяем есть ли в очереди запросов что отправить
               */
              sendFirstReqFromQueue(data.ID);

            }));
          }
        }
        catch (err) {
          if (err.stack)
            console.trace(err.stack);
          else
            console.error(err);
        }
      })
    );

    socket.on('end', function () {
      /**
       * при отключении отделения
       * логгируем как отключение отделения
       */
      db.Log.addLog({
        indentureId: 0,
        indentureCs: 0,
        filiationId: socket.lombardId ? socket.lombardId : 0,
        requestType: '8',
        requestBody: socket.lombardId ? socket.lombardId : 'unauthorized socket',
        isOutput: false
      });
      /**
       * записываем отключение в трэкере активности
       */
      tracker.setActiveFiliationFalse(socket.lombardId ? socket.lombardId : 0);
      console.log('disconnected');
      /**
       * удаляем из обьека активных сокетов
       */
      delete activeSockets[socket.lombardId];
      socket.destroy();
    })
  })
    .on('error', (err) => {
      throw err;
    });

  server.listen(config.socketPort, () => {
    console.log('opened server on', server.address());
  });
}

/**
 * Функция для оправки на отделение нулевого(первого) запроса в очереди, если таковой имеется
 * принимает id отделения
 */
function sendFirstReqFromQueue(filiationId) {

  let foundSocket = findSocketByFiliationId(filiationId);
  if (foundSocket) {
    let requestBody = foundSocket.reqQueue.shift();
    if (typeof (requestBody) !== "undefined") {
      /**
       * если shift не вернул undefined - значит есть что отправить
       *
       * логгирование этих запросов если они на продление и повторные, другие
       * типы запросов и так подконтрольны и залогированы в месте где вызываются
       */
      if ('EventID' in requestBody) {
        if (requestBody.EventID.indexOf('prolongation') !== -1) {

          db.Log.addLog({
            indentureId: requestBody.indentureID,
            indentureCs: requestBody.indentureCS,
            filiationId: requestBody.filiationId,
            requestType: '3',
            requestBody: requestBody,
            isOutput: true
          });
        }
      }

      /**
       * закодируем и непосредственно отправляем
       */
      requestBody = crypt.encode(requestBody, foundSocket.decodeKey);
      return foundSocket.write(requestBody);
    }
  }
  return false;
}



/**
 * Для получения сокета из объекта активных сокетов
 * @param filiationId
 * @returns {*}
 */
function findSocketByFiliationId(filiationId) {
  return _.find(activeSockets, function (socket) {
    return socket.lombardId === filiationId;
  });
}

/**
 * @param filiationId куда делать эмит
 * @param requestBody  тело запроса
 * @returns {*}   вернёт либо сокет, куда произвели эмит, либо false если
 * отделения нет online
 * Будем фильтровать запросы сквозь очередь:
 * при вызове где то sendRequestToSocketByFiliationId - будем гарантировано только добавлять
 * запрос в очередь,
 * Если же очередь на момент доавления была пуста - то бутем стартовать отправки, если же там и так что то было
 * очередь отработает на ответ от отделения
 */
function sendRequestToSocketByFiliationId(filiationId, requestBody) {

  let foundSocket = findSocketByFiliationId(filiationId);
  if (foundSocket) {
    foundSocket.reqQueue.push(requestBody);
    if (foundSocket.reqQueue.length === 1) {
      return sendFirstReqFromQueue(filiationId);
    }
  }
return false;
}



/**
 * Функция проверки наличия ответа по запросу
 * Работает через промис, который сделает resolve только если всё успешно как на стороне
 * backend и на филилиале
 * @param responseName
 *   Проверяем надичие ответа каждые 3 секунды с момента создания слушаетля
 *   и через время указаное в конфиге если ничего так и не получили от отделения
 *   * или получили и не смогли распарсить
 *   реджектим на фронт еррор, иначе как только получим и распарсим адевкатный ответ - резолвим данные
 */
function createCheckerOfResponse(responseName) {
  return new Promise(function (resolve, reject) {
    let data = {};
    let dataCheker = setInterval(() => {
      data = requestQueue.getResponse(responseName);
      if (Object.keys(data).length !== 0) {
        if (data.ErrorCode) {
          clearInterval(dataCheker);
          reject(data);
        }
        clearInterval(dataCheker);
        resolve(data);
      }
    }, 3000);

    setTimeout(function () {
      /**
       * если отделение не успело ответить - отправляем на фронтэнд ошибку 4504
       */
      if (Object.keys(data).length === 0) {
        data.ErrorCode = 4504;
      }
      clearInterval(dataCheker);
      /**
       * если в полученой инфе было поле код ошибки или мы его туда внесли делаем реджект
       */
      if (data.ErrorCode) {
        reject(data);
      }
    }, config.time.responseTimeout);
  });
}

/**
 * Функция для закрытия сокета, получает сокет и сообщение, которое надо послать ему перед закрытием
 * @param socket
 * @param message
 */
function killSocket(socket, message) {
  try {
    socket.write(message);
    socket.end();
    socket.destroy();
  }
  catch (error) {
    return false;
  }

}
