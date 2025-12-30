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
