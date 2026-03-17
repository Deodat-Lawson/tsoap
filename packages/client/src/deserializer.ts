/**
 * Custom deserializer that fills gaps in the `soap` package's built-in
 * XML-to-JS type conversion. Soap natively handles int, integer, short,
 * long, float, double, decimal, boolean, dateTime, and date. Everything
 * else falls through as a raw string. This map adds the missing numeric
 * types so our generated TypeScript types match the actual runtime values.
 */
export const typedSoapDeserializer: Record<string, (text: string) => number> = {
  byte:               (text) => parseInt(text, 10),
  unsignedByte:       (text) => parseInt(text, 10),
  unsignedShort:      (text) => parseInt(text, 10),
  unsignedInt:        (text) => parseInt(text, 10),
  unsignedLong:       (text) => parseInt(text, 10),
  negativeInteger:    (text) => parseInt(text, 10),
  nonNegativeInteger: (text) => parseInt(text, 10),
  positiveInteger:    (text) => parseInt(text, 10),
  nonPositiveInteger: (text) => parseInt(text, 10),
};
