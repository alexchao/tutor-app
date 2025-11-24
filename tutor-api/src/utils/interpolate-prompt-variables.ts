/**
 * Interpolates variables from an object into a string template.
 * Variables in the template should be wrapped in double curly braces, e.g., {{variableName}}.
 *
 * @param template - The string template containing {{variable}} placeholders
 * @param variables - An object with key-value pairs to interpolate into the template
 * @returns The interpolated string with variables replaced
 *
 * @example
 * ```ts
 * const result = interpolatePromptVariables(
 *   "Hello {{name}}, you are {{age}} years old.",
 *   { name: "Alice", age: "30" }
 * );
 * // Returns: "Hello Alice, you are 30 years old."
 * ```
 */
export function interpolatePromptVariables(
  template: string,
  variables: Record<string, string | number | boolean>
): string {
  // Validate that all keys in variables have corresponding placeholders in the template
  for (const key of Object.keys(variables)) {
    const placeholder = `{{${key}}}`;
    if (!template.includes(placeholder)) {
      throw new Error(
        `Variable "${key}" was provided but no corresponding placeholder "{{${key}}}" found in template`
      );
    }
  }

  let result = template;

  // Replace each {{key}} with its corresponding value
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`;
    const stringValue = String(value);
    result = result.replaceAll(placeholder, stringValue);
  }

  return result;
}

