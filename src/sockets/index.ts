//backend/src/sockets/index.ts


import { Server } from "socket.io";
import { chatSocket } from "./chat.socket";

export const initSockets = (io: Server) => {
  chatSocket(io);
};