import type { Logger as PinoLogger } from "pino";

/**
 * Type-safe logger interface that preserves Pino's full method signatures.
 * This interface explicitly defines the overloads to prevent TypeScript from
 * collapsing them in complex moduleResolution scenarios.
 */
export interface Logger {
	// Standard methods with explicit overloads
	fatal(msg: string, ...args: any[]): void;
	fatal<T extends object>(obj: T, msg?: string, ...args: any[]): void;

	error(msg: string, ...args: any[]): void;
	error<T extends object>(obj: T, msg?: string, ...args: any[]): void;

	warn(msg: string, ...args: any[]): void;
	warn<T extends object>(obj: T, msg?: string, ...args: any[]): void;

	info(msg: string, ...args: any[]): void;
	info<T extends object>(obj: T, msg?: string, ...args: any[]): void;

	debug(msg: string, ...args: any[]): void;
	debug<T extends object>(obj: T, msg?: string, ...args: any[]): void;

	trace(msg: string, ...args: any[]): void;
	trace<T extends object>(obj: T, msg?: string, ...args: any[]): void;

	// Preserve other logger methods
	child(bindings: Record<string, unknown>): Logger;
	level: string;
}
