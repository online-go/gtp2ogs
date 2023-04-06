import { Bot } from "./Bot";
import { config, BotConfig } from "./config";
import { EventEmitter } from "eventemitter3";
import { trace } from "./trace";

interface Events {
    start: (command: string, pid: number) => void;
}

/** This class manages a pool of Bots */
export class BotPool extends EventEmitter<Events> {
    pool_name: string;
    bot_config: BotConfig;
    instances: Bot[] = [];
    queue: ((bot: Bot) => void)[] = [];
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

    async acquire(): Promise<Bot> {
        await this.ready;
        for (let i = 0; i < this.instances.length; i++) {
            const bot = this.instances[i];
            if (bot.available) {
                bot.available = false;
                return bot;
            }
        }
        return new Promise((resolve) => {
            this.queue.push(resolve);
        });
    }

    release(bot: Bot): void {
        bot.setGame(null);
        if (this.queue.length > 0) {
            this.queue.shift()(bot);
        } else {
            bot.available = true;
        }
    }
}

export const bot_pools = {
    main: new BotPool("Main", config.bot),
    resign: config.resign_bot ? new BotPool("Resign", config.resign_bot) : null,
};
