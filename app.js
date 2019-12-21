const
    wsServer = new (require("ws-server-engine"))("a", {
        pingInterval: 10000,
        maxConnections: 2,
        inactivityTimeout: false,
        dumpInterval: 60000,
        logClientHeartbeat: true
    }),
    game = require("./module");
game(wsServer, "/bg/secret-hitler");