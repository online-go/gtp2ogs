import { Bot } from "./Bot";
import { config, BotConfig } from "./config";
import { EventEmitter } from "eventemitter3";
import { Speed } from "./types";
import { trace } from "./trace";

global.performance = global.performance || (Date as any);

interface Events {
    start: (command: string, pid: number) => void;
}

interface BotManagerInterface {
    ready: Promise<string[]>;
    bot_config: BotConfig;

    acquire(speed: Speed, width: number, height: number, game_id: number): Promise<Bot>;
    countAvailable(): number;
    release(bot: Bot): void;
    clearLastGameId(game_id: number): void;
    stateString(): string;
}

/** This class manages a pool of Bots */
export class BotPoolManager extends EventEmitter<Events> implements BotManagerInterface {
    pool_name: string;
    bot_config: BotConfig;
    instances: Bot[] = [];
    queue: [Speed, number, number, (bot: Bot) => void][] = [];
    ready: Promise<string[]>;
    log: (...arr: any[]) => any;
    verbose: (...arr: any[]) => any;
    error: (...arr: any[]) => any;
    warn: (...arr: any[]) => any;

    constructor(pool_name: string, bot_config: BotConfig) {
        super();

        this.log = trace.log.bind(null, `[${pool_name} pool]`);
        this.verbose = trace.debug.bind(null, `[${pool_name} pool]`);
        this.warn = trace.warn.bind(null, `[${pool_name} pool]`);
        this.error = trace.error.bind(null, `[${pool_name} pool]`);

        this.bot_config = bot_config;
        this.pool_name = pool_name;

        for (let i = 0; i < bot_config.instances; i++) {
            this.addInstance(bot_config);
        }

        this.ready = Promise.all(this.instances.map((bot) => bot.ready));

        this.ready
            .then(() => {
                trace.info(`${this.pool_name} bot pool: ${this.instances.length} bots ready`);
            })
            .catch((err) => {
                console.error(err);
                process.exit(1);
            });
    }

    private addInstance(bot_config: BotConfig) {
        const start_time = performance.now();
        const bot = new Bot(bot_config);
        this.instances.push(bot);

        bot.on("terminated", () => {
            this.instances.splice(this.instances.indexOf(bot), 1);
            if (performance.now() - start_time < 1000) {
                trace.error(`Bot "${bot_config.command.join(" ")}" terminated too quickly`);
                process.exit(1);
            }
            this.addInstance(bot_config);
        });
        bot.on("ready", () => {
            this.emit("start", bot_config.command.join(" "), bot.pid);
            trace.info(
                `Bot "${bot_config.command.join(" ")}" started with PID ${
                    bot.pid
                }. Ready in ${Math.round(performance.now() - start_time)}ms.`,
            );
        });
    }

    async acquire(speed: Speed, width: number, height: number, game_id: number): Promise<Bot> {
        trace.info(`Acquiring bot for ${speed} game`);
        await this.ready;
        for (const pass of ["game_id", "board_size", "any"]) {
            for (let i = 0; i < this.instances.length; i++) {
                const bot = this.instances[i];

                /* We prioritize instances that have been playing this game, are already
                 * setup to play on this board size, or finally any that are available.
                 */
                const pass_check =
                    (pass === "game_id" && bot.last_game_id === game_id) ||
                    (pass === "board_size" &&
                        bot.last_width === width &&
                        bot.last_height === height) ||
                    pass === "any";

                if (bot.available && pass_check) {
                    bot.available = false;
                    trace.info("Picked bot in " + pass + " pass");
                    return bot;
                }
            }
        }
        return new Promise((resolve) => {
            this.queue.push([speed, width, height, resolve]);
        });
    }

    public countAvailable(): number {
        return this.instances.filter((bot) => bot.available).length;
    }

    public release(bot: Bot): void {
        bot.setGame(null);
        if (this.queue.length > 0) {
            for (const pass of ["board_size", "any"]) {
                for (const target_speed of ["blitz", "live", "correspondence"]) {
                    for (let i = 0; i < this.queue.length; i++) {
                        const [speed, width, height, resolve] = this.queue[i];

                        const pass_check =
                            (pass === "board_size" &&
                                bot.last_width === width &&
                                bot.last_height === height) ||
                            pass === "any";

                        if (speed === target_speed && pass_check) {
                            this.queue.splice(i, 1);
                            resolve(bot);
                            return;
                        }
                    }
                }
            }
        } else {
            bot.available = true;
        }
    }
    public clearLastGameId(game_id: number): void {
        for (const bot of this.instances) {
            if (bot.last_game_id === game_id) {
                bot.last_game_id = -1;
            }
        }
    }

