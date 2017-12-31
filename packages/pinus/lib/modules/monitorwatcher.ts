import { getLogger } from 'pinus-logger'; var logger = getLogger('pinus', __filename);
import * as utils from '../util/utils';
import { default as events } from '../util/events';
import * as Constants from '../util/constants';
import * as util from 'util';
import { Application } from '../application';
import { IModule } from 'pinus-admin';
import { ConsoleService, MonitorAgent, MonitorCallback } from '../../index';
import { ServerInfo } from '../util/constants';


export class MonitorWatcherModule implements IModule
{
    app: Application;
    service: any;
    id: string;

    static moduleId = Constants.KEYWORDS.MONITOR_WATCHER;

    constructor(opts : {app:Application}, consoleService : ConsoleService)
    {
        this.app = opts.app;
        this.service = consoleService;
        this.id = this.app.getServerId();

        this.app.event.on(events.START_SERVER, finishStart.bind(null, this));
    };

    start(cb : ()=>void)
    {
        subscribeRequest(this, this.service.agent, this.id, cb);
    };

    monitorHandler(agent : MonitorAgent, msg : any, cb : MonitorCallback)
    {
        if (!msg || !msg.action)
        {
            return;
        }
        var func = (monitorMethods as any)[msg.action];
        if (!func)
        {
            logger.info('monitorwatcher unknown action: %j', msg.action);
            return;
        }
        func(this, agent, msg, cb);
    };
}

// ----------------- monitor start method -------------------------

var subscribeRequest = function (self : MonitorWatcherModule, agent : MonitorAgent, id : string, cb : MonitorCallback)
{
    var msg = { action: 'subscribe', id: id };
    agent.request(Constants.KEYWORDS.MASTER_WATCHER, msg, function (err : Error, servers)
    {
        if (err)
        {
            logger.error('subscribeRequest request to master with error: %j', err.stack);
            utils.invokeCallback(cb, err);
        }
        var res = [];
        for (var id in servers)
        {
            res.push(servers[id]);
        }
        addServers(self, res);
        utils.invokeCallback(cb);
    });
};

// ----------------- monitor request methods -------------------------

var addServer = function (self : MonitorWatcherModule, agent : MonitorAgent, msg : any, cb : MonitorCallback)
{
    logger.debug('[%s] receive addServer signal: %j', self.app.serverId, msg);
    if (!msg || !msg.server)
    {
        logger.warn('monitorwatcher addServer receive empty message: %j', msg);
        utils.invokeCallback(cb, Constants.SIGNAL.FAIL);
        return;
    }
    addServers(self, [msg.server]);
    utils.invokeCallback(cb, Constants.SIGNAL.OK);
};

var removeServer = function  (self : MonitorWatcherModule, agent : MonitorAgent, msg : any, cb : MonitorCallback)
{
    logger.debug('%s receive removeServer signal: %j', self.app.serverId, msg);
    if (!msg || !msg.id)
    {
        logger.warn('monitorwatcher removeServer receive empty message: %j', msg);
        utils.invokeCallback(cb, Constants.SIGNAL.FAIL);
        return;
    }
    removeServers(self, [msg.id]);
    utils.invokeCallback(cb, Constants.SIGNAL.OK);
};

var replaceServer = function (self : MonitorWatcherModule, agent : MonitorAgent, msg : any, cb : MonitorCallback)
{
    logger.debug('%s receive replaceServer signal: %j', self.app.serverId, msg);
    if (!msg || !msg.servers)
    {
        logger.warn('monitorwatcher replaceServer receive empty message: %j', msg);
        utils.invokeCallback(cb, Constants.SIGNAL.FAIL);
        return;
    }
    replaceServers(self, msg.servers);
    utils.invokeCallback(cb, Constants.SIGNAL.OK);
};

var startOver = function (self : MonitorWatcherModule, agent : MonitorAgent, msg : any, cb : MonitorCallback)
{
    var fun = self.app.lifecycleCbs[Constants.LIFECYCLE.AFTER_STARTALL];
    if (!!fun)
    {
        fun.call(null, self.app);
    }
    self.app.event.emit(events.START_ALL);
    utils.invokeCallback(cb, Constants.SIGNAL.OK);
};

// ----------------- common methods -------------------------

var addServers = function (self : MonitorWatcherModule, servers : ServerInfo[])
{
    if (!servers || !servers.length)
    {
        return;
    }
    self.app.addServers(servers);
};

var removeServers = function (self : MonitorWatcherModule, ids: string[])
{
    if (!ids || !ids.length)
    {
        return;
    }
    self.app.removeServers(ids);
};

var replaceServers = function (self : MonitorWatcherModule, servers:  {[serverId:string]:ServerInfo})
{
    self.app.replaceServers(servers);
};

// ----------------- bind methods -------------------------

var finishStart = function (self : MonitorWatcherModule, id : string)
{
    var msg = { action: 'record', id: id };
    self.service.agent.notify(Constants.KEYWORDS.MASTER_WATCHER, msg);
};

var monitorMethods = {
    'addServer': addServer,
    'removeServer': removeServer,
    'replaceServer': replaceServer,
    'startOver': startOver
};