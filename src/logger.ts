import pino, { type LevelWithSilent, type Logger } from "pino"

export type LogFormat = "json" | "pretty"

let rootLogger: Logger = pino({ level: "silent" })

export function configureLogging(
  format: LogFormat,
  level: LevelWithSilent,
): void {
  rootLogger =
    format === "pretty"
      ? pino({
          level,
          transport: {
            target: "pino-pretty",
            options: { colorize: process.stdout.isTTY },
          },
        })
      : pino({ level })
}

export function createLogger(name: string): Logger {
  return new Proxy({} as Logger, {
    get(_target, property) {
      const namedLogger = rootLogger.child({ name })
      const value = namedLogger[property as keyof Logger]
      return typeof value === "function" ? value.bind(namedLogger) : value
    },
  })
}
