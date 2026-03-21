import { readFile } from "node:fs/promises";

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function describeValue(value) {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
}

function formatPath(path, segment) {
  if (typeof segment === "number") {
    return `${path}[${segment}]`;
  }
  return `${path}.${segment}`;
}

function valuesEqual(left, right) {
  if (Object.is(left, right)) {
    return true;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateType(schemaType, value, path, errors) {
  const valid = schemaType === "array"
    ? Array.isArray(value)
    : schemaType === "object"
      ? isPlainObject(value)
      : schemaType === "integer"
        ? Number.isInteger(value)
        : typeof value === schemaType;

  if (!valid) {
    errors.push(`${path}: expected ${schemaType}, received ${describeValue(value)}`);
  }
}

function validateSchemaNode(schema, value, path, errors) {
  if (!isPlainObject(schema)) {
    return;
  }

  if (Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    const branchErrors = schema.anyOf.map((branch) => {
      const localErrors = [];
      validateSchemaNode(branch, value, path, localErrors);
      return localErrors;
    });
    const passed = branchErrors.some((entry) => entry.length === 0);
    if (!passed) {
      errors.push(`${path}: value did not satisfy any schema branch`);
    }
    return;
  }

  if (schema.const !== undefined && !valuesEqual(value, schema.const)) {
    errors.push(`${path}: expected const ${JSON.stringify(schema.const)}`);
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((entry) => valuesEqual(value, entry))) {
    errors.push(`${path}: expected one of ${schema.enum.map((entry) => JSON.stringify(entry)).join(", ")}`);
  }

  if (Array.isArray(schema.type)) {
    const localErrors = [];
    const passed = schema.type.some((entry) => {
      const testErrors = [];
      validateType(entry, value, path, testErrors);
      if (testErrors.length === 0) {
        return true;
      }
      localErrors.push(...testErrors);
      return false;
    });
    if (!passed) {
      errors.push(...localErrors);
      return;
    }
  } else if (typeof schema.type === "string") {
    const typeErrors = [];
    validateType(schema.type, value, path, typeErrors);
    if (typeErrors.length > 0) {
      errors.push(...typeErrors);
      return;
    }
  }

  if (Array.isArray(schema.required) && isPlainObject(value)) {
    for (const key of schema.required) {
      if (!(key in value)) {
        errors.push(`${path}: missing required property "${key}"`);
      }
    }
  }

  if (isPlainObject(schema.properties) && isPlainObject(value)) {
    for (const [key, childSchema] of Object.entries(schema.properties)) {
      if (!(key in value)) {
        continue;
      }
      validateSchemaNode(childSchema, value[key], formatPath(path, key), errors);
    }
  }

  if (isPlainObject(schema.items) && Array.isArray(value)) {
    value.forEach((entry, index) => {
      validateSchemaNode(schema.items, entry, formatPath(path, index), errors);
    });
  }
}

export function validateSchemaValue(schema, value, path = "$") {
  const errors = [];
  validateSchemaNode(schema, value, path, errors);
  return errors;
}

export function assertValidSchemaValue(schema, value, label = "value") {
  const errors = validateSchemaValue(schema, value, "$");
  if (errors.length > 0) {
    throw new Error(`Schema validation failed for ${label}\n${errors.join("\n")}`);
  }
}

export async function readAndValidateJsonFile(filePath, schema) {
  const raw = await readFile(filePath, "utf8");
  const value = JSON.parse(raw);
  assertValidSchemaValue(schema, value, filePath);
  return value;
}