    public stateString(): string {
        return `${this.pool_name}: ${this.countAvailable()}/${this.instances.length} available`;
    }
}

export class PersistentBotManager extends EventEmitter<Events> implements BotManagerInterface {
    pool_name: string;
    bot_config: BotConfig;
    instances: Bot[] = [];
    queue: [Speed, number, number, (bot: Bot) => void][] = [];
    ready: Promise<string[]>;
    log: (...arr: any[]) => any;
    verbose: (...arr: any[]) => any;
    error: (...arr: any[]) => any;
    warn: (...arr: any[]) => any;

    constructor(pool_name: string, bot_config: BotConfig) {
        super();

        this.log = trace.log.bind(null, `[${pool_name} bots]`);
        this.verbose = trace.debug.bind(null, `[${pool_name} bots]`);
        this.warn = trace.warn.bind(null, `[${pool_name} bots]`);
        this.error = trace.error.bind(null, `[${pool_name} bots]`);

        this.bot_config = bot_config;
        this.pool_name = pool_name;

        this.ready = Promise.resolve([]);
        trace.info(`${this.pool_name} persistent bots ready`);
    }

    private addInstance(bot_config: BotConfig, game_id: number): Bot {
        const start_time = performance.now();
        const bot = new Bot(bot_config);
        bot.last_game_id = game_id;
        this.instances.push(bot);

        bot.on("terminated", () => {
            if (bot.persistent_idle_timeout) {
                clearTimeout(bot.persistent_idle_timeout);
            }
            this.instances.splice(this.instances.indexOf(bot), 1);
            if (performance.now() - start_time < 1000) {
                trace.error(`Bot "${bot_config.command.join(" ")}" terminated too quickly`);
                process.exit(1);
            }
            if (bot.last_game_id !== -1) {
                this.addInstance(bot_config, game_id);
            }
        });
        bot.on("ready", () => {
            this.emit("start", bot_config.command.join(" "), bot.pid);
            trace.info(
                `Bot "${bot_config.command.join(" ")}" started with PID ${
                    bot.pid
                }. Ready in ${Math.round(performance.now() - start_time)}ms.`,
            );
        });

        return bot;
    }

    async acquire(_speed: Speed, _width: number, _height: number, game_id: number): Promise<Bot> {
        const bot =
            this.instances.find((bot) => bot.last_game_id === game_id) ||
            this.addInstance(this.bot_config, game_id);

        if (bot.persistent_idle_timeout) {
            clearTimeout(bot.persistent_idle_timeout);
        }

        return bot;
    }

    public countAvailable(): number {
        return 1;
    }

    release(bot: Bot): void {
        if (bot.persistent_idle_timeout) {
            clearTimeout(bot.persistent_idle_timeout);
        }
        bot.persistent_idle_timeout = setTimeout(() => {
            this.log(
                `Bot has been idle for ${this.bot_config.persistent_idle_timeout}ms, terminating`,
            );
            bot.persistent_idle_timeout = null;
            bot.last_game_id = -1;
            bot.kill();
        }, this.bot_config.persistent_idle_timeout);
    }
    public clearLastGameId(game_id: number): void {
        for (const bot of this.instances) {
            if (bot.last_game_id === game_id) {
                bot.last_game_id = -1;
                bot.kill();
            }
        }
    }

    public stateString(): string {
        return `${this.pool_name}: ${this.instances.length} bots`;
    }
}

export const bot_pools: {
    main: BotManagerInterface;
    ending: BotManagerInterface | null;
    opening: BotManagerInterface | null;
} = {
    main:
        config.bot.manager === "pool"
            ? new BotPoolManager("Main", config.bot)
            : new PersistentBotManager("Main", config.bot),
    ending:
        config.ending_bot?.manager === "pool"
            ? new BotPoolManager("Ending", config.ending_bot)
            : config.ending_bot?.manager === "persistent"
              ? new PersistentBotManager("Ending", config.ending_bot)
              : null,
    opening:
        config.opening_bot?.manager === "pool"
            ? new BotPoolManager("Opening", config.opening_bot)
            : config.opening_bot?.manager === "persistent"
              ? new PersistentBotManager("Opening", config.opening_bot)
              : null,
};
