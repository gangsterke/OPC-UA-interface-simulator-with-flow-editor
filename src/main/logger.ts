import log from "electron-log/main";

// Writes to a rotating file under userData/logs (electron-log's own default)
// as well as the console - a support/debugging trail independent of the
// in-app run log, which is ephemeral renderer state that disappears on reload.
log.initialize();
log.errorHandler.startCatching();

export default log;
