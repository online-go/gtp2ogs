import { config } from "./config";
import { GobanSocket } from "goban/src/GobanSocket";
import { trace } from "./trace";

const MIN_CONNECT_TIME = 1000;

export const socket = new GobanSocket(config.server);

socket.on("ERROR", (message) => {
    trace.error(message);
});

let connect_time = performance.now();
socket.on("connect", () => {
    connect_time = performance.now() - connect_time;
    trace.info(`Connected to ${config.server} in ${connect_time.toFixed(0)}ms`);
});
socket.on("disconnect", () => {
    if (performance.now() - connect_time < MIN_CONNECT_TIME) {
        process.exit(1);
    }
});
