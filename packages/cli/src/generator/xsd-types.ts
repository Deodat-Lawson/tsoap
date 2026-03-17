/**
 * Maps XSD primitive type local names (without namespace prefix) to
 * their TypeScript type representation as a source string.
 *
 * The soap package natively deserializes: int, integer, short, long,
 * float, double, decimal (to number), boolean (to boolean), dateTime
 * and date (to Date). Our runtime's customDeserializer fills in the
 * gaps for byte, unsigned*, and named integer types so they also
 * arrive as numbers at runtime.
 */

const SAFE_NUMBER_TYPES = new Set([
  "int",
  "short",
  "byte",
  "unsignedInt",
  "unsignedShort",
  "unsignedByte",
  "float",
  "double",
]);

/** WARNING: values > Number.MAX_SAFE_INTEGER lose precision */
const PRECISION_RISK_NUMBER_TYPES = new Set([
  "long",
  "unsignedLong",
  "integer",
  "decimal",
  "negativeInteger",
  "nonNegativeInteger",
  "positiveInteger",
  "nonPositiveInteger",
]);

const DATE_TYPES = new Set(["dateTime", "date"]);

const STRING_TYPES = new Set([
  "string",
  "normalizedString",
  "token",
  "language",
  "Name",
  "NCName",
  "NMTOKEN",
  "ID",
  "IDREF",
  "ENTITY",
  "anyURI",
  "QName",
  "NOTATION",
  "time",
  "duration",
  "gYear",
  "gYearMonth",
  "gMonth",
  "gMonthDay",
  "gDay",
  "base64Binary",
  "hexBinary",
]);

export interface XsdTypeInfo {
  tsType: string;
  /** If true, emitted with a JSDoc precision warning. */
  precisionRisk: boolean;
}

/**
 * Strips namespace prefix from an XSD type string.
 * `"xsd:string"` -> `"string"`, `"tns:MyType"` -> `"MyType"`
 */
export function stripNamespace(xsdType: string): string {
  const idx = xsdType.indexOf(":");
  return idx >= 0 ? xsdType.slice(idx + 1) : xsdType;
}

/**
 * Resolves an XSD primitive type to its TypeScript representation.
 * Returns `null` if the type is not a known primitive (i.e. it's a
 * complex or user-defined type that needs to be looked up elsewhere).
 */
export function resolveXsdPrimitive(localName: string): XsdTypeInfo | null {
  if (localName === "boolean") {
    return { tsType: "boolean", precisionRisk: false };
  }
  if (SAFE_NUMBER_TYPES.has(localName)) {
    return { tsType: "number", precisionRisk: false };
  }
  if (PRECISION_RISK_NUMBER_TYPES.has(localName)) {
    return { tsType: "number", precisionRisk: true };
  }
  if (DATE_TYPES.has(localName)) {
    return { tsType: "Date", precisionRisk: false };
  }
  if (STRING_TYPES.has(localName)) {
    return { tsType: "string", precisionRisk: false };
  }
  if (localName === "anyType") {
    return { tsType: "unknown", precisionRisk: false };
  }
  return null;
}
