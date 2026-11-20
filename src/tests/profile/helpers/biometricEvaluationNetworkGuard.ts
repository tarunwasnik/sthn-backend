/** Preload for the research-only tests: no sockets, HTTP, TLS or dotenv. */
import net from "node:net";
import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import dotenv from "dotenv";
import { mock } from "node:test";
const deny = () => { throw new Error("OFFLINE_NETWORK_FORBIDDEN"); };
mock.method(net.Socket.prototype, "connect", deny);
mock.method(http, "request", deny); mock.method(http, "get", deny);
mock.method(https, "request", deny); mock.method(https, "get", deny);
mock.method(tls, "connect", deny); mock.method(globalThis, "fetch", deny);
mock.method(dotenv, "config", () => ({ parsed: {} }));
process.env.NODE_ENV = "test";
