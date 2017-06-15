const async = require('async');
const azure = require('azure-storage');
const moment = require('moment');
const useragent = require('useragent');

const loggingTools = require('auth0-log-extension-tools');
const config = require('../lib/config');
const logger = require('../lib/logger');

module.exports = (storage) =>
  (req, res, next) => {
    const wtBody = (req.webtaskContext && req.webtaskContext.body) || req.body || {};
    const wtHead = (req.webtaskContext && req.webtaskContext.headers) || {};
    const isCron = (wtBody.schedule && wtBody.state === 'active') || (wtHead.referer === 'https://manage.auth0.com/' && wtHead['if-none-match']);

    if (!isCron) {
      return next();
    }

    const blobService = azure.createBlobService(config('STORAGE_ACCOUNT_NAME'), config('STORAGE_ACCOUNT_KEY'));

    const remapLogs = (record) => {
      record.type_code = record.type;
      record.type = loggingTools.logTypes.get(record.type);

      let agent = useragent.parse(record.user_agent);
      record.os = agent.os.toString();
      record.os_version = agent.os.toVersion();
      record.device = agent.device.toString();
      record.device_version = agent.device.toVersion();
      return record;
    };

    const onLogsReceived = (logs, callback) => {
      if (!logs || !logs.length) {
        return cb();
      }

      logger.info(`Sending ${logs.length} logs to Azure.`);

      async.eachLimit(logs.map(remapLogs), 5, (log, cb) => {
        const date = moment(log.date);
        const url = `${date.format('YYYY/MM/DD')}/${date.format('HH')}/${log._id}.json`;

        blobService.createBlockBlobFromText(config('STORAGE_CONTAINER_NAME'), url, JSON.stringify(log), cb);
      }, (err) => {
        if (err) {
          return callback(err);
        }

        logger.info('Upload complete.');
        return callback();
      });
    };

    const slack = new loggingTools.reporters.SlackReporter({
      hook: config('SLACK_INCOMING_WEBHOOK_URL'),
      username: 'auth0-logs-to-azure-blob-storage',
      title: 'Logs To Azure' });

    const options = {
      domain: config('AUTH0_DOMAIN'),
      clientId: config('AUTH0_CLIENT_ID'),
      clientSecret: config('AUTH0_CLIENT_SECRET'),
      batchSize: config('BATCH_SIZE'),
      startFrom: config('START_FROM'),
      logTypes: config('LOG_TYPES'),
      logLevel: config('LOG_LEVEL')
    };

    const auth0logger = new loggingTools.LogsProcessor(storage, options);

    return auth0logger
      .run(onLogsReceived)
      .then(result => {
        if (config('SLACK_SEND_SUCCESS') === true || config('SLACK_SEND_SUCCESS') === 'true') {
          slack.send(result.status, result.checkpoint);
        }
        res.json(result);
      })
      .catch(err => {
        slack.send({ error: err, logsProcessed: 0 }, null);
        next(err);
      });
  };
