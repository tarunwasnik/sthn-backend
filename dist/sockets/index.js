"use strict";
//backend/src/sockets/index.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSockets = void 0;
const chat_socket_1 = require("./chat.socket");
const initSockets = (io) => {
    (0, chat_socket_1.chatSocket)(io);
};
exports.initSockets = initSockets;
