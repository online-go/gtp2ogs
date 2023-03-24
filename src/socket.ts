import { config } from "./config";
import { GobanSocket } from "goban/src/GobanSocket";

export const socket = new GobanSocket(config.url);
