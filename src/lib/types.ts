import { GobanEngineConfig } from "goban-engine";
import { Move } from "../types";

/** Bot interface for TypeScript bots to implement */
export interface BotInterface {
    /**
     * Generate a move for the given game state and color
     * @param game_state Current state of the game
     * @param color Color to play ('black' or 'white')
     * @returns A Move object with x, y coordinates and/or pass/resign flags
     *
     * @example
     * // Regular move at D4
     * return { x: 3, y: 3, text: "D4" };
     *
     * @example
     * // Pass
     * return { x: -1, y: -1, pass: true, text: "pass" };
     *
     * @example
     * // Resign
     * return { resign: true, text: "resign" };
     */
    genmove(game_state: GobanEngineConfig, color: "black" | "white"): Promise<Move>;

    /** Optional: Handle chat messages */
    chat?(message: string, channel: "main" | "malkovich"): Promise<void>;

    /** Optional: Called when a game starts */
    gameStarted?(game_state: GobanEngineConfig): Promise<void>;

    /** Optional: Called when a game ends */
    gameEnded?(result: { winner: string; outcome: string }): Promise<void>;
}

/** Game state interface */
export interface GameState extends GobanEngineConfig {
    game_id: number;
}
