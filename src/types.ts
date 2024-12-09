import { JGOFTimeControlSpeed } from "goban-engine";

export interface Move {
    x?: number;
    y?: number;
    text?: string;
    resign?: boolean;
    pass?: boolean;
}

export type Speed = JGOFTimeControlSpeed;
