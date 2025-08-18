export const MILLIS_IN_SECOND = 1000;
export const SECONDS_IN_MINUTE = 60;

/**
 * Get the value of the provided environment variable name, or throw if it doesn't exist.
 *
 * @param name The name of the environment variable to retrieve.
 * @return The environment variable value.
 */
export function getRequiredEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable ${name}`);
    }
    return value;
}
