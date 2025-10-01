## Project Overview

gtp2ogs is a bridge that allows Go bots using the GTP (Go Text Protocol) to connect to and play games on the OGS (Online-Go.com) platform. The tool spawns and manages bot processes, handles websocket communication with OGS servers, translates between GTP commands and OGS game state, and manages concurrent games.

## Build and Development Commands

```bash
# Install dependencies
yarn install

# Build the project
make build

# Run the built application
make botr

# Linting
make lint              # Run eslint
make lint-fix          # Auto-fix eslint issues

# Code formatting
make prettier          # Format all TypeScript files

# Testing
make test              # Run Jest tests
```

## Core Architecture

### Bot Management System

The codebase uses two bot management strategies (configured via `bot.manager`):

1. **Pool Manager** (`pools.ts`): Maintains a fixed number of pre-spawned bot processes that are reused across games. Efficient for stateless bots.

2. **Persistent Manager** (`pools.ts`): Spawns one bot instance per game, allowing state persistence between moves (enables pondering). Bot processes are kept alive with an idle timeout.

Both managers implement the `BotManagerInterface` and handle bot acquisition/release with game affinity (preferring to reuse bots for the same game/board size).

### Multi-Bot System

Three types of bots can be configured:

- **Main bot** (`config.bot`): Primary bot for gameplay
- **Opening bot** (`config.opening_bot`): Optional bot for playing opening moves (helps weak bots play standard joseki)
- **Ending bot** (`config.ending_bot`): Optional bot that validates passes/resigns to prevent premature resignation

The Game class orchestrates when to switch between these bots based on move counts and game state.

### Key Components

**`main.ts`**: Entry point. Manages the websocket connection to OGS, handles challenges/notifications, creates Game instances for accepted games, and enforces game constraints (time controls, board sizes, rank ranges).

**`Bot.ts`**: Wraps a single GTP bot process. Manages stdin/stdout/stderr streams, command queuing, GTP protocol parsing, chat message extraction (MALKOVICH/DISCUSSION/MAIN prefixes), and principal variation (PV) parsing via `PvOutputParser`.

**`Game.ts`**: Manages a single game session. Acquires/releases bots from pools, translates OGS game state to GTP commands, handles move timing and delays (`min_move_time`), manages game clock (supports fischer, byoyomi, simple time controls), coordinates with opening/ending bots when configured.

**`config.ts`**: Configuration schema and validation. Uses JSON5 format, generates JSON schema from TypeScript types (see `Gulpfile.js`), and validates with jsonschema. Config can be provided via file (`--config`) or command line arguments.

**`pools.ts`**: Implements BotPoolManager and BotPersistentManager for the two bot management strategies.

**`PvOutputParser.ts`**: Parses principal variation output from bots (supports various formats including KataGo).

## Configuration System

Configuration is defined in `src/config.ts` using TypeScript interfaces. The build process automatically generates a JSON schema (`schema/Config.schema.json`) which is used to validate user config files at runtime.

See `example_config.json5` for all available options including:

- Bot command and management strategy
- Time control constraints (blitz/rapid/live/correspondence)
- Board size and komi restrictions
- Rank ranges and handicap settings
- Greeting/farewell messages
- Clock command support (kgs-time, kata-time, etc.)

## GTP Protocol Support

The bot detects available GTP commands on initialization by sending `list_commands`. Special handling for:

- **Clock commands**: Sends time updates if bot supports `kgs-time_settings`, `kata-time_settings`, or `gomill-cpu_time`
- **Chat output**: Parses stderr for lines starting with `MALKOVICH:`, `DISCUSSION:`, or `MAIN:` and sends to game chat
- **PV data**: Extracts principal variation from bot output if enabled

## Testing

Tests use Jest with ts-jest. Located in `src/__tests__/`. Currently focused on `PvOutputParser`. Test timeout is set to 200ms (very short, likely for unit tests only).

## Development Workflow

1. The Gulpfile orchestrates parallel tasks:

    - Schema generation from `src/config.ts`
    - ESLint watching
    - Webpack watching (compiles TypeScript to `dist/gtp2ogs.js`)

2. Source files are in `src/`, compiled output goes to `dist/`

3. The build uses webpack (not tsc directly) to create the final bundle

## Important Implementation Details

- **Move timing**: Moves faster than `min_move_time` (default 1500ms) are artificially delayed to avoid rushing players
- **Persistent bot idle timeout**: Default 10 minutes before terminating idle persistent bots
- **Graceful shutdown**: Bots receive `quit` command with 5s grace period before SIGTERM, then another 5s before SIGKILL
- **Game state synchronization**: Handicap stones are handled specially when bot plays black
- **Clock precision**: Server `clock.now` field is deleted from gamedata to avoid false positive changes
- **Release delay**: Pool manager waits (default 100ms) after moves for bots to finish writing PV/chat data before releasing

## Server Connection

- Default: `https://online-go.com`
- Beta: Use `--beta` flag to connect to `beta.online-go.com`
- Websocket connection managed in `socket.ts`
- API calls use `api1()` helper from `util.ts`
